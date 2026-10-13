import { describe, expect, it } from "vitest";
import { attachGeminiDecisions, createRunDiagnostic } from "../src/diagnostics.js";
import type { CandidateCollectionResult } from "../src/feeds.js";
import { makeCandidate } from "./helpers.js";

describe("article diagnostics", () => {
  it("records every scored URL with its local and Gemini decisions", () => {
    const selected = makeCandidate({
      id: "selected",
      url: "https://example.com/selected",
      contentScore: 28,
      selectionLane: "value"
    });
    const rejected = makeCandidate({
      id: "rejected",
      url: "https://example.com/rejected",
      contentScore: 0,
      scoreBreakdown: {
        topic: 0,
        stack: 0,
        impact: 0,
        goal: 0,
        negativePenalty: 0,
        positiveTotal: 0,
        total: 0
      }
    });
    const collection: CandidateCollectionResult = {
      candidates: [selected],
      evaluatedCandidates: [selected, rejected],
      sourceStats: [{
        sourceId: "test-source",
        fetched: 2,
        validDate: 2,
        scored: 2,
        rejectedSent: 0,
        rejectedDate: 0,
        rejectedCommunityGate: 0,
        rejectedSourceCooldown: 0,
        selected: 1
      }],
      localEligibility: {
        scoredAtOrAboveFallback: 1,
        passedHardGates: 1,
        normalEligible: 1,
        communityDiscoveryAdmitted: 0,
        rejectedAiTopic: 0,
        rejectedCommunityGate: 0,
        rejectedEvidence: 0,
        rejectedSourceCooldown: 0
      },
      rejectionReasons: new Map()
    };

    const diagnostic = createRunDiagnostic(
      collection,
      25,
      18,
      new Set(),
      "2026-10-06T01:00:00.000Z"
    );
    attachGeminiDecisions(diagnostic, [{
      candidateId: "selected",
      relevanceScore: 82,
      selected: true,
      reason: "與使用者工作相關"
    }]);

    expect(diagnostic.evaluatedItems).toHaveLength(2);
    expect(diagnostic.evaluatedItems?.find((item) => item.url === rejected.url)).toMatchObject({
      contentScore: 0,
      localDecision: "rejected:below-fallback-score"
    });
    expect(diagnostic.evaluatedItems?.find((item) => item.url === selected.url)).toMatchObject({
      localDecision: "selected:value",
      geminiDecision: {
        relevanceScore: 82,
        selected: true
      }
    });
  });
});
