import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { getProjectRoot } from "./config.js";
import type { ArticleDiagnostic, DeliveryRecord, FeedConfig, RunDiagnostic } from "./types.js";
import { canonicalizeUrl, hostMatches, hostname } from "./url.js";

interface SentState { sentUrls: string[] }
const statePath = path.join(getProjectRoot(), "data/sent-items.json");
const deliveryHistoryPath = path.join(getProjectRoot(), "data/delivery-history.json");
const runDiagnosticsPath = path.join(getProjectRoot(), "data/run-diagnostics.json");

interface DeliveryHistory { deliveries: DeliveryRecord[] }
interface RunDiagnosticsHistory { runs: RunDiagnostic[] }
export interface ArticleDiagnosticMatch {
  ranAt: string;
  item: ArticleDiagnostic;
}
const RUN_DIAGNOSTIC_RETENTION = 90;
const DETAILED_RUN_RETENTION = 7;

/**
 * 保留 90 次執行彙總，但只讓最近 7 次攜帶逐篇文章明細。
 * 這能支援近期 URL 追查，同時限制第三方 metadata 與 Git history 的成長。
 */
function compactRunDiagnostics(runs: RunDiagnostic[]): RunDiagnostic[] {
  const recentRuns = runs.slice(-RUN_DIAGNOSTIC_RETENTION);
  const detailedStart = Math.max(0, recentRuns.length - DETAILED_RUN_RETENTION);
  return recentRuns.map((run, index) => {
    if (index >= detailedStart || !run.evaluatedItems) return run;
    const { evaluatedItems: _discarded, ...summary } = run;
    return summary;
  });
}

function normalizeDeliveryRecord(value: unknown): DeliveryRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const recipientAlias = record.recipientAlias ?? record.recipientLabel;
  const recipientHash = record.recipientHash ?? record.recipientIdHash;
  if (typeof record.sentAt !== "string"
    || typeof recipientAlias !== "string"
    || typeof recipientHash !== "string"
    || typeof record.type !== "string"
    || typeof record.message !== "string"
    || !Array.isArray(record.urls)) return null;

  const status = record.status === "failed" ? "failed" : "sent";
  return {
    sentAt: record.sentAt,
    recipientAlias,
    recipientHash,
    status,
    type: record.type as DeliveryRecord["type"],
    message: record.message,
    urls: record.urls.filter((url): url is string => typeof url === "string"),
    ...(Array.isArray(record.sourceIds)
      ? { sourceIds: record.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === "string") }
      : {}),
    ...(typeof record.error === "string" ? { error: record.error } : {})
  };
}

export async function loadSentUrls(): Promise<Set<string>> {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8")) as SentState;
    return new Set(Array.isArray(state.sentUrls) ? state.sentUrls : []);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw new Error("Unable to read data/sent-items.json", { cause: error });
  }
}

export async function saveSentUrls(urls: Set<string>): Promise<void> {
  const recent = [...urls].slice(-500);
  await writeFile(statePath, `${JSON.stringify({ sentUrls: recent }, null, 2)}\n`, "utf8");
}

export function hashRecipientId(targetId: string): string {
  return createHash("sha256").update(targetId).digest("hex");
}

/**
 * 從成功的新聞投遞紀錄取得冷卻期內的來源 ID。
 * 舊紀錄沒有 sourceIds 時，會以文章網址對照 feed 的允許網域完成一次性相容推導。
 */
export async function loadRecentDeliveredSourceIds(
  feeds: FeedConfig[],
  cooldownHours: number,
  now = new Date(),
  historyPath = deliveryHistoryPath
): Promise<Set<string>> {
  let history: DeliveryHistory = { deliveries: [] };
  try {
    history = JSON.parse(await readFile(historyPath, "utf8")) as DeliveryHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw new Error("Unable to read delivery history", { cause: error });
  }

  const cutoff = now.valueOf() - cooldownHours * 60 * 60 * 1000;
  const recentSourceIds = new Set<string>();
  for (const value of Array.isArray(history.deliveries) ? history.deliveries : []) {
    const record = normalizeDeliveryRecord(value);
    if (!record || record.status !== "sent" || record.type !== "news") continue;
    const sentAt = new Date(record.sentAt).valueOf();
    if (Number.isNaN(sentAt) || sentAt < cutoff || sentAt > now.valueOf()) continue;

    record.sourceIds?.forEach((sourceId) => recentSourceIds.add(sourceId));
    if (record.sourceIds?.length) continue;
    for (const url of record.urls) {
      const candidateHost = hostname(url);
      if (!candidateHost) continue;
      feeds
        .filter((feed) => hostMatches(candidateHost, new Set(feed.allowedHosts ?? [])))
        .forEach((feed) => recentSourceIds.add(feed.id));
    }
  }
  return recentSourceIds;
}

export async function recordDeliveries(
  records: DeliveryRecord[],
  historyPath = deliveryHistoryPath
): Promise<void> {
  let history: DeliveryHistory = { deliveries: [] };
  try {
    history = JSON.parse(await readFile(historyPath, "utf8")) as DeliveryHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("Unable to read delivery history", { cause: error });
    }
  }

  const deliveries = Array.isArray(history.deliveries)
    ? history.deliveries.flatMap((record) => {
        const normalized = normalizeDeliveryRecord(record);
        return normalized ? [normalized] : [];
      })
    : [];
  deliveries.push(...records);
  await writeFile(
    historyPath,
    `${JSON.stringify({ deliveries: deliveries.slice(-365) }, null, 2)}\n`,
    "utf8"
  );
}

export async function recordRunDiagnostic(
  diagnostic: RunDiagnostic,
  diagnosticsPath = runDiagnosticsPath
): Promise<void> {
  let history: RunDiagnosticsHistory = { runs: [] };
  try {
    history = JSON.parse(await readFile(diagnosticsPath, "utf8")) as RunDiagnosticsHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new Error("Unable to read run diagnostics", { cause: error });
    }
  }

  const runs = Array.isArray(history.runs) ? history.runs : [];
  runs.push(diagnostic);
  await writeFile(
    diagnosticsPath,
    `${JSON.stringify({ runs: compactRunDiagnostics(runs) }, null, 2)}\n`,
    "utf8"
  );
}

/**
 * 依正規化後的 URL 查詢仍在保留期內的逐篇評分與淘汰紀錄。
 * @param url 要追查的文章 URL；追蹤參數與 fragment 不影響比對。
 * @param diagnosticsPath 診斷檔位置，測試可傳入暫存檔。
 * @returns 由舊到新的所有相符執行紀錄；超過逐篇保留期時不會有結果。
 * @throws 診斷檔存在但無法讀取或解析時拋出錯誤。
 */
export async function findArticleDiagnosticsByUrl(
  url: string,
  diagnosticsPath = runDiagnosticsPath
): Promise<ArticleDiagnosticMatch[]> {
  let history: RunDiagnosticsHistory;
  try {
    history = JSON.parse(await readFile(diagnosticsPath, "utf8")) as RunDiagnosticsHistory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Unable to read run diagnostics", { cause: error });
  }

  const targetUrl = canonicalizeUrl(url);
  return (Array.isArray(history.runs) ? history.runs : []).flatMap((run) =>
    (Array.isArray(run.evaluatedItems) ? run.evaluatedItems : [])
      .filter((item) => canonicalizeUrl(item.url) === targetUrl)
      .map((item) => ({ ranAt: run.ranAt, item }))
  );
}
