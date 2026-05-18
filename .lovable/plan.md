# Áp dụng tenant scoping nhất quán cho toàn bộ API

## Hiện trạng

- 39 file `src/lib/*.functions.ts`, ~107 server function dạng `list*/upsert*/delete*/create*/update*/save*/remove*`.
- 42 bảng nghiệp vụ có cột `tenant_id`. RLS đã chặn ở DB (qua `current_tenant_id()`), nhưng code app chưa lọc nhất quán: chỉ một số file (`bank`, `einvoices`, `units`, `purchases`, `unit-conversions`) đã thêm `.eq("tenant_id", …)` / `tenant_id: …`; phần lớn còn lại đang dựa hoàn toàn vào RLS.
- Hệ quả: nếu RLS lệch / hoặc khi chuyển sang `supabaseAdmin` thì dữ liệu có thể leak chéo tenant; insert có thể tạo bản ghi `tenant_id = NULL`.

## Mục tiêu

Mọi server function `list*/upsert*/delete*/create*/update*/save*/remove*` (cùng các `get*By*` ngang hàng) tác động vào bảng có cột `tenant_id` PHẢI:

1. Lấy `tenantId` từ context.
2. Lọc `.eq("tenant_id", tenantId)` cho mọi SELECT / UPDATE / DELETE.
3. Ghi `tenant_id: tenantId` cho mọi INSERT / UPSERT.
4. Báo lỗi rõ ràng nếu user chưa chọn doanh nghiệp hoạt động.

## Cách triển khai

### 1. Tạo middleware `withTenant`

File mới `src/integrations/supabase/with-tenant.ts`:

```ts
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const withTenant = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const tenantId = data?.active_tenant_id;
    if (!tenantId) {
      throw new Error("Chưa chọn doanh nghiệp hoạt động");
    }
    return next({ context: { tenantId } });
  });
```

`withTenant` gọi `requireSupabaseAuth` lồng bên trong → các handler chỉ cần dùng `.middleware([withTenant])` là có cả `supabase`, `userId`, `claims`, `tenantId`.

### 2. Quy tắc áp dụng theo bảng

Áp dụng cho 42 bảng có `tenant_id` (xem schema). Một số bảng đặc biệt:

- `journal_lines` không có `tenant_id` → lọc gián tiếp qua `entry_id ∈ journal_entries.tenant_id`.
- `profiles`, `user_roles`, `tenants`, `tenant_members`, `user_invitations`: KHÔNG đổi (đã có quy tắc riêng); chỉ `user_invitations` cần lọc theo tenant đang xem.
- Bảng global (`accounts`, `chart_of_accounts` mẫu, `units` chia sẻ, `tax_codes`…): kiểm tra cột — nếu không có `tenant_id` thì giữ nguyên.

### 3. Phạm vi sửa theo file

Cập nhật tất cả file dưới đây, mỗi function `list*/upsert*/delete*/create*/update*/save*/remove*` + các `*Stats`, `get*` ngang hàng đụng vào bảng có tenant_id:

- `assets.functions.ts` (fixed_assets)
- `bank.functions.ts` (bank_accounts, bank_vouchers, bank_transactions) — bổ sung chỗ còn thiếu
- `cash.functions.ts` (cash_vouchers)
- `coa.functions.ts` (accounts nếu có tenant_id)
- `customers.functions.ts` (customers, customer_groups)
- `dashboard-overview.functions.ts` (read-only aggregates)
- `dimensions.functions.ts` (branches, departments, projects, cost_centers)
- `documents.functions.ts` (documents, document_links, document_status_history)
- `einvoices.functions.ts` / `einvoices-sync.functions.ts` / `einvoice-xml.functions.ts` — bổ sung chỗ còn thiếu
- `fiscal-periods.functions.ts` (fiscal_years, fiscal_periods)
- `inventory.functions.ts` (products, product_categories, stock_movements, stock_vouchers, warehouses)
- `invoices.functions.ts` (invoices)
- `journal.functions.ts` (journal_entries; journal_lines join entries)
- `ledgers.functions.ts` (read journal_entries + lines)
- `partyGroups.functions.ts` (customer_groups, supplier_groups)
- `payables.functions.ts` (supplier_payments + invoices)
- `payroll.functions.ts` (employees, payroll_runs)
- `purchases.functions.ts` / `purchases-dashboard.functions.ts`
- `receipts.functions.ts` (customer_receipts, sales_invoices)
- `receivables.functions.ts`
- `reports.functions.ts` (report_snapshots, report_notes + nguồn dữ liệu)
- `sales.functions.ts` / `sales-dashboard.functions.ts`
- `settings.functions.ts` (exchange_rates, ai_suggestions…)
- `stock-takes.functions.ts`
- `tax.functions.ts`, `tax-lookup.functions.ts`
- `tenants.functions.ts`, `invitations.functions.ts` — giữ logic chọn tenant riêng, chỉ chuẩn hoá phần đọc/ghi liên quan
- `unit-conversions.functions.ts`, `units.functions.ts`, `warehouses.functions.ts`
- `admin.functions.ts` — chỉ áp dụng cho thao tác cấp tenant; superadmin/cross-tenant không đổi
- `superadmin.functions.ts` — KHÔNG đổi (vẫn dùng admin client cross-tenant)
- `chat.functions.ts`, `codegen.functions.ts` — không đụng DB business → giữ nguyên

Bỏ qua các file/handler không đụng bảng tenant.

### 4. Mẫu sửa cho từng pattern

SELECT:
```ts
.middleware([withTenant])
.handler(async ({ context }) => {
  const { supabase, tenantId } = context;
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", tenantId)        // ← thêm
    .order("created_at", { ascending: false });
  ...
});
```

INSERT / UPSERT:
```ts
await supabase.from("customers").insert({
  ...data,
  user_id: userId,
  tenant_id: tenantId,                // ← thêm
});
```

UPDATE / DELETE:
```ts
await supabase
  .from("customers")
  .update(payload)
  .eq("id", data.id)
  .eq("tenant_id", tenantId);         // ← thêm (defense-in-depth)
```

JOIN-derived (vd `journal_lines`): vẫn lọc qua `journal_entries.tenant_id = tenantId` bằng inner-join hoặc lọc ở entry trước.

### 5. Sau khi sửa code

- Chạy build để TypeScript check.
- `supabase--linter` để bắt RLS warning mới (không kỳ vọng có).
- Smoke test thủ công qua preview ở 1–2 tenant: list, create, delete vẫn hoạt động.

## Out of scope (loop sau)

- Realtime channels: chưa filter theo tenant ở client.
- Bảng không có `tenant_id` (vd `journal_lines.tenant_id` chưa tồn tại) — nếu muốn lọc cứng ở DB, cần migration thêm cột + backfill (đề xuất riêng).
- `superadmin.functions.ts` cross-tenant.
- UI hiển thị / xử lý lỗi "Chưa chọn doanh nghiệp hoạt động".

## Rủi ro

Đụng ~30 file, ~80+ handler. Khả năng làm vỡ query rất cao nếu áp dụng máy móc cho bảng không có cột tenant_id. Sẽ kiểm cột thực tế trước khi sửa từng handler.

Sau khi bạn duyệt, mình sẽ làm theo nhóm file (mỗi nhóm 4–6 file, build sạch giữa các bước).
