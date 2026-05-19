# Cho phép chọn mẫu Daily Digest (ngắn / tiêu chuẩn / chi tiết)

## Database

Migration: thêm cột `template` vào `user_digest_prefs`.

```sql
ALTER TABLE public.user_digest_prefs
  ADD COLUMN template text NOT NULL DEFAULT 'standard'
  CHECK (template IN ('short','standard','detailed'));
```

## Định nghĩa 3 mẫu

| Mẫu | Nội dung |
|---|---|
| **Ngắn** (`short`) | 1 dòng KPI chính (Doanh thu hôm qua + số HĐ), số cảnh báo & số inbox dưới dạng inline. Không emoji-heavy. ~3 dòng. |
| **Tiêu chuẩn** (`standard`) | Như hiện tại: KPI 4 dòng, danh sách cảnh báo (≤5), inbox. |
| **Chi tiết** (`detailed`) | Tiêu chuẩn + thêm: top 3 khách hàng có doanh thu hôm qua, top 3 NCC có chi hôm qua, công nợ AR/AP tổng hiện tại, số hợp đồng quá hạn, tất cả cảnh báo (≤10) kèm body. |

## Server changes

**`src/lib/digest-generator.server.ts`**
- Nhận thêm tham số `template: 'short'|'standard'|'detailed'` (default `standard`).
- Tách `buildMarkdown(template, data)` thành 3 nhánh.
- Với `detailed`: thêm các query — group theo `customer_id` từ `customer_receipts` + `sales_invoices` (top 3), tương tự `supplier_payments` (top 3), tổng `receivables`/`payables` (nếu có bảng tương ứng — fallback: tổng `sales_invoices.balance_due` & `invoices.balance_due`).

**`src/lib/digest-prefs.functions.ts`**
- `DigestPrefs` thêm `template`.
- `getDigestPrefs` select thêm cột.
- `updateDigestPrefs` zod schema thêm `template: z.enum(['short','standard','detailed']).optional()`.
- `sendDigestNow` đọc `template` từ prefs và truyền vào `generateAndPostDigest`.

**`src/routes/api/public/hooks/daily-digest.ts`**
- Đọc cột `template` cùng các prefs khác; truyền vào generator.

## UI changes

**`src/components/settings/digest-settings-card.tsx`**
- Thêm 1 dòng "Mẫu nội dung" với `Select` 3 lựa chọn:
  - Ngắn — "1 dòng tóm tắt KPI"
  - Tiêu chuẩn — "KPI + cảnh báo + inbox"
  - Chi tiết — "Thêm top KH/NCC + công nợ"
- Disable khi `!enabled`. onChange → `updateMut.mutate({ template })`.
- Nút "Gửi thử ngay" sẽ dùng mẫu đã chọn.

## Kiểm thử

1. Chọn "Ngắn" → Gửi thử → message chỉ ~3 dòng.
2. Chọn "Chi tiết" → Gửi thử → có sections "Top khách hàng", "Top NCC", "Công nợ".
3. Đổi mẫu → lưu → cron job lần kế tiếp dùng đúng mẫu mới.
4. Mẫu mặc định cho user cũ = `standard` (không vỡ).
