import { describe, expect, it } from "vitest";

import {
  loadScoringConfig,
  normalizeScoringText,
  scoreContent,
  type ScoringConfig
} from "../src/scoring.js";

function testConfig(): ScoringConfig {
  return {
    titleMultiplier: 1,
    descriptionMultiplier: 0.6,
    dimensions: {
      topic: {
        cap: 40,
        groups: [
          {
            id: "agents",
            weight: 10,
            phrases: ["agent", "agentic", "agentic coding"]
          },
          {
            id: "rag",
            weight: 10,
            phrases: ["rag", "retrieval-augmented generation"]
          },
          {
            id: "api",
            weight: 10,
            phrases: ["api"]
          }
        ]
      },
      stack: {
        cap: 20,
        groups: [
          {
            id: "java",
            weight: 12,
            phrases: ["java", "spring ai"]
          }
        ]
      },
      impact: {
        cap: 20,
        groups: [
          {
            id: "breaking",
            weight: 12,
            phrases: ["breaking change", "deprecated"]
          },
          {
            id: "security",
            weight: 12,
            phrases: ["security advisory", "cve"]
          }
        ]
      },
      goal: {
        cap: 20,
        groups: [
          {
            id: "reliability",
            weight: 10,
            phrases: ["reliability", "fault tolerance"]
          }
        ]
      }
    },
    negative: {
      cap: 30,
      groups: [
        {
          id: "finance",
          weight: 15,
          phrases: ["funding", "valuation"]
        },
        {
          id: "marketing",
          weight: 20,
          phrases: ["keynote", "webinar"]
        }
      ]
    }
  };
}

describe("normalizeScoringText", () => {
  it("uses Unicode NFKC, lower case and collapsed whitespace", () => {
    expect(normalizeScoringText("  ＪＡＶＡ\t\n API  ")).toBe("java api");
  });
});

describe("scoreContent", () => {
  it("matches complete English words instead of substrings", () => {
    const result = scoreContent(
      {
        title: "JavaScript storage enables rapid prototypes"
      },
      testConfig()
    );

    expect(result.contentScore).toBe(0);
    expect(result.matchedGroups).toEqual([]);
  });

  it("matches Java, RAG and API as complete terms", () => {
    const result = scoreContent(
      {
        title: "Java API for RAG"
      },
      testConfig()
    );

    expect(result.contentScore).toBe(32);
    expect(result.matchedGroups.map((match) => match.groupId)).toEqual([
      "rag",
      "api",
      "java"
    ]);
  });

  it("scores a synonym group once and prefers its title match", () => {
    const result = scoreContent(
      {
        title: "Agentic coding in production",
        description: "An agent and agentic workflow for developers"
      },
      testConfig()
    );

    expect(result.breakdown.topic).toBe(10);
    expect(result.matchedGroups).toHaveLength(1);
    expect(result.matchedGroups[0]).toMatchObject({
      groupId: "agents",
      phrase: "agentic coding",
      field: "title",
      points: 10
    });
  });

  it("applies the description multiplier when there is no title match", () => {
    const result = scoreContent(
      {
        title: "A practical engineering guide",
        description: "Improve Java reliability with a new API"
      },
      testConfig()
    );

    expect(result.breakdown.topic).toBe(6);
    expect(result.breakdown.stack).toBe(7.2);
    expect(result.breakdown.goal).toBe(6);
    expect(result.contentScore).toBe(19.2);
  });

  it("caps every dimension independently", () => {
    const config = testConfig();
    config.dimensions.impact.cap = 20;

    const result = scoreContent(
      {
        title: "Breaking change and security advisory for CVE handling"
      },
      config
    );

    expect(result.matchedGroups.filter((match) => match.dimension === "impact"))
      .toHaveLength(2);
    expect(result.breakdown.impact).toBe(20);
  });

  it("applies negative groups once, caps the penalty and clamps at zero", () => {
    const result = scoreContent(
      {
        title: "Funding valuation keynote webinar"
      },
      testConfig()
    );

    expect(result.negativeMatches).toHaveLength(2);
    expect(result.breakdown.negativePenalty).toBe(30);
    expect(result.contentScore).toBe(0);
  });

  it("returns a complete positive and negative breakdown", () => {
    const result = scoreContent(
      {
        title: "Java agent API breaking change improves reliability",
        description: "Announced during a funding keynote"
      },
      testConfig()
    );

    expect(result.breakdown).toEqual({
      topic: 20,
      stack: 12,
      impact: 12,
      goal: 10,
      negativePenalty: 21,
      positiveTotal: 54,
      total: 33
    });
    expect(result.contentScore).toBe(33);
    expect(result.negativeMatches).toEqual([
      {
        groupId: "finance",
        phrase: "funding",
        field: "description",
        penalty: 9
      },
      {
        groupId: "marketing",
        phrase: "keynote",
        field: "description",
        penalty: 12
      }
    ]);
  });

  it("contains no source or freshness input and produces equal scores for equal text", () => {
    const officialText = {
      title: "Java agent API breaking change",
      description: "Reliability improvements"
    };
    const communityText = { ...officialText };

    expect(scoreContent(officialText, testConfig())).toEqual(
      scoreContent(communityText, testConfig())
    );
  });

  it("rejects duplicate group identifiers", () => {
    const config = testConfig();
    config.dimensions.stack.groups[0]!.id = "agents";

    expect(() => scoreContent({ title: "Java" }, config)).toThrow(
      "Duplicate scoring group id: agents."
    );
  });

  it("rejects empty phrases", () => {
    const config = testConfig();
    config.dimensions.topic.groups[0]!.phrases.push(" ");

    expect(() => scoreContent({ title: "Agent" }, config)).toThrow(
      "agents.phrases must not contain empty phrases."
    );
  });
});

describe("loadScoringConfig", () => {
  it("loads and validates the project scoring configuration", async () => {
    const config = await loadScoringConfig();

    expect(config.dimensions.topic.cap).toBe(40);
    expect(config.dimensions.stack.cap).toBe(20);
    expect(config.dimensions.impact.cap).toBe(20);
    expect(config.dimensions.goal.cap).toBe(20);
    expect(config.negative.cap).toBe(30);
    expect(JSON.stringify(config.dimensions)).not.toMatch(/fresh|source|priority/i);
    expect(JSON.stringify(config.negative)).not.toMatch(/fresh|source|priority/i);
  });

  it("matches Chinese phrases inside an unsegmented sentence", async () => {
    const config = await loadScoringConfig();
    const result = scoreContent({
      title: "這篇文章說明多智能體如何進行工具調用與上下文工程"
    }, config);

    expect(result.matchedGroups.map((match) => match.groupId)).toEqual(
      expect.arrayContaining(["agent-systems", "agent-protocols", "context-engineering"])
    );
  });

  it("matches new local-model and agent-framework vocabulary", async () => {
    const config = await loadScoringConfig();
    const result = scoreContent({
      title: "Microsoft Agent Framework integrates Ollama local LLM quantization"
    }, config);

    expect(result.matchedGroups.map((match) => match.groupId)).toEqual(
      expect.arrayContaining(["agent-systems", "model-serving-infra", "developer-tools"])
    );
  });

  it("admits typed decision-model reporting to the fallback candidate pool", async () => {
    const config = await loadScoringConfig();
    const result = scoreContent({
      title: "前OpenAI研究員新創TypeSafe推Jev模型，讓AI從生成文字轉向直接判斷",
      description: "TypeSafe全面開放Jev，讓AI直接回傳受型別限制的判斷與機率，省去大型語言模型逐字生成與解析流程，主打低延遲與低成本"
    }, config);

    expect(result.contentScore).toBeGreaterThanOrEqual(18);
    expect(result.matchedGroups.map((match) => match.groupId)).toEqual(
      expect.arrayContaining([
        "decision-models",
        "machine-consumable-output",
        "cost-and-limits",
        "engineering-practice"
      ])
    );
  });
});
