… (Đây là kết quả rà soát phân hệ **Tài sản cố định**, không phải kế hoạch lương như file `.lovable/plan.md` đang ghi.)

## Đã có trong hệ thống

| Nhóm | Tính năng | File |
|---|---|---|
| Danh mục | Nhóm TSCĐ + khung khấu hao | `fa-categories.functions.ts`, `categories.tsx` |
| Sổ KH | Đa sổ (kế toán / thuế / IFRS) | `fa-books.functions.ts`, `books.tsx`, bảng `fa_asset_books` |
| Hồ sơ TSCĐ | CRUD + Thẻ TSCĐ (S23-DN) | `assets.functions.ts`, `index.tsx`, `$id.card.tsx` |
| Tạo từ hoá đơn | Wizard từ AP invoice / từ TSCĐ → CCDC | `from-invoice.tsx`, `from-fixed-asset.tsx` |
| Khấu hao | Chạy theo tháng + ghi sổ 214/6422… | `runMonthlyDepreciation`, `depreciation.tsx` |
| CCDC phân bổ | `allocated_assets` + targets + adjustments | `allocated-assets.functions.ts`, `allocations.tsx`, `allocations.$id.tsx` |
| Biến động | TRANSFER / REVALUATION / MAJOR_REPAIR / PARTIAL_DISPOSAL | `fa-events.functions.ts`, `events.tsx` |
| Thanh lý | Bán/thanh lý, JE 811/711/214 | `fa-disposals.functions.ts`, `disposal.tsx` |
| Tái phân loại | Đổi nhóm / TK | `fa-reclass.functions.ts`, `reclassify.tsx` |
| Kiểm kê | Phiếu + scan barcode | `fa-inventory.functions.ts`, `inventory.tsx`, `inventory.$id.tsx` |
| Báo cáo | S21-DN, S22-DN, Tăng/giảm theo nguồn vốn, Thẻ TSCĐ | `fa-reports.functions.ts`, `reports.tsx` |

## Còn dang dở

### A. Báo cáo & in chứng từ (gap rõ nhất)
1. **Biên bản giao nhận TSCĐ — mẫu 01-TSCĐ (TT200)** — in khi đưa TSCĐ vào sử dụng (chữ ký bên giao / bên nhận / kế toán).
2. **Biên bản thanh lý TSCĐ — mẫu 02-TSCĐ** — hiện đã có `fa_disposals` nhưng chưa có bản in chính thức để ký.
3. **Biên bản bàn giao TSCĐ sửa chữa lớn hoàn thành — mẫu 03-TSCĐ** — gắn với event `MAJOR_REPAIR`.
4. **Biên bản đánh giá lại TSCĐ — mẫu 04-TSCĐ** — gắn với event `REVALUATION`.
5. **Biên bản kiểm kê TSCĐ — mẫu 05-TSCĐ** — `fa_inventory_counts` đã có dữ liệu, chưa có template in.
6. **Báo cáo TSCĐ theo bộ phận / dự án / chi nhánh** — pivot nguyên giá & GTCL theo dimension (để đối chiếu chi phí KH với phân bổ JE).
7. **Báo cáo TSCĐ sắp hết khấu hao** (còn dưới N tháng) — cảnh báo lập kế hoạch thay thế.
8. **In nhãn QR/Barcode cho TSCĐ** — kiểm kê đang quét nhưng chưa có chức năng in nhãn.

### B. Nghiệp vụ còn thiếu
9. **Import Excel TSCĐ đầu kỳ** — upload .xlsx (mã, tên, nguyên giá, KH luỹ kế, ngày SD…) → bulk insert. Hiện chỉ có nhập tay từng cái.
10. **Khấu hao theo bộ phận sử dụng (đa target)** — TSCĐ dùng chung nhiều bộ phận, chia chi phí KH theo `allocated_asset_targets`. CCDC đã làm, TSCĐ chưa.
11. **Tự động tính lại lịch khấu hao** khi: nâng cấp tăng nguyên giá, đánh giá lại, đổi useful_life. Hiện event sinh JE nhưng chưa cập nhật base để tháng sau tính đúng.
12. **Tổn thất / suy giảm giá trị (Impairment)** — VAS 03/IAS 36, ghi giảm GTCL ngoài lịch KH định kỳ.

### C. Tích hợp & kiểm soát (Phase F)
13. **Khoá kỳ** — không cho chạy/huỷ khấu hao, thanh lý, sửa cost_basis nếu `fiscal_periods` đã closed (đã có hàm `is_period_locked`, cần áp vào FA serverFn).
14. **Audit trail** — log mọi hành động critical (chạy KH, thanh lý, reval, reclass) vào `audit_logs`.
15. **Đảo bút toán (void)** — huỷ một kỳ khấu hao đã ghi: sinh JE ngược + đánh dấu `depreciation_entries.status = void`.
16. **Liên kết NV ↔ TSCĐ** — hiển thị danh sách TSCĐ NV đang giữ trong hồ sơ NV (đã có `assignee_id`/`assignee_employee_id`, chỉ thiếu UI).
17. **Dashboard TSCĐ** — KPI tổng nguyên giá, GTCL, KH năm, tỉ lệ KH, TSCĐ sắp hết hạn, top 10 TSCĐ giá trị cao.

## Đề xuất ưu tiên

- **Đợt 1** (tuần này) — items **1, 2, 5, 9**: bộ chứng từ in chuẩn TT200 (01/02/05-TSCĐ) + import Excel đầu kỳ. Đây là 4 thứ kế toán dùng/yêu cầu nhiều nhất khi audit.
- **Đợt 2** — items **3, 4, 6, 7, 11**: hoàn thiện chứng từ event + báo cáo theo dimension + tự động tính lại lịch KH sau biến động.
- **Đợt 3** — items **13, 14, 15** (Phase F: khoá kỳ + audit + void).
- **Đợt 4** — items **8, 10, 12, 16, 17** (nice-to-have: nhãn QR, đa target KH, impairment, link NV, dashboard).

## Câu hỏi

Bạn chọn hướng nào?
- **A** — Triển khai Đợt 1 (4 mẫu chứng từ in + import Excel TSCĐ).
- **B** — Nhảy thẳng Phase F kiểm soát (khoá kỳ + audit + void KH).
- **C** — Làm Dashboard TSCĐ trước cho dễ thấy tổng quan.
- **D** — Chọn cụ thể từng item theo số (vd: "1, 2, 9, 13").
