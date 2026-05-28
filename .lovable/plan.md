
# Redesign panel "Đề xuất của Fin"

Chỉ sửa duy nhất phần body của `InboxItemSheetDetail` trong `src/components/inbox/inbox-item-sheet.tsx` (dòng 315–475). Không động vào server function, schema, hay logic confidence.

## Thứ tự mới (top → bottom)

```
┌─ Header: Đề xuất của Fin · [Phiếu mua hàng]
├─ Summary: Đối tác · Số tiền · ngày                (giữ)
├─ ① Tin cậy 60% — cần xác nhận                   (MỚI: confidence breakdown)
│    ✓ Mặt hàng khớp 99%
│    ⚠ NCC mới — chưa có trong hệ thống (−25%)
│    ❓ Mục đích mua chưa rõ (−15%)
├─ ② BÚT TOÁN ĐỀ XUẤT                              (lên trên — Vấn đề 1)
│    Nợ 156 … 9.888.000
│    Có 331 … 9.888.000
│    ⓘ Nông sản chưa chế biến — không chịu VAT     (Vấn đề 4)
├─ ③ Mục đích mua hàng này? (nếu ambiguous)        (MỚI — Vấn đề 3)
│    ◉ Hàng hoá bán lại → TK 156  (Fin đoán)
│    ○ Nguyên liệu → TK 152
│    ○ Chi phí sự kiện/trang trí → TK 642
├─ ④ Khi duyệt, Fin sẽ tự tạo:                     (gộp + làm rõ — Vấn đề 5)
│    🏪 NCC: … (Sửa)
│    📦 2 mặt hàng mới · TK 156 · 99% (Xem)
├─ ⑤ ▸ Đối chiếu hoá đơn gốc (collapsed)           (Vấn đề 6: gộp meta + items)
├─ Reasoning summary (nếu có)
├─ Blocker / chat history
└─ Footer: [Duyệt & ghi sổ — tự tạo NCC + 2 mặt hàng]  (CTA nói rõ side-effect)
         [Sửa] [Bỏ qua]
         [Áp dụng quy tắc cho tương lai]
```

## Thay đổi từng section

### A. Confidence breakdown (Vấn đề 2)
Block mới ngay dưới Summary, dùng tone amber khi <80, emerald khi ≥80:
- Header: `Tin cậy {n}% — cần anh xác nhận` (hoặc "rất đáng tin" khi ≥80)
- List dòng = `item.reasoning.signals` (đã có sẵn từ server) — render với icon ✓/⚠/❓ và label. Nếu signal có field `weight` thì append `(±xx%)`; nếu không thì chỉ hiện label. Không tạo signal mới ở client.
- Phải khớp số tổng với `confidence` trong header → không sửa source data, chỉ render lại.

### B. Bút toán đề xuất (Vấn đề 1)
Di chuyển block hiện có (lines 396–437) lên ngay dưới breakdown. Giữ nguyên markup grid.
- Thêm dòng note ngay dưới khi VAT = 0 (Vấn đề 4):
  - Điều kiện: `meta.vat_amount == 0 && meta.subtotal > 0` → hiện banner info nhỏ: "ⓘ Nông sản chưa chế biến — không chịu VAT (Điều 5 Luật thuế GTGT)".
  - Text fallback chung: "ⓘ Hoá đơn không có VAT đầu vào để khấu trừ" khi không detect được nông sản.
  - Detect nông sản dựa trên item name keyword (hoa, rau, củ, quả, …) — chỉ là gợi ý tone, không đổi logic kế toán.

### C. Mục đích mua hàng (Vấn đề 3)
Block mới, **chỉ render khi**:
- Voucher kind = purchase_voucher
- Có line debit thuộc {156, 152, 153, 642, 211, 213, 242}
- Có ≥2 lựa chọn hợp lý → frontend heuristic đơn giản: nếu tài khoản đoán ∈ {156, 152, 642} thì show 3 option đó.

UI: radio group, option Fin đoán = checked + chip "(Fin đoán)". Khi user đổi → gọi `onEdit(item)` mở voucher editor (KHÔNG tự sửa bút toán trong panel — giữ scope UI-only).
Out-of-scope: persist lựa chọn này thành rule; chỉ điều hướng sang flow chỉnh sửa hiện có.

### D. "Khi duyệt, Fin sẽ tự tạo" (Vấn đề 5)
Refactor `MissingMasterDataPanel`:
- Đổi tiêu đề từ "CẦN TẠO MỚI VÀO HỆ THỐNG" → "Khi duyệt, Fin sẽ tự tạo"
- Bỏ 3 nút "Tạo mới" rời rạc; mỗi dòng còn nút phụ "Sửa" / "Xem" (link sang sheet chi tiết NCC/mặt hàng — đã có). Việc tạo thực tế dồn về CTA chính.
- CTA chính ở footer đổi label động: `Duyệt & ghi sổ — tự tạo NCC + N mặt hàng` (khi có missing) hoặc giữ "Duyệt & ghi sổ" như cũ.

### E. Đối chiếu hoá đơn gốc (Vấn đề 6)
- Gói `VoucherMetaGrid` + `ProposalItemsList` + `ReconciliationPanel` (hoặc chỉ 2 cái đầu) vào 1 `<details>` collapsible, mặc định đóng.
- Tiêu đề: `▸ Đối chiếu hoá đơn gốc (N dòng · {tổng tiền})`.
- `ItemResolutionPanelWrapper` giữ nguyên vị trí ngoài (vì nó hành động được, không phải repeat data).

### F. Trust strip (Vấn đề 7)
Bỏ block lines 370–387. Gom các check thành 1 dòng compact đặt ngay TRÊN nút "Duyệt & ghi sổ" trong footer:
`✓ OCR đầy đủ · ✓ Phân loại 2 dòng · ⚠ NCC mới` — chip nhỏ nhưng cạnh CTA để KTV scan trước khi bấm.

## Phạm vi
- 1 file: `src/components/inbox/inbox-item-sheet.tsx`
- Có thể tách 2–3 sub-component nội bộ cùng file: `ConfidenceBreakdown`, `PurposePicker`, `VatExplain`.
- Không đổi props của `InboxItemSheetDetail`, không đổi `InboxItem` type, không đổi server function.

## Out of scope
- ProposalCard ở `/categorize` (giữ nguyên)
- Persist lựa chọn "mục đích mua" thành rule/memory
- Thay đổi cách tính confidence ở server
- Tự động post bút toán khi đổi mục đích
