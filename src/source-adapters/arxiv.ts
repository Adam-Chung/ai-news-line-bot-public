import { isAllowedByRobots } from "../robots.js";
import { sourceHttpClient } from "../source-http.js";
import { plainTextFromHtml } from "../html.js";

export interface ArxivDateItem {
  url: string;
  publishedAt: string | null;
}

export function extractArxivInitialSubmissionDate(html: string): string | null {
  const content = plainTextFromHtml(html);
  const versionOne = content.match(
    /\[v1\]\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+UTC)/u
  )?.[1];
  const submittedOn = content.match(
    /Submitted on\s+(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4})/u
  )?.[1];
  const rawDate = versionOne ?? submittedOn;
  if (!rawDate) return null;

  const parsed = new Date(versionOne ? rawDate : `${rawDate} 00:00:00 UTC`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

export async function verifyArxivSubmissionDates<T extends ArxivDateItem>(
  items: T[],
  candidatesToCheck: T[],
  now: Date,
  requiredFreshItems: number
): Promise<T[]> {
  const cutoff = now.valueOf() - 24 * 60 * 60 * 1000;
  const verifiedDates = new Map<string, string>();

  for (const item of candidatesToCheck) {
    if (verifiedDates.size >= requiredFreshItems) break;
    try {
      if (!await isAllowedByRobots(item.url)) {
        console.warn(`Skipping arXiv date verification disallowed by robots.txt: ${item.url}`);
        continue;
      }
      const response = await sourceHttpClient.fetch(item.url, {
        signal: AbortSignal.timeout(45_000)
      });
      if (!response.ok) {
        console.warn(`Skipping arXiv date verification for ${item.url}: HTTP ${response.status}`);
        continue;
      }
      const submittedAt = extractArxivInitialSubmissionDate(await response.text());
      if (!submittedAt) {
        console.warn(`Skipping arXiv item without a verifiable initial submission date: ${item.url}`);
        continue;
      }
      const timestamp = new Date(submittedAt).valueOf();
      const eligible = timestamp >= cutoff && timestamp <= now.valueOf();
      console.log(JSON.stringify({
        arxivDateVerification: {
          url: item.url,
          rssPublishedAt: item.publishedAt,
          initialSubmittedAt: submittedAt,
          eligible
        }
      }));
      if (eligible) {
        verifiedDates.set(item.url, submittedAt);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping arXiv date verification for ${item.url}: ${message}`);
    }
  }

  return items.map((item) => ({
    ...item,
    publishedAt: verifiedDates.get(item.url) ?? null
  }));
}
