# 貢獻與回報政策

## Contribution and feedback policy

## Private／Public 關係

### Private/Public relationship

本 repository 是由 Private source of truth 單向產生的 source-available public version。Public repository 不是獨立開發來源，且任何內容都不會自動同步回 Private repository。直接修改 Public repository 的同步範圍，可能在下一次安全發布時被覆蓋。

This repository is a source-available public version generated one way from a Private source of truth. The Public repository is not an independent development source, and nothing is synchronized back into Private automatically. Direct changes within the generated Public scope may be overwritten by the next sanitized publication.

## 接受 Public Issues

### Public Issues are accepted

歡迎透過 Public Issues 回報錯誤、提出功能建議、指出文件問題或說明可重現的使用情境。建立 Issue 時，請提供受影響的 commit 或版本、重現步驟、預期與實際結果、影響範圍，以及不含真實 Secret、個人資料或未授權第三方內容的最小證據。

Public Issues are accepted for bug reports, feature suggestions, documentation corrections, and reproducible use cases. Include the affected commit or version, reproduction steps, expected and actual behavior, impact, and minimal evidence without real secrets, personal data, or unauthorized third-party content.

安全弱點必須依照 [`SECURITY.md`](SECURITY.md) 私下回報，不要建立含有弱點細節的 Public Issue。

Report security vulnerabilities privately according to [`SECURITY.md`](SECURITY.md). Do not open a Public Issue containing vulnerability details.

## 不直接接受 Public Pull Requests

### Public Pull Requests are not accepted

Public Pull Requests are not accepted as an upstream contribution path and may be closed without code review. 如果某項 Issue 建議被接受，repository owner 會在 Private repository 中自行評估並重新實作，再經 allowlist、verifier、tests 與單向發布流程重新產生 Public 版本。

Public Pull Requests are not accepted as an upstream contribution path and may be closed without code review. When an Issue proposal is accepted, the repository owner independently evaluates and implements it in the Private repository, then regenerates the Public version through the allowlist, verifier, tests, and one-way publication workflow.

此流程避免未受信任的 Public code、Git history、fixtures、Secrets 或 production assumptions 自動進入 Private production source。不得建立 Public → Private 的自動 pull、merge、cherry-pick 或 workflow dispatch。

This process prevents untrusted Public code, Git history, fixtures, secrets, or production assumptions from entering the Private production source automatically. Do not create automated Public-to-Private pull, merge, cherry-pick, or workflow-dispatch paths.

## Fork 與自用權利

### Fork and self-hosting rights

不直接接受 Pull Request 不會取消 [`LICENSE`](LICENSE) 授予的權利。你仍可依 License 為個人、學習、研究及其他非商業目的 Fork、修改、自架及符合條件地再散布原始碼；但你的 Fork 不會成為本專案的 upstream contribution source。

The no-Pull-Request policy does not remove rights granted by [`LICENSE`](LICENSE). You may still fork, modify, self-host, and conditionally redistribute source code for personal, educational, research, and other non-commercial purposes under the License, but your fork does not become an upstream contribution source for this project.

## 本機重現

### Local reproduction

需求：Node.js 20 以上。

Requirement: Node.js 20 or later.

```bash
npm ci
npm run check
```

不要在 Issue、測試或範例中使用真實 Gemini key、LINE token、LINE userId、私人來源、production URL 或 runtime data。請使用離線 fixture、`example.com` 與明確的假資料。

Do not use real Gemini keys, LINE tokens, LINE user IDs, private sources, production URLs, or runtime data in Issues, tests, or examples. Use offline fixtures, `example.com`, and clearly synthetic values.

自行維護 Fork 時，請保留 24 小時發布時間驗證、來源中立評分、Rate Limit、`Retry-After`、`robots.txt`、空白預設來源與 fail-closed 行為。

When maintaining your own fork, preserve the 24-hour publication-time validation, source-neutral scoring, rate limits, `Retry-After`, `robots.txt`, empty default source configuration, and fail-closed behavior.
