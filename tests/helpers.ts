import type { NewsCandidate } from "../src/types.js";

export function makeCandidate(overrides: Partial<NewsCandidate> = {}): NewsCandidate {
  return {
    id: "candidate-1",
    sourceId: "test-source",
    source: "Test source",
    sourceRole: "official",
    organization: "test",
    evidencePolicy: "primary",
    evidenceStatus: "primary",
    contentKind: "concept",
    primaryTopic: "coding-agents",
    title: "A useful AI update",
    url: "https://example.com/update",
    description: "Details",
    publishedAt: "2026-07-23T01:00:00.000Z",
    contentScore: 80,
    scoreBreakdown: {
      topic: 40,
      stack: 20,
      impact: 0,
      goal: 20,
      negativePenalty: 0,
      positiveTotal: 80,
      total: 80
    },
    matchedGroups: [],
    negativeMatches: [],
    strongMatchCount: 0,
    discoveredBy: ["Test source"],
    corroborationUrls: [],
    bypassSourceCooldown: false,
    ...overrides
  };
}
