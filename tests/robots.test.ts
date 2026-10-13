import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRobotsCache, isAllowedByRobots } from "../src/robots.js";
import { SourceHttpClient } from "../src/source-http.js";

afterEach(() => clearRobotsCache());

function clientFor(content: string, status = 200): SourceHttpClient {
  return new SourceHttpClient({
    minimumIntervalMs: 0,
    fetchImpl: vi.fn(async () => new Response(content, { status }))
  });
}

describe("isAllowedByRobots", () => {
  it("uses the most specific matching rule and lets Allow win an equal tie", async () => {
    const client = clientFor(`
User-agent: *
Disallow: /news/
Allow: /news/public/
`);

    await expect(isAllowedByRobots("https://example.com/news/private/item", client))
      .resolves.toBe(false);
    await expect(isAllowedByRobots("https://example.com/news/public/item", client))
      .resolves.toBe(true);
  });

  it("prefers the named crawler group over the wildcard group", async () => {
    const client = clientFor(`
User-agent: *
Disallow: /

User-agent: AI-News-Line-Bot
Allow: /news/
Disallow: /
`);

    await expect(isAllowedByRobots("https://example.com/news/item", client))
      .resolves.toBe(true);
  });

  it("allows a missing robots file but fails closed on server errors", async () => {
    await expect(isAllowedByRobots(
      "https://missing.example/news/item",
      clientFor("", 404)
    )).resolves.toBe(true);
    await expect(isAllowedByRobots(
      "https://broken.example/news/item",
      clientFor("", 503)
    )).resolves.toBe(false);
  });
});
