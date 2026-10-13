# AI News LINE Bot

一個可自行設定來源與個人偏好的 AI 新聞篩選範例專案。系統可讀取使用者自行加入的 RSS、Atom、sitemap 或支援的 API，先以本地規則篩選，再交由 Gemini 產生繁體中文摘要，最後以 LINE Push API 傳送給指定收件者。

> 本 Public Repository **不內建任何新聞來源**。`config/feeds.json` 預設為空陣列，不會主動存取任何第三方網站。使用者加入、啟用及運行來源前，必須自行完成授權與合規確認並承擔相應責任。

## 為什麼不提供預設來源

網站政策、feed 授權、API 條款與 `robots.txt` 會變動，而且個人研究、多人散布與商業用途可能適用不同限制。公開可讀的 RSS 或網頁不代表允許自動抓取、交給 AI 處理、重製摘要或再次散布。

因此本專案只提供通用程式架構，不替使用者選擇或背書任何資料來源。

## 系統流程

```text
使用者自行設定的來源
        ↓
發布時間與網址驗證
        ↓
本地內容評分、去重與候選限制
        ↓
Gemini 相關性判斷與摘要
        ↓
LINE Push API
```

## 使用原則與使用者責任

新增任何來源前，使用者必須自行確認並持續遵守：

- 目標網站或 API 最新的 Terms of Service、使用政策與 feed/API 授權。
- `robots.txt`、Rate Limit、`Retry-After` 及其他自動存取限制。
- 著作權、資料庫權、隱私、個人資料、商標及所在地適用法令。
- 是否允許把來源內容傳送給 Gemini 或其他第三方服務處理。
- 摘要、引用、保存、多人傳送、公開展示及商業使用的限制。

禁止繞過登入、付費牆、CAPTCHA、IP 封鎖、存取權限或其他技術限制。來源條款不清楚、禁止自動存取或無法確認時，應保持 `enabled: false`，或不要加入該來源。

本專案僅供學習、研究與合法用途，不構成法律意見。免責聲明不能取代使用者取得必要授權或遵守法令的義務。

## 安全預設

- `config/feeds.json` 預設為 `[]`。
- Public 版本不包含 production 排程 workflow。
- Public 版本不包含 Gemini／LINE Secrets、LINE userId、收件者 alias 或 hash。
- Public 版本不包含 delivery history、run diagnostics 或 sent-items。
- 同一 origin 預設至少間隔一秒，並處理 `Retry-After`。
- LINE 只使用 Push API；至少需要一個 `LINE_TARGET_ID_` 前綴的環境變數。

這些控制只能降低風險，不能自動判定特定來源是否合法。

## 開始使用

需求：Node.js 20 以上。

```bash
npm ci
npm run check
```

複製 `.env.example` 為本機環境設定，但不要提交 `.env`：

```text
GEMINI_API_KEY=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_TARGET_ID_001=...
SOURCE_USER_AGENT=AI-News-Line-Bot/0.4 (+https://your-public-contact.example; personal digest)
```

## 新增來源

編輯 `config/feeds.json`。Public 版本不提供真實來源範例，以下僅示範欄位格式，`example.com` 不代表可實際使用：

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

1. 確認來源提供穩定且可驗證的發布時間。
2. 閱讀 Terms of Service、授權、`robots.txt` 與 Rate Limit。
3. 確認你的用途是否包含 AI 處理、摘要與 LINE 傳送。
4. 先保持 `enabled: false`，使用離線 fixture 撰寫解析測試。
5. 在合理頻率下進行一次 smoke test，確認失敗時會停止而非繞過限制。
6. 記錄檢查日期、依據、必要 attribution 及重新檢查條件。

## 個人化

- `config/profile.json`：修改顯示名稱、技術背景、目標及關注主題。
- `config/scoring.json`：修改第一階段詞彙、門檻與候選限制。
- `SOURCE_USER_AGENT`：設定可識別且有聯絡方式的 User-Agent。

請勿把公司內部資料、私人 Prompt、憑證或個人資料放進公開設定。

## 執行模式

| 指令 | 用途 | 呼叫 Gemini | 傳送 LINE |
|---|---|---:|---:|
| `npm run check` | 編譯與離線測試 | 否 | 否 |
| `npm run smoke:sources` | 檢查已啟用來源；空設定時不會發出來源請求 | 否 | 否 |
| `npm run preview:candidates` | 預覽本地候選 | 否 | 否 |
| `npm run dry-run` | 執行 Gemini 決選但不傳 LINE | 是 | 否 |
| `npm start` | 執行完整流程 | 是 | 是 |
| `npm run test-line` | 傳送固定測試訊息 | 否 | 是 |

## 部署注意事項

Public Repository 只包含 CI，不包含排程與 production Secrets 映射。若要自行建立 GitHub Actions 排程：

- Secrets 必須存放在 GitHub repository Secrets，不可寫入 YAML 或程式碼。
- 收件者 Secret 使用無身分含意的名稱，例如 `LINE_TARGET_ID_001`。
- 不要把 delivery history 或完整訊息 commit 回 Public Repository。
- 排程應保持低頻，避免對來源造成負擔。
- 部署前再次檢查已啟用來源的現行政策。

## 資料與隱私

執行時可能產生已傳送網址、診斷資料與 LINE 投遞紀錄。Public 版本已將 `data/*.json` 排除於 Git；使用者仍應設定適當的私人儲存、保存期限與存取控制。

不要公開 LINE userId。即使是 hash 或 alias，也可能形成可長期關聯的識別資料。

## License 狀態

除非 repository 中另有正式 `LICENSE` 文件，Public 可見不代表授予複製、修改、散布或商業使用權。Repository 擁有者應在發布前自行選擇並審閱適合的 License；第三方來源內容不會因本專案的 License 而取得額外授權。

## 已知限制

- 沒有設定來源時不會產生新聞候選。
- RSS、API 與網站結構可能變更。
- Gemini 與本地規則可能漏判、誤判或產生不準確摘要。
- 來源可存取不代表可合法重製或散布。
- 本專案不會替使用者持續監控每個來源的政策變更。
