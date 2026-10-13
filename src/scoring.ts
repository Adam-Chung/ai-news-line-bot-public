import { readFile } from "node:fs/promises";
import path from "node:path";

export type PositiveDimension = "topic" | "stack" | "impact" | "goal";
export type MatchField = "title" | "description";

export interface ScoringGroup {
  id: string;
  weight: number;
  phrases: string[];
}

export interface ScoringDimensionConfig {
  cap: number;
  groups: ScoringGroup[];
}

export interface ScoringConfig {
  titleMultiplier: number;
  descriptionMultiplier: number;
  dimensions: Record<PositiveDimension, ScoringDimensionConfig>;
  negative: ScoringDimensionConfig;
}

export interface ScoreInput {
  title: string;
  description?: string;
}

export interface PositiveMatch {
  dimension: PositiveDimension;
  groupId: string;
  phrase: string;
  field: MatchField;
  points: number;
}

export interface NegativeMatch {
  groupId: string;
  phrase: string;
  field: MatchField;
  penalty: number;
}

export interface ScoreBreakdown {
  topic: number;
  stack: number;
  impact: number;
  goal: number;
  negativePenalty: number;
  positiveTotal: number;
  total: number;
}

export interface ContentScoreResult {
  contentScore: number;
  breakdown: ScoreBreakdown;
  matchedGroups: PositiveMatch[];
  negativeMatches: NegativeMatch[];
}

const POSITIVE_DIMENSIONS: PositiveDimension[] = [
  "topic",
  "stack",
  "impact",
  "goal"
];

const WORD_CHARACTER = "[\\p{L}\\p{N}_]";

/**
 * Normalization is intentionally limited to compatibility normalization,
 * case folding and whitespace. It does not remove punctuation because doing so
 * could turn two unrelated terms into a false phrase match.
 */
export function normalizeScoringText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function phrasePattern(phrase: string): RegExp {
  const normalized = normalizeScoringText(phrase);
  if (!normalized) {
    throw new Error("Scoring phrases must not be empty.");
  }

  const escaped = escapeRegExp(normalized).replace(/\\ /gu, "\\s+");
  // 中文通常不以空白分詞，因此含漢字的詞彙採子字串匹配；英文仍保留字界避免誤判。
  const containsHan = /\p{Script=Han}/u.test(normalized);
  const startsWithWord = !containsHan && /^[\p{L}\p{N}_]/u.test(normalized);
  const endsWithWord = !containsHan && /[\p{L}\p{N}_]$/u.test(normalized);
  const prefix = startsWithWord ? `(?<!${WORD_CHARACTER})` : "";
  const suffix = endsWithWord ? `(?!${WORD_CHARACTER})` : "";

  return new RegExp(`${prefix}${escaped}${suffix}`, "u");
}

interface BestMatch {
  phrase: string;
  field: MatchField;
  multiplier: number;
}

function findBestMatch(
  group: ScoringGroup,
  title: string,
  description: string,
  config: ScoringConfig
): BestMatch | undefined {
  let best: BestMatch | undefined;

  for (const phrase of group.phrases) {
    const pattern = phrasePattern(phrase);
    const candidates: BestMatch[] = [];

    if (pattern.test(title)) {
      candidates.push({
        phrase,
        field: "title",
        multiplier: config.titleMultiplier
      });
    }
    if (pattern.test(description)) {
      candidates.push({
        phrase,
        field: "description",
        multiplier: config.descriptionMultiplier
      });
    }

    for (const candidate of candidates) {
      if (
        !best ||
        candidate.multiplier > best.multiplier ||
        (candidate.multiplier === best.multiplier &&
          normalizeScoringText(candidate.phrase).length >
            normalizeScoringText(best.phrase).length)
      ) {
        best = candidate;
      }
    }
  }

  return best;
}

function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}

export function validateScoringConfig(config: ScoringConfig): void {
  assertNonNegativeFinite(config.titleMultiplier, "titleMultiplier");
  assertNonNegativeFinite(config.descriptionMultiplier, "descriptionMultiplier");

  const ids = new Set<string>();
  const dimensions: Array<[string, ScoringDimensionConfig]> = [
    ...POSITIVE_DIMENSIONS.map(
      (dimension): [string, ScoringDimensionConfig] => [
        dimension,
        config.dimensions[dimension]
      ]
    ),
    ["negative", config.negative]
  ];

  for (const [dimensionName, dimension] of dimensions) {
    if (!dimension) {
      throw new Error(`Missing scoring dimension: ${dimensionName}.`);
    }
    assertNonNegativeFinite(dimension.cap, `${dimensionName}.cap`);

    for (const group of dimension.groups) {
      if (!group.id.trim()) {
        throw new Error(`${dimensionName} contains a group with an empty id.`);
      }
      if (ids.has(group.id)) {
        throw new Error(`Duplicate scoring group id: ${group.id}.`);
      }
      ids.add(group.id);
      assertNonNegativeFinite(group.weight, `${group.id}.weight`);

      if (group.phrases.length === 0) {
        throw new Error(`${group.id}.phrases must contain at least one phrase.`);
      }
      for (const phrase of group.phrases) {
        if (!normalizeScoringText(phrase)) {
          throw new Error(`${group.id}.phrases must not contain empty phrases.`);
        }
      }
    }
  }
}

export function scoreContent(
  input: ScoreInput,
  config: ScoringConfig
): ContentScoreResult {
  validateScoringConfig(config);

  const title = normalizeScoringText(input.title);
  const description = normalizeScoringText(input.description ?? "");
  const matchedGroups: PositiveMatch[] = [];
  const dimensionScores: Record<PositiveDimension, number> = {
    topic: 0,
    stack: 0,
    impact: 0,
    goal: 0
  };

  for (const dimensionName of POSITIVE_DIMENSIONS) {
    const dimension = config.dimensions[dimensionName];
    let rawScore = 0;

    for (const group of dimension.groups) {
      const match = findBestMatch(group, title, description, config);
      if (!match) {
        continue;
      }

      const points = roundScore(group.weight * match.multiplier);
      rawScore += points;
      matchedGroups.push({
        dimension: dimensionName,
        groupId: group.id,
        phrase: match.phrase,
        field: match.field,
        points
      });
    }

    dimensionScores[dimensionName] = roundScore(
      clamp(rawScore, 0, dimension.cap)
    );
  }

  const negativeMatches: NegativeMatch[] = [];
  let rawNegativePenalty = 0;
  for (const group of config.negative.groups) {
    const match = findBestMatch(group, title, description, config);
    if (!match) {
      continue;
    }

    const penalty = roundScore(group.weight * match.multiplier);
    rawNegativePenalty += penalty;
    negativeMatches.push({
      groupId: group.id,
      phrase: match.phrase,
      field: match.field,
      penalty
    });
  }

  const negativePenalty = roundScore(
    clamp(rawNegativePenalty, 0, config.negative.cap)
  );
  const positiveTotal = roundScore(
    POSITIVE_DIMENSIONS.reduce(
      (sum, dimension) => sum + dimensionScores[dimension],
      0
    )
  );
  const contentScore = roundScore(
    clamp(positiveTotal - negativePenalty, 0, 100)
  );

  return {
    contentScore,
    breakdown: {
      ...dimensionScores,
      negativePenalty,
      positiveTotal,
      total: contentScore
    },
    matchedGroups,
    negativeMatches
  };
}

export async function loadScoringConfig(
  filePath = path.resolve(process.cwd(), "config", "scoring.json")
): Promise<ScoringConfig> {
  const config = JSON.parse(await readFile(filePath, "utf8")) as ScoringConfig;
  validateScoringConfig(config);
  return config;
}
