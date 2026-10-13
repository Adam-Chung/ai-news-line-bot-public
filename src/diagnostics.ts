import type { CandidateCollectionResult } from "./feeds.js";
import type { GeminiDecision, NewsCandidate, RunDiagnostic } from "./types.js";

/**
 * 判斷本地評分完成但未送進 Gemini 的原因。
 * @param candidate 已完成本地評分的文章。
 * @param selectedIds 本次送進 Gemini 的 candidate ID。
 * @param normalMode 是否至少有一篇文章達到一般門檻。
 * @param normalThreshold 一般候選門檻。
 * @param fallbackThreshold 保底候選門檻。
 * @param recentSourceIds 仍在跨日冷卻期的來源 ID。
 * @param knownReasons 硬性資格檢查記錄的明確原因。
 * @returns 穩定、可供診斷檔查詢的原因代碼。
 */
export function rejectionReason(
  candidate: NewsCandidate,
  selectedIds: Set<string>,
  normalMode: boolean,
  normalThreshold: number,
  fallbackThreshold: number,
  recentSourceIds: Set<string>,
  knownReasons: Map<string, string>
): string {
  if (selectedIds.has(candidate.id)) return "selected";
  const knownReason = knownReasons.get(candidate.id);
  if (knownReason) return knownReason;
  if (candidate.evidenceStatus === "unverified-claim") return "unverified-claim";
  if (candidate.contentScore < fallbackThreshold) return "below-fallback-score";
  if (recentSourceIds.has(candidate.sourceId) && !candidate.bypassSourceCooldown) {
    return "source-cooldown";
  }
  if (candidate.contentScore < normalThreshold && normalMode) return "below-normal-score";
  return "diversity-limit";
}

/**
 * 建立本次本地篩選的隱私安全診斷快照。
 * @param collection 來源收集、評分及本地選擇結果。
 * @param normalThreshold 一般候選門檻。
 * @param fallbackThreshold 保底候選門檻。
 * @param recentSourceIds 仍在跨日冷卻期的來源 ID。
 * @param ranAt 診斷時間；測試可傳入固定值。
 * @returns 同時含執行彙總與逐篇 URL 判斷的診斷資料。
 */
export function createRunDiagnostic(
  collection: CandidateCollectionResult,
  normalThreshold: number,
  fallbackThreshold: number,
  recentSourceIds: Set<string>,
  ranAt = new Date().toISOString()
): RunDiagnostic {
  const selectedById = new Map(collection.candidates.map((candidate) => [candidate.id, candidate]));
  const selectedIds = new Set(selectedById.keys());
  const normalMode = collection.localEligibility.normalEligible > 0;
  const ranked = [...collection.evaluatedCandidates]
    .sort((a, b) => b.contentScore - a.contentScore || a.url.localeCompare(b.url));
  const reasonFor = (candidate: NewsCandidate): string => rejectionReason(
    candidate,
    selectedIds,
    normalMode,
    normalThreshold,
    fallbackThreshold,
    recentSourceIds,
    collection.rejectionReasons
  );

  return {
    ranAt,
    validDateCount: collection.sourceStats.reduce((sum, stats) => sum + stats.validDate, 0),
    evaluatedCount: collection.evaluatedCandidates.length,
    candidateCount: collection.candidates.length,
    highestContentScore: ranked[0]?.contentScore ?? null,
    geminiCalled: collection.candidates.length > 0,
    localEligibility: collection.localEligibility,
    sourceStats: collection.sourceStats,
    nearMisses: ranked
      .filter((candidate) => !selectedIds.has(candidate.id))
      .slice(0, 5)
      .map((candidate) => ({
        title: candidate.title,
        source: candidate.source,
        url: candidate.url,
        contentScore: candidate.contentScore,
        reason: reasonFor(candidate)
      })),
    localCandidates: collection.candidates.map((candidate) => ({
      candidateId: candidate.id,
      title: candidate.title,
      source: candidate.source,
      sourceId: candidate.sourceId,
      url: candidate.url,
      contentScore: candidate.contentScore,
      selectionLane: candidate.selectionLane!,
      bypassSourceCooldown: candidate.bypassSourceCooldown
    })),
    geminiDecisions: [],
    evaluatedItems: ranked.map((candidate) => {
      const selected = selectedById.get(candidate.id);
      return {
        candidateId: candidate.id,
        title: candidate.title,
        source: candidate.source,
        sourceId: candidate.sourceId,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        contentScore: candidate.contentScore,
        scoreBreakdown: candidate.scoreBreakdown,
        matchedGroups: candidate.matchedGroups,
        negativeMatches: candidate.negativeMatches,
        localDecision: selected
          ? `selected:${selected.selectionLane ?? "unknown"}`
          : `rejected:${reasonFor(candidate)}`,
        ...(selected?.selectionLane ? { selectionLane: selected.selectionLane } : {})
      };
    })
  };
}

/**
 * 將 Gemini 的逐篇判斷合併到相同 URL 診斷項目。
 * @param diagnostic 尚未附加 Gemini 結果的執行診斷。
 * @param decisions Gemini 回傳並已驗證 candidate ID 的結果。
 * @returns 原物件，方便呼叫端繼續寫入狀態檔。
 */
export function attachGeminiDecisions(
  diagnostic: RunDiagnostic,
  decisions: GeminiDecision[]
): RunDiagnostic {
  diagnostic.geminiDecisions = decisions;
  const decisionsById = new Map(decisions.map((decision) => [decision.candidateId, decision]));
  diagnostic.evaluatedItems?.forEach((item) => {
    const decision = decisionsById.get(item.candidateId);
    if (decision) item.geminiDecision = decision;
  });
  return diagnostic;
}
