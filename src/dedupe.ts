import type { EvidenceStatus, NewsCandidate } from "./types.js";
import { normalizeScoringText } from "./scoring.js";

const stopWords = new Set([
  "about", "adds", "after", "agent", "agents", "and", "announces", "api",
  "for", "from", "into", "new", "release", "releases", "the", "to", "with"
]);

function evidenceRank(status: EvidenceStatus): number {
  switch (status) {
    case "primary": return 6;
    case "linked-primary": return 5;
    case "corroborated": return 4;
    case "expert-analysis": return 3;
    case "secondary-report": return 3;
    case "preprint": return 2;
    case "community-technique": return 1;
    case "unverified-claim": return 0;
  }
}

function titleTokens(title: string): Set<string> {
  const tokens = normalizeScoringText(title)
    .split(/[^\p{L}\p{N}_.+-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function versionTokens(tokens: Set<string>): Set<string> {
  return new Set([...tokens].filter((token) => /\d/u.test(token)));
}

export function isSameEvent(a: NewsCandidate, b: NewsCandidate): boolean {
  if (a.contentKind !== "change" || b.contentKind !== "change") return false;
  const aTokens = titleTokens(a.title);
  const bTokens = titleTokens(b.title);
  const similarity = jaccard(aTokens, bTokens);
  const sharedVersion = [...versionTokens(aTokens)].some((token) => bTokens.has(token));
  return (sharedVersion && similarity >= 0.6)
    || (a.primaryTopic === b.primaryTopic && similarity >= 0.75);
}

function preferredCandidate(a: NewsCandidate, b: NewsCandidate): NewsCandidate {
  if (a.contentScore !== b.contentScore) return b.contentScore > a.contentScore ? b : a;
  const evidenceDifference = evidenceRank(b.evidenceStatus) - evidenceRank(a.evidenceStatus);
  if (evidenceDifference !== 0) return evidenceDifference > 0 ? b : a;
  if (a.description.length !== b.description.length) return b.description.length > a.description.length ? b : a;
  return a.url.localeCompare(b.url) <= 0 ? a : b;
}

function mergeCandidates(
  preferred: NewsCandidate,
  other: NewsCandidate,
  independentCorroboration: boolean
): NewsCandidate {
  const corroborationUrls = independentCorroboration
    ? [...preferred.corroborationUrls, other.url, ...other.corroborationUrls]
    : [...preferred.corroborationUrls, ...other.corroborationUrls];
  const otherHasPrimaryEvidence = other.evidenceStatus === "primary"
    || other.evidenceStatus === "linked-primary";
  const evidenceStatus = otherHasPrimaryEvidence
    ? independentCorroboration ? "corroborated" : "linked-primary"
    : independentCorroboration
      && preferred.evidenceStatus !== "primary"
      && preferred.evidenceStatus !== "linked-primary"
        ? "corroborated"
        : preferred.evidenceStatus;
  return {
    ...preferred,
    evidenceStatus,
    discoveredBy: [...new Set([...preferred.discoveredBy, ...other.discoveredBy])],
    corroborationUrls: [...new Set(corroborationUrls.filter((url) => url !== preferred.url))]
  };
}

export function deduplicateCandidates(candidates: NewsCandidate[]): NewsCandidate[] {
  const byUrl = new Map<string, NewsCandidate>();
  for (const candidate of candidates) {
    const existing = byUrl.get(candidate.url);
    if (!existing) {
      byUrl.set(candidate.url, candidate);
      continue;
    }
    const preferred = preferredCandidate(existing, candidate);
    byUrl.set(
      candidate.url,
      mergeCandidates(preferred, preferred === existing ? candidate : existing, false)
    );
  }

  const result: NewsCandidate[] = [];
  for (const candidate of byUrl.values()) {
    const duplicateIndex = result.findIndex((existing) =>
      existing.sourceRole !== "expert"
      && candidate.sourceRole !== "expert"
      && isSameEvent(existing, candidate));
    if (duplicateIndex < 0) {
      result.push(candidate);
      continue;
    }

    const existing = result[duplicateIndex]!;
    const preferred = preferredCandidate(existing, candidate);
    const other = preferred === existing ? candidate : existing;
    result[duplicateIndex] = mergeCandidates(
      preferred,
      other,
      preferred.organization !== other.organization
    );
  }
  return result;
}
