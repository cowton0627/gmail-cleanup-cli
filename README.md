# gmail-cleanup-cli

AI 輔助的 Gmail 收件匣整理工具。掃描你的 INBOX，把每封信丟給 Claude 分類成 `keep` / `review_needed` / `likely_archive` / `likely_trash`，輸出 CSV 報表，讓你決定要怎麼處置。

**目前版本只讀取信件，不會修改、封存或刪除任何郵件。**

## 功能

- 直接呼叫 Gmail API（不依賴 `gws`）抓取 INBOX 信件 metadata
- 用 Claude API 分類，套用「收據／發票／登入／銀行 → review_needed」等保守規則
- 內建 prompt caching 與批次處理，降低 API 成本
- 輸出可在 Excel／Google Sheets 直接打開的 CSV

## 需求

- Node.js 18 以上
- Google 帳號（要整理的 Gmail）
- GCP 專案 + Gmail API OAuth credentials
- Anthropic API key

## 安裝

```bash
npm install
```

## 設定

### 1. Anthropic API key

複製 `.env.example` 為 `.env`，填入你的 API key：

```bash
cp .env.example .env
# 編輯 .env，把 ANTHROPIC_API_KEY=sk-ant-... 換成你自己的 key
```

> 如果還沒有 key，到 https://console.anthropic.com/ 申請。

### 2. GCP 專案 + Gmail OAuth

下面這些步驟跟著文章作者做過的設定一致，但 OAuth client 類型要選「**桌面應用程式 (Desktop app)**」：

1. 開啟 https://console.cloud.google.com/ 並登入要整理的 Gmail 帳號
2. **建立專案**（或選用既有專案），名稱隨意
3. 進入「**APIs & Services → Library**」，搜尋 **Gmail API**，點 **Enable**
4. 進入「**APIs & Services → OAuth consent screen**」：
   - User type 選 **External**
   - 填 App name（例如 `gmail-cleanup`）、support email、developer email
   - **Scopes** 這頁可以先跳過（直接 Save and Continue）
   - **Test users** 加入你自己的 Gmail 帳號（重要！否則會被擋下）
5. 進入「**APIs & Services → Credentials**」：
   - 點 **Create Credentials → OAuth client ID**
   - Application type 選 **Desktop app**
   - 名稱隨意，建立後點下載按鈕拿到 JSON
6. 把下載的 JSON **重新命名為 `credentials.json`**，放在這個專案的根目錄

### 3. 執行 OAuth 授權

```bash
node src/index.js auth
```

這個指令會：
1. 啟動本機 server 在 `http://127.0.0.1:<隨機 port>/oauth2callback`
2. 在 terminal 印出一個 Google 授權網址
3. 你打開網址、用要整理的 Gmail 帳號授權
4. 瀏覽器自動跳回 localhost，把授權碼交給本機 server
5. Token 存到 `~/.config/gmail-cleanup/token.json`，下次不用再授權

> **WSL 使用者**：把 terminal 印出的網址複製到 Windows 瀏覽器即可。WSL2 的 localhost 跟 Windows 是相通的，授權後可以正常 callback。

## 使用方式

```bash
# 預設掃描 500 封 INBOX 信件
node src/index.js scan

# 掃描更多 + 自訂輸出位置
node src/index.js scan --max 2000 --output ~/Desktop/inbox_review.csv

# 加入 Gmail 搜尋條件（只看 90 天前的）
node src/index.js scan --query "older_than:90d" --max 1000
```

如果有執行 `npm link`，可直接 `gmail-cleanup scan ...`。

## 輸出格式

CSV 欄位：

| 欄位 | 說明 |
| --- | --- |
| `date` | 信件 Date header |
| `from` | 寄件者 |
| `subject` | 主旨 |
| `original_labels` | Gmail 原本的 label（用 `\|` 分隔） |
| `classification` | `keep` / `review_needed` / `likely_archive` / `likely_trash` |
| `reason` | Claude 給的中文理由 |
| `suggested_action` | 對應的建議動作 |
| `message_id` | Gmail 內部 message id（之後做 modify/trash 時會用到） |

## 分類規則（系統 prompt）

- **keep** — 明顯重要的個人或工作信件
- **review_needed** — 收據／發票／訂單／付款／登入／2FA／銀行／政府／學校／醫療／保險，**或不確定的一律放這裡**
- **likely_archive** — 不急但值得保留（電子報、舊出貨通知等）
- **likely_trash** — 純廣告、促銷、過期優惠、大量發送無關信

設計原則：寧可保留也不要誤刪。

## 成本

預設使用 `claude-haiku-4-5-20251001`（最便宜的選擇）。可在 `.env` 設定 `CLAUDE_MODEL` 換成 Sonnet/Opus。

每批 25 封信一次 API 呼叫，加上 prompt caching，1000 封信大致 < $0.05 USD（Haiku 4.5）。

## 未來規劃

- [ ] `apply` 子指令：根據 CSV 自動加標籤、封存、移到垃圾桶
- [ ] dry-run 模式
- [ ] 限制只處理 N 天前的信
- [ ] 支援多個 Gmail 帳號

## 安全性

- `credentials.json` 與 `~/.config/gmail-cleanup/token.json` 已加入 `.gitignore`，**請勿 commit**
- Token 檔權限設為 0600
- 目前只請求 `gmail.readonly` scope，無法修改任何信件

## 授權

ISC
