# Kế hoạch: Sau khi HĐĐT được tải về thì làm gì?

## Bối cảnh hiện tại

Hôm nay có 2 luồng nạp HĐĐT vào kho `einvoices`:
- **TCT sync** (`syncTctInvoices`): chỉ lấy **metadata danh sách** (tổng tiền, MST, số HĐ, trạng thái `tthai`). **Không tải XML, không có dòng hàng.**
- **Import XML** (`importEinvoicesToStore`): có XML đầy đủ → parse ra `einvoice_lines`, lưu file vào bucket `einvoices`.

Sau khi tải về, HĐĐT chỉ "nằm yên" trong bảng `einvoices`. Việc đối chiếu với hoá đơn mua/bán nội bộ phải bấm nút **Auto-match** thủ công. Không có ghi sổ tự động, không có thông báo, không có gợi ý hạch toán.

## Mục tiêu

Biến `einvoices` thành **nguồn sự thật** cho hoá đơn mua/bán: tải về → bổ sung XML đầy đủ → đối chiếu → đề xuất tạo chứng từ / hạch toán → thông báo cho người dùng.

---

## Pipeline đề xuất (5 bước, chạy ngay sau khi sync/import)

```text
   TCT sync danh sách           Import XML thủ công
          |                              |
          v                              v
   [1] Lưu metadata             [1'] Parse + lưu lines
          |                              |
          +--------> [2] Tải XML chi tiết cho HĐ mới <--+ (chỉ TCT)
                              |
                              v
                     [3] Auto-match theo (MST + số HĐ + tổng)
                              |
                              v
                     [4] Đề xuất tạo / cập nhật chứng từ
                              |
                              v
                     [5] Thông báo + đưa vào Inbox
```

### Bước 1 — Lưu metadata (giữ nguyên)

Đã có. Bổ sung: lưu `tct_status` chuẩn hoá (`valid | cancelled | adjusted | replaced | pending`) và **bỏ qua** HĐ `cancelled` ở các bước sau (không match, không ghi sổ).

### Bước 2 — Tải chi tiết XML cho HĐ TCT mới

Sau khi `syncTctInvoices` xong, với mỗi HĐ vừa tạo, gọi tiếp endpoint TCT `/query/invoices/export-xml?nbmst=...&khhdon=...&shdon=...` (qua `TCT_PROXY_URL`) để lấy XML đầy đủ. Sau đó:
- Upload XML vào bucket `einvoices` → set `xml_path`
- Parse bằng `parseEinvoiceXml` → ghi `einvoice_lines`, bổ sung `exchange_rate`, `payment_method`, `cqt_signed`, `seller_signed`...

Chạy **bất đồng bộ theo batch** (10 HĐ/lần, có retry, log vào `einvoice_sync_logs.detail`) để không kéo dài thời gian sync chính. Nếu fail → đánh dấu `xml_fetch_status = 'failed'`, người dùng có thể bấm "Tải lại XML" trên trang chi tiết.

### Bước 3 — Auto-match thông minh

Hiện auto-match chỉ khớp `invoice_no` + MST. Nâng cấp:
- **Match 3 mức** (theo độ tin cậy giảm dần):
  1. `(MST đối tác, ký hiệu, số HĐ)` → khớp **chắc chắn** → tự gán.
  2. `(MST đối tác, số HĐ)` + chênh lệch tổng tiền ≤ 1 đồng → tự gán + cờ `match_confidence = 'high'`.
  3. `(MST đối tác, ngày ±3, tổng ±1%)` → đề xuất, **không tự gán**, hiển thị ở Inbox để người dùng xác nhận.
- Phát hiện **trùng lặp ngược**: 1 invoice nội bộ đang trỏ tới 2 einvoice → cảnh báo.

Chạy ngay cuối `syncTctInvoices` / `importEinvoicesToStore` cho riêng các HĐ vừa tạo (không quét toàn bộ).

### Bước 4 — Đề xuất tạo chứng từ

Với einvoice **chưa match** sau bước 3:
- **Chiều mua (`in`)**: tạo bản nháp `invoices` (purchases) với supplier auto-upsert theo MST, lines copy từ `einvoice_lines`, gợi ý tài khoản chi phí theo `ai/suggest-account` dựa trên `description`. Trạng thái `draft`, chờ kế toán duyệt.
- **Chiều bán (`out`)**: tạo bản nháp `sales_invoices` tương tự (trường hợp HĐ bán phát hành ngoài app rồi sync về).
- Không tự ghi sổ — chỉ tạo nháp + link 2 chiều (`einvoices.matched_*` ↔ `invoices.einvoice_id`).

Tính năng này **bật/tắt theo tenant setting** (`auto_draft_from_einvoice`), mặc định **tắt** để không ngợp người dùng cũ.

### Bước 5 — Thông báo & Inbox

Kết thúc pipeline, ghi 1 bản ghi `notifications` + đẩy vào Inbox AI lane "HĐĐT mới":
- **Tóm tắt**: "Đã tải N HĐĐT đầu vào: A đã ghép, B chờ duyệt, C cần xem (ambiguous)."
- Mỗi HĐ ambiguous (bước 3 mức 3) là 1 inbox item với CTA "Xác nhận ghép" / "Bỏ qua".
- HĐ `cancelled` mà đang trỏ tới invoice nội bộ → cảnh báo "HĐ đã huỷ ở TCT, cần xử lý chứng từ".

---

## Thay đổi DB cần thiết

| Bảng | Cột mới | Mục đích |
|---|---|---|
| `einvoices` | `xml_fetch_status` (`pending\|done\|failed`) | trạng thái tải XML chi tiết |
| `einvoices` | `xml_fetch_error` text | log lỗi tải XML |
| `einvoices` | `match_confidence` (`exact\|high\|suggested`) | mức độ tin cậy match |
| `einvoices` | `auto_draft_invoice_id` uuid | nháp chứng từ tự sinh |
| `invoices` / `sales_invoices` | `einvoice_id` uuid | liên kết ngược |
| `tenants` (hoặc `tenant_settings`) | `einvoice_auto_draft` bool default false | bật/tắt bước 4 |
| `einvoice_sync_logs` | `detail` jsonb | log chi tiết từng HĐ (xml fail, match...) |

Không xoá cột nào. Trigger giữ nguyên.

---

## Thay đổi code

- **`src/lib/einvoices-sync.functions.ts`**:
  - Tách `syncTctInvoices` thành 2 phase: `fetchList` (đồng bộ) + `enrichXml` (background batch).
  - Thêm helper `fetchInvoiceXmlFromTct({ nbmst, khhdon, shdon, token })`.
  - Sau khi insert HĐ mới, push vào hàng đợi enrich (gọi inline với `Promise.allSettled` batch 10).
- **`src/lib/einvoices.functions.ts`**:
  - `autoMatchEInvoices` → nâng cấp 3 mức, trả `{ exact, high, suggested, ambiguous }`.
  - Thêm `draftInvoiceFromEinvoice(einvoiceId)` server fn.
  - Thêm `retryXmlFetch(einvoiceId)`.
- **`src/lib/einvoice-xml-parser.ts`**: đã đủ, không sửa.
- **UI**:
  - `src/routes/_app/einvoices/index.tsx`: cột "XML" (✓/⚠/⏳), cột "Mức khớp", filter `xml_fetch_status`.
  - `src/routes/_app/einvoices/$id.tsx`: nút "Tải lại XML", "Tạo nháp chứng từ", panel "Gợi ý ghép" cho suggested.
  - `src/components/sync-tct-dialog.tsx`: sau khi sync xong, hiện toast có CTA "Xem N HĐ chờ duyệt" → /inbox?lane=einvoice.
  - Inbox: thêm lane `einvoice_review` lấy từ einvoices có `match_confidence='suggested'` hoặc `tct_status='cancelled' AND matched_*`.
- **`src/lib/digest-generator.server.ts`**: thêm section "HĐĐT tuần này" vào digest.

---

## Triển khai theo giai đoạn

1. **Phase 1 (làm trước)**: Bước 2 (tải XML chi tiết sau TCT sync) + cột `xml_fetch_status`. Đây là gap lớn nhất hiện tại — HĐ TCT không có lines nên không hạch toán được.
2. **Phase 2**: Bước 3 nâng cấp auto-match + Inbox lane mới.
3. **Phase 3**: Bước 4 (auto-draft) + setting tenant.
4. **Phase 4**: Bước 5 notifications + digest section.

Mỗi phase độc lập, có thể release riêng.

---

## Câu hỏi cần bạn quyết trước khi bắt tay

1. **Auto-draft ở bước 4**: mặc định **tắt** (an toàn) hay **bật** (chủ động)?
2. **HĐ `cancelled` ở TCT** nhưng đã hạch toán nội bộ — chỉ cảnh báo, hay tự đảo bút toán?
3. **Phạm vi Phase 1 ngay bây giờ**: chỉ tải XML + parse lines, hay làm luôn cả nâng cấp auto-match (Phase 2)?
