import { describe, expect, it } from "vitest";
import { extractArxivInitialSubmissionDate } from "../src/source-adapters/arxiv.js";

describe("arXiv submission dates", () => {
  it("uses the v1 submission history instead of the RSS announcement time", () => {
    const html = `
      <div class="dateline">[Submitted on 31 May 2026]</div>
      <div class="submission-history">
        <b>[v1]</b> Sun, 31 May 2026 11:40:55 UTC (1,050 KB)
      </div>
    `;

    expect(extractArxivInitialSubmissionDate(html))
      .toBe("2026-05-31T11:40:55.000Z");
  });

  it("falls back to the submitted-on date and rejects missing dates", () => {
    expect(extractArxivInitialSubmissionDate(
      `<div class="dateline">[Submitted on 28 Jul 2026]</div>`
    )).toBe("2026-07-28T00:00:00.000Z");
    expect(extractArxivInitialSubmissionDate("<main>No submission date</main>")).toBeNull();
  });
});
