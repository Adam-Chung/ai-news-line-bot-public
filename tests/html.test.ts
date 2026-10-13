import { describe, expect, it } from "vitest";
import { plainTextFromHtml } from "../src/html.js";

describe("plainTextFromHtml", () => {
  it("removes script and style elements whose closing tags contain whitespace", () => {
    expect(plainTextFromHtml(
      "<p>Visible</p><script>hidden()</script\t\n ignored><style>.hidden{}</style >"
    )).toBe("Visible");
  });

  it("drops the remainder after an unclosed raw-text element", () => {
    expect(plainTextFromHtml("Visible<script>Submitted on 31 May 2026"))
      .toBe("Visible");
  });

  it("decodes nested HTML entities only once", () => {
    expect(plainTextFromHtml("&amp;lt;b&amp;gt;Example&amp;lt;/b&amp;gt;"))
      .toBe("&lt;b&gt;Example&lt;/b&gt;");
  });

  it("normalizes readable text and applies an optional maximum length", () => {
    expect(plainTextFromHtml("<b>Hello</b>&nbsp; &amp; welcome", 9))
      .toBe("Hello & w");
  });
});
