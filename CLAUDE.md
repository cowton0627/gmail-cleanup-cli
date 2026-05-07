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

## 分類四類（寧可保留也不要誤刪）

- `keep` — 真人寫的個人／工作信
- `review_needed` — 收據／發票／訂單／付款／登入／2FA／銀行／政府／學校／醫療／保險／法律／合約，**或不確定的一律放這**
- `likely_archive` — 電子報、舊出貨通知等不急但值得保留
- `likely_trash` — 純廣告、促銷、過期優惠、大量發送無關信

## 不要碰的東西

- `credentials.json` — GCP OAuth client credentials，已 gitignored
- `token.json`、`*.csv`（除 `example.csv`）— 同上
- `~/.config/gws/credentials.enc` — gws 的加密憑證 store
- `.env*` — gitignored

## 驗證 gws 還活著

```bash
gws gmail users messages list --params '{"userId":"me","labelIds":["INBOX"],"maxResults":3}'
```

看到 JSON 裡有 `messages` 陣列就 OK。沒有的話通常是 token 過期，使用者要重跑 `gws auth login -s gmail`。

## 專案結構

```
.
├── CLAUDE.md           # 這份
├── README.md           # 給人類看的安裝與使用說明
├── prompts/
│   ├── 01-scan.md      # 貼給 Claude Code 跑掃描（read-only）
│   └── 02-apply.md     # 確認 CSV 後貼這個（會改 Gmail）
├── credentials.json    # gitignored
└── .gitignore
```
