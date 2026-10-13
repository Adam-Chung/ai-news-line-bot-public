# AI News LINE Bot

一個可自行設定來源與個人偏好的 AI 新聞篩選範例專案。系統可讀取使用者自行加入的 RSS、Atom、sitemap 或支援的 API，先以本地規則篩選，再交由 Gemini 產生繁體中文與英文摘要，最後以 LINE Push API 傳送給指定收件者。

An example AI news filtering project with user-configurable sources and personal preferences. It reads RSS, Atom, sitemap, or supported API sources added by the user, applies local filtering rules, asks Gemini to generate Traditional Chinese and English summaries, and delivers the results to specified recipients through the LINE Push API.

> 本 Public Repository **不內建任何新聞來源**。`config/feeds.json` 預設為空陣列，不會主動存取任何第三方網站。使用者加入、啟用及運行來源前，必須自行完成授權與合規確認並承擔相應責任。
>
> This Public Repository **does not include any built-in news sources**. `config/feeds.json` is an empty array by default, so the project does not access any third-party website unless the user adds a source. Before adding, enabling, or running a source, users must verify authorization and compliance requirements and accept responsibility for their use.

## 主要功能

### Key features

- 僅接受具有可驗證發布時間且位於最近 24 小時內的內容。<br>
  Accepts only content with a verifiable publication timestamp within the previous 24 hours.
- 先以來源中立的本地規則評分、去重與限制候選數量，再呼叫 Gemini。<br>
  Applies source-neutral local scoring, deduplication, and candidate limits before calling Gemini.
- 由 Gemini 進行個人相關性判斷，並產生中文在前、英文在後的雙語摘要。<br>
  Uses Gemini for personalized relevance evaluation and bilingual summaries with Chinese first and English second.
- 使用 LINE Push API 個別傳送給一個以上的 Secret-configured recipients。<br>
  Delivers individually to one or more secret-configured recipients through the LINE Push API.
- 內建保守 Rate Limit、`Retry-After`、`robots.txt` 檢查、錯誤隔離與隱私導向紀錄。<br>
  Includes conservative rate limits, `Retry-After`, `robots.txt` checks, failure isolation, and privacy-conscious records.

## 技術棧

### Technology stack

| 類型 / Area | 技術 / Technology |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript 5 |
| Parsing | `fast-xml-parser` |
| AI | Gemini API |
| Delivery | LINE Messaging API — Push API |
| Testing | Vitest |
| Automation | GitHub Actions |

## 為什麼不提供預設來源

### Why no default sources are included

網站政策、feed 授權、API 條款與 `robots.txt` 會變動，而且個人研究、多人散布與商業用途可能適用不同限制。公開可讀的 RSS 或網頁不代表允許自動抓取、交給 AI 處理、重製摘要或再次散布。

Website policies, feed licenses, API terms, and `robots.txt` rules can change. Personal research, distribution to multiple recipients, and commercial use may also be subject to different restrictions. A publicly accessible RSS feed or webpage does not automatically authorize automated retrieval, AI processing, summary reproduction, or redistribution.

因此本專案只提供通用程式架構，不替使用者選擇或背書任何資料來源。

This project therefore provides only a general-purpose software architecture. It does not select, approve, or endorse any data source on the user's behalf.

## 系統流程

### System flow

```text
使用者自行設定的來源
User-configured sources
        ↓
發布時間與網址驗證
Publication-time and URL validation
        ↓
本地內容評分、去重與候選限制
Local content scoring, deduplication, and candidate limits
        ↓
Gemini 相關性判斷與中英摘要
Gemini relevance evaluation and bilingual summarization
        ↓
LINE Push API
```

## 關鍵技術決策

### Key technical decisions

- Public 版本以空來源設定發布，避免替使用者選擇或背書第三方來源。<br>
  The Public version ships with an empty source configuration to avoid selecting or endorsing third-party sources for users.
- 發布時間、存取政策或必要設定無法驗證時採 fail closed，不猜測、不繞過限制。<br>
  The system fails closed when publication time, access policy, or required configuration cannot be verified; it does not guess or bypass restrictions.
- 本地規則負責低成本縮小候選，Gemini 只處理受限批次，控制免費額度與延遲。<br>
  Local rules reduce the candidate set at low cost, while Gemini processes only a bounded batch to control free-tier usage and latency.
- Public repository 由 Private source of truth 單向安全匯出；production state、來源與 Secrets 不反向或向外同步。<br>
  The Public repository is generated one way from a Private source of truth; production state, sources, and secrets are never synchronized outward or back automatically.

## 使用原則與使用者責任

### Usage principles and user responsibilities

新增任何來源前，使用者必須自行確認並持續遵守：

Before adding any source, users must independently verify and continue to comply with:

- 目標網站或 API 最新的 Terms of Service、使用政策與 feed/API 授權。<br>
  The current Terms of Service, usage policies, and feed or API licenses of the target website or API.
- `robots.txt`、Rate Limit、`Retry-After` 及其他自動存取限制。<br>
  `robots.txt`, rate limits, `Retry-After`, and other automated-access restrictions.
- 著作權、資料庫權、隱私、個人資料、商標及所在地適用法令。<br>
  Copyright, database rights, privacy, personal-data, trademark, and applicable local laws.
- 是否允許把來源內容傳送給 Gemini 或其他第三方服務處理。<br>
  Whether source content may be sent to Gemini or another third-party service for processing.
- 摘要、引用、保存、多人傳送、公開展示及商業使用的限制。<br>
  Restrictions on summarization, quotation, retention, multi-recipient delivery, public display, and commercial use.

禁止繞過登入、付費牆、CAPTCHA、IP 封鎖、存取權限或其他技術限制。來源條款不清楚、禁止自動存取或無法確認時，應保持 `enabled: false`，或不要加入該來源。

Do not bypass authentication, paywalls, CAPTCHAs, IP blocks, access controls, or other technical restrictions. If a source's terms are unclear, prohibit automated access, or cannot be verified, keep `enabled: false` or do not add that source.

本專案僅供學習、研究與合法用途，不構成法律意見。免責聲明不能取代使用者取得必要授權或遵守法令的義務。

This project is intended only for learning, research, and lawful use and does not constitute legal advice. A disclaimer does not replace the user's obligation to obtain required authorization or comply with applicable law.

## 安全預設

### Secure defaults

- `config/feeds.json` 預設為 `[]`。<br>
  `config/feeds.json` defaults to `[]`.
- Public 版本不包含 production 排程 workflow。<br>
  The Public version does not include the production scheduling workflow.
- Public 版本不包含 Gemini／LINE Secrets、LINE userId、收件者 alias 或 hash。<br>
  The Public version does not include Gemini or LINE Secrets, LINE user IDs, recipient aliases, or recipient hashes.
- Public 版本不包含 delivery history、run diagnostics 或 sent-items。<br>
  The Public version does not include delivery history, run diagnostics, or sent-item state.
- 同一 origin 預設至少間隔一秒，並處理 `Retry-After`。<br>
  Requests to the same origin are spaced at least one second apart by default, and `Retry-After` is honored.
- LINE 只使用 Push API；至少需要一個 `LINE_TARGET_ID_` 前綴的環境變數。<br>
  LINE delivery uses only the Push API and requires at least one environment variable prefixed with `LINE_TARGET_ID_`.

這些控制只能降低風險，不能自動判定特定來源是否合法。

These controls reduce risk but cannot automatically determine whether using a particular source is lawful.

## 開始使用

### Getting started

需求：Node.js 20 以上。

Requirement: Node.js 20 or later.

```bash
npm ci
npm run check
```

複製 `.env.example` 為本機環境設定，但不要提交 `.env`：

Copy `.env.example` for local configuration, but do not commit `.env`:

```text
GEMINI_API_KEY=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_TARGET_ID_001=...
SOURCE_USER_AGENT=AI-News-Line-Bot/0.4 (+https://your-public-contact.example; personal digest)
```

## 新增來源

### Adding a source

編輯 `config/feeds.json`。Public 版本不提供真實來源範例，以下僅示範欄位格式，`example.com` 不代表可實際使用：

Edit `config/feeds.json`. The Public version does not provide a real source example. The following block demonstrates the field structure only; `example.com` does not imply that the source may actually be used:

```json
[
  {
    "id": "example-feed",
    "name": "Example Feed",
    "url": "https://example.com/feed.xml",
    "adapter": "rss",
    "sourceRole": "official",
    "organization": "example",
    "evidencePolicy": "primary",
    "datePolicy": "published-only",
    "enabled": false,
    "maxFetchItems": 10,
    "allowedHosts": ["example.com"]
  }
]
```

加入來源後至少完成以下檢查：

After adding a source, complete at least the following checks:

1. 確認來源提供穩定且可驗證的發布時間。<br>
   Confirm that the source provides stable and verifiable publication timestamps.
2. 閱讀 Terms of Service、授權、`robots.txt` 與 Rate Limit。<br>
   Review the Terms of Service, license, `robots.txt`, and rate limits.
3. 確認你的用途是否包含 AI 處理、摘要與 LINE 傳送。<br>
   Confirm whether your intended use permits AI processing, summarization, and LINE delivery.
4. 先保持 `enabled: false`，使用離線 fixture 撰寫解析測試。<br>
   Keep `enabled: false` initially and write parser tests with offline fixtures.
5. 在合理頻率下進行一次 smoke test，確認失敗時會停止而非繞過限制。<br>
   Run one smoke test at a reasonable frequency and confirm that failures stop processing instead of bypassing restrictions.
6. 記錄檢查日期、依據、必要 attribution 及重新檢查條件。<br>
   Record the review date, evidence, required attribution, and conditions that require another review.

## 個人化

### Personalization

- `config/profile.json`：修改顯示名稱、技術背景、目標及關注主題。<br>
  `config/profile.json`: Change the display name, technical background, goals, and topics of interest.
- `config/scoring.json`：修改第一階段詞彙、門檻與候選限制。<br>
  `config/scoring.json`: Change first-stage vocabulary, thresholds, and candidate limits.
- `SOURCE_USER_AGENT`：設定可識別且有聯絡方式的 User-Agent。<br>
  `SOURCE_USER_AGENT`: Configure an identifiable User-Agent with contact information.

請勿把公司內部資料、私人 Prompt、憑證或個人資料放進公開設定。

Do not place internal company data, private prompts, credentials, or personal data in public configuration.

## 執行模式

### Execution modes

| 指令 / Command | 用途 / Purpose | 呼叫 Gemini / Calls Gemini | 傳送 LINE / Sends LINE |
|---|---|---:|---:|
| `npm run check` | 編譯與離線測試<br>Build and offline tests | 否 / No | 否 / No |
| `npm run smoke:sources` | 檢查已啟用來源；空設定時不會發出來源請求<br>Check enabled sources; an empty configuration sends no source requests | 否 / No | 否 / No |
| `npm run preview:candidates` | 預覽本地候選<br>Preview local candidates | 否 / No | 否 / No |
| `npm run dry-run` | 執行 Gemini 決選但不傳 LINE<br>Run Gemini selection without LINE delivery | 是 / Yes | 否 / No |
| `npm start` | 執行完整流程<br>Run the complete pipeline | 是 / Yes | 是 / Yes |
| `npm run test-line` | 傳送固定測試訊息<br>Send a fixed test message | 否 / No | 是 / Yes |

## 部署注意事項

### Deployment notes

Public Repository 只包含 CI，不包含排程與 production Secrets 映射。若要自行建立 GitHub Actions 排程：

The Public Repository includes CI only. It does not include a schedule or production Secret mappings. If you create your own GitHub Actions schedule:

- Secrets 必須存放在 GitHub repository Secrets，不可寫入 YAML 或程式碼。<br>
  Store Secrets in GitHub repository Secrets; never write them into YAML or source code.
- 收件者 Secret 使用無身分含意的名稱，例如 `LINE_TARGET_ID_001`。<br>
  Use recipient Secret names that do not reveal identity, such as `LINE_TARGET_ID_001`.
- 不要把 delivery history 或完整訊息 commit 回 Public Repository。<br>
  Do not commit delivery history or complete messages to the Public Repository.
- 排程應保持低頻，避免對來源造成負擔。<br>
  Keep schedules infrequent to avoid burdening source systems.
- 部署前再次檢查已啟用來源的現行政策。<br>
  Recheck the current policies of every enabled source before deployment.

## 資料與隱私

### Data and privacy

執行時可能產生已傳送網址、診斷資料與 LINE 投遞紀錄。Public 版本已將 `data/*.json` 排除於 Git；使用者仍應設定適當的私人儲存、保存期限與存取控制。

Runtime execution may produce sent URLs, diagnostics, and LINE delivery records. The Public version excludes `data/*.json` from Git, but users must still configure appropriate private storage, retention periods, and access controls.

不要公開 LINE userId。即使是 hash 或 alias，也可能形成可長期關聯的識別資料。

Do not publish LINE user IDs. Even hashes or aliases can become long-term linkable identifiers.

## License 狀態

### License status

除非 repository 中另有正式 `LICENSE` 文件，Public 可見不代表授予複製、修改、散布或商業使用權。Repository 擁有者應在發布前自行選擇並審閱適合的 License；第三方來源內容不會因本專案的 License 而取得額外授權。

Unless the repository includes a formal `LICENSE` file, public visibility does not grant permission to copy, modify, distribute, or use the project commercially. The repository owner should independently select and review an appropriate License before release. Third-party source content does not gain additional permissions from this project's License.

## Repository 政策

### Repository policies

- 安全回報方式請參閱 [`SECURITY.md`](SECURITY.md)。<br>
  See [`SECURITY.md`](SECURITY.md) for private vulnerability reporting instructions.
- 開發設定、修改原則與 Public mirror 貢獻流程請參閱 [`CONTRIBUTING.md`](CONTRIBUTING.md)。<br>
  See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, change guidelines, and the Public mirror contribution flow.
- 本 repository 目前沒有 `LICENSE`；在 License 決策完成前，不應假設取得重用權。<br>
  This repository currently has no `LICENSE`; do not assume reuse rights until a license decision is completed.

## 已知限制

### Known limitations

- 沒有設定來源時不會產生新聞候選。<br>
  No news candidates are produced when no sources are configured.
- RSS、API 與網站結構可能變更。<br>
  RSS feeds, APIs, and website structures may change.
- Gemini 與本地規則可能漏判、誤判或產生不準確摘要。<br>
  Gemini and local rules may miss, misclassify, or inaccurately summarize content.
- 來源可存取不代表可合法重製或散布。<br>
  Source accessibility does not imply lawful reproduction or distribution.
- 本專案不會替使用者持續監控每個來源的政策變更。<br>
  This project does not continuously monitor source-policy changes on the user's behalf.
