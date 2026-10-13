import { describe, expect, it } from "vitest";
import { loadRecipients } from "../src/recipients.js";

describe("loadRecipients", () => {
  it("loads every matching environment variable with an alias derived from its suffix", () => {
    const recipients = loadRecipients({
      LINE_TARGET_ID_PRIMARY: " U-primary ",
      LINE_TARGET_ID_TEAM_ALPHA: "U-team-alpha",
      UNRELATED_SECRET: "ignored"
    });

    expect(recipients).toEqual([
      { alias: "Primary", targetId: "U-primary" },
      { alias: "Team Alpha", targetId: "U-team-alpha" }
    ]);
  });

  it("does not impose a recipient count limit", () => {
    const environment = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`LINE_TARGET_ID_USER_${index + 1}`, `U-${index + 1}`])
    );

    expect(loadRecipients(environment)).toHaveLength(20);
  });

  it("only accepts the LINE_TARGET_ID_ prefix", () => {
    expect(() => loadRecipients({
      LINE_TARGET_ID: "U-legacy",
      BACKUP_LINE_TARGET_ID_PRIMARY: "U-backup"
    })).toThrow("At least one LINE recipient secret is required");
  });

  it("requires at least one configured recipient", () => {
    expect(() => loadRecipients({})).toThrow("At least one LINE recipient secret is required");
  });

  it("rejects duplicate userIds", () => {
    expect(() => loadRecipients({
      LINE_TARGET_ID_PRIMARY: "U-same",
      LINE_TARGET_ID_USER_2: "U-same"
    })).toThrow("distinct userIds");
  });
});
