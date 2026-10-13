import type { EvidenceStatus, SelectionLane, SourceRole } from "./types.js";

export interface SelectionCandidate {
  id: string;
  sourceId: string;
  organization: string;
  sourceRole: SourceRole;
  evidenceStatus: EvidenceStatus;
  primaryTopic: string;
  contentScore: number;
  strongMatchCount: number;
  publishedAt: string;
  url: string;
  bypassSourceCooldown: boolean;
}

export interface SelectedCandidate<T extends SelectionCandidate> {
  candidate: T;
  lane: SelectionLane;
}

export interface SelectionLimits {
  candidateLimit: number;
  minContentScore: number;
  fallbackCandidateLimit: number;
  fallbackMinContentScore: number;
  valueSlots: number;
  primarySlots: number;
  discoverySlots: number;
  maxPerSource: number;
  maxPerOrganization: number;
  maxPerTopic: number;
  sourceCooldownHours: number;
  sourceCooldownBypassGroups: string[];
}

const blockedEvidenceStatuses = new Set<EvidenceStatus>(["unverified-claim"]);

function compareCandidates(a: SelectionCandidate, b: SelectionCandidate): number {
  return b.contentScore - a.contentScore
    || b.strongMatchCount - a.strongMatchCount
    || a.url.localeCompare(b.url);
}

function isPrimaryEvidence(status: EvidenceStatus): boolean {
  return status === "primary" || status === "linked-primary" || status === "corroborated";
}

/**
 * 依內容價值、來源多樣性與跨日冷卻規則，挑選要送交 Gemini 的候選文章。
 * 冷卻只抑制近期已推送來源；資安與破壞性變更等重大內容可由上游標記例外。
 */
export function selectCandidates<T extends SelectionCandidate>(
  candidates: T[],
  limits: SelectionLimits,
  recentSourceIds = new Set<string>()
): SelectedCandidate<T>[] {
  const allowed = candidates
    .filter((candidate) => !blockedEvidenceStatuses.has(candidate.evidenceStatus))
    .filter((candidate) => !recentSourceIds.has(candidate.sourceId) || candidate.bypassSourceCooldown);
  const standardMode = allowed.some(
    (candidate) => candidate.contentScore >= limits.minContentScore
  );
  const candidateLimit = standardMode
    ? limits.candidateLimit
    : limits.fallbackCandidateLimit;
  const standardOrdered = allowed
    .filter((candidate) => candidate.contentScore >= limits.minContentScore)
    .sort(compareCandidates);
  const discoveryOrdered = allowed
    .filter((candidate) => candidate.contentScore >= limits.fallbackMinContentScore)
    .sort(compareCandidates);

  const selected: SelectedCandidate<T>[] = [];
  const selectedIds = new Set<string>();
  const sourceCounts = new Map<string, number>();
  const organizationCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();

  const canSelect = (candidate: T): boolean =>
    !selectedIds.has(candidate.id)
    && (sourceCounts.get(candidate.sourceId) ?? 0) < limits.maxPerSource
    && (organizationCounts.get(candidate.organization) ?? 0) < limits.maxPerOrganization
    && (topicCounts.get(candidate.primaryTopic) ?? 0) < limits.maxPerTopic
    && selected.length < candidateLimit;

  const add = (candidate: T, lane: SelectionLane): boolean => {
    if (!canSelect(candidate)) return false;
    selected.push({ candidate, lane });
    selectedIds.add(candidate.id);
    sourceCounts.set(candidate.sourceId, (sourceCounts.get(candidate.sourceId) ?? 0) + 1);
    organizationCounts.set(
      candidate.organization,
      (organizationCounts.get(candidate.organization) ?? 0) + 1
    );
    topicCounts.set(candidate.primaryTopic, (topicCounts.get(candidate.primaryTopic) ?? 0) + 1);
    return true;
  };

  const fill = (
    pool: T[],
    lane: SelectionLane,
    slotCount: number,
    predicate: (candidate: T) => boolean
  ): void => {
    let added = 0;
    for (const candidate of pool) {
      if (added >= slotCount || selected.length >= candidateLimit) break;
      if (predicate(candidate) && add(candidate, lane)) added += 1;
    }
  };

  if (!standardMode) {
    fill(discoveryOrdered, "fallback", candidateLimit, () => true);
    return selected;
  }

  fill(standardOrdered, "value", Math.min(limits.valueSlots, candidateLimit), () => true);
  fill(standardOrdered, "primary", limits.primarySlots, (candidate) => isPrimaryEvidence(candidate.evidenceStatus));
  fill(
    discoveryOrdered,
    "discovery",
    limits.discoverySlots,
    (candidate) => (sourceCounts.get(candidate.sourceId) ?? 0) === 0
  );
  fill(standardOrdered, "fallback", candidateLimit - selected.length, () => true);

  return selected;
}
