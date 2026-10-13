import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeedConfig, Profile } from "./types.js";
import { validateScoringConfig, type ScoringConfig } from "./scoring.js";
import type { SelectionLimits } from "./selection.js";

const projectRoot = process.cwd();

async function readJson<T>(relativePath: string): Promise<T> {
  const content = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(content) as T;
}

export async function loadProfile(): Promise<Profile> {
  return readJson<Profile>("config/profile.json");
}

export async function loadFeeds(): Promise<FeedConfig[]> {
  const feeds = await readJson<FeedConfig[]>("config/feeds.json");
  const ids = new Set<string>();
  const adapters = new Set(["rss", "arxiv-rss", "sitemap", "hacker-news", "html-changelog"]);
  const sourceRoles = new Set(["official", "expert", "media", "community", "research"]);
  const evidencePolicies = new Set(["primary", "analysis", "reporting", "external-primary-required", "preprint"]);
  const datePolicies = new Set([
    "published-only",
    "page-published-meta",
    "page-submission-history",
    "dated-sections"
  ]);

  feeds.forEach((feed, index) => {
    if (!feed.id?.trim()) throw new Error(`Feed at index ${index} is missing id`);
    if (ids.has(feed.id)) throw new Error(`Duplicate feed id: ${feed.id}`);
    ids.add(feed.id);
    if (!feed.name?.trim() || !feed.url?.trim()) throw new Error(`Feed ${feed.id} is missing name or url`);
    if (!adapters.has(feed.adapter)) throw new Error(`Feed ${feed.id} has unknown adapter: ${feed.adapter}`);
    if (!sourceRoles.has(feed.sourceRole)) throw new Error(`Feed ${feed.id} has unknown sourceRole`);
    if (!evidencePolicies.has(feed.evidencePolicy)) throw new Error(`Feed ${feed.id} has unknown evidencePolicy`);
    if (!datePolicies.has(feed.datePolicy)) throw new Error(`Feed ${feed.id} has unknown datePolicy`);
    if (!Number.isInteger(feed.maxFetchItems) || feed.maxFetchItems < 1 || feed.maxFetchItems > 200) {
      throw new Error(`Feed ${feed.id} maxFetchItems must be an integer from 1 to 200`);
    }
    if ("priority" in (feed as unknown as Record<string, unknown>)) {
      throw new Error(`Feed ${feed.id} must not define numeric priority`);
    }
  });
  return feeds;
}

export interface CommunityGateConfig {
  highValueBypassScore: number;
  discoveryCandidateLimit: number;
  minPoints: number;
  minComments: number;
}

export interface RankingConfig extends ScoringConfig {
  selection: SelectionLimits;
  community: CommunityGateConfig;
}

function requireNonNegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
}

export async function loadRankingConfig(): Promise<RankingConfig> {
  const config = await readJson<RankingConfig>("config/scoring.json");
  validateScoringConfig(config);
  const selection = config.selection;
  if (!selection) throw new Error("Missing scoring selection configuration");
  const numericSelection = Object.entries(selection)
    .filter(([, value]) => typeof value === "number") as Array<[string, number]>;
  numericSelection.forEach(([key, value]) => requireNonNegativeNumber(value, `selection.${key}`));
  if (!Array.isArray(selection.sourceCooldownBypassGroups)
    || selection.sourceCooldownBypassGroups.some((groupId) => typeof groupId !== "string" || !groupId.trim())) {
    throw new Error("selection.sourceCooldownBypassGroups must contain non-empty group IDs");
  }
  if (selection.candidateLimit < 1) throw new Error("selection.candidateLimit must be at least 1");
  if (selection.fallbackCandidateLimit < 1
    || selection.fallbackCandidateLimit > selection.candidateLimit) {
    throw new Error("selection.fallbackCandidateLimit must be between 1 and candidateLimit");
  }
  if (selection.fallbackMinContentScore > selection.minContentScore) {
    throw new Error("selection.fallbackMinContentScore must not exceed minContentScore");
  }
  if (selection.valueSlots + selection.primarySlots + selection.discoverySlots > selection.candidateLimit) {
    throw new Error("Configured selection lanes exceed candidateLimit");
  }
  if (!config.community) throw new Error("Missing community gate configuration");
  Object.entries(config.community).forEach(([key, value]) => requireNonNegativeNumber(value, `community.${key}`));
  if (!Number.isInteger(config.community.discoveryCandidateLimit)
    || config.community.discoveryCandidateLimit > selection.candidateLimit) {
    throw new Error("community.discoveryCandidateLimit must be an integer from 0 to candidateLimit");
  }
  return config;
}

export function getProjectRoot(): string {
  return projectRoot;
}

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
