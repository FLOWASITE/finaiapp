## Mục tiêu
Nâng cấp dialog **Thêm hàng hoá / dịch vụ** ở `/items` thành form chuẩn phần mềm kế toán (Misa/Fast/Bravo): bố cục rõ ràng theo nhóm thông tin, ưu tiên trường quan trọng, ẩn/hiện hợp lý theo loại, và tăng chất lượng nhập liệu.

## Vấn đề hiện tại
- Tất cả 13 trường nằm chung 1 grid 2 cột — khó scan, mã/tên bị lẫn với tài khoản kế toán.
- Dialog `max-w-2xl` quá hẹp cho lượng trường này.
- Không có gợi ý / validate (mã trùng, mã tự sinh, định dạng số tiền VND).
- Loại "Combo" có icon nhưng chưa có UI khai báo thành phần — sẽ tạm để placeholder rõ ràng.
- Trường Mã vạch nằm cạnh Loại (vị trí kém quan trọng đứng đầu).
- Số tiền (Giá bán, Giá vốn) chưa format ngàn — dễ nhập sai.

## Thiết kế mới — Dialog rộng + Tabs

Mở rộng dialog lên `max-w-3xl`, chia 3 tab:

```
┌─ Thêm hàng hoá / dịch vụ ────────────────────────[ X ]─┐
│  [Loại: ● Hàng hoá  ○ Dịch vụ  ○ Combo]              │
│  ─────────────────────────────────────────────────    │
│  [ Thông tin chung ] [ Giá & Thuế ] [ Kho & Kế toán ] │
│                                                        │
│  (nội dung tab)                                        │
│                                                        │
│  ─────────────────────────────────────────────────    │
│              [ Huỷ ]  [ Lưu & thêm mới ]  [ Lưu ]    │
└────────────────────────────────────────────────────────┘
```

**Loại** chuyển thành **segmented control** (RadioGroup dạng pill) đặt ở đầu — đây là quyết định ảnh hưởng toàn bộ form.

### Tab 1 — Thông tin chung
- Mã * (có nút ⟳ tự sinh: `HH0001`, `DV0001`, `CB0001`)
- Tên *
- Mã vạch (chỉ Hàng hoá/Combo)
- ĐVT * (Combobox gợi ý: cái, hộp, kg, lít, giờ, lần…)
- Nhóm (Select + nút + tạo nhanh)
- Ghi chú (Textarea, 2 dòng)

### Tab 2 — Giá & Thuế
- Giá bán (Input số có format ngàn: `1.500.000`)
- Giá vốn (chỉ Hàng hoá/Combo)
- VAT % (Select: KCT / 0 / 5 / 8 / 10)
- Trạng thái: Switch "Đang kinh doanh"

### Tab 3 — Kho & Kế toán
*(ẩn hoàn toàn nếu là Dịch vụ — thay bằng infobox "Dịch vụ không quản lý tồn kho")*

Section **Định mức tồn kho** (Hàng hoá/Combo):
- Tồn tối thiểu / Tồn tối đa (2 cột)

Section **Tài khoản kế toán** (luôn hiện, có placeholder mặc định theo TT133/TT200):
- TK doanh thu (511)
- TK giá vốn (632) — ẩn nếu Dịch vụ
- TK kho (156) — ẩn nếu Dịch vụ
- TK thuế GTGT đầu ra (3331)

Mỗi field tài khoản có tooltip giải thích.

### Tab 4 (chỉ Combo) — Thành phần
Placeholder: "Khai báo thành phần combo sẽ có ở bản cập nhật sau" + disable nút Lưu nếu Combo (để minh bạch). *Hoặc* giữ Combo hoạt động như Hàng hoá hiện tại — sẽ chọn phương án giữ hoạt động để không chặn user.

## Cải tiến UX khác
- **NumberInput** helper format `vi-VN` (1.500.000) cho giá bán/vốn/định mức.
- **Validate inline** mã trùng (check trong `products` đã load), tên rỗng.
- **Nút "Lưu & thêm mới"** giữ dialog mở, reset form, focus về ô Mã — workflow nhập hàng loạt.
- **Phím tắt**: `Ctrl+S` lưu, `Esc` huỷ.
- **Trạng thái loading** nút Lưu (`m.isPending` → spinner + "Đang lưu…").

## Phạm vi file
Chỉ chỉnh **UI/presentation**, không đổi backend:
- `src/routes/_app/items/index.tsx` — tách `ProductDialog` thành component riêng, viết lại JSX theo tabs.
- *(mới)* `src/components/ui/number-input.tsx` — wrapper Input format vi-VN.

Không đổi: `inventory.functions.ts`, schema DB, sidebar, route tree.

## Out of scope
- Upload ảnh sản phẩm (cần storage bucket — đề xuất tách task riêng).
- Khai báo thành phần Combo chi tiết (cần bảng `product_components`).
- Đa đơn vị tính + tỉ lệ quy đổi (cần bảng `product_units`).
