import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findArticleDiagnosticsByUrl,
  hashRecipientId,
  loadRecentDeliveredSourceIds,
  recordDeliveries,
  recordRunDiagnostic
} from "../src/state.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("run diagnostics", () => {
  it("keeps source counts and near misses without recipient data", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-diagnostics-"));
    temporaryDirectories.push(directory);
    const diagnosticsPath = path.join(directory, "run-diagnostics.json");

    await recordRunDiagnostic({
      ranAt: "2026-07-28T04:32:43.454Z",
      validDateCount: 3,
      evaluatedCount: 2,
      candidateCount: 0,
      highestContentScore: 22,
      geminiCalled: false,
      localEligibility: {
        scoredAtOrAboveFallback: 1,
        passedHardGates: 0,
        normalEligible: 0,
        communityDiscoveryAdmitted: 0,
        rejectedAiTopic: 0,
        rejectedCommunityGate: 0,
        rejectedEvidence: 0,
        rejectedSourceCooldown: 1
      },
      sourceStats: [{
        sourceId: "arxiv-cs-ai",
        fetched: 10,
        validDate: 1,
        scored: 1,
        rejectedSent: 0,
        rejectedDate: 9,
        rejectedCommunityGate: 0,
        rejectedSourceCooldown: 0,
        selected: 0
      }],
      nearMisses: [{
        title: "Useful agent paper",
        source: "arXiv",
        url: "https://arxiv.org/abs/example",
        contentScore: 22,
        reason: "normal-score-fallback-not-activated"
      }],
      localCandidates: [],
      geminiDecisions: []
    }, diagnosticsPath);

    const content = await readFile(diagnosticsPath, "utf8");
    expect(content).not.toMatch(/recipient|userId/i);
    expect(JSON.parse(content).runs[0]).toMatchObject({
      candidateCount: 0,
      highestContentScore: 22
    });
  });

  it("keeps per-URL details for only the latest seven runs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-diagnostics-"));
    temporaryDirectories.push(directory);
    const diagnosticsPath = path.join(directory, "run-diagnostics.json");

    for (let index = 0; index < 10; index += 1) {
      await recordRunDiagnostic({
        ranAt: `2026-10-${String(index + 1).padStart(2, "0")}T01:00:00.000Z`,
        validDateCount: 1,
        evaluatedCount: 1,
        candidateCount: 0,
        highestContentScore: 0,
        geminiCalled: false,
        localEligibility: {
          scoredAtOrAboveFallback: 0,
          passedHardGates: 0,
          normalEligible: 0,
          communityDiscoveryAdmitted: 0,
          rejectedAiTopic: 0,
          rejectedCommunityGate: 0,
          rejectedEvidence: 0,
          rejectedSourceCooldown: 0
        },
        sourceStats: [],
        nearMisses: [],
        localCandidates: [],
        geminiDecisions: [],
        evaluatedItems: []
      }, diagnosticsPath);
    }

    const history = JSON.parse(await readFile(diagnosticsPath, "utf8"));
    expect(history.runs).toHaveLength(10);
    expect(history.runs.slice(0, 3).every((run: object) => !("evaluatedItems" in run))).toBe(true);
    expect(history.runs.slice(3).every((run: object) => "evaluatedItems" in run)).toBe(true);
  });

  it("finds retained article decisions by canonical URL", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-diagnostics-"));
    temporaryDirectories.push(directory);
    const diagnosticsPath = path.join(directory, "run-diagnostics.json");
    await writeFile(diagnosticsPath, JSON.stringify({ runs: [{
      ranAt: "2026-10-06T01:00:00.000Z",
      evaluatedItems: [{
        candidateId: "article-1",
        title: "Typed decision model",
        source: "Example",
        sourceId: "example",
        url: "https://example.com/article",
        publishedAt: "2026-10-06T00:00:00.000Z",
        contentScore: 19.8,
        scoreBreakdown: {
          topic: 6,
          stack: 4.2,
          impact: 4.8,
          goal: 4.8,
          negativePenalty: 0,
          positiveTotal: 19.8,
          total: 19.8
        },
        matchedGroups: [],
        negativeMatches: [],
        localDecision: "selected:discovery"
      }]
    }] }));

    const matches = await findArticleDiagnosticsByUrl(
      "https://example.com/article?utm_source=test#details",
      diagnosticsPath
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      ranAt: "2026-10-06T01:00:00.000Z",
      item: {
        contentScore: 19.8,
        localDecision: "selected:discovery"
      }
    });
  });

  it("loads recent successful source IDs without exposing recipient IDs", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-history-"));
    temporaryDirectories.push(directory);
    const historyPath = path.join(directory, "delivery-history.json");
    await writeFile(historyPath, JSON.stringify({ deliveries: [{
      sentAt: "2026-08-01T00:00:00.000Z",
      recipientAlias: "Primary",
      recipientHash: "hash",
      status: "sent",
      type: "news",
      message: "digest",
      urls: ["https://example.com/news"],
      sourceIds: ["example-source"]
    }] }));

    const sources = await loadRecentDeliveredSourceIds(
      [],
      48,
      new Date("2026-08-02T00:00:00.000Z"),
      historyPath
    );
    expect([...sources]).toEqual(["example-source"]);
  });

  it("infers a recent source from legacy URL-only delivery records", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-history-"));
    temporaryDirectories.push(directory);
    const historyPath = path.join(directory, "delivery-history.json");
    await writeFile(historyPath, JSON.stringify({ deliveries: [{
      sentAt: "2026-08-01T00:00:00.000Z",
      recipientAlias: "Primary",
      recipientHash: "hash",
      status: "sent",
      type: "news",
      message: "digest",
      urls: ["https://github.blog/changelog/copilot-update"]
    }] }));

    const sources = await loadRecentDeliveredSourceIds([{
      id: "github-copilot-changelog",
      name: "GitHub Copilot Changelog",
      url: "https://github.blog/changelog/label/copilot/feed/",
      adapter: "rss",
      sourceRole: "official",
      organization: "microsoft",
      evidencePolicy: "primary",
      datePolicy: "published-only",
      enabled: true,
      maxFetchItems: 20,
      allowedHosts: ["github.blog"]
    }], 48, new Date("2026-08-02T00:00:00.000Z"), historyPath);

    expect([...sources]).toEqual(["github-copilot-changelog"]);
  });
});

describe("delivery history", () => {
  it("records per-recipient status without storing the raw userId", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-history-"));
    temporaryDirectories.push(directory);
    const historyPath = path.join(directory, "delivery-history.json");
    const rawUserId = "U-sensitive-user-id";

    await recordDeliveries([{
      sentAt: "2026-07-23T01:30:00.000Z",
      recipientAlias: "Primary",
      recipientHash: hashRecipientId(rawUserId),
      status: "sent",
      type: "news",
      message: "daily digest",
      urls: ["https://example.com/news"]
    }], historyPath);

    const content = await readFile(historyPath, "utf8");
    expect(content).not.toContain(rawUserId);
    expect(JSON.parse(content).deliveries[0]).toMatchObject({
      recipientAlias: "Primary",
      status: "sent",
      sentAt: "2026-07-23T01:30:00.000Z"
    });
  });

  it("migrates the previous single-recipient history fields", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "ai-news-history-"));
    temporaryDirectories.push(directory);
    const historyPath = path.join(directory, "delivery-history.json");
    await writeFile(historyPath, JSON.stringify({ deliveries: [{
      sentAt: "2026-07-22T01:30:00.000Z",
      recipientLabel: "Primary",
      recipientIdHash: "old-hash",
      type: "news",
      message: "old digest",
      urls: []
    }] }));

    await recordDeliveries([], historyPath);

    const history = JSON.parse(await readFile(historyPath, "utf8"));
    expect(history.deliveries[0]).toMatchObject({
      recipientAlias: "Primary",
      recipientHash: "old-hash",
      status: "sent"
    });
    expect(history.deliveries[0].recipientLabel).toBeUndefined();
  });
});
