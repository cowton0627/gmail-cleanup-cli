# 使用說明（詳細版）

`README.md` 是給第一次進來的人看的安裝跟概觀；這份是日常操作的詳細手冊。看完一次以後，平常只需要記得最後那句「**貼 01 → 改 CSV → 貼 02**」。

---

## 心智模型（一句話）

這不是「跑起來的程式」，是一份**操作手冊**。實際做事的是 **Claude Code 自己 + gws CLI**。資料夾的角色是給你兩份固定的 prompt 範本，貼進 Claude Code 之後它就照著做。

```
你 ─貼 prompt─▶ Claude Code ─執行 gws 指令─▶ Gmail API
                  ↑                              ↓
                  └────── 自己分類 ─────────── metadata
```

---

## 第一次：一次性設定（只做一次，之後忘掉）

依照 `README.md` 的「需求」「一次性設定」兩段做完：

1. 安裝 `node>=18`、`jq`、`gcloud SDK`、`gws`（`npm i -g @googleworkspace/cli`）
2. GCP Console 新增專案 → 啟用 Gmail API → OAuth consent screen 把自己加進 Test users → Credentials 建 Desktop OAuth client → 下載 JSON
3. `gcloud auth login --no-launch-browser` → `gcloud config set project ...` → `gws auth setup` → `gws auth login -s gmail`
4. 驗證指令見 [`README.md`](./README.md) 的「gws 認證」段。看不到 `messages` 陣列 → 99% 是 token 過期，重跑 `gws auth login -s gmail`。

> SSH 遠端用的話，OAuth callback 那關有眉角：README 第 86 行那段「把跳轉網址 curl 進 listen 中的 server」要照做。

---

## 日常使用：兩階段流程

### 階段 1 — Scan（讀，不會動 Gmail）

1. 打開 Claude Code（`claude` 指令）。
2. 把 `prompts/01-scan.md` **整段**貼上去。
3. 在 prompt 最後那個「**我的需求**」區塊寫一句具體要求，例如：

   > 處理 INBOX 最多 500 封，輸出到 `~/Desktop/inbox_review.csv`。

4. 送出。Claude Code 會：
   - 用 `gws ... messages list` 分頁抓 ID
   - 對每個 ID 抓 metadata（`From`/`Subject`/`Date`/`snippet`，**不抓本文**）
   - 自己判斷分類（`keep` / `review_needed` / `likely_archive` / `likely_trash`）
   - 寫成 CSV，欄位是 `date, from, subject, original_labels, classification, reason, suggested_action, message_id`
   - 印分類統計

這階段被 prompt 硬性禁止呼叫任何會改 Gmail 的 API（`trash` / `delete` / `modify`），所以放心，跑壞了也只是浪費時間。

### 階段 2 — Review（最重要，由你做）

打開產出的 CSV（用 LibreOffice、Excel、Numbers、`column -ts,` 都行），依 `classification` 欄排序，**只看 `likely_trash` 那一段**：

- 看到不該丟的，**直接把 `classification` 改成 `keep`**（或 `review_needed`），存檔。
- Apply 階段只看 `likely_trash`，所以你改成別的就等於救回來。

> 設計原則：寧可保留也不要誤刪。看到一封拿不準的，改成 `keep` 就好。

### 階段 3 — Apply（會動 Gmail，請審慎）

CSV 確定 OK 之後：

1. Claude Code 裡貼 `prompts/02-apply.md`。
2. 在最下面填 CSV 路徑 + 那句「我已審閱 CSV，請執行」。
3. Claude Code 會：
   - 先 `head -5 <CSV>` 給你看，確認解析對
   - 對每封 `likely_trash` 呼叫 `messages.trash`（**不是 delete**，是丟到垃圾桶）
   - 每 50 封回報進度
   - 失敗率 > 1% 或連 3 次 API fail → 自動停下

之後 Gmail 預設 30 天後才清空垃圾桶，這 30 天內你都能撈回來。

---

## 各檔案的角色

| 檔案 | 角色 | 你要不要編輯 |
|---|---|---|
| `README.md` | 給人看的安裝/使用說明 | 一般不用 |
| `USAGE.md` | 這份詳細操作手冊 | 一般不用 |
| `CLAUDE.md` | 給未來進來這個 repo 的 Claude Code 看的 onboarding + 硬規則 | 一般不用 |
| `prompts/01-scan.md` | 貼給 Claude Code 跑掃描 | **每次貼之前**在最下面填具體需求 |
| `prompts/02-apply.md` | 貼給 Claude Code 執行 trash | **每次貼之前**在最下面填 CSV 路徑 + 授權句 |
| `credentials.json` | GCP OAuth client 憑證 | 不 commit、不外流 |
| `.gitignore` | 擋掉 secret 跟 CSV | 不用動 |

---

## 安全機制（可以放心的理由）

1. **Scan 是 read-only**：prompt 明文禁止修改 API。
2. **Apply 只 trash 不 delete**：Gmail 30 天反悔期。
3. **白名單機制**：Apply 只動 `likely_trash`，不在 CSV 的信完全不碰。
4. **你是最後一道閘**：CSV 在你眼前，改 `classification` 就能救信。
5. **憑證隔離**：`credentials.json` / `token.json` / `*.csv` 都被 `.gitignore` 擋，不會被 commit 出去。
6. **gws 加密 keystore**：token 存在 `~/.config/gws/credentials.enc`，不在這個 repo 裡。

---

## 出狀況的快速排查

| 症狀 | 多半是 | 處理 |
|---|---|---|
| `gws ... messages list` 沒回 messages 陣列 | token 過期 | `gws auth login -s gmail` |
| Apply 階段失敗率高 | scope 不夠（只給了 readonly） | `gws auth setup` 重跑勾 `gmail.modify` |
| CSV 開出來亂碼 | Excel 認不得 UTF-8 | LibreOffice 開、或匯入時選 UTF-8 |
| 想復原誤丟的信 | 還沒過 30 天 | Gmail 網頁版 → 垃圾桶 → 還原 |

---

## 一句話摘要

> 設定完一次之後，**日常用法就是「貼 01 → 改 CSV → 貼 02」三步**，其他什麼都不用做。
