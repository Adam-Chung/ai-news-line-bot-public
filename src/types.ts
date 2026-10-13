export type SourceRole = "official" | "expert" | "media" | "community" | "research";
export type EvidencePolicy = "primary" | "analysis" | "reporting" | "external-primary-required" | "preprint";
export type EvidenceStatus =
  | "primary"
  | "linked-primary"
  | "corroborated"
  | "expert-analysis"
  | "secondary-report"
  | "community-technique"
  | "preprint"
  | "unverified-claim";
export type ContentKind = "change" | "concept" | "practice" | "research" | "discussion";
export type SelectionLane = "value" | "primary" | "discovery" | "fallback";
export type SourceAdapter = "rss" | "arxiv-rss" | "sitemap" | "hacker-news" | "html-changelog";
export type DatePolicy =
  | "published-only"
  | "page-published-meta"
  | "page-submission-history"
  | "dated-sections";

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  adapter: SourceAdapter;
  sourceRole: SourceRole;
  organization: string;
  evidencePolicy: EvidencePolicy;
  datePolicy: DatePolicy;
  enabled: boolean;
  maxFetchItems: number;
  pathPrefix?: string;
  allowedHosts?: string[];
}

export interface Profile {
  name: string;
  displayName?: string;
  language: string;
  role: string;
  technologies: string[];
  goals: string[];
  highPriorityTopics: string[];
  lowPriorityTopics: string[];
}

export interface NewsCandidate {
  id: string;
  sourceId: string;
  source: string;
  sourceRole: SourceRole;
  organization: string;
  evidencePolicy: EvidencePolicy;
  evidenceStatus: EvidenceStatus;
  contentKind: ContentKind;
  primaryTopic: string;
  title: string;
  url: string;
  discussionUrl?: string;
  description: string;
  publishedAt: string;
  contentScore: number;
  scoreBreakdown: {
    topic: number;
    stack: number;
    impact: number;
    goal: number;
    negativePenalty: number;
    positiveTotal: number;
    total: number;
  };
  matchedGroups: Array<{
    dimension: "topic" | "stack" | "impact" | "goal";
    groupId: string;
    phrase: string;
    field: "title" | "description";
    points: number;
  }>;
  negativeMatches: Array<{
    groupId: string;
    phrase: string;
    field: "title" | "description";
    penalty: number;
  }>;
  strongMatchCount: number;
  engagement?: {
    points: number;
    comments: number;
  };
  discoveredBy: string[];
  corroborationUrls: string[];
  selectionLane?: SelectionLane;
  bypassSourceCooldown: boolean;
}

export interface CuratedItem {
  candidateId: string;
  relevanceScore: number;
  category: "重要新聞" | "AI 新概念" | "AI 名詞" | "開發工具";
  title: string;
  summary: string;
  whyImportant: string;
  conceptExplanation: string | null;
}

export interface CuratedDigest {
  items: CuratedItem[];
  decisions: GeminiDecision[];
}

export interface GeminiDecision {
  candidateId: string;
  relevanceScore: number | null;
  selected: boolean;
  reason: string;
}

export interface ArticleDiagnostic {
  candidateId: string;
  title: string;
  source: string;
  sourceId: string;
  url: string;
  publishedAt: string;
  contentScore: number;
  scoreBreakdown: NewsCandidate["scoreBreakdown"];
  matchedGroups: NewsCandidate["matchedGroups"];
  negativeMatches: NewsCandidate["negativeMatches"];
  localDecision: string;
  selectionLane?: SelectionLane;
  geminiDecision?: GeminiDecision;
}

export interface DeliveryRecord {
  sentAt: string;
  recipientAlias: string;
  recipientHash: string;
  status: "sent" | "failed";
  type: "news" | "no-news" | "test";
  message: string;
  urls: string[];
  sourceIds?: string[];
  error?: string;
}

export interface RunDiagnostic {
  ranAt: string;
  validDateCount: number;
  evaluatedCount: number;
  candidateCount: number;
  highestContentScore: number | null;
  geminiCalled: boolean;
  localEligibility: LocalEligibilitySummary;
  sourceStats: Array<{
    sourceId: string;
    fetched: number;
    validDate: number;
    scored: number;
    rejectedSent: number;
    rejectedDate: number;
    rejectedCommunityGate: number;
    rejectedSourceCooldown: number;
    selected: number;
    error?: string;
  }>;
  nearMisses: Array<{
    title: string;
    source: string;
    url: string;
    contentScore: number;
    reason: string;
  }>;
  localCandidates: Array<{
    candidateId: string;
    title: string;
    source: string;
    sourceId: string;
    url: string;
    contentScore: number;
    selectionLane: SelectionLane;
    bypassSourceCooldown: boolean;
  }>;
  geminiDecisions: GeminiDecision[];
  /** 最近數次執行保留逐篇結果；較舊執行僅保存彙總，避免狀態檔無限制成長。 */
  evaluatedItems?: ArticleDiagnostic[];
  geminiError?: string;
}

export interface LocalEligibilitySummary {
  scoredAtOrAboveFallback: number;
  passedHardGates: number;
  normalEligible: number;
  communityDiscoveryAdmitted: number;
  rejectedAiTopic: number;
  rejectedCommunityGate: number;
  rejectedEvidence: number;
  rejectedSourceCooldown: number;
}

export interface LineRecipient {
  alias: string;
  targetId: string;
}
