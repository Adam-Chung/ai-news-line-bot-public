# 貢獻指南

## Contributing Guide

## 目前的貢獻模式

### Current contribution model

這個 repository 是由 Private production repository 單向產生的安全 Public mirror。Issue、錯誤回報與改進建議都歡迎提出；Public repository 的修改不會自動同步回 Private repository，下一次安全同步也可能覆蓋直接修改。

This repository is a sanitized Public mirror generated one way from a Private production repository. Issues, bug reports, and improvement proposals are welcome. Changes made directly in the Public repository do not sync back automatically and may be overwritten by the next sanitized publication.

在準備較大修改前，請先建立 Issue 說明問題、預期行為、建議方案與影響範圍。Maintainer 會判斷是否適合移植到 Private source of truth，再由安全同步流程發布。

Before preparing a substantial change, open an Issue describing the problem, expected behavior, proposed approach, and affected scope. A maintainer will decide whether the change should be migrated to the Private source of truth and then published through the sanitized synchronization process.

安全弱點請遵循 [`SECURITY.md`](SECURITY.md)，不要建立公開 Issue。

For security vulnerabilities, follow [`SECURITY.md`](SECURITY.md) instead of opening a public Issue.

## 開發設定

### Development setup

需求：Node.js 20 以上。

Requirement: Node.js 20 or later.

```bash
npm ci
npm run check
```

不要在測試或範例中使用真實 Gemini key、LINE token、LINE userId、私人來源、內部 URL 或 production 資料。使用離線 fixture、`example.com` 與明確的假資料。

Do not use real Gemini keys, LINE tokens, LINE user IDs, private sources, internal URLs, or production data in tests or examples. Use offline fixtures, `example.com`, and clearly synthetic values.

## 修改原則

### Change guidelines

- 保持來源中立；不得因品牌或來源名稱直接增加內容分數。<br>
  Keep scoring source-neutral; do not award relevance points directly for a brand or source name.
- 新來源預設不得加入 Public 設定；使用者應自行新增並承擔授權與合規責任。<br>
  Do not add enabled sources to the Public configuration; users must add and review their own sources.
- 保留 24 小時發布時間驗證、Rate Limit、`Retry-After`、`robots.txt` 與 fail-closed 行為。<br>
  Preserve the 24-hour publication-time validation, rate limits, `Retry-After`, `robots.txt`, and fail-closed behavior.
- 行為變更必須新增或更新測試及相關 README。<br>
  Behavioral changes must include updated tests and relevant README documentation.
- 不要提交 `.env`、runtime `data/*.json`、build output、憑證或個人資料。<br>
  Do not commit `.env`, runtime `data/*.json`, build output, credentials, or personal data.

## Pull Request 檢查

### Pull Request checklist

提交 Pull Request 前，請確認：

Before opening a Pull Request, confirm that:

1. `npm run check` 已通過。<br>
   `npm run check` passes.
2. 測試不需要真實網路、Gemini 或 LINE 憑證。<br>
   Tests do not require real network access, Gemini credentials, or LINE credentials.
3. diff 不包含 Secret、個人資料、真實收件者或私人來源。<br>
   The diff contains no secrets, personal data, real recipients, or private sources.
4. commit message 使用清楚的英文，並保持每個 commit 範圍單一。<br>
   Commit messages are clear English and each commit has a focused scope.
5. README、`SECURITY.md` 或其他受影響文件已同步更新。<br>
   README, `SECURITY.md`, and other affected documentation are updated.

接受 Public Pull Request 不代表程式碼會直接合併；maintainer 可能改以等效修改移植到 Private source of truth，以維持單向安全發布與 history 隔離。

Acceptance of a Public Pull Request does not imply a direct merge. A maintainer may reimplement or migrate an equivalent change in the Private source of truth to preserve one-way sanitized publication and history isolation.

## 貢獻授權

### Contribution licensing

本專案採用自訂的非商業 source-available [`LICENSE`](LICENSE)。提交 Issue 或 Pull Request 不會自動授予 maintainer 任意改用其他 License 的權利。在任何程式碼被移植或採用前，maintainer 可能要求 contributor 明確確認其擁有提交內容的權利，並同意該內容依本專案 License 發布。

This project uses a custom non-commercial source-available [`LICENSE`](LICENSE). Opening an Issue or Pull Request does not automatically grant the maintainer unrestricted relicensing rights. Before code is migrated or accepted, the maintainer may require explicit confirmation that the contributor owns the submitted material and agrees to its distribution under the project License.
