# Cải thiện tiếp theo cho pipeline parse chứng từ

Pipeline hiện tại: `LlamaParse (balanced) → Gemini 3 Flash structured → fallback Gemini 2.5 Pro vision`. Đã chạy được, nhưng còn các điểm yếu sau cần xử lý.

## 1. Sao kê dài: chunk theo trang + ghép

**Vấn đề:** Sao kê 30–100 trang đưa toàn bộ markdown vào 1 lần gọi Flash → dễ vượt context, model bỏ dòng cuối, khó debug khi sai.

**Đề xuất:**
- LlamaParse trả markdown theo từng trang (`result/json` thay vì `result/markdown`) → giữ ranh giới trang.
- Với `bank_statement`: chia thành batch ~5–10 trang, gọi Flash song song với schema chỉ chứa `transactions[]`, sau đó merge + lấy `opening/closing_balance` từ trang đầu/cuối.
- Validate: tổng debit/credit khớp chênh lệch `closing - opening` (sai số < 1 đồng) — nếu lệch, retry trang nghi ngờ.

## 2. PDF digital: bỏ qua LlamaParse khi có text layer

**Vấn đề:** PDF xuất từ phần mềm (hoá đơn điện tử, sao kê internet banking) đã có text layer sẵn → trả tiền LlamaParse là phí.

**Đề xuất:**
- Thêm bước `unpdf` (pure-JS, chạy được trên Worker) trích text layer trước.
- Nếu text dày + có dạng bảng (heuristic: nhiều dòng có ≥3 cụm số) → đưa thẳng vào Flash, bỏ qua LlamaParse.
- Nếu text rỗng/quá ít (scan) → mới gọi LlamaParse.
- Tiết kiệm ~60–80% chi phí parser cho doanh nghiệp dùng e-invoice.

## 3. Cache theo hash file

**Vấn đề:** User upload lại cùng 1 file (retry, đổi `kind`) → parse lại từ đầu, tốn tiền + chậm.

**Đề xuất:**
- Hash SHA-256 của `fileBase64`, lưu cache `(hash, kind) → parsed JSON` vào bảng `ai_parse_cache` (TTL 30 ngày).
- Trước khi gọi LlamaParse: check cache. Hit → trả luôn.

## 4. Schema chặt cho `cash_voucher` + `auto`

**Vấn đề:** Hai kind này đang free-form JSON + regex `extractJSON`, dễ lỗi parse.

**Đề xuất:**
- Thêm `CashVoucherSchema` (zod): `voucher_type`, `voucher_no`, `date`, `party_name`, `amount`, `currency`, `reason`, `account_debit?`, `account_credit?`.
- Với `auto`: chạy bước phân loại trước (Flash + `Output.object({ kind: enum })`), rồi dispatch sang schema tương ứng — 2 lượt gọi nhưng cùng dùng Flash nên vẫn rẻ.

## 5. Quan sát + đo lường

**Vấn đề:** Không biết LlamaParse đang fail bao nhiêu %, latency thật, chi phí mỗi file.

**Đề xuất:**
- Cột mới trong `ai_uploads`: `parser_used`, `parser_ms`, `structurer_ms`, `parser_cost_estimate`, `pages`.
- Tab nhỏ trong `/settings` → Admin → "AI parse stats": 7 ngày gần nhất, hit-rate cache, fallback-rate vision, top file lỗi.

## 6. Retry + timeout chắc hơn

**Vấn đề:** `POLL_TIMEOUT_MS = 120s` cứng. File sao kê 100 trang ở tier `balanced` có thể >2 phút → timeout oan.

**Đề xuất:**
- Tăng timeout động theo size file (vd: 60s + 2s/100KB, trần 300s).
- Retry job khi LlamaParse trả `ERROR` (1 lần, đổi tier `balanced → fast`).
- Backoff khi 429.

## 7. UX phía client

- Hiện trạng thái 2 pha trong dialog upload: "Đang trích layout…" → "Đang chuẩn hoá dữ liệu…".
- Hiển thị badge `parser: llamaparse | vision` để user biết file nào chạy fallback.

---

## Ưu tiên đề xuất

| # | Việc | Lợi ích | Effort |
|---|------|---------|--------|
| 1 | Chunk sao kê theo trang + validate balance | Sửa đúng lỗi nghiêm trọng nhất | M |
| 2 | unpdf bypass cho PDF digital | Giảm 60–80% cost | S |
| 3 | Cache theo hash | Giảm cost + tăng tốc retry | S |
| 5 | Đo lường | Cần để biết bước nào fail | S |
| 4 | Schema cash_voucher + auto | Ổn định hơn | S |
| 6 | Timeout động + retry | Giảm flaky | XS |
| 7 | UX 2 pha + badge | Polish | XS |

Đề xuất làm theo thứ tự: **2 → 3 → 5 → 1 → 4 → 6 → 7**. Hai bước đầu (unpdf + cache) cho ROI cao nhất trong khi bước 1 (chunk sao kê) cần thiết kế cẩn thận hơn.

## Phạm vi

Plan này chỉ liệt kê hướng cải thiện. Sau khi bạn chốt làm cái nào, tôi sẽ tạo plan triển khai chi tiết riêng cho từng phần.
