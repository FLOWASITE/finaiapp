## Mục tiêu

Liên kết **Cài đặt → Tổ chức** với **Trí nhớ AI → Bối cảnh DN** thành một nguồn dữ liệu chung. Người dùng có thể sửa ở bất kỳ chỗ nào, dữ liệu vẫn nhất quán. AI luôn đọc thông tin pháp nhân mới nhất.

## Phạm vi đồng bộ

4 nhóm trường (đã chọn):

| Nhóm | Trường trong `tenants` | Key trong `ai_memory_context` |
|---|---|---|
| Thông tin pháp nhân | `company_name`, `tax_id`, `address`, `legal_form` | `org.company_name`, `org.tax_id`, `org.address`, `org.legal_form` |
| Ngành nghề KD | `industries` (jsonb), `industry_name` | `business_model.industries` |
| Chuẩn mực kế toán | `accounting_standard`, `fiscal_year_start` | `accounting.standard`, `accounting.fiscal_year` |
| Liên hệ & Người đại diện | `email`, `phone`, `legal_rep_name`, `legal_rep_title` | `org.contact`, `org.legal_rep` |

## Thiết kế

### 1. Nguồn dữ liệu chính
- **`tenants`** là **nguồn sự thật** (source of truth) cho các trường pháp nhân.
- Các mục tương ứng trong `ai_memory_context` được đánh dấu **"managed"** (cờ `source = 'tenant'` + `source_field` lưu khoá trường).
- Mục managed: `value_text` được render từ tenant, **không lưu cứng** giá trị riêng — luôn đọc từ tenants để tránh lệch.

### 2. Đồng bộ 2 chiều

**Tenant → Context (tự động):**
- Trigger PG `tg_tenant_sync_context` chạy sau INSERT/UPDATE `tenants`: upsert 8 mục managed vào `ai_memory_context` với `category`, `key`, `label`, `value_text` lấy từ tenant. Idempotent theo `(tenant_id, key)`.
- Chạy lần đầu cho tenant hiện có qua backfill trong cùng migration.

**Context → Tenant (khi user sửa trong AI Memory):**
- `updateContext` server fn: nếu row có `source='tenant'` → parse `value_text` về field gốc của tenant và `UPDATE tenants` (qua `updateActiveTenant`). Sau đó trigger tenant sẽ refresh lại context row → đảm bảo format chuẩn.
- Một số mục có format tự do (ví dụ "Ngành nghề chính: ...; phụ: ...") → dùng helper parser đơn giản; nếu parse thất bại, báo lỗi và yêu cầu sửa ở trang Tổ chức.

### 3. UI

**Trang AI Memory → tab Bối cảnh DN:**
- Các mục managed hiển thị với badge **"Đồng bộ từ Tổ chức"** + icon link.
- Cho phép sửa inline (như hiện tại); khi lưu sẽ ghi ngược về `tenants`.
- Không cho xoá mục managed (ẩn nút xoá, hiện "Sửa tại Cài đặt → Tổ chức" link).
- Thêm banner đầu tab: "🔗 Một số mục được liên kết với Cài đặt → Tổ chức. Sửa ở đâu cũng được."

**Trang Cài đặt → Tổ chức:**
- Thêm thẻ thông tin nhỏ ở đầu trang: "Các trường này tự động đồng bộ vào Trí nhớ AI → Bối cảnh DN" + link sang `/ai/memory?tab=context`.

### 4. Migration DB
- Thêm cột `source text` (`'tenant'` | `'manual'` mặc định `'manual'`) và `source_field text` vào `ai_memory_context`.
- Unique constraint `(tenant_id, key)` để upsert.
- Function `public.sync_tenant_to_context(p_tenant uuid)` chứa logic upsert 8 mục.
- Trigger AFTER INSERT OR UPDATE OF (company_name, tax_id, address, legal_form, industries, industry_name, accounting_standard, fiscal_year_start, email, phone, legal_rep_name, legal_rep_title) ON tenants.
- Backfill: `SELECT sync_tenant_to_context(id) FROM tenants;`

### 5. Server fns
- `src/lib/ai-memory-context.functions.ts`:
  - `updateContext` mở rộng: nếu `source='tenant'` → gọi handler ghi ngược tenant; chặn xoá managed rows.
  - Trả thêm `source`, `source_field` trong COLS để UI biết.
- `src/lib/tenants.functions.ts`: không đổi (trigger DB lo phần đồng bộ).

## Files dự kiến

- **Migration mới**: `add_tenant_context_sync.sql` (cột + function + trigger + backfill).
- **Sửa** `src/lib/ai-memory-context.functions.ts` (cập nhật cột & updateContext write-back).
- **Sửa** `src/components/ai-memory-tabs.tsx` → `ContextTab` & `ContextRow` (badge managed, ẩn delete, render link).
- **Sửa** `src/routes/_app/settings/index.tsx` (banner liên kết).

## Không trong phạm vi
- Không đổi schema `tenants`.
- Không đụng các tab khác (Rules, Partners, Limits…).
- Không tự động tạo lại các mục managed nếu user đã xoá thủ công trước migration — backfill sẽ upsert lại.
