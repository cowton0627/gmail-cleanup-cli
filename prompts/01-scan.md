# Scan & classify Gmail INBOX

請整理我的 Gmail 收件匣。**只處理 INBOX**，不要動其他 label 的信件。

## 步驟

### 1. 列出 INBOX 信件 ID

用 gws，分頁抓到我指定的封數上限（預設 500，最多 5000）：

```bash
gws gmail users messages list --params '{"userId":"me","labelIds":["INBOX"],"maxResults":500}'
```

如果回傳 `nextPageToken`，加上 `pageToken` 繼續抓，直到湊滿上限或沒有 nextPageToken 為止。

### 2. 抓每封 metadata

對每個 ID 跑：

```bash
gws gmail users messages get --params '{"userId":"me","id":"<ID>","format":"metadata","metadataHeaders":["From","Subject","Date"]}'
```

收集 `id`、`labelIds`、`snippet`、`payload.headers` 中的 From / Subject / Date。**不要抓信件本文**（不需要、會吃 quota）。

> 量大時用 jq 把每筆 stream 進一個 jsonl，最後 `jq -s .` 合併。

### 3. 你（Claude Code）對每封信分類

四個類別：

- **keep** — 明顯重要的個人或工作信件（真實的人寫給我、有上下文的對話）
- **review_needed** — 收據／發票／訂單／付款／登入／2FA／銀行／政府／學校／醫療／保險／法律／合約，**或你不確定的**
- **likely_archive** — 不急但值得保留（電子報、舊出貨通知、社群通知）
- **likely_trash** — 純廣告、促銷、過期優惠、大量發送無關信

### 嚴格規則

1. **不確定就 review_needed**。寧可保留也不要誤刪。
2. 收據／發票／訂單／付款／登入／安全／驗證／銀行／政府／學校／醫療／保險／法律 一律 review_needed。
3. 個人來信（真人寫的、非系統發的）一律 keep。
4. 純行銷／促銷且無交易內容 → likely_trash。
5. 老電子報或定期通知 → likely_archive。

### 4. 輸出 CSV

寫到我指定的路徑（例如 `~/Desktop/inbox_review.csv`）。欄位順序：

```
date, from, subject, original_labels, classification, reason, suggested_action, message_id
```

- `original_labels`：用 `|` 分隔的 labelIds
- `reason`：你分類的中文簡短理由（例如「促銷信」、「銀行扣款通知」、「個人來信」）
- `suggested_action`：對應該分類的中文建議動作

最後印一個簡短摘要：總共 N 封、各分類各幾封。

## 限制（嚴守）

- **不要**呼叫 `messages.trash` / `messages.delete` / `messages.modify`
- **不要**呼叫任何會修改 Gmail 狀態的 API
- 如果 gws 失敗連續 > 3 次，停下來告訴我
- 如果 quota 接近上限，停下來告訴我

---

**我的需求**：
（在這裡寫你的具體要求，例如「處理 INBOX 最多 500 封，輸出到 ~/Desktop/inbox_review.csv」）
