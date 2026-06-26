## Mục tiêu

Bổ sung danh sách Phiếu nhập/xuất kho hiển thị **đầy đủ thông tin chi tiết** ngay trên list (không cần mở dialog). Áp dụng cả desktop table lẫn mobile card (đang dùng ở viewport hiện tại 707px).

## Trường sẽ hiển thị (chuẩn phần mềm kế toán)

Mỗi phiếu sẽ show:

**Header**
- Số phiếu · Badge loại (Nhập/Xuất) · Badge trạng thái ghi sổ
- Ngày chứng từ · Ngày ghi sổ (nếu khác)
- Số chứng từ gốc (HĐ/PXK liên kết)

**Định khoản & Kho**
- Kho (mã + tên)
- Nhánh (branch) nếu có
- TK Nợ / TK Có (suy từ voucher_type + counter_account)

**Đối tượng**
- Mã + Tên đối tượng (party)

**Tổng hợp**
- Số dòng · Tổng SL · Tổng giá trị
- Diễn giải (reason)

**Chi tiết dòng (collapsible)**
- Nút "Xem N mặt hàng ▾" mở rộng inline 1 bảng nhỏ trong card: Mã · Tên · ĐVT · SL · Đơn giá · Thành tiền

**Hành động** (giữ nguyên): Mở chi tiết · Menu ⋯ (Xem · Sửa · In · Huỷ)

## Layout

### Mobile card (chính, vì user đang ở mobile)
Mỗi phiếu = card 2 hàng meta + 1 hàng tổng + dòng "Xem chi tiết ▾":

```text
☐ PNK2026-00001  [↓ Nhập] [Đã ghi sổ]              CT: 2026-06-26
                                                    GS: 2026-06-26
─────────────────────────────────────────────────────────────────
Kho:       Kho Chính (KC01)
Đối tượng: NCC-001 · Công ty ABC
Định khoản: Nợ 152 / Có 331
CT gốc:    HĐ001234
Diễn giải: Nhập NVL tháng 6
─────────────────────────────────────────────────────────────────
3 mặt hàng · SL 120 · 📎 2                       200.000 ₫
[▾ Xem chi tiết mặt hàng]
```

Khi mở rộng: bảng nhỏ liệt kê từng dòng `stock_movements` (đã có sẵn trong response).

### Desktop table
Thêm cột con dưới mỗi row chính (expandable row) với cùng bảng dòng, đồng thời bổ sung 2 cột vào header: **Ngày ghi sổ** · **CT gốc** (đã có CT gốc dạng sub-line, sẽ chuyển thành cột riêng).

## File thay đổi

- `src/components/inventory/VoucherListPage.tsx`
  - Mở rộng JSX mobile card (block `pagination.pageRows.map` ~ dòng 450–483) thêm các trường + expand state `Set<string>` cho từng phiếu.
  - Mở rộng table desktop: thêm cột "Ngày ghi sổ", cột "CT gốc"; thêm expandable row chi tiết dòng (tận dụng `r.stock_movements` đã có).
  - Cập nhật `exportCsv` để bổ sung Ngày ghi sổ vào CSV.
  - Cập nhật `colCount` cho skeleton/empty state.

## Lưu ý kỹ thuật

- Toàn bộ dữ liệu chi tiết dòng đã có sẵn trong `listStockVouchers` (đã select `stock_movements(qty, unit_cost, product_id, products(code, name, unit))`) — không cần fetch thêm.
- Ngày ghi sổ: dùng `r.posted_at` nếu có, fallback bằng cách hiển thị `—` (không phá vỡ).
- Định khoản hiển thị: với `voucher_type=in` → `Nợ {stock_account || 152} / Có {counter_account}`; với `out` → `Nợ {counter_account} / Có {stock_account || 152}`.
- Toàn bộ thay đổi nằm trong UI/presentation (1 file), không đụng server function hay schema.
- Giữ design tokens hiện tại (bg-card, text-muted-foreground, badge colors), không hardcode màu.
