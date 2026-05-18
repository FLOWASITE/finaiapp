
# Hoàn thiện Phân hệ Tiền lương — Chuẩn phần mềm kế toán VN

## Hiện trạng
- Đã có: `employees`, `payroll_runs`, `payroll_lines` cơ bản; tính PIT lũy tiến; BHXH/BHYT/BHTN; ghi sổ JE đơn giản (toàn bộ vào TK 6421).
- Còn thiếu (so với MISA/FAST/Bravo): hồ sơ NV chi tiết, hợp đồng LĐ, người phụ thuộc đăng ký giảm trừ, chấm công, thang lương/chính sách, nhiều khoản thu nhập/khấu trừ tùy biến, tạm ứng lương, quyết toán PIT cuối năm, báo cáo BHXH/PIT, phiếu lương in/email, multi-tenant + phân quyền, kỳ kế toán khóa, lock kỳ lương, phân bổ chi phí lương theo phòng ban/dự án.

## Phân chia phase

### Phase A — Nền tảng dữ liệu & Hồ sơ nhân viên
- Mở rộng `employees`: tenant_id, branch_id, department_id, project_id, email, phone, address, dob, gender, ethnicity, nationality, citizen_id_date/place, tax_id_date, social_insurance_no, health_insurance_no, contract_type, contract_no, hire_date, probation_end, termination_date, payment_method (cash/bank), bank_name, branch_name, payroll_account, region (vùng I-IV — lương tối thiểu).
- Bảng `employee_contracts` (hợp đồng LĐ): số HĐ, loại (thử việc/xác định/không xác định), ngày bắt đầu/kết thúc, lương cơ bản, lương đóng BH, phụ cấp cố định, file đính kèm.
- Bảng `employee_dependents` (người phụ thuộc): họ tên, quan hệ, MST, ngày bắt đầu/kết thúc giảm trừ, trạng thái đăng ký.
- Bảng `payroll_policies`: chính sách BHXH theo năm (8/1.5/1/17.5/3/0.5/1...), mức trần BH (20× LTT vùng), giảm trừ bản thân/người phụ thuộc.
- RLS theo tenant, phân quyền owner/admin/accountant/hr.
- UI: trang `/payroll/employees` chi tiết + tab Hợp đồng, Người phụ thuộc.

### Phase B — Cấu trúc lương & Chấm công
- Bảng `salary_components`: catalog khoản TN/giảm trừ (lương CB, phụ cấp ăn ca, xăng xe, điện thoại, thưởng, OT, hỗ trợ...), gắn flags: `is_taxable`, `taxable_cap`, `is_insurance_base`, `account_code`.
- Bảng `employee_salary_structures`: mỗi NV có nhiều dòng cấu phần áp dụng theo kỳ.
- Bảng `timesheets` (chấm công) hoặc nhập tay tổng công/OT/nghỉ phép/nghỉ không lương theo kỳ.
- Bảng `payroll_run_lines` mở rộng (JSONB `components`, OT amount, deductions JSON).
- UI: trang chấm công + import Excel mẫu.

### Phase C — Tính lương nâng cao & Ghi sổ chi tiết
- Engine tính lương:
  - Lương theo công thực tế / công chuẩn.
  - Cộng các khoản TN từ salary structure + timesheet OT (×1.5/×2/×3).
  - Loại trừ TN không chịu thuế (ăn ca ≤ 730k, đồng phục ≤ 5tr/năm…).
  - BHXH theo lương đóng BH có chặn trần.
  - PIT lũy tiến 7 bậc; hỗ trợ NV không cư trú (20% flat); NV thử việc/lao động dưới 3 tháng ≥ 2tr/lần → 10% khấu trừ.
  - Tạm ứng lương trừ vào kỳ.
- Ghi sổ JE chi tiết theo phòng ban/dự án:
  - Nợ 622/627/641/642/154 theo `account_code` của component và `department_id` (chiều phân tích).
  - Có 334 (lương phải trả), 3383/3384/3386/3382/3335.
  - Bút toán BH công ty: Nợ 622/627/641/642 / Có 3383/3384/3386/3382.
  - Bút toán khấu trừ NV: Nợ 334 / Có 3383/3384/3386/3335.
- Trạng thái kỳ lương: draft → calculated → approved → posted → paid.

### Phase D — Chi trả & Chứng từ
- Thanh toán lương: tạo phiếu chi tiền mặt hoặc UNC chuyển khoản, xuất file ngân hàng (Vietcombank/BIDV/MB CSV mẫu).
- Phiếu lương cá nhân (payslip) in PDF + gửi email từng NV (Lovable AI gateway optional).
- Chốt tạm ứng lương kỳ trước.
- Tạm ứng lương giữa kỳ → ghi 334.

### Phase E — Báo cáo & Tờ khai
- Bảng thanh toán lương C02-HD/BB (mẫu TT200).
- Bảng phân bổ tiền lương & BHXH theo TK chi phí / phòng ban.
- Báo cáo tăng/giảm lao động BHXH (D02-LT, D02-TS).
- Tờ khai khấu trừ PIT tháng/quý (05/KK-TNCN).
- Quyết toán PIT năm (05/QTT-TNCN) + chứng từ khấu trừ thuế.
- Export Excel/CSV (UTF-8 BOM), in mẫu chuẩn.

### Phase F — Tích hợp & tự động hóa
- Khóa kỳ lương theo `fiscal_periods` (chặn sửa nếu kỳ closed).
- Cron `pg_cron` nhắc kỳ lương cuối tháng (option).
- Audit trail (`audit_logs`) cho mọi thay đổi kỳ lương posted.
- Đảo bút toán (void) kỳ lương đã ghi sổ.
- Liên kết NV ↔ tài sản giao (FA `assignee`).

## Đề xuất
Bắt đầu **Phase A** ngay. Mỗi phase ~1 migration + functions + UI; chạy tuần tự, bạn duyệt từng phase trước khi sang phase kế tiếp.

## Bạn xác nhận?
Trả lời **"Phase A"** để bắt đầu, hoặc cho biết phần nào cần bỏ/ưu tiên khác.
