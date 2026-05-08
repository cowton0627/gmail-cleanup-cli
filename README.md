# gmail-cleanup-cli

用 **gws + Claude Code** 整理 Gmail 收件匣的 runbook。

這不是傳統 CLI 工具，而是一份「環境需求 + 一次性設定 + 可貼上的 prompt 範本」。打開 Claude Code，把 `prompts/01-scan.md` 整段貼進去，它會用 gws 抓信、分類、產出 CSV；審閱後再貼 `prompts/02-apply.md`，就會把該丟的丟到垃圾桶。

> **TL;DR**：第一次設定完後，日常就是「貼 `01-scan.md` → 改 CSV → 貼 `02-apply.md`」三步。

## 為什麼是這個架構

```
你 ──prompt──▶ Claude Code ──呼叫──▶ gws ──呼叫──▶ Gmail API
                  │
                  └─── 直接用自己的能力分類（不需要另外的 LLM API key）
```

- **gws** 負責跟 Gmail API 講話（OAuth、分頁、metadata 抓取）
- **Claude Code**（你訂閱的這個 CLI）負責決策（分類、判斷風險）
- **你** 負責看 CSV、最終決定

不需要 Anthropic API key — 你已經為 Claude Code 付費了，分類就是請它做事而已。

## 需求

| 工具 | 用途 |
|---|---|
| Node.js >= 18 | 跑 gws |
| python3 | CSV 輸出（內建在大部分系統） |
| jq | 處理 JSON |
| gcloud SDK | gws 的依賴 |
| gws (Google Workspace CLI) | 跟 Gmail API 講話 |
| Claude Code | 你已經有 |

## 一次性設定

### 1. 安裝依賴（WSL2 / Ubuntu）

```bash
# jq
sudo apt-get install -y jq

# gcloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# gws
npm install -g @googleworkspace/cli
```

驗證：`gcloud --version`、`gws --version`、`jq --version` 都應印出版本號。

### 2. GCP 專案 + Gmail OAuth

到 https://console.cloud.google.com/ 用要整理的 Gmail 帳號登入：

1. **新增專案**（名稱隨意）
2. **APIs & Services → Library**：搜尋 Gmail API → Enable
3. **OAuth consent screen**：
   - User Type 選 External
   - 填 App name / support email
   - **Test users 加入你自己的 Gmail**（必要！）
4. **Credentials → Create Credentials → OAuth client ID**：
   - Type 選 **Desktop app**
   - 建立後下載 JSON

下載的 JSON 不一定要放專案根目錄 — `gws auth setup` 會自己處理。

### 3. gws 認證

```bash
# 登入 gcloud（遠端 SSH 用 --no-launch-browser）
gcloud auth login --no-launch-browser
gcloud config set project <你的-project-id>

# 設定 gws：選 Gmail API；scan 階段需要 gmail.readonly，apply 階段需要 gmail.modify（可一次都勾起來）
gws auth setup

# 使用者授權
gws auth login -s gmail
```

驗證：
```bash
gws gmail users messages list --params '{"userId":"me","labelIds":["INBOX"],"maxResults":3}'
```
看到 JSON 裡有 messages 陣列就 OK。

> **遠端 SSH 注意**：`gws auth login` 會啟動 localhost server 等 callback。你的瀏覽器在本機開不到遠端 localhost，解法是把瀏覽器跳轉的網址（含 `?code=...`）整段貼回 terminal，用 `curl '貼上的 URL'` 從遠端送進 listen 中的 server。

## 使用方式

### 掃描階段（read-only，安全）

打開 Claude Code，把 `prompts/01-scan.md` 整段貼上，最後加一句你的需求，例如：

```
（貼 01-scan.md 內容）

請處理我的 INBOX 最多 500 封，輸出到 ~/Desktop/inbox_review.csv。
```

Claude Code 會：
1. 用 gws 抓 ID 清單（分頁）
2. 對每個 ID 抓 metadata
3. 自己分類（keep / review_needed / likely_archive / likely_trash）
4. 寫成 CSV

打開 CSV，照 `classification` 欄排序，看分類是否合理。覺得有誤，可以手動把 `classification` 欄改成 `keep` 或 `review_needed`，就不會在 apply 階段被處理。

### Apply 階段（會修改 Gmail，謹慎）

確認 CSV 沒問題後，貼 `prompts/02-apply.md`：

```
（貼 02-apply.md 內容）

CSV 在 ~/Desktop/inbox_review.csv。
```

Claude Code 會：
1. 對每封 `likely_trash` 的信呼叫 `gws gmail users messages trash` 移到垃圾桶（**不是永久刪除**）
2. Gmail 預設 30 天後自動清空垃圾桶 — 給你後悔的機會

## 出狀況的快速排查

| 症狀 | 多半是 | 處理 |
|---|---|---|
| `gws ... messages list` 沒回 `messages` 陣列 | token 過期 | `gws auth login -s gmail` |
| Apply 階段失敗率高 | scope 不夠（只給了 readonly） | `gws auth setup` 重跑、勾 `gmail.modify` |
| CSV 開出來亂碼 | Excel 認不得 UTF-8 | 用 LibreOffice 開、或匯入時手動選 UTF-8 |
| 想復原誤丟的信 | 還沒過 30 天 | Gmail 網頁版 → 垃圾桶 → 還原 |

## 分類規則

四個類別：`keep` / `review_needed` / `likely_archive` / `likely_trash`，定義跟詳細判斷規則只在 [`prompts/01-scan.md`](./prompts/01-scan.md) 維護一份。

設計原則：寧可保留也不要誤刪。

## 安全

- `gws` 預設用加密憑證（keyring backend），存在 `~/.config/gws/credentials.enc`
- 本專案不存任何 secret；`.gitignore` 排除 `credentials.json`、`token.json`、`*.csv`
- Apply 階段只 trash 不 delete，留 30 天後悔期

## 各檔案的角色

| 檔案 | 角色 | 你要不要編輯 |
|---|---|---|
| `README.md` | 給人看的安裝 + 使用說明（這份） | 一般不用 |
| `CLAUDE.md` | 給未來進來這個 repo 的 Claude Code 看的 onboarding + 硬規則 | 一般不用 |
| `prompts/01-scan.md` | 貼給 Claude Code 跑掃描（read-only） | **每次貼之前**在最下面填具體需求 |
| `prompts/02-apply.md` | 貼給 Claude Code 執行 trash（會改 Gmail） | **每次貼之前**在最下面填 CSV 路徑 + 授權句 |
| `credentials.json` | GCP OAuth client 憑證 | 不 commit、不外流（已 gitignored） |
| `.gitignore` | 擋掉 secret 跟 CSV | 不用動 |

## License

ISC
