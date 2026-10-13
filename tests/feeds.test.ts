import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRankingConfig, type RankingConfig } from "../src/config.js";
import { collectCandidates, collectCandidatesDetailed, looksLikeChangeClaim } from "../src/feeds.js";
import type { FeedConfig } from "../src/types.js";

const feed: FeedConfig = {
  id: "test",
  name: "Test",
  url: "https://example.com/feed",
  adapter: "rss",
  sourceRole: "official",
  organization: "example",
  evidencePolicy: "primary",
  datePolicy: "published-only",
  enabled: true,
  maxFetchItems: 20,
  allowedHosts: ["example.com"]
};

afterEach(() => vi.unstubAllGlobals());

async function testRankingConfig(): Promise<RankingConfig> {
  const config = await loadRankingConfig();
  return {
    ...config,
    selection: {
      ...config.selection,
      minContentScore: 0,
      fallbackMinContentScore: 0
    }
  };
}

function rss(items: Array<{ title: string; url: string; published?: string }>): string {
  return `<rss><channel>${items.map((item) => `<item><title>${item.title}</title><link>${item.url}</link>${item.published ? `<pubDate>${item.published}</pubDate>` : ""}</item>`).join("")}</channel></rss>`;
}

function atom(entries: string): string {
  return `<feed>${entries}</feed>`;
}

describe("collectCandidates", () => {
  it("keeps only articles published within the last 24 hours", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      { title: "Recent", url: "https://example.com/recent", published: "2026-07-22T12:00:00Z" },
      { title: "Old", url: "https://example.com/old", published: "2025-07-22T12:00:00Z" },
      { title: "Missing date", url: "https://example.com/missing" }
    ]), { status: 200 })));

    const result = await collectCandidates(
      [{ ...feed, maxFetchItems: 2 }],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.map((item) => item.title)).toEqual(["Recent"]);
  });

  it("rejects articles published in the future", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      { title: "Future", url: "https://example.com/future", published: "2026-07-23T02:30:00Z" }
    ]), { status: 200 })));

    await expect(collectCandidates([feed], rankingConfig, new Set(), now)).resolves.toEqual([]);
  });

  it("filters old articles before applying the per-source limit", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      { title: "Agentic coding API model MCP evaluation", url: "https://example.com/old-1", published: "2025-07-22T12:00:00Z" },
      { title: "Codex Copilot Azure TypeScript RAG", url: "https://example.com/old-2", published: "2025-07-22T13:00:00Z" },
      { title: "Recent useful article", url: "https://example.com/recent", published: "2026-07-22T12:00:00Z" }
    ]), { status: 200 })));

    const result = await collectCandidates(
      [{ ...feed, maxFetchItems: 2 }],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.map((item) => item.title)).toEqual(["Recent useful article"]);
  });

  it("filters sent articles before applying the per-source limit", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      { title: "Agentic coding API model MCP evaluation", url: "https://example.com/sent-1", published: "2026-07-22T12:00:00Z" },
      { title: "Codex Copilot Azure TypeScript RAG", url: "https://example.com/sent-2", published: "2026-07-22T13:00:00Z" },
      { title: "Recent unsent article", url: "https://example.com/unsent", published: "2026-07-22T14:00:00Z" }
    ]), { status: 200 })));

    const result = await collectCandidates(
      [{ ...feed, maxFetchItems: 2 }],
      rankingConfig,
      new Set(["https://example.com/sent-1", "https://example.com/sent-2"]),
      now
    );

    expect(result.map((item) => item.title)).toEqual(["Recent unsent article"]);
  });

  it("does not treat Atom updated as the publication timestamp", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(atom(`
      <entry>
        <title>Updated old article</title>
        <link rel="alternate" href="https://example.com/updated-only" />
        <updated>2026-07-22T12:00:00Z</updated>
      </entry>
    `), { status: 200 })));

    await expect(collectCandidates([feed], rankingConfig, new Set(), now)).resolves.toEqual([]);
  });

  it("prefers the Atom alternate link and canonicalizes tracking parameters", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(atom(`
      <entry>
        <title>Recent Atom article</title>
        <link rel="self" href="https://example.com/feed-entry" />
        <link rel="alternate" href="https://example.com/article/?utm_source=rss#section" />
        <published>2026-07-22T12:00:00Z</published>
      </entry>
    `), { status: 200 })));

    const result = await collectCandidates([feed], rankingConfig, new Set(), now);

    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("https://example.com/article");
  });

  it("matches sent URLs after canonicalization", async () => {
    const now = new Date("2026-07-23T01:30:00Z");
    const rankingConfig = await testRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      {
        title: "Already sent",
        url: "https://example.com/article/?utm_campaign=daily#top",
        published: "2026-07-22T12:00:00Z"
      }
    ]), { status: 200 })));

    const result = await collectCandidates(
      [feed],
      rankingConfig,
      new Set(["https://example.com/article"]),
      now
    );

    expect(result).toEqual([]);
  });
});

describe("community change claims", () => {
  it("detects capability and product-change wording independently from relevance scoring", () => {
    expect(looksLikeChangeClaim("Claude Code adds remote agents", "")).toBe(true);
    expect(looksLikeChangeClaim("Gemini now supports a new API", "")).toBe(true);
    expect(looksLikeChangeClaim("A vendor unveils its coding model", "")).toBe(true);
    expect(looksLikeChangeClaim("A practical MCP evaluation walkthrough", "")).toBe(false);
  });

  it("keeps Show HN projects in the community-technique lane", () => {
    expect(looksLikeChangeClaim("Show HN: A Java SDK for testing MCP servers", "new tool"))
      .toBe(false);
  });

  it("admits a community article at the normal threshold without engagement", async () => {
    const now = new Date("2026-08-02T04:45:33Z");
    const rankingConfig = await loadRankingConfig();
    const communityFeed: FeedConfig = {
      ...feed,
      sourceRole: "community",
      evidencePolicy: "external-primary-required"
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([{
      title: "Show HN: coding agent MCP evaluation",
      url: "https://example.com/high-value",
      published: "2026-08-02T03:00:00Z"
    }]), { status: 200 })));

    const result = await collectCandidatesDetailed(
      [communityFeed],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.evaluatedCandidates[0]!.contentScore).toBeGreaterThanOrEqual(25);
    expect(result.candidates).toHaveLength(1);
    expect(result.localEligibility).toMatchObject({
      scoredAtOrAboveFallback: 1,
      passedHardGates: 1,
      communityDiscoveryAdmitted: 0,
      rejectedCommunityGate: 0
    });
  });

  it("admits only one low-engagement AI community article for discovery", async () => {
    const now = new Date("2026-08-02T04:45:33Z");
    const rankingConfig = await loadRankingConfig();
    const communityFeed: FeedConfig = {
      ...feed,
      sourceRole: "community",
      evidencePolicy: "external-primary-required"
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([
      {
        title: "Show HN: coding agent",
        url: "https://example.com/stronger",
        published: "2026-08-02T03:00:00Z"
      },
      {
        title: "Show HN: agent best practice",
        url: "https://example.com/weaker",
        published: "2026-08-02T02:00:00Z"
      }
    ]), { status: 200 })));

    const result = await collectCandidatesDetailed(
      [communityFeed],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.candidates.map((candidate) => candidate.url))
      .toEqual(["https://example.com/stronger"]);
    expect(result.localEligibility).toMatchObject({
      scoredAtOrAboveFallback: 2,
      passedHardGates: 1,
      communityDiscoveryAdmitted: 1,
      rejectedCommunityGate: 1
    });
  });

  it("does not use community discovery for an unverified change claim", async () => {
    const now = new Date("2026-08-02T04:45:33Z");
    const rankingConfig = await loadRankingConfig();
    const communityFeed: FeedConfig = {
      ...feed,
      sourceRole: "community",
      evidencePolicy: "external-primary-required"
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([{
      title: "AI agent platform launches breaking change",
      url: "https://example.com/unverified-launch",
      published: "2026-08-02T03:00:00Z"
    }]), { status: 200 })));

    const result = await collectCandidatesDetailed(
      [communityFeed],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.candidates).toEqual([]);
    expect(result.localEligibility).toMatchObject({
      communityDiscoveryAdmitted: 0,
      rejectedEvidence: 1
    });
  });

  it("does not let low-engagement community discovery bypass source cooldown", async () => {
    const now = new Date("2026-08-02T04:45:33Z");
    const rankingConfig = await loadRankingConfig();
    const communityFeed: FeedConfig = {
      ...feed,
      sourceRole: "community",
      evidencePolicy: "external-primary-required"
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([{
      title: "Show HN: coding agent",
      url: "https://example.com/cooled-discovery",
      published: "2026-08-02T03:00:00Z"
    }]), { status: 200 })));

    const result = await collectCandidatesDetailed(
      [communityFeed],
      rankingConfig,
      new Set(),
      now,
      new Set([communityFeed.id])
    );

    expect(result.candidates).toEqual([]);
    expect(result.localEligibility).toMatchObject({
      communityDiscoveryAdmitted: 0,
      rejectedCommunityGate: 0,
      rejectedSourceCooldown: 1
    });
  });

  it("rejects critical-impact scoring without an AI topic match", async () => {
    const now = new Date("2026-08-02T04:45:33Z");
    const rankingConfig = await loadRankingConfig();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rss([{
      title: "Chrome security advisory system design",
      url: "https://example.com/general-security",
      published: "2026-08-02T03:00:00Z"
    }]), { status: 200 })));

    const result = await collectCandidatesDetailed(
      [feed],
      rankingConfig,
      new Set(),
      now
    );

    expect(result.evaluatedCandidates[0]!.contentScore).toBeGreaterThanOrEqual(18);
    expect(result.candidates).toEqual([]);
    expect(result.localEligibility.rejectedAiTopic).toBe(1);
    expect(result.rejectionReasons.get(result.evaluatedCandidates[0]!.id))
      .toBe("missing-ai-topic");
  });
});
