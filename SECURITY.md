# 安全政策

## Security Policy

## 支援範圍

### Supported scope

本專案尚未發布穩定版本。目前只維護 `main` 分支的最新程式碼；舊 commit、使用者自行修改的來源設定及自行建立的部署流程不在支援範圍內。

This project has not published a stable release. Only the latest code on `main` is maintained. Older commits, user-supplied source configurations, and user-created deployment workflows are outside the supported scope.

## 私下回報弱點

### Reporting a vulnerability privately

請優先使用本 repository 的 GitHub Private Vulnerability Reporting：進入 **Security → Advisories → Report a vulnerability**。不要在公開 Issue、Discussion、Pull Request、commit 或 Actions log 中揭露可利用細節、憑證、LINE userId 或其他個人資料。

Please use this repository's GitHub Private Vulnerability Reporting whenever available: open **Security → Advisories → Report a vulnerability**. Do not disclose exploitable details, credentials, LINE user IDs, or other personal data in a public Issue, Discussion, Pull Request, commit, or Actions log.

回報時請提供受影響的 commit 或版本、重現步驟、預期與實際結果、影響評估，以及不含真實 Secret 或個人資料的最小證據。請勿測試不屬於你的 LINE 帳號、第三方來源或 production 環境。

Include the affected commit or version, reproduction steps, expected and actual behavior, impact assessment, and minimal evidence without real secrets or personal data. Do not test against LINE accounts, third-party sources, or production environments that you do not own or control.

如果 Private Vulnerability Reporting 暫時無法使用，請不要公開敏感內容；可先建立不含弱點細節的普通 Issue，請 repository owner 提供私人聯絡方式。

If Private Vulnerability Reporting is temporarily unavailable, do not publish sensitive details. Open a regular Issue without vulnerability details and ask the repository owner for a private contact channel.

## 憑證外洩

### Credential exposure

若懷疑 Gemini API key、LINE access token、LINE userId、Deploy Key 或其他 Secret 已外洩，請先在對應服務撤銷或輪替憑證，再清理 Git history、Actions log、artifact 或其他副本。單純刪除目前檔案不足以使已外洩的憑證失效。

If a Gemini API key, LINE access token, LINE user ID, Deploy Key, or another secret may have been exposed, revoke or rotate it at the issuing service first. Then remove it from Git history, Actions logs, artifacts, and other copies. Deleting only the current file does not invalidate an exposed credential.

## 安全界線

### Security boundaries

本 Public Repository 不包含預設新聞來源、production 排程、Secrets 或 delivery history。使用者自行加入來源或部署後，必須自行負責來源授權、Rate Limit、資料保存、存取控制與第三方服務設定。

This Public Repository does not include default news sources, production schedules, secrets, or delivery history. Users who add sources or deploy the project are responsible for source authorization, rate limits, data retention, access control, and third-party service configuration.
