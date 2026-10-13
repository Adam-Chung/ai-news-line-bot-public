import type { CuratedDigest, LineRecipient, LocalEligibilitySummary, NewsCandidate } from "./types.js";

function evidenceLabel(candidate: NewsCandidate): string {
  switch (candidate.evidenceStatus) {
    case "primary": return "官方發布";
    case "linked-primary": return "社群發現、連結官方原文";
    case "corroborated": return "已交叉佐證";
    case "expert-analysis": return "專家實務";
    case "secondary-report": return "媒體報導";
    case "community-technique": return "社群技巧";
    case "preprint": return "預印本研究";
    case "unverified-claim": return "尚未驗證";
  }
}

export function formatLineMessage(
  digest: CuratedDigest,
  candidates: NewsCandidate[],
  now = new Date(),
  displayName = "使用者"
): string {
  const byId = new Map(candidates.map((item) => [item.id, item]));
  const date = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(now);
  const sections = digest.items.flatMap((item, index) => {
    const candidate = byId.get(item.candidateId);
    if (!candidate) return [];
    const concept = item.conceptExplanation ? `\n\n💡 名詞／概念\n${item.conceptExplanation}` : "";
    const discussion = candidate.discussionUrl
      ? `\n💬 Hacker News 討論：${candidate.discussionUrl}`
      : "";
    const primaryLink = candidate.discussionUrl
      ? `🔗 原文：${candidate.url}`
      : `🔗 ${candidate.url}`;
    return [`${index + 1}.【${item.category}】${item.title}\n${item.summaryZh.trim()}\n\n${item.summaryEn.trim()}\n\n📌 資料性質：${evidenceLabel(candidate)}\n📰 來源：${candidate.source}\n\n🎯 為什麼對你重要\n${item.whyImportant}${concept}\n\n${primaryLink}${discussion}`];
  });
  return `🤖 ${displayName} 的今日 AI 情報｜${date}\n\n${sections.join("\n\n──────────\n\n")}`;
}

export interface NoNewsDiagnostics {
  validDateCount: number;
  evaluatedCount: number;
  candidateCount: number;
  highestContentScore: number | null;
  geminiCalled: boolean;
  localEligibility: LocalEligibilitySummary;
  normalThreshold: number;
  fallbackThreshold: number;
  geminiThreshold: number;
}

/** 將本地硬性資格淘汰原因整理成適合 LINE 顯示的精簡文字。 */
function formatLocalRejections(summary: LocalEligibilitySummary): string {
  const reasons = [
    summary.rejectedAiTopic > 0 ? `AI 主題不足 ${summary.rejectedAiTopic} 篇` : null,
    summary.rejectedCommunityGate > 0 ? `社群互動不足 ${summary.rejectedCommunityGate} 篇` : null,
    summary.rejectedEvidence > 0 ? `證據不足 ${summary.rejectedEvidence} 篇` : null,
    summary.rejectedSourceCooldown > 0 ? `來源冷卻 ${summary.rejectedSourceCooldown} 篇` : null
  ].filter((reason): reason is string => reason !== null);
  if (reasons.length > 0) return reasons.join("、");
  return summary.scoredAtOrAboveFallback > 0
    ? "無硬性資格淘汰"
    : "沒有內容達到保底分數";
}

export function formatNoNewsMessage(
  diagnostics: NoNewsDiagnostics,
  now = new Date(),
  displayName = "使用者"
): string {
  const date = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric"
  }).format(now);
  const highestScore = diagnostics.highestContentScore === null
    ? "無可評分內容"
    : `${diagnostics.highestContentScore} 分`;
  const geminiStatus = diagnostics.geminiCalled
    ? `已檢查 ${diagnostics.candidateCount} 篇候選，均未達 ${diagnostics.geminiThreshold} 分`
    : "未呼叫（資格檢查後沒有可送出的候選）";
  const localEligibility = diagnostics.localEligibility;
  const communityDiscovery = localEligibility.communityDiscoveryAdmitted > 0
    ? `\n🧭 社群探索放行：${localEligibility.communityDiscoveryAdmitted} 篇`
    : "";

  return `🤖 ${displayName} 的今日 AI 情報｜${date}\n\n今天沒有發現達到重要性門檻的 AI 消息。\n\n📥 24 小時內有效內容：${diagnostics.validDateCount} 篇\n🔎 完成本地評分：${diagnostics.evaluatedCount} 篇\n🏅 當日最高本地分數：${highestScore}\n📊 ${diagnostics.fallbackThreshold} 分以上內容：${localEligibility.scoredAtOrAboveFallback} 篇\n✅ 通過資格檢查：${localEligibility.passedHardGates} 篇${communityDiscovery}\n🚫 淘汰原因：${formatLocalRejections(localEligibility)}\n📤 送交 Gemini：${geminiStatus}\n🎯 本地門檻：一般 ${diagnostics.normalThreshold} 分；0 篇時保底 ${diagnostics.fallbackThreshold} 分\n\n系統維持寧缺勿濫，明天再繼續幫你留意。`;
}

export async function sendLineMessage(message: string, token: string, targetId: string): Promise<void> {
  if (!targetId.trim()) throw new Error("LINE_TARGET_ID is required; broadcast delivery is disabled");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: targetId, messages: [{ type: "text", text: message }] }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`LINE API returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
}

export function sendLineMessageToRecipients(
  message: string,
  token: string,
  recipients: LineRecipient[]
): Promise<PromiseSettledResult<void>[]> {
  return Promise.allSettled(
    recipients.map((recipient) => sendLineMessage(message, token, recipient.targetId))
  );
}
