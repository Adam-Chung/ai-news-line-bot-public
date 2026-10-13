import { canonicalizeUrl } from "../url.js";
import { sourceHttpClient } from "../source-http.js";

export interface HackerNewsItem {
  id: string;
  title: string;
  url: string;
  discussionUrl: string;
  description: string;
  publishedAt: string;
  points: number;
  commentCount: number;
}

interface HackerNewsHit {
  objectID?: unknown;
  title?: unknown;
  url?: unknown;
  story_text?: unknown;
  created_at?: unknown;
  points?: unknown;
  num_comments?: unknown;
  _tags?: unknown;
}

interface HackerNewsResponse {
  hits?: unknown;
  nbPages?: unknown;
}

const internalHackerNewsHosts = new Set(["news.ycombinator.com", "hn.algolia.com"]);

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isStoryHit(hit: HackerNewsHit): boolean {
  if (hit._tags === undefined) return typeof hit.title === "string";
  return Array.isArray(hit._tags) && hit._tags.includes("story");
}

function externalHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:")
      || internalHackerNewsHosts.has(url.hostname.toLowerCase())) {
      return null;
    }
    return canonicalizeUrl(url.toString());
  } catch {
    return null;
  }
}

export function parseHackerNewsResponse(
  json: unknown,
  now: Date,
  lookbackHours = 24
): HackerNewsItem[] {
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(lookbackHours) || lookbackHours < 0) {
    throw new Error("Cannot parse Hacker News response: invalid time window");
  }

  const response = json as HackerNewsResponse;
  if (!response || !Array.isArray(response.hits)) return [];

  const upperBound = now.getTime();
  const lowerBound = upperBound - lookbackHours * 60 * 60 * 1000;

  return response.hits.flatMap((rawHit) => {
    if (!rawHit || typeof rawHit !== "object") return [];
    const hit = rawHit as HackerNewsHit;
    const title = typeof hit.title === "string" ? hit.title.trim() : "";
    const url = externalHttpUrl(hit.url);
    const publishedTime = typeof hit.created_at === "string"
      ? Date.parse(hit.created_at)
      : Number.NaN;

    if (!isStoryHit(hit)
      || title.length === 0
      || url === null
      || !Number.isFinite(publishedTime)
      || publishedTime < lowerBound
      || publishedTime > upperBound) {
      return [];
    }

    const id = String(hit.objectID ?? url);
    return [{
      id,
      title,
      url,
      discussionUrl: `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
      description: typeof hit.story_text === "string" ? hit.story_text.trim() : "",
      publishedAt: new Date(publishedTime).toISOString(),
      points: asFiniteNumber(hit.points),
      commentCount: asFiniteNumber(hit.num_comments)
    }];
  });
}

export async function fetchHackerNews(
  baseUrl: string,
  now: Date,
  maxPages = 2
): Promise<HackerNewsItem[]> {
  if (!Number.isInteger(maxPages) || maxPages < 0) {
    throw new Error("Cannot fetch Hacker News: maxPages must be a non-negative integer");
  }
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Cannot fetch Hacker News: invalid current time");
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/search_by_date`;
  const lowerBoundSeconds = Math.floor((now.getTime() - 24 * 60 * 60 * 1000) / 1000);
  const upperBoundSeconds = Math.floor(now.getTime() / 1000);
  const items: HackerNewsItem[] = [];

  let availablePages = maxPages;
  for (let page = 0; page < Math.min(maxPages, availablePages); page += 1) {
    const url = new URL(endpoint);
    url.searchParams.set("tags", "story");
    url.searchParams.set(
      "numericFilters",
      `created_at_i>=${lowerBoundSeconds},created_at_i<=${upperBoundSeconds}`
    );
    url.searchParams.set("hitsPerPage", "100");
    url.searchParams.set("page", String(page));

    let response: Response;
    try {
      response = await sourceHttpClient.fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      throw new Error(`Failed to fetch Hacker News page ${page} from ${url.origin}`, {
        cause: error
      });
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Hacker News page ${page} from ${url.origin}: HTTP ${response.status}`
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new Error(`Failed to parse Hacker News page ${page} from ${url.origin}`, {
        cause: error
      });
    }

    items.push(...parseHackerNewsResponse(json, now));
    const nbPages = (json as HackerNewsResponse)?.nbPages;
    availablePages = typeof nbPages === "number" && Number.isFinite(nbPages)
      ? Math.max(0, Math.floor(nbPages))
      : page + 1;
  }

  return items;
}
