import { findArticleDiagnosticsByUrl } from "./state.js";

/**
 * 從命令列查詢近期文章的本地分數、命中詞及 Gemini 決策。
 * @throws 未提供 URL 或診斷檔無法讀取時拋出錯誤。
 */
async function main(): Promise<void> {
  const url = process.argv[2]?.trim();
  if (!url) {
    throw new Error("Usage: npm run diagnose:url -- <article-url>");
  }

  const matches = await findArticleDiagnosticsByUrl(url);
  if (matches.length === 0) {
    console.log("No retained diagnostic found for this URL. Detailed records are kept for the latest 7 runs.");
    return;
  }
  console.log(JSON.stringify(matches, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
