# 自架指南

## Self-hosting guide

本指南協助你在自己的電腦或 Private GitHub repository 執行 AI News LINE Bot。使用前請先閱讀根目錄的 [`LICENSE`](../LICENSE)：本專案允許個人、學習、研究及其他非商業用途，但不允許未經書面授權的商業使用。

This guide explains how to run AI News LINE Bot on your own computer or from a private GitHub repository. Read the root [`LICENSE`](../LICENSE) first. The project permits personal, educational, research, and other non-commercial use, but commercial use requires separate written permission.

## 事前準備

### Prerequisites

- Node.js 20 以上。<br>
  Node.js 20 or later.
- 可使用 Gemini API 的 API key。<br>
  An API key with access to the Gemini API.
- LINE Messaging API channel access token。<br>
  A LINE Messaging API channel access token.
- 至少一個允許 Bot 推送訊息的 LINE user ID。<br>
  At least one LINE user ID that the bot is allowed to message.
- 你有權自動存取並交由 Gemini 處理的 RSS、Atom、sitemap 或 API 來源。<br>
  RSS, Atom, sitemap, or API sources that you are authorized to access automatically and process through Gemini.

## 在本機執行

### Run locally

1. Fork 或下載 repository，安裝固定版本的 dependencies：

   Fork or download the repository, then install the locked dependencies:

   ```bash
   npm ci
   npm run check
   ```

2. 複製 `.env.example` 為 `.env`，填入自己的憑證。`.env` 不可提交到 Git。

   Copy `.env.example` to `.env` and add your own credentials. Never commit `.env` to Git.

   ```text
   GEMINI_API_KEY=...
   GEMINI_MODEL=gemini-3.5-flash
   GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
   LINE_CHANNEL_ACCESS_TOKEN=...
   LINE_TARGET_ID_001=...
   SOURCE_USER_AGENT=AI-News-Line-Bot/0.4 (+https://your-public-contact.example; personal digest)
   ```

3. 編輯 `config/profile.json`，設定你的背景、目標與關注主題。

   Edit `config/profile.json` to describe your background, goals, and topics of interest.

4. 編輯 `config/feeds.json` 加入自己的來源。Public 版本預設沒有來源；請先完成 Terms、授權、`robots.txt`、Rate Limit、AI processing 與再散布檢查，再將來源設為 `enabled: true`。

   Add your own sources to `config/feeds.json`. The Public version has no default sources. Review the applicable terms, license, `robots.txt`, rate limits, AI-processing permission, and redistribution rules before setting a source to `enabled: true`.

5. 依序進行不傳送訊息的驗證，再執行完整流程：

   Validate without sending a message before running the complete pipeline:

   ```bash
   npm run smoke:sources
   npm run preview:candidates
   npm run dry-run
   npm start
   ```

`npm run dry-run` 會呼叫 Gemini，但不會傳送 LINE。`npm start` 會呼叫 Gemini 並傳送 LINE。

`npm run dry-run` calls Gemini without sending LINE. `npm start` calls Gemini and sends LINE messages.

## 使用 GitHub Actions 排程

### Schedule with GitHub Actions

長期排程建議將程式碼匯入你自己的 **Private repository**，不要直接在 Public fork 保存 runtime state。Public GitHub Actions logs、artifacts 與 cache 可能被具有 repository 存取權的人讀取；不要把 Gemini key、LINE token、LINE user ID 或完整訊息寫入 workflow、log、artifact 或 cache。

For long-running schedules, import the code into your own **private repository** instead of storing runtime state in a public fork. GitHub Actions logs, artifacts, and caches may be readable by people with repository access. Never place Gemini keys, LINE tokens, LINE user IDs, or complete messages in a workflow, log, artifact, or cache.

1. 建立新的 Private repository，複製本專案的 working tree，但不要複製其他人的 `.git` history、`.env` 或 `data/*.json`。

   Create a new private repository and copy this project's working tree. Do not copy another user's `.git` history, `.env`, or `data/*.json`.

2. 在 Private repository 的 Actions Secrets 建立：

   Add these Actions Secrets to the private repository:

   - `GEMINI_API_KEY`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_TARGET_ID_001`

3. 在 Actions Variables 建立 `SOURCE_USER_AGENT`。需要更多收件者時，可自行增加 `LINE_TARGET_ID_002` 等 Secret，並在 workflow 的 `env` 中加入同名映射。

   Add `SOURCE_USER_AGENT` as an Actions Variable. For more recipients, add Secrets such as `LINE_TARGET_ID_002` and map each matching name in the workflow `env` block.

4. 將 [`examples/daily-ai-news.private-repo.example.yml`](examples/daily-ai-news.private-repo.example.yml) 複製到 `.github/workflows/daily-ai-news.yml`，審閱 cron、權限與 Secrets 映射後才提交。

   Copy [`examples/daily-ai-news.private-repo.example.yml`](examples/daily-ai-news.private-repo.example.yml) to `.github/workflows/daily-ai-news.yml`. Review the cron schedule, permissions, and Secret mappings before committing it.

範例 workflow 會把去重與投遞紀錄 commit 回 **你的 Private repository**，避免每天重複推送。這些檔案可能包含網址、完整訊息、recipient alias、hash 與診斷內容，不得推送到 Public repository。

The example workflow commits deduplication and delivery state back to **your private repository** to reduce repeated delivery. These files may contain URLs, complete messages, recipient aliases, hashes, and diagnostics and must never be pushed to a public repository.

GitHub Actions 的 cron 使用 UTC，且 scheduled run 可能延遲。範例 `30 1 * * *` 對應 Asia/Taipei 09:30，但不能保證準時開始。

GitHub Actions cron uses UTC, and scheduled runs may be delayed. The example `30 1 * * *` corresponds to 09:30 Asia/Taipei, but exact start time is not guaranteed.

## 安全與維護檢查

### Security and maintenance checklist

- 先執行 `npm run check`，再修改或部署。<br>
  Run `npm run check` before modifying or deploying the project.
- 使用 repository Secrets，不要把 Secret 寫進 YAML、程式碼或 Issue。<br>
  Use repository Secrets; never place secrets in YAML, source code, or issues.
- 保持來源低頻、遵守 `Retry-After`，來源拒絕存取時停止。<br>
  Keep source access infrequent, honor `Retry-After`, and stop when access is denied.
- 定期重新檢查來源條款、Gemini／LINE API 政策、dependencies 與安全警示。<br>
  Recheck source terms, Gemini and LINE API policies, dependencies, and security alerts regularly.
- 若憑證可能外洩，先撤銷或輪替，再清理 history 與 logs。<br>
  If a credential may be exposed, revoke or rotate it before cleaning history and logs.

本文件提供技術操作資訊，不構成法律意見，也不能替代你對來源與服務條款的審查。

This document provides technical operating information, not legal advice, and does not replace your review of source and service terms.
