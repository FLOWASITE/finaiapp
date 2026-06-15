
# Bổ sung trường mặc định cho "Hàng hóa" trong dialog tạo mặt hàng

## Bối cảnh
Trong `ItemCreateDialog`, khi người dùng chọn loại "Hàng hóa", form hiện tại chưa có các trường kế toán kho/giá vốn/doanh thu như màn hình tham chiếu trong ảnh.

## Phạm vi
Chỉ chỉnh sửa giao diện trong `src/components/catalog/ItemCreateDialog.tsx`. Không động vào server-fn `upsertCatalogItem`, schema DB, hay logic khác.

## Thay đổi UI (chỉ hiển thị khi `itemType === "goods"`)

Thêm 1 section mới "Thông tin kho & hạch toán hàng hóa" ngay sau section Hạch toán, gồm:

1. **Kho mặc định** (Select) — option mặc định: `Kho chính (MWH)`. Danh sách kho tạm hardcode: MWH, KHO_HCM, KHO_HN. Mặc định `MWH`.
2. **Tab nội bộ** (3 tab nhỏ kiểu chip / underline): `Thông tin chi tiết` (mặc định), `Thông tin đầu kỳ`, `Thông tin XNK`. Hai tab sau hiện trạng thái placeholder "Sẽ bổ sung sau".
3. Trong tab **Thông tin chi tiết**:
   - **Giá nhập** (number input, mặc định 0)
   - **Giá bán** (number input, mặc định 0)
   - **Thuế GTGT** (Select: 0% / 5% / 8% / 10%, mặc định 10%) — đồng bộ với `vatRateStandard` đã có.
   - **TK kho** *(Select tài khoản, mặc định `1561 - Giá mua hàng hóa`)*
   - **TK giá vốn** *(Select, mặc định `632 - Giá vốn hàng bán`)*
   - **TK doanh thu** *(Select, mặc định `5111 - Doanh thu bán hàng hóa`)*
   - **TK giảm trừ doanh thu** *(Select, mặc định `5211 - Chiết khấu thương mại`)*
   - **Ghi chú** (Textarea) — dùng chung `form.notes` đã có, ẩn ô Ghi chú gốc khi đang chế độ Hàng hóa để tránh trùng.

Tất cả dropdown TK có thêm vài option phổ biến để chọn:
- TK kho: 1561, 1562, 152, 153, 156
- TK giá vốn: 632
- TK doanh thu: 5111, 5112, 5113
- TK giảm trừ: 5211, 5212, 5213

## State mới (local trong component, không vào schema lưu)
```ts
const [warehouse, setWarehouse] = useState("MWH");
const [goodsTab, setGoodsTab] = useState<"detail"|"opening"|"xnk">("detail");
const [priceIn, setPriceIn] = useState(0);
const [priceOut, setPriceOut] = useState(0);
const [accStock, setAccStock] = useState("1561");
const [accCogs, setAccCogs] = useState("632");
const [accRevenue, setAccRevenue] = useState("5111");
const [accDiscount, setAccDiscount] = useState("5211");
```

Khi chuyển sang itemType=goods: set `accStock=1561` và đồng bộ `defaultAccountTT99/TT133 = 1561` (override preset cũ `156` để khớp với màn hình tham chiếu — TK kho hàng hóa thường là 1561 chi tiết của 156). Khi chuyển lại service: trở về preset dịch vụ.

## Lưu dữ liệu
- `priceIn`, `priceOut`, `accCogs`, `accRevenue`, `accDiscount`, `warehouse` chưa có trong schema CatalogItem → đính kèm vào `notes` dạng JSON ẩn hoặc bỏ qua ở lần này. **Đề xuất**: bỏ qua phần persist (chỉ render UI mặc định) để tránh thay đổi backend; sẽ kết nối ở task sau. `defaultAccountTT99/TT133` vẫn = `accStock`.

## Không thay đổi
- Section Thuế, NCC & tần suất, footer.
- Không sửa dialog Edit.
- Không sửa types/server-fn.
