## Chẩn đoán

`OrganizationTab` chỉ bắt đầu gọi `getActiveTenant` **sau khi** người dùng bấm vào tab → mỗi lần mở phải chờ đủ chuỗi: cold start serverFn → `attachSupabaseAuth` lấy session → query `profiles` → query `tenants(*)` + `tenant_members`. Trong khi đó:

- `TenantSwitcher` ở header đã gọi `listMyTenants` (lấy danh sách tenant + role + active id) nhưng dữ liệu này **không được tái sử dụng**.
- `getActiveTenant` đang `select("*")` toàn bộ ~40 cột (gồm cả `logo_url`, `signature_url`, `stamp_url` là data lớn) dù phần lớn không cần render ngay.
- Query không được prefetch ở route loader → render → mount → fetch → setState → render lại.
- `JSON.stringify(form)` chạy mỗi lần render để check dirty cũng góp phần lag sau khi data về (form ~40 field).

## Kế hoạch sửa

### 1. Prefetch ở layout `_app`
Trong `src/routes/_app.tsx` thêm `loader` dùng `queryClient.ensureQueryData({ queryKey: ["active-tenant"], queryFn: () => getActiveTenant(), staleTime: 60_000 })`. Khi user vào bất kỳ trang `_app/*` nào, dữ liệu tổ chức đã sẵn trong cache → mở tab Settings là instant.

### 2. Tách `getActiveTenant` để trả về nhanh phần "core"
Sửa `src/lib/tenants.functions.ts`:
- `getActiveTenant`: `select` danh sách cột cụ thể, **bỏ** `logo_url, signature_url, stamp_url` (3 cột có thể chứa data URL dài).
- Thêm `getActiveTenantAssets` riêng cho logo/signature/stamp, gọi lazy trong section "Thương hiệu & Chữ ký" khi user scroll tới (hoặc `prefetchQuery`).

### 3. Gộp profile lookup
Hiện tại `getActiveTenant` gọi `profiles` để lấy `active_tenant_id`, rồi mới gọi `tenants` + `tenant_members`. Đổi thành 1 query duy nhất bằng RPC `current_tenant_id()` (đã có trong DB) lồng vào subquery, hoặc dùng `.in('id', supabase.rpc(...))` style — giảm 1 round trip Supabase.

Cụ thể: tạo 1 view/RPC `get_active_tenant_with_role(uid)` trong migration, trả về tenant row + my role trong 1 lệnh. Server fn chỉ gọi 1 RPC.

### 4. Chia sẻ cache với `TenantSwitcher`
`listMyTenants` đã có `role` của tenant active. Trong `OrganizationTab`:
- Đọc `myRole` từ cache `["my-tenants"]` làm fallback ban đầu (`placeholderData`) để render UI ngay, không phải đợi `active-tenant`.

### 5. Bỏ tính toán dư thừa phía client
Trong `OrganizationTab`:
- Thay `dirty = JSON.stringify(form) !== JSON.stringify(data?.tenant)` bằng `useMemo` so sánh nông các key đã thay đổi, hoặc track 1 cờ `isDirty` set khi user gõ.
- `computeTenantSetupProgress` đã ổn (đang trong `useMemo`).

### 6. Skeleton tốt hơn
Hiện tại `OrganizationSkeleton` chỉ show khi `!form`. Cho hiển thị ngay header (logo + tên) bằng dữ liệu từ `["my-tenants"]` cache để cảm giác load nhanh hơn, skeleton chỉ ở phần form bên dưới.

## Files dự kiến chỉnh

- `src/routes/_app.tsx` — thêm loader prefetch.
- `src/lib/tenants.functions.ts` — `getActiveTenant` (select tách cột, dùng RPC), thêm `getActiveTenantAssets`.
- `src/routes/_app/settings/index.tsx` — placeholderData từ `my-tenants`, dirty flag, lazy load assets section.
- `supabase/migrations/*` — RPC `get_active_tenant_with_role`.

## Kỳ vọng

- Lần mở Settings đầu tiên: từ ~chuỗi tuần tự (profile → tenant → member) còn 1 RPC duy nhất, **+ data đã prefetch** ở layout → gần như instant.
- Payload nhỏ hơn (bỏ 3 cột asset).
- Lần mở tiếp theo trong 60s: dùng cache, 0ms.

Bạn duyệt thì mình triển khai theo đúng thứ tự trên?