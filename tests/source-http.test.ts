import { describe, expect, it, vi } from "vitest";
import { SourceHttpClient, sourceCrawlerProduct, sourceUserAgent } from "../src/source-http.js";

describe("SourceHttpClient", () => {
  it("serializes same-origin requests and waits the configured interval", async () => {
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const starts: number[] = [];
    const fetchImpl = vi.fn(async () => {
      starts.push(currentTime);
      return new Response("ok");
    });
    const client = new SourceHttpClient({
      minimumIntervalMs: 1_000,
      fetchImpl,
      now: () => currentTime,
      sleep
    });

    await Promise.all([
      client.fetch("https://example.com/feed"),
      client.fetch("https://example.com/article")
    ]);

    expect(starts).toEqual([1_000, 2_000]);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it("does not delay requests to different origins", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => new Response("ok"));
    const client = new SourceHttpClient({
      minimumIntervalMs: 1_000,
      fetchImpl,
      now: () => 1_000,
      sleep
    });

    await Promise.all([
      client.fetch("https://one.example/feed"),
      client.fetch("https://two.example/feed")
    ]);

    expect(sleep).not.toHaveBeenCalled();
  });

  it("identifies the crawler and honors Retry-After before the next request", async () => {
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 429,
        headers: { "Retry-After": "5" }
      }))
      .mockResolvedValueOnce(new Response("ok"));
    const client = new SourceHttpClient({
      minimumIntervalMs: 1_000,
      fetchImpl,
      now: () => currentTime,
      sleep
    });

    await client.fetch("https://example.com/first");
    await client.fetch("https://example.com/second");

    expect(sleep).toHaveBeenCalledWith(5_000);
    const firstHeaders = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get("User-Agent")).toBe(sourceUserAgent);
    expect(sourceCrawlerProduct).toBe("AI-News-Line-Bot");
  });

  it("honors arXiv's 15-second crawl interval", async () => {
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const client = new SourceHttpClient({
      minimumIntervalMs: 1_000,
      fetchImpl: vi.fn(async () => new Response("ok")),
      now: () => currentTime,
      sleep
    });

    await client.fetch("https://arxiv.org/robots.txt");
    await client.fetch("https://arxiv.org/abs/2607.21618");

    expect(sleep).toHaveBeenCalledWith(15_000);
  });

  it("honors Microsoft DevBlogs' 10-second crawl interval", async () => {
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const client = new SourceHttpClient({
      minimumIntervalMs: 1_000,
      fetchImpl: vi.fn(async () => new Response("ok")),
      now: () => currentTime,
      sleep
    });

    await client.fetch("https://devblogs.microsoft.com/agent-framework/feed/");
    await client.fetch("https://devblogs.microsoft.com/agent-framework/a-release/");

    expect(sleep).toHaveBeenCalledWith(10_000);
  });
});
