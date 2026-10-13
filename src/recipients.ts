import type { LineRecipient } from "./types.js";

const recipientEnvironmentPrefix = "LINE_TARGET_ID_";

function aliasFromEnvironmentName(name: string): string {
  return name
    .slice(recipientEnvironmentPrefix.length)
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function loadRecipients(environment: NodeJS.ProcessEnv = process.env): LineRecipient[] {
  const recipients = Object.entries(environment)
    .filter(([name, value]) => name.startsWith(recipientEnvironmentPrefix)
      && name.length > recipientEnvironmentPrefix.length
      && Boolean(value?.trim()))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({
      alias: aliasFromEnvironmentName(name),
      targetId: value!.trim()
    }));

  if (recipients.length === 0) {
    throw new Error("At least one LINE recipient secret is required");
  }

  const uniqueIds = new Set(recipients.map((recipient) => recipient.targetId));
  if (uniqueIds.size !== recipients.length) {
    throw new Error("LINE recipient secrets must contain distinct userIds");
  }

  return recipients;
}
