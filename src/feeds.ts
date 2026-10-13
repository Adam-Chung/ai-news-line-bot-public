import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { RankingConfig } from "./config.js";
import { deduplicateCandidates } from "./dedupe.js";
import { scoreContent, type ContentScoreResult } from "./scoring.js";
import { selectCandidates } from "./selection.js";
import type {
  ContentKind,
  EvidenceStatus,
  FeedConfig,
  LocalEligibilitySummary,
  NewsCandidate
} from "./types.js";
import { canonicalizeUrl, hostMatches, hostname } from "./url.js";
import { fetchHackerNews, type HackerNewsItem } from "./source-adapters/hacker-news.js";
import { verifyArxivSubmissionDates } from "./source-adapters/arxiv.js";
import { isAllowedByRobots } from "./robots.js";
import { sourceHttpClient } from "./source-http.js";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const multiTenantHosts = new Set(["github.com"]);

export interface RawSourceItem {
  title: string;
  url: string;
  discussionUrl?: string;
  description: string;
  publishedAt: string | null;
  engagement?: {
    points: number;
    comments: number;
  };
}

export interface SourceCollectionStats {
  sourceId: string;
  fetched: number;
  validDate: number;
  scored: number;
  rejectedSent: number;
  rejectedDate: number;
  rejectedCommunityGate: number;
  rejectedSourceCooldown: number;
  selected: number;
  error?: string;
}

export interface CandidateCollectionResult {
  candidates: NewsCandidate[];
  evaluatedCandidates: NewsCandidate[];
  sourceStats: SourceCollectionStats[];
  localEligibility: LocalEligibilitySummary;
  rejectionReasons: Map<string, string>;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record["#text"] ?? record["__cdata"] ?? "");
  }
  return "";
}

function alternateLink(value: unknown): string {
  if (typeof value === "string") return value;
  const links = asArray(value);
  for (const item of links) {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const href = record["@_href"];
      const rel = record["@_rel"];
      if (typeof href === "string" && (rel === undefined || rel === "alternate")) return href;
    }
  }
  for (const item of links) {
    if (item && typeof item === "object") {
      const href = (item as Record<string, unknown>)["@_href"];
      if (typeof href === "string") return href;
    }
  }
  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaContent(html: string, property: string): string {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propertyFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  return decodeHtml(propertyFirst.exec(html)?.[1] ?? contentFirst.exec(html)?.[1] ?? "").trim();
}

export function parseSyndication(xml: string, feed: FeedConfig): RawSourceItem[] {
  const document = parser.parse(xml) as Record<string, any>;
  const entries = document.rss?.channel?.item ?? document.feed?.entry ?? [];

  return asArray<Record<string, unknown>>(entries)
    .flatMap((entry) => {
      const title = stripHtml(text(entry.title));
      const rawUrl = alternateLink(entry.link) || text(entry.guid).trim();
      if (!title || !rawUrl) return [];

      const published = text(entry.pubDate ?? entry.published).trim();
      const parsedDate = published ? new Date(published) : null;
      return [{
        title,
        url: canonicalizeUrl(rawUrl),
        description: stripHtml(text(entry.description ?? entry.summary ?? entry.content)),
        publishedAt: parsedDate && !Number.isNaN(parsedDate.valueOf())
          ? parsedDate.toISOString()
          : null
      }];
    });
}

async function parseSitemap(
  xml: string,
  feed: FeedConfig,
  cutoff: number
): Promise<RawSourceItem[]> {
  const document = parser.parse(xml) as Record<string, any>;
  const sitemapUrls = asArray<Record<string, unknown>>(document.urlset?.url)
    .map((entry) => ({ url: text(entry.loc), modifiedAt: text(entry.lastmod) }))
    .filter((entry) => entry.url && (!feed.pathPrefix || entry.url.startsWith(feed.pathPrefix)))
    .filter((entry) => {
      const modified = new Date(entry.modifiedAt).valueOf();
      return !Number.isNaN(modified) && modified >= cutoff;
    })
    .sort((a, b) => new Date(b.modifiedAt).valueOf() - new Date(a.modifiedAt).valueOf())
    .slice(0, feed.maxFetchItems);

  const pages = await Promise.allSettled(sitemapUrls.map(async (entry) => {
    if (!await isAllowedByRobots(entry.url)) {
      throw new Error(`${entry.url} is disallowed by robots.txt or robots.txt is unreachable`);
    }
    const response = await sourceHttpClient.fetch(entry.url, {
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`${entry.url} returned HTTP ${response.status}`);
    const html = await response.text();
    const title = metaContent(html, "og:title")
      || entry.url.split("/").pop()?.replace(/-/g, " ")
      || entry.url;
    const published = metaContent(html, "article:published_time");
    const publishedDate = new Date(published);
    return {
      title: stripHtml(title),
      url: canonicalizeUrl(entry.url),
      description: stripHtml(metaContent(html, "og:description") || metaContent(html, "description")),
      publishedAt: published && !Number.isNaN(publishedDate.valueOf())
        ? publishedDate.toISOString()
        : null
    } satisfies RawSourceItem;
  }));

  return pages.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

async function fetchText(feed: FeedConfig): Promise<string> {
  const response = await sourceHttpClient.fetch(feed.url, {
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`${feed.name} returned HTTP ${response.status}`);
  return response.text();
}

function mapHackerNewsItems(items: HackerNewsItem[]): RawSourceItem[] {
  return items.map((item) => ({
    title: stripHtml(item.title),
    url: item.url,
    discussionUrl: item.discussionUrl,
    description: stripHtml(
      item.description || "Discovered through Hacker News."
    ),
    publishedAt: item.publishedAt,
    engagement: {
      points: item.points,
      comments: item.commentCount
    }
  }));
}

async function fetchSource(
  feed: FeedConfig,
  now: Date,
  cutoff: number,
  rankingConfig: RankingConfig
): Promise<RawSourceItem[]> {
  if (feed.adapter === "hacker-news") {
    const maxPages = Math.max(1, Math.ceil(feed.maxFetchItems / 100));
    return mapHackerNewsItems(await fetchHackerNews(feed.url, now, maxPages))
      .slice(0, feed.maxFetchItems);
  }
  if (feed.adapter === "html-changelog") {
    console.warn(`Skipping disabled or unsupported HTML changelog source ${feed.id}`);
    return [];
  }

  const content = await fetchText(feed);
  if (feed.adapter === "sitemap") return parseSitemap(content, feed, cutoff);

  const items = parseSyndication(content, feed);
  if (feed.adapter !== "arxiv-rss") return items;

  const candidatesToCheck = items
    .filter((item) => {
      if (!item.publishedAt) return false;
      const timestamp = new Date(item.publishedAt).valueOf();
      return timestamp >= cutoff && timestamp <= now.valueOf();
    })
    .slice(0, feed.maxFetchItems)
    .map((item) => ({ item, score: scoreContent(item, rankingConfig).contentScore }))
    .filter(({ score }) => score >= rankingConfig.selection.fallbackMinContentScore)
    .sort((a, b) => b.score - a.score || a.item.url.localeCompare(b.item.url))
    .slice(0, rankingConfig.selection.candidateLimit)
    .map(({ item }) => item);

  return verifyArxivSubmissionDates(
    items,
    candidatesToCheck,
    now,
    Math.max(1, rankingConfig.selection.maxPerSource)
  );
}

export function looksLikeChangeClaim(title: string, description: string): boolean {
  if (/^\s*show\s+hn\s*:/iu.test(title)) return false;
  return /\b(?:announc(?:e[sd]?|ing)|adds?|available|breaking change|changelog|debut(?:s|ed)?|deprecat(?:e[sd]?|ion)|introduc(?:e[sd]?|ing)|launch(?:e[sd]?|ing)|migration|new model|now supports?|release[sd]?|roll(?:ed|ing)? out|security advisory|ships?|unveil(?:s|ed|ing)?|updates?|upgrade[sd]?)\b/iu
    .test(`${title} ${description}`);
}

function contentKind(
  feed: FeedConfig,
  score: ContentScoreResult,
  item: RawSourceItem
): ContentKind {
  if (feed.sourceRole === "community" && looksLikeChangeClaim(item.title, item.description)) {
    return "change";
  }
  if (score.breakdown.impact > 0) return "change";
  if (feed.sourceRole === "research") return "research";
  if (score.matchedGroups.some((match) => match.groupId === "engineering-practice")) return "practice";
  if (feed.sourceRole === "community") return "discussion";
  if (feed.sourceRole === "expert" || feed.sourceRole === "media") return "practice";
  return "concept";
}

function evidenceStatus(
  feed: FeedConfig,
  kind: ContentKind,
  url: string,
  officialHosts: Set<string>
): EvidenceStatus {
  if (feed.evidencePolicy === "primary") return "primary";
  if (feed.evidencePolicy === "analysis") return "expert-analysis";
  if (feed.evidencePolicy === "reporting") return "secondary-report";
  if (feed.evidencePolicy === "preprint") return "preprint";

  const candidateHost = hostname(url);
  if (candidateHost && hostMatches(candidateHost, officialHosts)) {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    if (path.length > 0) return "linked-primary";
  }
  return kind === "change" ? "unverified-claim" : "community-technique";
}

function primaryTopic(score: ContentScoreResult): string {
  return score.matchedGroups.find((match) => match.dimension === "topic")?.groupId
    ?? score.matchedGroups.find((match) => match.dimension === "stack")?.groupId
    ?? score.matchedGroups.find((match) => match.dimension === "impact")?.groupId
    ?? score.matchedGroups.find((match) => match.dimension === "goal")?.groupId
    ?? "general";
}

function communityGate(candidate: NewsCandidate, config: RankingConfig): boolean {
  if (candidate.sourceRole !== "community") return true;
  if (candidate.contentScore >= config.community.highValueBypassScore) return true;
  const engagement = candidate.engagement;
  return Boolean(engagement
    && (engagement.points >= config.community.minPoints
      || engagement.comments >= config.community.minComments));
}

/** 判斷候選是否明確命中 AI 主題，而不是只靠資安或生命週期詞彙取得分數。 */
function hasExplicitAiTopic(candidate: NewsCandidate): boolean {
  return candidate.matchedGroups.some((match) => match.dimension === "topic");
}

/** 資安與 breaking/deprecation 候選必須同時具有 AI 主題，才能取得候選資格。 */
function passesCriticalAiTopicGate(candidate: NewsCandidate, config: RankingConfig): boolean {
  const hasCriticalImpact = candidate.matchedGroups.some(
    (match) => match.dimension === "impact"
      && config.selection.sourceCooldownBypassGroups.includes(match.groupId)
  );
  return !hasCriticalImpact || hasExplicitAiTopic(candidate);
}

/** 依內容分數、標題強匹配數及 URL，穩定排序低互動社群探索候選。 */
function compareCommunityDiscovery(a: NewsCandidate, b: NewsCandidate): number {
  return b.contentScore - a.contentScore
    || b.strongMatchCount - a.strongMatchCount
    || a.url.localeCompare(b.url);
}

function officialHosts(feeds: FeedConfig[]): Set<string> {
  const hosts = new Set<string>();
  feeds
    .filter((feed) => feed.sourceRole === "official")
    .flatMap((feed) => feed.allowedHosts ?? [])
    .forEach((host) => {
      const normalized = host.toLowerCase();
      if (!multiTenantHosts.has(normalized)) hosts.add(normalized);
    });
  return hosts;
}

export async function collectCandidatesDetailed(
  feeds: FeedConfig[],
  rankingConfig: RankingConfig,
  sentUrls: Set<string>,
  now = new Date(),
  recentSourceIds = new Set<string>()
): Promise<CandidateCollectionResult> {
  const cutoff = now.valueOf() - 24 * 60 * 60 * 1000;
  const canonicalSentUrls = new Set([...sentUrls].map(canonicalizeUrl));
  const enabledFeeds = feeds.filter((feed) => feed.enabled);
  const trustedOfficialHosts = officialHosts(feeds);
  const results = await Promise.allSettled(
    enabledFeeds.map(async (feed) => ({
      feed,
      items: await fetchSource(feed, now, cutoff, rankingConfig)
    }))
  );

  const evaluatedCandidates: NewsCandidate[] = [];
  const rejectionReasons = new Map<string, string>();
  let scoredAtOrAboveFallback = 0;
  const sourceStats = new Map<string, SourceCollectionStats>(
    enabledFeeds.map((feed) => [feed.id, {
      sourceId: feed.id,
      fetched: 0,
      validDate: 0,
      scored: 0,
      rejectedSent: 0,
      rejectedDate: 0,
      rejectedCommunityGate: 0,
      rejectedSourceCooldown: 0,
      selected: 0
    }])
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const feed = enabledFeeds[index];
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      if (feed) sourceStats.get(feed.id)!.error = message;
      console.warn(`Skipping feed ${feed?.id}: ${message}`);
      return;
    }

    const { feed, items } = result.value;
    const stats = sourceStats.get(feed.id)!;
    stats.fetched = items.length;
    let admittedForScoring = 0;
    items.forEach((item) => {
      if (canonicalSentUrls.has(item.url)) {
        stats.rejectedSent += 1;
        return;
      }
      if (!item.publishedAt) {
        stats.rejectedDate += 1;
        return;
      }
      const publishedAt = new Date(item.publishedAt).valueOf();
      if (Number.isNaN(publishedAt) || publishedAt < cutoff || publishedAt > now.valueOf()) {
        stats.rejectedDate += 1;
        return;
      }
      stats.validDate += 1;
      if (admittedForScoring >= feed.maxFetchItems) return;
      admittedForScoring += 1;

      const score = scoreContent(item, rankingConfig);
      const kind = contentKind(feed, score, item);
      const status = evidenceStatus(feed, kind, item.url, trustedOfficialHosts);
      const candidate: NewsCandidate = {
        id: createHash("sha256").update(item.url).digest("hex").slice(0, 12),
        sourceId: feed.id,
        source: feed.name,
        sourceRole: feed.sourceRole,
        organization: feed.organization,
        evidencePolicy: feed.evidencePolicy,
        evidenceStatus: status,
        contentKind: kind,
        primaryTopic: primaryTopic(score),
        title: item.title,
        url: item.url,
        ...(item.discussionUrl ? { discussionUrl: item.discussionUrl } : {}),
        description: item.description,
        publishedAt: item.publishedAt,
        contentScore: score.contentScore,
        scoreBreakdown: score.breakdown,
        matchedGroups: score.matchedGroups,
        negativeMatches: score.negativeMatches,
        strongMatchCount: score.matchedGroups.filter((match) => match.field === "title").length,
        ...(item.engagement ? { engagement: item.engagement } : {}),
        discoveredBy: [feed.name],
        corroborationUrls: [],
        // 重大資安與 breaking/deprecation 消息即使來源在冷卻期內也必須保留。
        bypassSourceCooldown: score.matchedGroups.some((match) =>
          rankingConfig.selection.sourceCooldownBypassGroups.includes(match.groupId))
      };
      stats.scored += 1;
      evaluatedCandidates.push(candidate);
      const reachesFallback = candidate.contentScore >= rankingConfig.selection.fallbackMinContentScore;
      if (reachesFallback) scoredAtOrAboveFallback += 1;
    });
  });

  const uniqueCandidates = deduplicateCandidates(evaluatedCandidates);
  const fallbackPool = uniqueCandidates.filter(
    (candidate) => candidate.contentScore >= rankingConfig.selection.fallbackMinContentScore
  );
  const aiTopicAllowed = fallbackPool.filter((candidate) => {
    if (passesCriticalAiTopicGate(candidate, rankingConfig)) return true;
    rejectionReasons.set(candidate.id, "missing-ai-topic");
    return false;
  });
  const evidenceAllowed = aiTopicAllowed.filter((candidate) => {
    if (candidate.evidenceStatus !== "unverified-claim") return true;
    rejectionReasons.set(candidate.id, "unverified-claim");
    return false;
  });
  const communityDiscoveryPool = evidenceAllowed
    .filter((candidate) => candidate.sourceRole === "community")
    .filter((candidate) => !communityGate(candidate, rankingConfig))
    .filter(hasExplicitAiTopic);
  const communityDiscovery = communityDiscoveryPool
    .filter((candidate) => !recentSourceIds.has(candidate.sourceId) || candidate.bypassSourceCooldown)
    .sort(compareCommunityDiscovery)
    .slice(0, rankingConfig.community.discoveryCandidateLimit);
  const communityDiscoveryPoolIds = new Set(
    communityDiscoveryPool.map((candidate) => candidate.id)
  );
  const communityDiscoveryIds = new Set(communityDiscovery.map((candidate) => candidate.id));
  const communityAllowed = evidenceAllowed.filter((candidate) => {
    if (communityGate(candidate, rankingConfig) || communityDiscoveryIds.has(candidate.id)) return true;
    if (communityDiscoveryPoolIds.has(candidate.id)
      && recentSourceIds.has(candidate.sourceId)
      && !candidate.bypassSourceCooldown) {
      return true;
    }
    rejectionReasons.set(candidate.id, "community-gate");
    return false;
  });
  const hardGateEligible = communityAllowed.filter((candidate) => {
    if (!recentSourceIds.has(candidate.sourceId) || candidate.bypassSourceCooldown) return true;
    rejectionReasons.set(candidate.id, "source-cooldown");
    return false;
  });
  uniqueCandidates.forEach((candidate) => {
    const stats = sourceStats.get(candidate.sourceId);
    if (!stats) return;
    if (candidate.sourceRole === "community"
      && !communityGate(candidate, rankingConfig)
      && !communityDiscoveryIds.has(candidate.id)
      && rejectionReasons.get(candidate.id) !== "source-cooldown") {
      stats.rejectedCommunityGate += 1;
    }
    if (candidate.contentScore >= rankingConfig.selection.fallbackMinContentScore
      && rejectionReasons.get(candidate.id) === "source-cooldown") {
      stats.rejectedSourceCooldown += 1;
    }
  });
  const candidates = selectCandidates(hardGateEligible, rankingConfig.selection, recentSourceIds)
    .map(({ candidate, lane }) => ({ ...candidate, selectionLane: lane }));
  candidates.forEach((candidate) => {
    const stats = sourceStats.get(candidate.sourceId);
    if (stats) stats.selected += 1;
  });
  return {
    candidates,
    evaluatedCandidates,
    sourceStats: [...sourceStats.values()],
    localEligibility: {
      scoredAtOrAboveFallback,
      passedHardGates: hardGateEligible.length,
      normalEligible: hardGateEligible.filter(
        (candidate) => candidate.contentScore >= rankingConfig.selection.minContentScore
      ).length,
      communityDiscoveryAdmitted: communityDiscovery.length,
      rejectedAiTopic: fallbackPool.length - aiTopicAllowed.length,
      rejectedCommunityGate: evidenceAllowed.length - communityAllowed.length,
      rejectedEvidence: aiTopicAllowed.length - evidenceAllowed.length,
      rejectedSourceCooldown: communityAllowed.length - hardGateEligible.length
    },
    rejectionReasons
  };
}

export async function collectCandidates(
  feeds: FeedConfig[],
  rankingConfig: RankingConfig,
  sentUrls: Set<string>,
  now = new Date(),
  recentSourceIds = new Set<string>()
): Promise<NewsCandidate[]> {
  return (await collectCandidatesDetailed(feeds, rankingConfig, sentUrls, now, recentSourceIds)).candidates;
}
