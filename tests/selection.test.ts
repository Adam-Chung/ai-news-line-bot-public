import { describe, expect, it } from "vitest";
import { selectCandidates, type SelectionCandidate, type SelectionLimits } from "../src/selection.js";

const limits: SelectionLimits = {
  candidateLimit: 6,
  minContentScore: 30,
  fallbackCandidateLimit: 3,
  fallbackMinContentScore: 18,
  valueSlots: 4,
  primarySlots: 1,
  discoverySlots: 1,
  maxPerSource: 1,
  maxPerOrganization: 2,
  maxPerTopic: 2,
  sourceCooldownHours: 48,
  sourceCooldownBypassGroups: ["breaking-lifecycle", "security"]
};

function candidate(
  id: string,
  contentScore: number,
  overrides: Partial<SelectionCandidate> = {}
): SelectionCandidate {
  return {
    id,
    sourceId: `source-${id}`,
    organization: `org-${id}`,
    sourceRole: "official",
    evidenceStatus: "primary",
    primaryTopic: `topic-${id}`,
    contentScore,
    strongMatchCount: 1,
    publishedAt: "2026-07-23T01:00:00.000Z",
    url: `https://example.com/${id}`,
    bypassSourceCooldown: false,
    ...overrides
  };
}

describe("selectCandidates", () => {
  it("admits high-value community content without a source-value penalty", () => {
    const community = candidate("community", 90, {
      sourceRole: "community",
      evidenceStatus: "community-technique"
    });
    const official = candidate("official", 40);

    const result = selectCandidates([official, community], limits);

    expect(result[0]?.candidate.id).toBe("community");
    expect(result[0]?.lane).toBe("value");
  });

  it("blocks unverified claims even when their content score is high", () => {
    const result = selectCandidates([
      candidate("rumor", 100, {
        sourceRole: "community",
        evidenceStatus: "unverified-claim"
      }),
      candidate("verified", 50)
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["verified"]);
  });

  it("applies source, organization, and topic diversity constraints", () => {
    const result = selectCandidates([
      candidate("a", 90, { sourceId: "same-source", organization: "same-org", primaryTopic: "agents" }),
      candidate("b", 89, { sourceId: "same-source", organization: "same-org", primaryTopic: "agents" }),
      candidate("c", 88, { organization: "same-org", primaryTopic: "agents" }),
      candidate("d", 87, { organization: "same-org", primaryTopic: "other" }),
      candidate("e", 86, { organization: "different-org", primaryTopic: "different" })
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["a", "c", "e"]);
  });

  it("uses deterministic non-source tie breaks", () => {
    const result = selectCandidates([
      candidate("later-url", 50, {
        url: "https://example.com/z",
        publishedAt: "2026-07-23T01:00:00.000Z"
      }),
      candidate("stronger", 50, {
        strongMatchCount: 2,
        url: "https://example.com/y"
      }),
      candidate("earlier-url", 50, {
        url: "https://example.com/a",
        publishedAt: "2026-07-23T01:00:00.000Z"
      })
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["stronger", "earlier-url", "later-url"]);
  });

  it("does not use publication time to break equal-score ties", () => {
    const result = selectCandidates([
      candidate("older-a", 50, {
        url: "https://example.com/a",
        publishedAt: "2026-07-22T02:00:00.000Z"
      }),
      candidate("newer-z", 50, {
        url: "https://example.com/z",
        publishedAt: "2026-07-23T01:00:00.000Z"
      })
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["older-a", "newer-z"]);
  });

  it("reserves a discovery slot for a different source at the fallback threshold", () => {
    const result = selectCandidates([
      candidate("qualified", 30),
      candidate("below", 29)
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["qualified", "below"]);
    expect(result[1]?.lane).toBe("discovery");
  });

  it("uses at most three fallback candidates only when nothing reaches the normal threshold", () => {
    const result = selectCandidates([
      candidate("fallback-a", 29),
      candidate("fallback-b", 25),
      candidate("fallback-c", 20),
      candidate("too-low", 17)
    ], limits);

    expect(result.map((item) => item.candidate.id))
      .toEqual(["fallback-a", "fallback-b", "fallback-c"]);
    expect(result.every((item) => item.lane === "fallback")).toBe(true);
  });

  it("adds one cross-source discovery candidate when a normal candidate exists", () => {
    const result = selectCandidates([
      candidate("qualified", 30),
      candidate("fallback-only", 29)
    ], limits);

    expect(result.map((item) => item.candidate.id)).toEqual(["qualified", "fallback-only"]);
  });

  it("cools recently delivered sources across runs", () => {
    const result = selectCandidates([
      candidate("recent", 90, { sourceId: "recent-source" }),
      candidate("other", 40)
    ], limits, new Set(["recent-source"]));

    expect(result.map((item) => item.candidate.id)).toEqual(["other"]);
  });

  it("allows critical items to bypass source cooldown", () => {
    const result = selectCandidates([
      candidate("critical", 50, {
        sourceId: "recent-source",
        bypassSourceCooldown: true
      })
    ], limits, new Set(["recent-source"]));

    expect(result.map((item) => item.candidate.id)).toEqual(["critical"]);
  });
});
