import { describe, expect, it } from "vitest";
import { loadFeeds } from "../src/config.js";

describe("public source configuration", () => {
  it("does not include any article source by default", async () => {
    await expect(loadFeeds()).resolves.toEqual([]);
  });
});
