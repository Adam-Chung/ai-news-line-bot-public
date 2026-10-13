import {
  sourceCrawlerProduct,
  sourceHttpClient,
  type SourceHttpClient
} from "./source-http.js";

interface RobotsRule {
  allow: boolean;
  pattern: string;
  specificity: number;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

interface RobotsPolicy {
  allowed(url: URL): boolean;
}

const policyCache = new Map<string, Promise<RobotsPolicy>>();

function ruleRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const rawPattern = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = rawPattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

function parseRobots(content: string, product: string): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let rulesStarted = false;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) {
      current = null;
      rulesStarted = false;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || rulesStarted) {
        current = { agents: [], rules: [] };
        groups.push(current);
        rulesStarted = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current || (field !== "allow" && field !== "disallow")) continue;
    rulesStarted = true;
    if (!value) continue;
    current.rules.push({
      allow: field === "allow",
      pattern: value,
      specificity: value.replace(/[*$]/g, "").length
    });
  }

  const normalizedProduct = product.toLowerCase();
  const exactGroups = groups.filter((group) => group.agents.includes(normalizedProduct));
  const selectedGroups = exactGroups.length > 0
    ? exactGroups
    : groups.filter((group) => group.agents.includes("*"));
  const rules = selectedGroups.flatMap((group) => group.rules);

  return {
    allowed(url: URL): boolean {
      const path = `${url.pathname}${url.search}`;
      const matching = rules
        .filter((rule) => ruleRegex(rule.pattern).test(path))
        .sort((a, b) => b.specificity - a.specificity || Number(b.allow) - Number(a.allow));
      return matching[0]?.allow ?? true;
    }
  };
}

async function loadPolicy(origin: string, client: SourceHttpClient): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", origin);
  try {
    const response = await client.fetch(robotsUrl, {
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 404 || response.status === 410) {
      return { allowed: () => true };
    }
    if (!response.ok) {
      return { allowed: () => false };
    }
    return parseRobots(await response.text(), sourceCrawlerProduct);
  } catch {
    return { allowed: () => false };
  }
}

export async function isAllowedByRobots(
  target: string,
  client: SourceHttpClient = sourceHttpClient
): Promise<boolean> {
  const url = new URL(target);
  let policyPromise = policyCache.get(url.origin);
  if (!policyPromise) {
    policyPromise = loadPolicy(url.origin, client);
    policyCache.set(url.origin, policyPromise);
  }
  return (await policyPromise).allowed(url);
}

export function clearRobotsCache(): void {
  policyCache.clear();
}
