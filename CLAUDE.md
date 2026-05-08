# CLAUDE.md

給未來進到這個 repo 的 Claude Code 用的快速 onboarding。

## 這個 repo 是什麼

**不是傳統 CLI 工具**，而是一份 runbook：環境需求 + 一次性設定 + 兩份可貼上的 prompt 範本（`prompts/01-scan.md`、`prompts/02-apply.md`）。

執行模型：

```
使用者 ──prompt──▶ Claude Code ──呼叫──▶ gws ──呼叫──▶ Gmail API
                       │
                       └─── 由 Claude Code 自己分類（不需要另外的 LLM API key）
```

- `gws`（Google Workspace CLI）負責跟 Gmail API 講話
- Claude Code（你自己）負責分類與決策
- 使用者負責看 CSV、最終決定

## 歷史脈絡：曾經有過 src/，現在沒有了

- `9d61603`（Initial commit）— 原本是用 Anthropic SDK 寫的 Node.js CLI（`src/auth.js`、`classify.js`、`csv.js`、`gmail.js`、`index.js`）
- `b074ba4`（Pivot）— 把整個 `src/` + `package.json` 砍掉，改成 prompt runbook

理由：原本的 CLI 重複了使用者已經付費的 Claude Code 能力，多一個 Anthropic API key + 獨立 binary 沒有意義。

**舊腳本沒有遺失**，留在 git 歷史裡。需要參考某個檔案：

```bash
git show 9d61603:src/classify.js
```

不要主動把 `src/` 還原回工作目錄 — 那是已經被否決的架構。

## 硬規則（Apply 階段絕對不能違反）

來自 `prompts/02-apply.md`，使用者貼這份 prompt 觸發修改 Gmail 時：

1. **只**處理 CSV 中 `classification == 'likely_trash'` 的列
2. **不要碰** `keep` / `review_needed` / `likely_archive` 的信件
3. **不要碰** 不在 CSV 裡的信件
4. **不可呼叫** `messages.delete`（永久刪除）— 一律用 `messages.trash`，給 Gmail 30 天反悔期
5. 處理前先 `head -5 <CSV>` 給使用者確認解析正確
6. 每 50 封回報進度；單 batch 失敗率 > 1% 或連續 3 次 API 失敗 → 立即停止

Scan 階段（`prompts/01-scan.md`）是 read-only：不可呼叫 `trash` / `delete` / `modify` 或任何會修改 Gmail 狀態的 API。

## 分類四類

`keep` / `review_needed` / `likely_archive` / `likely_trash`。權威定義與判斷規則在 `prompts/01-scan.md`，不要在這裡複製一份（避免漂移）。設計原則：**寧可保留也不要誤刪**。

## 不要碰的東西

- `credentials.json` — GCP OAuth client credentials，已 gitignored
- `token.json`、`*.csv`（除 `example.csv`）— 同上
- `~/.config/gws/credentials.enc` — gws 的加密憑證 store
- `.env*` — gitignored

## 驗證 gws / 專案結構

兩者都在 `README.md` 維護，這裡不複製。驗證指令見 README「gws 認證」段；專案結構見 README 末尾。
