import { loadFeeds, loadProfile, loadRankingConfig, requireEnvironment } from "./config.js";
import { attachGeminiDecisions, createRunDiagnostic, rejectionReason } from "./diagnostics.js";
import { collectCandidatesDetailed } from "./feeds.js";
import { curateWithGemini } from "./gemini.js";
import { formatLineMessage, formatNoNewsMessage, sendLineMessageToRecipients } from "./line.js";
import { loadRecipients } from "./recipients.js";
import {
  hashRecipientId,
  loadRecentDeliveredSourceIds,
  loadSentUrls,
  recordDeliveries,
  recordRunDiagnostic,
  saveSentUrls
} from "./state.js";
import type { DeliveryRecord, LineRecipient } from "./types.js";

/** 將外部錯誤縮短為可安全寫入診斷紀錄的文字。 */
function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message.slice(0, 300) : String(reason).slice(0, 300);
}

/** 對所有設定收件者獨立推播，並保存不含明文 userId 的投遞紀錄。 */
async function deliverMessage(
  message: string,
  type: DeliveryRecord["type"],
  urls: string[],
  token: string,
  recipients: LineRecipient[],
  sourceIds: string[] = []
): Promise<{ sentCount: number; failedAliases: string[] }> {
  const results = await sendLineMessageToRecipients(message, token, recipients);
  const sentAt = new Date().toISOString();
  const records: DeliveryRecord[] = results.map((result, index) => ({
    sentAt,
    recipientAlias: recipients[index]!.alias,
    recipientHash: hashRecipientId(recipients[index]!.targetId),
    status: result.status === "fulfilled" ? "sent" : "failed",
    type,
    message,
    urls,
    sourceIds,
    ...(result.status === "rejected" ? { error: errorMessage(result.reason) } : {})
  }));
  await recordDeliveries(records);

  const failures = records.filter((record) => record.status === "failed");
  return {
    sentCount: records.length - failures.length,
    failedAliases: failures.map((record) => record.recipientAlias)
  };
}

/** 任一收件者失敗時，在個別投遞已完成後讓 workflow 明確失敗。 */
function throwForDeliveryFailures(failedAliases: string[]): void {
  if (failedAliases.length > 0) {
    throw new Error(`LINE delivery failed for: ${failedAliases.join(", ")}`);
  }
}

/** 執行每日來源擷取、篩選、Gemini 判斷與 LINE 投遞流程。 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const previewCandidates = process.argv.includes("--preview-candidates");
  const lineTestMode = process.argv.includes("--test-line") || process.env.LINE_TEST_MODE === "true";
  const noDelivery = dryRun || previewCandidates;
  const lineToken = noDelivery && !lineTestMode ? undefined : requireEnvironment("LINE_CHANNEL_ACCESS_TOKEN");
  const recipients = noDelivery && !lineTestMode ? [] : loadRecipients();

  if (lineTestMode) {
    const timestamp = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());
    const message = `✅ AI News Bot 測試成功\n\nLINE 推播通道已正常連線。\n測試時間：${timestamp}`;
    const outcome = await deliverMessage(message, "test", [], lineToken!, recipients, []);
    throwForDeliveryFailures(outcome.failedAliases);
    console.log(`Sent a LINE test message to ${outcome.sentCount} recipient(s). Gemini was not called.`);
    return;
  }

  const profile = await loadProfile();
  const displayName = profile.displayName?.trim() || profile.name;
  const feeds = await loadFeeds();
  const rankingConfig = await loadRankingConfig();
  const sentUrls = await loadSentUrls();
  const now = new Date();
  const recentSourceIds = await loadRecentDeliveredSourceIds(
    feeds,
    rankingConfig.selection.sourceCooldownHours,
    now
  );
  const collection = await collectCandidatesDetailed(feeds, rankingConfig, sentUrls, now, recentSourceIds);
  const candidates = collection.candidates;
  const diagnostic = createRunDiagnostic(
    collection,
    rankingConfig.selection.minContentScore,
    rankingConfig.selection.fallbackMinContentScore,
    recentSourceIds
  );
  console.log(`Found ${candidates.length} eligible candidates.`);
  collection.sourceStats.forEach((stats) => {
    console.log(JSON.stringify({ sourceStats: stats }));
  });
  if (previewCandidates) {
    const selectedById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selectedIds = new Set(selectedById.keys());
    collection.evaluatedCandidates
      .sort((a, b) => b.contentScore - a.contentScore || a.url.localeCompare(b.url))
      .slice(0, 20)
      .forEach((candidate, index) => {
      const selected = selectedById.get(candidate.id);
      const decision = selected
        ? `selected:${selected.selectionLane ?? "unknown"}`
        : `rejected:${rejectionReason(
            candidate,
            selectedIds,
            collection.localEligibility.normalEligible > 0,
            rankingConfig.selection.minContentScore,
            rankingConfig.selection.fallbackMinContentScore,
            recentSourceIds,
            collection.rejectionReasons
          )}`;
      console.log(JSON.stringify({
        rank: index + 1,
        decision,
        id: candidate.id,
        title: candidate.title,
        source: candidate.source,
        sourceRole: candidate.sourceRole,
        evidenceStatus: candidate.evidenceStatus,
        selectionLane: candidate.selectionLane,
        contentScore: candidate.contentScore,
        scoreBreakdown: candidate.scoreBreakdown,
        matchedGroups: candidate.matchedGroups.map((match) => match.groupId),
        negativeMatches: candidate.negativeMatches.map((match) => match.groupId),
        publishedAt: candidate.publishedAt,
        url: candidate.url
      }, null, 2));
      });
    return;
  }
  const geminiApiKey = requireEnvironment("GEMINI_API_KEY");
  let digest: Awaited<ReturnType<typeof curateWithGemini>>;
  try {
    digest = await curateWithGemini(
      profile,
      candidates,
      geminiApiKey,
      process.env.GEMINI_MODEL,
      process.env.GEMINI_FALLBACK_MODEL
    );
    attachGeminiDecisions(diagnostic, digest.decisions);
  } catch (error) {
    diagnostic.geminiError = errorMessage(error);
    if (!noDelivery) await recordRunDiagnostic(diagnostic);
    throw error;
  }
  if (!noDelivery) await recordRunDiagnostic(diagnostic);
  if (digest.items.length === 0) {
    const noNewsMessage = formatNoNewsMessage({
      validDateCount: diagnostic.validDateCount,
      evaluatedCount: diagnostic.evaluatedCount,
      candidateCount: diagnostic.candidateCount,
      highestContentScore: diagnostic.highestContentScore,
      geminiCalled: diagnostic.geminiCalled,
      localEligibility: diagnostic.localEligibility,
      normalThreshold: rankingConfig.selection.minContentScore,
      fallbackThreshold: rankingConfig.selection.fallbackMinContentScore,
      geminiThreshold: 75
    }, new Date(), displayName);
    if (dryRun) {
      console.log(`\n${noNewsMessage}\n`);
      return;
    }
    const outcome = await deliverMessage(noNewsMessage, "no-news", [], lineToken!, recipients, []);
    throwForDeliveryFailures(outcome.failedAliases);
    console.log(`No item reached the relevance threshold. Sent a status message to ${outcome.sentCount} recipient(s).`);
    return;
  }

  const message = formatLineMessage(digest, candidates, new Date(), displayName);
  if (dryRun) {
    console.log(`\n${message}\n`);
    return;
  }

  const selectedIds = new Set(digest.items.map((item) => item.candidateId));
  const selectedCandidates = candidates.filter((item) => selectedIds.has(item.id));
  const selectedUrls = selectedCandidates.map((item) => item.url);
  const selectedSourceIds = [...new Set(selectedCandidates.map((item) => item.sourceId))];
  const outcome = await deliverMessage(message, "news", selectedUrls, lineToken!, recipients, selectedSourceIds);
  if (outcome.sentCount > 0) {
    selectedUrls.forEach((url) => sentUrls.add(url));
    await saveSentUrls(sentUrls);
  }
  throwForDeliveryFailures(outcome.failedAliases);
  console.log(`Sent ${digest.items.length} curated item(s) to ${outcome.sentCount} recipient(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
