## Mục tiêu

Nâng cấp `XmlInvoicePreview` từ "tem giấy đỏ" hiện tại sang **Hybrid editorial**: header đỏ kiểu con dấu giữ chất hóa đơn VN, phần thân dùng design tokens của app (border/muted/foreground/primary) để hòa với chat và hỗ trợ dark mode tự nhiên. Mật độ **rich** — hiển thị thêm template/ký hiệu/seri, thuế suất từng dòng, chữ ký, mã tra cứu.

## Phạm vi

- Chỉ sửa `src/components/chat/invoice/xml-invoice-preview.tsx`.
- Cập nhật nhẹ `invoice-extract-card.tsx`: mở rộng cột trái lên `md:grid-cols-[340px_1fr]` để có chỗ cho layout rich; bỏ badge "đã ký số" trùng lặp bên ngoài khi `isXml` (đã có trong preview).
- Không đổi `parse-document.functions.ts`, không đổi backend, không đổi `EinvoiceExtras` type.

## Thiết kế mới

### Cấu trúc

```text
┌─────────────────────────────────────┐
│ ▮ HÓA ĐƠN GTGT          [đã ký số]  │  ← stamp-bar đỏ mảnh (8px) + badge
│   VAT Invoice · Bản thể hiện        │
├─────────────────────────────────────┤
│ Số          Ký hiệu       Ngày      │  ← 3 cột meta, mono, foreground
│ 00012345    1C25TXX       17/05/26  │
├─────────────────────────────────────┤
│ NGƯỜI BÁN                           │  ← label uppercase muted-foreground
│ Công ty TNHH ABC                    │
│ MST 0123456789 · HN, ...            │
├─────────────────────────────────────┤
│ NGƯỜI MUA                           │
│ ...                                 │
├─────────────────────────────────────┤
│ #  Hàng hoá       SL  Đơn giá  VAT │  ← bảng dòng, divider mảnh
│ 1  Bút bi xanh    10   2.000  10%  │
│ 2  ...                              │
│ … +3 dòng                           │
├─────────────────────────────────────┤
│ Cộng tiền hàng         2.000.000   │
│ Thuế GTGT (10%)          200.000   │
│ ─────────────────────────────────   │
│ TỔNG THANH TOÁN       2.200.000 ₫  │  ← primary, font lớn
│ Bằng chữ: Hai triệu hai trăm ...   │  ← italic muted
├─────────────────────────────────────┤
│ 🛡 CQT: M2-25-CK...   ↗ Tải XML    │
└─────────────────────────────────────┘
```

### Token & màu

- Khung: `border-border bg-card text-card-foreground rounded-xl shadow-sm` — bỏ nền kem `#fffaf2`, bỏ viền vàng. Hoạt động đúng cả light/dark.
- Stamp-bar đỏ: dải `h-1.5 bg-[#c8102e]` ở mép trên + label đỏ uppercase `text-[10px] tracking-[0.2em]` → giữ "DNA hóa đơn VN" mà không lấn cả thẻ.
- Accent đỏ chỉ dùng cho: stamp-bar, label "HÓA ĐƠN GTGT", số HĐ, dòng "TỔNG THANH TOÁN". Mọi chỗ khác dùng `foreground` / `muted-foreground` / `border`.
- Watermark sọc đỏ hiện tại → **bỏ** (gây nhiễu trong dark mode).
- Badge ký số: `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400` (giữ như cũ).
- Badge "ĐÃ HUỶ": overlay xoay vẫn dùng, đổi sang `border-destructive text-destructive`.
- Adjustment label (thay thế/điều chỉnh): chip nhỏ `bg-amber-500/10 text-amber-600` thay vì đỏ.

### Typography & spacing

- Title `text-[10px] font-semibold tracking-[0.22em]` đỏ.
- Meta row (Số/Ký hiệu/Ngày): grid 3 cột, label `text-[9px] uppercase muted`, value `text-[11px] font-mono font-semibold foreground`.
- Section labels: `text-[9px] font-semibold uppercase tracking-wider text-muted-foreground` thay cho đỏ.
- Tên NCC/người mua: `text-[12px] font-semibold foreground`.
- Bảng dòng: thêm cột `VAT%` (nếu `vat_rate` có); zebra `even:bg-muted/30` nhẹ; divider `border-border/60`.
- Tổng: dùng `border-t-2 border-border` phía trên, dòng tổng `text-[14px] font-bold text-primary` (hoặc giữ đỏ `#c8102e` để nhất quán brand HĐ — chọn đỏ cho điểm nhấn).
- Padding tổng thể: `p-3.5`, section gap `space-y-2.5`.

### Rich content thêm

- Hiển thị `template` cạnh `series` nếu có: "Mẫu 1/001 · Ký hiệu 1C25TXX".
- Mỗi line item show `vat_rate` (vd `10%`, `KCT`, `KKKNT` map từ số).
- Tách 2 badge: "Đã ký số (NCC)" và "Có mã CQT" — show cả hai khi có cả.
- Footer hiển thị `cqt_code` truncate với `title` tooltip + nút copy nhỏ (icon `Copy` lucide, click → `navigator.clipboard`).
- Tăng số dòng hiển thị từ 4 → 5; "+N dòng khác" giữ nguyên format.

### Tương tác

- Hover toàn card: `hover:border-border hover:shadow-md transition`.
- Click vào header hoặc footer "Tải XML gốc" mở `signedUrl` tab mới (giữ behavior).
- Nút copy mã CQT: `stopPropagation`, toast `sonner` "Đã copy mã CQT".

### Dark mode

- Vì dùng `bg-card` + `text-card-foreground` + `border-border` → tự động đẹp ở dark.
- Đỏ `#c8102e` giữ nguyên hex (đủ contrast trên cả nền sáng và nền `card` tối của app).
- Emerald/amber dùng pattern `text-emerald-600 dark:text-emerald-400` đã chuẩn.

## File thay đổi

1. `src/components/chat/invoice/xml-invoice-preview.tsx` — rewrite render theo spec trên, giữ nguyên props (`data: EinvoiceExtras`, `signedUrl`).
2. `src/components/chat/invoice/invoice-extract-card.tsx`:
   - `md:grid-cols-[300px_1fr]` → `md:grid-cols-[340px_1fr]` khi `isXml`.
   - Ẩn badge "đã ký số / đã xác minh" ngoài khi `isXml && parsed?._einvoice` (vì preview đã có).
   - Ẩn dòng `filename` lặp dưới preview khi `isXml` để gọn (filename đã ngầm hiểu từ "Tải XML gốc").

## Không làm

- Không đổi parser, không đổi schema `EinvoiceExtras`.
- Không đổi luồng upload/stream/chat.
- Không thêm dependency mới (dùng `lucide-react` đã có).

## Kết quả

Preview XML trong chat trông như một "thẻ hóa đơn editorial" — vẫn nhận diện được là HĐ VN nhờ stamp đỏ + tổng tiền đỏ, nhưng phần thân sạch, hợp dark mode, đầy đủ thông tin rich (template/seri, VAT từng dòng, cả 2 badge ký số, mã CQT copy được).
