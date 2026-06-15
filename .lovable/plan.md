# Sửa: Báo cáo tài chính lẫn dữ liệu giữa các tổ chức

## Nguyên nhân

Toàn bộ server function trong `src/lib/reports.functions.ts` đang lọc bằng `user_id` (id của người dùng) thay vì `tenant_id` (id tổ chức). Khi một user sở hữu nhiều tổ chức (vd: bạn vừa tạo "Linh kiện Tân Phú"), mọi báo cáo vẫn gom dữ liệu của các tổ chức cũ cùng user → tổ chức mới chưa có bút toán vẫn hiện số liệu.

Đây cùng kiểu lỗi với "Bút toán gần đây" trên Dashboard đã sửa trước đó: RLS chỉ kiểm tra thành viên tenant (`is_tenant_member`), không khóa theo `active_tenant_id`, nên app phải tự thêm `.eq("tenant_id", tenantId)`.

## Phạm vi sửa (chỉ 1 file)

`src/lib/reports.functions.ts` — chuyển middleware và filter:

- Đổi `requireSupabaseAuth` → `withTenant` ở tất cả `createServerFn`:
  drilldown B01/B02/B03, Bảng cân đối phát sinh, Sổ cái, Sổ chi tiết, BS/PL/CF, dashboard tài sản & tồn kho, ghi chú báo cáo, snapshot, danh sách chứng từ.
- Thay mọi `.eq("user_id", userId)` / `.eq("journal_entries.user_id", userId)` thành `.eq("tenant_id", tenantId)` (hoặc `.eq("journal_entries.tenant_id", tenantId)` khi join qua `journal_lines`).
- Với bảng không có `tenant_id` (`journal_lines`, `depreciation_entries`): vẫn join qua bảng cha (`journal_entries`, `fixed_assets`) — chỉ đổi điều kiện `user_id` → `tenant_id`.
- `report_notes.upsert`: ghi `tenant_id` thay vì `user_id`; `onConflict` đổi sang `tenant_id,section` (cần kiểm tra/điều chỉnh unique constraint — nếu hiện tại là `user_id,section` sẽ tạo migration đổi unique).
- `resolveTenantStandard`: nhận thẳng `tenantId` từ context, bỏ bước đọc `profiles.active_tenant_id`.

## Kiểm tra sau khi sửa

1. Đăng nhập → chuyển sang tổ chức "Linh kiện Tân Phú" → mở Báo cáo tài chính (B01/B02/B03), Bảng cân đối phát sinh, Sổ cái: tất cả phải trống.
2. Quay lại tổ chức cũ: số liệu cũ hiển thị đầy đủ như trước.
3. Drill-down từ một chỉ tiêu trên B01/B02/B03 vẫn ra đúng bút toán của tổ chức hiện hành.

## Không động đến

- Schema DB (trừ khi unique của `report_notes` đang là `user_id,section` — khi đó tạo migration nhỏ đổi sang `tenant_id,section`).
- RLS policies (giữ nguyên; chỉ sửa lớp app).
- Các báo cáo nằm ở file khác (`purchase-reports`, `sales-reports`, `fa-reports`, `payroll-reports`) — sẽ rà thêm trong cùng turn nếu xác nhận chúng cũng lọc bằng `user_id`.
