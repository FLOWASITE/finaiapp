# Kế hoạch: Bổ sung các phân hệ kế toán còn thiếu

## Hiện trạng AccuVN
Đã có: Bán hàng, Mua hàng (hoá đơn vào), Kho, Quỹ tiền mặt, Ngân hàng, TSCĐ, Sổ nhật ký, BCTC, Thuế GTGT, Công nợ phải thu, Trợ lý AI.

## Đối chiếu với MISA AMIS / FAST / Bravo
Các phân hệ phổ biến trong phần mềm kế toán VN còn **thiếu** trong AccuVN:

### Nhóm 1 — Bắt buộc (gap rõ nhất)
1. **Công nợ phải trả** (`/payables`) — đối ứng với phải thu. Theo dõi dư nợ NCC, tuổi nợ, lịch thanh toán, đối chiếu với hoá đơn mua.
2. **Tiền lương & nhân sự** (`/payroll`) — bảng lương, BHXH/BHYT/BHTN, thuế TNCN, hạch toán 334/338/3383/3384/3389.
3. **Giá thành sản xuất** (`/costing`) — tập hợp chi phí 621/622/627 → tính giá thành thành phẩm 154→155 (cho DN sản xuất).
4. **Hợp đồng & dự án** (`/projects`) — theo dõi doanh thu/chi phí theo hợp đồng, dự án, công trình.

### Nhóm 2 — Quan trọng
5. **Thuế TNCN / Tờ khai 05-KK-TNCN** (mở rộng `/tax`) — hiện chỉ có GTGT.
6. **Thuế TNDN tạm tính & quyết toán** (mở rộng `/tax`) — tờ khai 03/TNDN.
7. **Ngân sách & dự toán** (`/budget`) — lập kế hoạch tháng/quý, so sánh thực tế vs kế hoạch.
8. **Báo cáo quản trị** (mở rộng `/reports`) — Lãi/lỗ theo SP, khách hàng, kênh; dòng tiền dự kiến (cashflow forecast).

### Nhóm 3 — Hỗ trợ vận hành
9. **Đơn đặt hàng (Sales Order / Purchase Order)** — quy trình đặt → hoá đơn → giao hàng.
10. **Phiếu nhập/xuất kho có chứng từ riêng** (mở rộng `/inventory`) — hiện chỉ có movement đơn giản.
11. **Đa chi nhánh / kho** — `branch_id`, `warehouse_id` trên các bảng chính.
12. **Đa tiền tệ & tỷ giá** — bảng `exchange_rates`, đánh giá chênh lệch tỷ giá cuối kỳ (515/635).
13. **Khoá sổ kỳ kế toán** (`period_locks`) — cấm sửa chứng từ đã khoá.
14. **Nhật ký hoạt động / Audit log** — ai tạo/sửa/xoá chứng từ.

### Nhóm 4 — Quản trị hệ thống
15. **Phân quyền theo vai trò** (admin/kế toán trưởng/kế toán viên/xem) — bảng `user_roles` + RLS theo role.
16. **Cài đặt doanh nghiệp** (`/settings`) — logo, chữ ký, mẫu hoá đơn, kỳ kế toán, chuẩn TT133/TT200.
17. **Import/Export Excel** — nhập bảng kê hoá đơn, danh mục KH/NCC/SP từ Excel.

## Đề xuất ưu tiên Phase 5 (build ngay)
Đề xuất tập trung 4 phân hệ tạo giá trị cao nhất, cân đối thời gian:

**A. Công nợ phải trả** (`/payables`)
- Sinh từ `invoices` (mua) đã ghi sổ + `cash_vouchers` chi
- View: dư nợ NCC, tuổi nợ (0-30/31-60/61-90/>90), lịch đến hạn

**B. Tiền lương** (`/payroll`)
- Bảng `employees`, `payroll_runs`, `payroll_lines`
- Tính: lương cơ bản, phụ cấp, BHXH (10.5%), BHYT (1.5%), BHTN (1%), TNCN luỹ tiến
- Sinh bút toán: 642/641 → 334, 338x

**C. Phân quyền + Cài đặt DN** (`/settings`)
- `user_roles` enum (owner/accountant/viewer) + `has_role()` security definer
- Trang `/settings` chỉnh hồ sơ DN, chuẩn TT, kỳ kế toán

**D. Đa tiền tệ + Khoá sổ** (nâng cấp ngầm)
- `exchange_rates(date, currency, rate)`
- `period_locks(year, month, locked_at)` + check trong serverFn ghi sổ

## Ngoài phạm vi Phase 5
Giá thành sản xuất, dự án, ngân sách, đơn hàng, đa chi nhánh, import Excel — để Phase 6+.

## Câu hỏi cho bạn trước khi build
1. **Ưu tiên đúng không?** Build 4 phân hệ A+B+C+D, hay bạn muốn đảo thứ tự / thêm / bỏ?
2. **Quy mô DN mục tiêu**: SME dịch vụ/thương mại (TT133, không cần giá thành SX) hay có sản xuất (cần Giá thành — TT200)?
3. **Lương**: tính theo công thức VN chuẩn (BHXH 10.5%/BHYT 1.5%/BHTN 1%, TNCN luỹ tiến 7 bậc) hay đơn giản hoá (lương net + thuế phẳng) ở phase này?
4. **Phân quyền**: chỉ cần 2 vai trò (owner/viewer) hay đầy đủ 4 (owner/kế toán trưởng/kế toán viên/viewer)?
