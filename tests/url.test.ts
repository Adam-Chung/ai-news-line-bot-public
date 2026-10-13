import { describe, expect, it } from "vitest";
import { canonicalizeUrl, hostMatches, hostname } from "../src/url.js";

describe("canonicalizeUrl", () => {
  it("removes tracking parameters and fragments while preserving meaningful query parameters", () => {
    expect(canonicalizeUrl("https://example.com/article/?utm_source=rss&b=2&a=1#section"))
      .toBe("https://example.com/article?a=1&b=2");
  });

  it("returns a trimmed value when the URL is invalid", () => {
    expect(canonicalizeUrl("  not a url  ")).toBe("not a url");
  });
});

describe("host helpers", () => {
  it("extracts and matches exact or nested hosts", () => {
    expect(hostname("https://docs.example.com/path")).toBe("docs.example.com");
    expect(hostMatches("docs.example.com", ["example.com"])).toBe(true);
    expect(hostMatches("notexample.com", ["example.com"])).toBe(false);
  });
});
