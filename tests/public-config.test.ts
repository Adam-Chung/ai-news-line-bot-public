import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadFeeds } from "../src/config.js";

describe("public source configuration", () => {
  it("does not include any article source by default", async () => {
    await expect(loadFeeds()).resolves.toEqual([]);
  });

  it("includes the non-commercial License and self-hosting guide", async () => {
    const root = process.cwd();
    await expect(readFile(path.join(root, "LICENSE"), "utf8"))
      .resolves.toContain("Personal and Non-Commercial Source License 1.0");
    await expect(readFile(path.join(root, "docs", "SELF_HOSTING.md"), "utf8"))
      .resolves.toContain("Private repository");
  });
});
