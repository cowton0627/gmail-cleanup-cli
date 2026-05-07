# Apply CSV decisions to Gmail

我已經審閱過 CSV（路徑會在最下面）。請對 `classification == 'likely_trash'` 的信件採取行動。

## 操作

對 CSV 中**每筆 `likely_trash`** 的列：

### 1. 加標籤 `cleanup-trash-candidate`

如果這個 label 還不存在，先建立：

```bash
gws gmail users labels create --params '{"userId":"me","requestBody":{"name":"cleanup-trash-candidate","labelListVisibility":"labelShow","messageListVisibility":"show"}}'
```

對每封信加 label：

```bash
gws gmail users messages modify --params '{"userId":"me","id":"<message_id>","requestBody":{"addLabelIds":["<labelId>"]}}'
```

### 2. 移到垃圾桶

```bash
gws gmail users messages trash --params '{"userId":"me","id":"<message_id>"}'
```

> **不可使用 `messages.delete`**（永久刪除）。Gmail 的 trash 30 天後會自動清空，給後悔機會。

## 進度報告

- 每處理 50 封，回報一次進度（已處理 / 總數 / 失敗數）
- 若**任何一個 batch 內失敗率 > 1%**，立即停止，把錯誤訊息給我看
- 若連續 3 次 API 失敗，立即停止
- 全部處理完印總結：成功 N、失敗 M（列出失敗的 message_id 與原因）

## 限制（嚴守）

- **只**處理 CSV 中 `classification == 'likely_trash'` 的列
- **不要碰** keep / review_needed / likely_archive 的信件
- **不要碰** 不在 CSV 裡的信件
- **不可呼叫** `messages.delete`（永久刪除）
- 處理前先 `head -5 <CSV>` 給我看，讓我確認你解析對了

---

**CSV 路徑**：
（在這裡寫你的 CSV 路徑，例如 `~/Desktop/inbox_review.csv`）

**確認**：
（寫一句「我已審閱 CSV，請執行」表示授權）
