# Mở rộng splitItemName — các trường hợp cần xử lý thêm

Hiện tại `src/lib/items/split-item-name.ts` đã xử lý: biển số xe, ngày/kỳ tháng, tuyến HCM-HN, "từ X đến Y", số HĐ/LĐX/PO, ngoặc đơn (loại trừ quy cách SP).

Dưới đây là **các nhóm trường hợp thực tế** còn thiếu, gom theo domain. Kế hoạch là bổ sung rule cho từng nhóm, **giữ nguyên kiến trúc** (regex push → working string), thêm test fixtures, không động đến UI.

---

## 1) Điện / Nước / Viễn thông / Internet

Mẫu hay gặp trên hóa đơn EVN, viễn thông:
- `"Tiền điện kỳ 2 tháng 03/2026 - CT 123456 - Công tơ ABC-456"`
- `"Cước Internet FTTH gói F8 tháng 04/2026 - HĐ INET-2026-0412"`
- `"Cước điện thoại số 0903xxx xxx tháng 5/2026"`
- `"Tiền nước sinh hoạt kỳ 04/2026 - Đồng hồ DH-0123"`

**Rule mới cần thêm:**
- `mã KH/CT/HĐ`: `\b(CT|KH|MKH|HĐ|HD|HDT|HĐT)[:#\s-]*[A-Z0-9-]{3,}\b`
- `công tơ / đồng hồ`: `\b(công\s*tơ|đồng\s*hồ|ĐH|CT)\s*[:#-]?\s*[A-Z0-9-]{2,}\b`
- `số điện thoại`: `\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b`
- `gói cước`: `\bgói\s+[A-Z]\d+\b` (gói F8, gói M120…) — đưa vào note, không nuốt vào tên

→ canonical còn lại: "Tiền điện", "Cước Internet FTTH", "Cước điện thoại", "Tiền nước sinh hoạt".

---

## 2) Xăng dầu / Nhiên liệu

- `"Xăng RON 95-III - Trụ 3 - 12.34 lít - BKS 30A-123.45"`
- `"Dầu DO 0,05S-II - 50L - xe 51C-99999"`
- `"Xăng E5 RON92 ngày 12/03/2026"`

**Rule mới:**
- `trụ bơm`: `\btrụ\s*\d+\b`
- `dung tích đo`: `\b\d+([.,]\d+)?\s*(lít|l|L)\b` (chỉ tách khi đứng riêng, **KHÔNG** tách khi nằm trong "RON 95")
- Giữ nguyên `RON 95-III`, `E5 RON92`, `DO 0,05S-II` trong canonical (đây là spec sản phẩm).

→ canonical: "Xăng RON 95-III", "Dầu DO 0,05S-II", "Xăng E5 RON92".

---

## 3) Vé / Phí cầu đường / BOT / ETC

- `"Phí BOT trạm Pháp Vân ngày 12/03/2026 - xe 30A-123.45"`
- `"Vé máy bay VN1234 HAN-SGN ngày 28/01/2026 - hành khách Nguyễn Văn A"`
- `"Phí ETC nạp tài khoản VETC-12345"`
- `"Vé tàu SE1 ghế 23 toa 5 ngày 01/02"`

**Rule mới:**
- `số chuyến bay`: `\b[A-Z]{2}\d{2,4}\b` (VN1234, VJ142) — đặt SAU rule "biển số xe"
- `tên hành khách`: `\bhành\s*khách\s*[:\-]?\s*[^,;]{2,40}` (khó — có thể bỏ qua, để user xoá tay)
- `trạm BOT`: `\btrạm\s+[A-ZĐ][^\s,;]{1,30}` (Pháp Vân, Long Thành…) — match cụm "trạm + tên riêng"
- `số ghế/toa`: `\b(ghế|toa|khoang)\s*\d+\b`

→ canonical: "Phí BOT", "Vé máy bay", "Phí ETC nạp tài khoản", "Vé tàu".

---

## 4) Thuê / Dịch vụ định kỳ

- `"Tiền thuê văn phòng tháng 03/2026 - HĐ TVP-2024-001"`
- `"Phí dịch vụ kế toán quý I/2026"`
- `"Phí bảo trì thang máy kỳ 01-03/2026"`
- `"Phí quản lý tòa nhà tháng 4/2026 - Tầng 5 phòng 502"`

**Rule mới:**
- `quý`: `\bquý\s*(I{1,3}|IV|[1-4])(?:[/-]\d{2,4})?\b`
- `tầng / phòng / căn`: `\b(tầng|phòng|căn|lô|block)\s*[A-Z0-9-]{1,6}\b`

→ canonical: "Tiền thuê văn phòng", "Phí dịch vụ kế toán", "Phí bảo trì thang máy", "Phí quản lý tòa nhà".

---

## 5) Lãi vay / Phí ngân hàng

- `"Lãi vay HĐTD số 12345/2025/HĐTD-NHCT kỳ 03/2026"`
- `"Phí chuyển khoản liên ngân hàng ngày 15/03"`
- `"Phí duy trì tài khoản tháng 03/2026"`

**Rule mới:** mở rộng rule "Số HĐ" để bắt thêm `HĐTD`, `HĐVV`, `HĐMB`, `HĐKT` (đã gần đủ — chỉ cần thêm prefix vào regex hiện có).

→ canonical: "Lãi vay", "Phí chuyển khoản liên ngân hàng", "Phí duy trì tài khoản".

---

## 6) Bảo hiểm / Lệ phí / Thuế

- `"Phí bảo hiểm TNDS xe ô tô 30A-123.45 thời hạn 01/04/2026 - 31/03/2027"`
- `"Lệ phí trước bạ xe 30A-123.45"`
- `"Phí đăng kiểm xe tải 50H-897.69 chu kỳ 6 tháng"`

Đã có rule biển số + khoảng ngày. **Bổ sung:**
- `chu kỳ N tháng/năm`: `\bchu\s*kỳ\s*\d+\s*(tháng|năm)\b`

→ canonical: "Phí bảo hiểm TNDS xe ô tô", "Lệ phí trước bạ xe", "Phí đăng kiểm xe tải".

---

## 7) Vật tư / Sửa chữa có model + serial

- `"Lốp Michelin 195/65R15 - serial MX-2026-001"`
- `"Ắc quy GS 12V-70Ah - model N70 - xe 51C-99999"`
- `"Thay nhớt Castrol 5W-30 4L - km hiện tại 45.678"`

**Cẩn trọng** — đây là điểm khó nhất:
- `195/65R15`, `12V-70Ah`, `5W-30`, `N70` là **spec sản phẩm**, PHẢI giữ trong canonical.
- `serial …`, `model …` (khi giá trị là mã định danh cá biệt) → note.
- `km hiện tại N` → note (số đo lúc thay).

**Heuristic an toàn**: chỉ tách `serial/model` khi giá trị **chứa cả chữ và số và dấu nối** dài ≥ 5 ký tự VÀ **không nằm trong whitelist spec** (R15, V, Ah, W…). Nếu mơ hồ → KHÔNG tách (an toàn hơn là tách nhầm).

→ canonical: "Lốp Michelin 195/65R15", "Ắc quy GS 12V-70Ah model N70" (giữ model vì là spec), "Thay nhớt Castrol 5W-30 4L".

---

## 8) Người / Đối tượng cụ thể

- `"Lương tháng 03/2026 - Nguyễn Văn A - MSNV NV-001"`
- `"Tạm ứng công tác phí Trần Thị B - chuyến HN ngày 05/04"`

**Rule:**
- `MSNV / MNV`: `\b(MSNV|MNV|NV)[:#\s-]*[A-Z0-9-]{2,}\b`
- Tên người ở giữa rất khó tách tự động → **không làm**, để user tự sửa khi cần.

→ canonical: "Lương", "Tạm ứng công tác phí" (kèm note còn lại).

---

## 9) Đơn vị tính lẫn trong tên

Hiện tại đã giữ `(thùng 24)` qua SPEC_IN_PAREN. Mở rộng whitelist:
- `vỉ`, `khay`, `block`, `ream`, `kiện`, `cuộn`, `cây`, `bịch`, `xấp`, `tép`

(thêm vào regex `SPEC_IN_PAREN` hiện có.)

---

## 10) Nhiễu định dạng

- Dấu `*`, `•`, `→`, `=>`, `||` ở đầu/giữa do copy từ Excel.
- Nhiều khoảng trắng, tab, xuống dòng `\n` trong cell.
- Tiền tố `STT.`, `1.`, `01)`, `- ` ở đầu dòng.

**Rule clean-up cuối cùng** (chạy SAU tất cả rule khác, trước khi trả về):
- Strip prefix số thứ tự: `^[\s\-*•]*(\d{1,3}[.)\]]\s*)+`
- Collapse `\s+` → ` `, trim `[-–·,.;:*•|=>→\s]` ở 2 đầu.

---

## Kế hoạch triển khai

1. **`src/lib/items/split-item-name.ts`** — thêm các rule theo thứ tự ưu tiên (cụ thể trước, chung sau). Sắp xếp lại danh sách `RULES` cho đúng thứ tự bóc tách.
2. **Mở rộng `SPEC_IN_PAREN`** — thêm các đơn vị quy cách mới.
3. **Thêm rule clean-up cuối** — strip prefix số thứ tự + ký tự nhiễu.
4. **Test fixtures** — tạo `src/lib/items/__tests__/split-item-name.test.ts` (hoặc inline trong cùng file dưới dạng comment + assertion script) với ~20 case từ mỗi nhóm trên.
5. **Không động đến UI** — `inbox-item-sheet.tsx` và `item-resolution-panel.tsx` đã đọc `canonical_name` + `line_note`, hưởng lợi tự động.

## Out of scope (đề xuất riêng nếu cần)

- **AI fallback**: khi splitter trả `note_parts` rỗng nhưng tên dài > 60 ký tự, gọi Lovable AI gemini-flash-lite tách 1 lần và cache kết quả vào `supplier_item_mappings.canonical_name`. Việc này cần bảng/cột mới — tách thành plan sau.
- **UI cho phép user "khoá" canonical**: 1 nút "Đặt làm tên chuẩn" để ghi đè splitter cho NCC đó. Cũng tách plan riêng.

## Câu hỏi xác nhận

Em đề xuất làm **nhóm 1–4 và 9–10** trước (cover ~80% case thực tế, ít rủi ro nhận diện nhầm). Nhóm 5–8 có heuristic mong manh hơn — anh muốn em làm luôn cả 10 nhóm trong một lượt, hay chỉ làm 1–4 + 9–10 trước rồi xem kết quả với dữ liệu thật?
