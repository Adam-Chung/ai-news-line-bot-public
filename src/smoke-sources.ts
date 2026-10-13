import { XMLParser } from "fast-xml-parser";
import { loadFeeds } from "./config.js";
import { parseSyndication } from "./feeds.js";
import { fetchHackerNews } from "./source-adapters/hacker-news.js";
import { sourceHttpClient } from "./source-http.js";

const xmlParser = new XMLParser({ ignoreAttributes: false });

async function fetchText(url: string): Promise<string> {
  const response = await sourceHttpClient.fetch(url, {
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** 判斷空白 RSS 是否明確宣告今天為不發布內容的日期。 */
function isDeclaredSkipDay(xml: string, now = new Date()): boolean {
  const document = xmlParser.parse(xml) as Record<string, any>;
  const rawDays = document.rss?.channel?.skipDays?.day;
  const days = Array.isArray(rawDays) ? rawDays : rawDays ? [rawDays] : [];
  const today = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long"
  }).format(now);
  return days.some((day) => String(day).trim().toLowerCase() === today.toLowerCase());
}

async function main(): Promise<void> {
  const feeds = (await loadFeeds()).filter((feed) => feed.enabled);
  const failures: string[] = [];

  for (const feed of feeds) {
    try {
      if (feed.adapter === "rss" || feed.adapter === "arxiv-rss") {
        const xml = await fetchText(feed.url);
        const items = parseSyndication(xml, feed);
        const datedItems = items.filter((item) => item.publishedAt !== null).length;
        if (feed.adapter === "arxiv-rss" && items.length === 0 && isDeclaredSkipDay(xml)) {
          console.log(`OK ${feed.id}: parsed=0, feed declares today as a skip day`);
          continue;
        }
        if (items.length === 0 || datedItems === 0) {
          throw new Error(`parsed=${items.length}, dated=${datedItems}`);
        }
        const note = feed.adapter === "arxiv-rss"
          ? ", submission dates verified only during candidate collection"
          : "";
        console.log(`OK ${feed.id}: parsed=${items.length}, dated=${datedItems}${note}`);
        continue;
      }

      if (feed.adapter === "hacker-news") {
        const items = await fetchHackerNews(feed.url, new Date(), Math.max(1, Math.ceil(feed.maxFetchItems / 100)));
        console.log(`OK ${feed.id}: recentStories=${items.length}`);
        continue;
      }

      if (feed.adapter === "sitemap") {
        const document = xmlParser.parse(await fetchText(feed.url)) as Record<string, any>;
        const urls = document.urlset?.url;
        const count = Array.isArray(urls) ? urls.length : urls ? 1 : 0;
        if (count === 0) throw new Error("sitemap contains no URLs");
        console.log(`OK ${feed.id}: sitemapUrls=${count}`);
        continue;
      }

      console.log(`SKIP ${feed.id}: adapter=${feed.adapter} is not enabled for daily collection`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${feed.id}: ${message}`);
      console.error(`FAIL ${feed.id}: ${message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Source smoke test failed for ${failures.length} source(s)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
