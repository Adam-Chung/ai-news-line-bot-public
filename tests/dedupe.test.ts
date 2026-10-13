import { describe, expect, it } from "vitest";
import { deduplicateCandidates, isSameEvent } from "../src/dedupe.js";
import { makeCandidate } from "./helpers.js";

describe("deduplicateCandidates", () => {
  it("merges identical canonical URLs and retains every discovery source", () => {
    const result = deduplicateCandidates([
      makeCandidate({ source: "Feed A", discoveredBy: ["Feed A"] }),
      makeCandidate({ source: "Feed B", discoveredBy: ["Feed B"] })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.discoveredBy).toEqual(["Feed A", "Feed B"]);
  });

  it("deduplicates the same versioned change from one organization without claiming corroboration", () => {
    const result = deduplicateCandidates([
      makeCandidate({
        id: "a",
        url: "https://example.com/release",
        title: "Gemini API 3.2 release adds structured output",
        contentKind: "change",
        organization: "google"
      }),
      makeCandidate({
        id: "b",
        url: "https://example.org/changelog",
        title: "Gemini API 3.2 release adds structured output",
        contentKind: "change",
        organization: "google"
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.corroborationUrls).toEqual([]);
  });

  it("records independent corroboration for the same versioned change", () => {
    const result = deduplicateCandidates([
      makeCandidate({
        id: "community",
        url: "https://community.example/change",
        title: "Claude API 5.1 breaking change migration",
        contentKind: "change",
        sourceRole: "community",
        organization: "community",
        evidencePolicy: "external-primary-required",
        evidenceStatus: "community-technique"
      }),
      makeCandidate({
        id: "official",
        url: "https://official.example/change",
        title: "Claude API 5.1 breaking change migration",
        contentKind: "change",
        organization: "anthropic",
        evidenceStatus: "primary"
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("official");
    expect(result[0]?.corroborationUrls).toEqual(["https://community.example/change"]);
  });

  it("retains the highest content score while upgrading evidence separately", () => {
    const result = deduplicateCandidates([
      makeCandidate({
        id: "community",
        contentScore: 90,
        evidenceStatus: "community-technique",
        sourceRole: "community"
      }),
      makeCandidate({
        id: "official",
        contentScore: 10,
        evidenceStatus: "primary"
      })
    ]);

    expect(result[0]).toMatchObject({
      id: "community",
      contentScore: 90,
      evidenceStatus: "linked-primary"
    });
  });

  it("does not label a community URL as linked primary when the official evidence is separate", () => {
    const result = deduplicateCandidates([
      makeCandidate({
        id: "community",
        url: "https://community.example/change",
        title: "Claude API 5.1 breaking change migration",
        contentKind: "change",
        contentScore: 90,
        evidenceStatus: "community-technique",
        sourceRole: "community",
        organization: "community"
      }),
      makeCandidate({
        id: "official",
        url: "https://official.example/change",
        title: "Claude API 5.1 breaking change migration",
        contentKind: "change",
        contentScore: 10,
        evidenceStatus: "primary",
        organization: "anthropic"
      })
    ]);

    expect(result[0]).toMatchObject({
      id: "community",
      contentScore: 90,
      evidenceStatus: "corroborated",
      corroborationUrls: ["https://official.example/change"]
    });
  });

  it("keeps expert analysis separate from the primary announcement", () => {
    const result = deduplicateCandidates([
      makeCandidate({
        id: "official",
        title: "Spring AI 2.1 release adds agent tools",
        contentKind: "change"
      }),
      makeCandidate({
        id: "analysis",
        url: "https://expert.example/spring-ai-analysis",
        title: "Spring AI 2.1 release adds agent tools",
        contentKind: "change",
        sourceRole: "expert",
        evidencePolicy: "analysis",
        evidenceStatus: "expert-analysis"
      })
    ]);

    expect(result.map((item) => item.id)).toEqual(["official", "analysis"]);
  });
});

describe("isSameEvent", () => {
  it("does not group generic articles that only share an AI topic", () => {
    expect(isSameEvent(
      makeCandidate({ title: "Agent reliability practices", contentKind: "change" }),
      makeCandidate({ title: "Agent security evaluation", contentKind: "change" })
    )).toBe(false);
  });
});
