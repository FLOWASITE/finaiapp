
# Rà soát các task Phân hệ Lương

## Đã hoàn thành (A → E phần thuế/BHXH)

| Phase | Nội dung | Trạng thái |
|---|---|---|
| A | Hồ sơ NV mở rộng + `employee_contracts` + `employee_dependents` + `payroll_policies` + RLS | ✅ |
| B | `salary_components`, `employee_salary_structures`, `timesheets`, `payroll_run_lines` + UI | ✅ |
| C | Engine tính lương (công chuẩn, OT 150/200/300, ngưỡng miễn thuế, BH cap, PIT 7 bậc, NCT 20%, mùa vụ 10%) + ghi sổ Nợ 622/627/641/642 / Có 334/3383/4/6/3382/3335 | ✅ |
| D | Payslip PDF (print), CSV ngân hàng UTF-8 BOM, tạm ứng giữa kỳ, đánh dấu đã trả | ✅ |
| E.1 | 05/KK-TNCN quý, 05/QTT-TNCN năm, C70a-HD (D02-LT) tháng + CSV | ✅ |

## Còn dang dở

### Phase E.2 — Báo cáo nội bộ & tờ khai còn thiếu
1. **Bảng thanh toán tiền lương C02-HD/BB** (mẫu TT200) — bảng in chuẩn để ký nhận, có cột ký tên.
2. **Bảng phân bổ tiền lương & BHXH** theo TK chi phí × phòng ban × dự án (đối chiếu với JE đã ghi sổ).
3. **D02-TS** — báo cáo tăng/giảm lao động & điều chỉnh đóng BHXH (khác C70a ở chỗ chỉ liệt kê biến động trong kỳ, không phải toàn bộ LĐ).
4. **Chứng từ khấu trừ thuế TNCN cá nhân** (mẫu 03/TNCN) — in cho từng NV khi nghỉ việc hoặc cuối năm.
5. **Import Excel chấm công** (đã ghi trong plan B nhưng chưa làm) — upload .xlsx, mapping cột → bulk upsert `timesheets`.

### Phase F — Tích hợp & tự động hóa (chưa bắt đầu)
6. **Khóa kỳ lương theo `fiscal_periods`** — không cho tạo/sửa/xóa run nếu kỳ kế toán đã closed.
7. **Audit trail** cho kỳ lương đã posted — log mọi thao tác approve/post/void/edit vào `audit_logs`.
8. **Đảo bút toán (void)** kỳ đã ghi sổ — sinh JE ngược, đổi status `posted → voided`.
9. **Liên kết NV ↔ tài sản** — hiển thị tài sản NV đang giữ trong hồ sơ (FA `assignee_employee_id`).
10. **Cron nhắc kỳ lương** (`pg_cron`, optional) — gửi nhắc tạo bảng lương ngày 25-28 hàng tháng.

### Đề xuất bổ sung (ngoài plan gốc)
11. **Dashboard lương** — KPI quỹ lương 12 tháng, top BP theo chi phí, so sánh tháng/quý, headcount biến động.

## Đề xuất ưu tiên

**Đợt 1 (tuần này)** — hoàn thành Phase E.2: items **1, 2, 5** (báo cáo C02-HD, bảng phân bổ, import chấm công). Đây là 3 thứ kế toán dùng hàng tháng, gap rõ nhất so với MISA/FAST.

**Đợt 2** — Phase F core: items **6, 7, 8** (khóa kỳ + audit + void). Đây là chuẩn kiểm soát nội bộ, cần trước khi đưa hệ thống vào dùng thật.

**Đợt 3** — items **3, 4, 9, 10, 11** (D02-TS, chứng từ TNCN cá nhân, FA link, cron, dashboard).

## Câu hỏi

Bạn muốn:
- **A** — Triển khai luôn Đợt 1 (C02-HD + bảng phân bổ + import chấm công)?
- **B** — Nhảy thẳng Phase F (khóa kỳ + audit + void)?
- **C** — Làm Dashboard lương trước cho dễ nhìn tổng quan?
- **D** — Chọn cụ thể từng item theo số ở trên.
