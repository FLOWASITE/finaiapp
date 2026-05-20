# Tinh chỉnh sidebar

File duy nhất chỉnh: `src/components/app-sidebar.tsx`

## 1. Sidebar AI mode (FRONT_SECTIONS)

Bỏ cả cụm group **"Hồ sơ"** (Hoá đơn bán / Hoá đơn mua / Hoá đơn điện tử / Trung tâm tài liệu).

Thay bằng **1 leaf duy nhất** trong section "Không gian":

- `Trung tâm tài liệu` → `/documents` — icon `FileText`

Các group khác (Tiền, Đối tác, Hàng hoá) giữ nguyên.

## 2. Sidebar Kế toán mode (SECTIONS)

Trong section đầu có label `"AI"` (đang chứa "Trí nhớ AI"):

- **Đổi label group**: `"AI"` → `"Bắt đầu mọi việc"`
- **Bỏ entry** `Trí nhớ AI` (`/ai/memory`)
- **Thêm entry** `Trung tâm chứng từ` → `/documents`, icon `Inbox` (hoặc `FileText`)

Section "AI" thứ hai (chứa Tiền & Ngân hàng, Bán hàng, Mua hàng, …) **đổi  label "AI"**  thành Vận hành

## Ghi chú

- Không đụng `EINVOICE_SECTIONS`, `TAX_SECTIONS`, `REPORTS_SECTIONS`, `SUPERADMIN_SECTIONS`.
- Không xoá route `/ai/memory` — chỉ ẩn khỏi sidebar.
- Không thay đổi logic chọn section / active state.

Xác nhận để mình implement?