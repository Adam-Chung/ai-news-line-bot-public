import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLineMessage, formatNoNewsMessage, sendLineMessage, sendLineMessageToRecipients } from "../src/line.js";
import type { CuratedDigest, NewsCandidate } from "../src/types.js";
import { makeCandidate } from "./helpers.js";

describe("formatLineMessage", () => {
  it("formats a selected item and preserves its source URL", () => {
    const candidates: NewsCandidate[] = [makeCandidate({
      id: "abc",
      source: "Test",
      title: "Source title",
      url: "https://example.com/news",
      description: ""
    })];
    const digest: CuratedDigest = { items: [{
      candidateId: "abc", relevanceScore: 90, category: "AI 新概念", title: "Context Engineering",
      summaryZh: "這是繁體中文摘要。", summaryEn: "This is the English summary.",
      whyImportant: "與可靠 AI 系統有關", conceptExplanation: "設計模型執行時取得的完整脈絡。"
    }], decisions: [] };

    const result = formatLineMessage(
      digest,
      candidates,
      new Date("2026-07-20T00:00:00Z"),
      "測試使用者"
    );

    expect(result).toContain("測試使用者 的今日 AI 情報");
    expect(result).toContain("Context Engineering");
    expect(result).toContain("這是繁體中文摘要。\n\nThis is the English summary.");
    expect(result.indexOf("這是繁體中文摘要。"))
      .toBeLessThan(result.indexOf("This is the English summary."));
    expect(result).toContain("資料性質：官方發布");
    expect(result).toContain("來源：Test");
    expect(result).toContain("🔗 https://example.com/news");
    expect(result).toContain("https://example.com/news");
  });

  it("formats Hacker News with the external article as primary and discussion as secondary", () => {
    const candidate = makeCandidate({
      id: "hn",
      sourceId: "hacker-news",
      source: "Hacker News",
      sourceRole: "community",
      evidencePolicy: "external-primary-required",
      evidenceStatus: "community-technique",
      url: "https://example.com/ai-tool",
      discussionUrl: "https://news.ycombinator.com/item?id=44000001"
    });
    const digest: CuratedDigest = {
      items: [{
        candidateId: "hn",
        relevanceScore: 90,
        category: "開發工具",
        title: "AI 工具",
        summaryZh: "繁體中文摘要。",
        summaryEn: "English summary.",
        whyImportant: "與 AI 開發有關",
        conceptExplanation: null
      }],
      decisions: []
    };

    const result = formatLineMessage(digest, [candidate]);

    expect(result).toContain("🔗 原文：https://example.com/ai-tool");
    expect(result).toContain(
      "💬 Hacker News 討論：https://news.ycombinator.com/item?id=44000001"
    );
  });

  it("formats a daily status when no item reaches the threshold", () => {
    const result = formatNoNewsMessage({
      validDateCount: 323,
      evaluatedCount: 130,
      candidateCount: 3,
      highestContentScore: 22,
      geminiCalled: true,
      localEligibility: {
        scoredAtOrAboveFallback: 3,
        passedHardGates: 3,
        normalEligible: 0,
        communityDiscoveryAdmitted: 0,
        rejectedAiTopic: 0,
        rejectedCommunityGate: 0,
        rejectedEvidence: 0,
        rejectedSourceCooldown: 0
      },
      normalThreshold: 25,
      fallbackThreshold: 18,
      geminiThreshold: 75
    }, new Date("2026-07-20T00:00:00Z"));

    expect(result).toContain("沒有發現達到重要性門檻");
    expect(result).toContain("24 小時內有效內容：323 篇");
    expect(result).toContain("當日最高本地分數：22 分");
    expect(result).toContain("淘汰原因：無硬性資格淘汰");
    expect(result).toContain("已檢查 3 篇候選，均未達 75 分");
    expect(result).toContain("一般 25 分；0 篇時保底 18 分");
  });

  it("labels Chinese media content as secondary reporting", () => {
    const candidate = makeCandidate({
      id: "media",
      sourceRole: "media",
      evidencePolicy: "reporting",
      evidenceStatus: "secondary-report"
    });
    const digest: CuratedDigest = {
      items: [{
        candidateId: "media",
        relevanceScore: 80,
        category: "重要新聞",
        title: "媒體報導",
        summaryZh: "繁體中文摘要。",
        summaryEn: "English summary.",
        whyImportant: "提供在地觀點",
        conceptExplanation: null
      }],
      decisions: []
    };

    expect(formatLineMessage(digest, [candidate])).toContain("資料性質：媒體報導");
  });

  it("explains when Gemini was not called", () => {
    const result = formatNoNewsMessage({
      validDateCount: 0,
      evaluatedCount: 0,
      candidateCount: 0,
      highestContentScore: null,
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
      normalThreshold: 25,
      fallbackThreshold: 18,
      geminiThreshold: 75
    });

    expect(result).toContain("未呼叫");
    expect(result).toContain("無可評分內容");
  });

  it("explains when a fallback-score article fails the community gate", () => {
    const result = formatNoNewsMessage({
      validDateCount: 95,
      evaluatedCount: 95,
      candidateCount: 0,
      highestContentScore: 24,
      geminiCalled: false,
      localEligibility: {
        scoredAtOrAboveFallback: 1,
        passedHardGates: 0,
        normalEligible: 0,
        communityDiscoveryAdmitted: 0,
        rejectedAiTopic: 0,
        rejectedCommunityGate: 1,
        rejectedEvidence: 0,
        rejectedSourceCooldown: 0
      },
      normalThreshold: 25,
      fallbackThreshold: 18,
      geminiThreshold: 75
    }, new Date("2026-08-02T04:45:33Z"));

    expect(result).toContain("18 分以上內容：1 篇");
    expect(result).toContain("通過資格檢查：0 篇");
    expect(result).toContain("社群互動不足 1 篇");
    expect(result).toContain("未呼叫（資格檢查後沒有可送出的候選）");
  });

  it("shows AI-topic rejection and the admitted community discovery count", () => {
    const result = formatNoNewsMessage({
      validDateCount: 100,
      evaluatedCount: 90,
      candidateCount: 1,
      highestContentScore: 22,
      geminiCalled: true,
      localEligibility: {
        scoredAtOrAboveFallback: 2,
        passedHardGates: 1,
        normalEligible: 0,
        communityDiscoveryAdmitted: 1,
        rejectedAiTopic: 1,
        rejectedCommunityGate: 0,
        rejectedEvidence: 0,
        rejectedSourceCooldown: 0
      },
      normalThreshold: 25,
      fallbackThreshold: 18,
      geminiThreshold: 75
    });

    expect(result).toContain("社群探索放行：1 篇");
    expect(result).toContain("AI 主題不足 1 篇");
  });
});

describe("sendLineMessage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("always uses LINE push with the configured target", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendLineMessage("hello", "token", "U123");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.line.me/v2/bot/message/push");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      to: "U123", messages: [{ type: "text", text: "hello" }]
    });
  });

  it("rejects an empty target instead of broadcasting", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendLineMessage("hello", "token", "")).rejects.toThrow("LINE_TARGET_ID is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attempts every recipient even when one delivery fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string };
      return new Response(body.to === "U-fails" ? "failed" : null, {
        status: body.to === "U-fails" ? 500 : 200
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await sendLineMessageToRecipients("hello", "token", [
      { alias: "Primary", targetId: "U-primary" },
      { alias: "User 2", targetId: "U-fails" },
      { alias: "User 3", targetId: "U-user-3" }
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
});
