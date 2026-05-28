# Fix routing Loại B — chặn dịch vụ rõ bản chất + siết floating

## Mục tiêu

Hoá đơn vận chuyển/điện/nước/internet/thuê/bảo hiểm KHÔNG bị đẩy vào luồng "chọn mục đích chi" (Loại B). Floating keyword "nước" không còn match bừa.

## 1. `src/lib/items/route-line.ts` (mới)

Module shared client+server:

- `CLEAR_SERVICE_PATTERNS: string[]` — các phrase đã normalize (NFD→strip→đ→d→lower):
  - vận chuyển, vận tải, cước vận chuyển, cước, logistics, giao hàng, ship
  - tiền điện, hoá đơn điện, điện năng
  - tiền nước sạch, nước sạch, hoá đơn nước
  - internet, cáp quang, viễn thông, đường truyền
  - thuê mặt bằng, thuê nhà, thuê văn phòng, thuê kho, thuê xe
  - phí ngân hàng, lãi vay
  - grab, taxi, be, gojek
  - bảo hiểm
  - lệ phí, phí nhà nước
- `containsPhrase(haystackNorm, phraseNorm): boolean` — dùng RegExp `\b...\b` trên chuỗi đã `normalizeName`. Phrase cũng `normalizeName` để đồng bộ. Escape regex.
- `classifyRoute({ description, itemNames }): { route: "typeA" | "unknown"; reason?: string; matched?: string }`:
  - Concat `description + " " + itemNames.join(" ")` → `normalizeName`.
  - Loop `CLEAR_SERVICE_PATTERNS`: hit đầu tiên → `{ route: "typeA", matched, reason: "Dịch vụ rõ bản chất: ${matched}" }`.
  - Không match → `{ route: "unknown" }`.

## 2. `src/lib/inbox-ai.functions.ts` — sửa `suggestPurchasePurpose`

Tại đầu hàm (sau khi gom description + itemNames):

```ts
const routed = classifyRoute({ description, itemNames });
if (routed.route === "typeA") {
  return { candidates: [], route: "typeA", reason: routed.reason };
}
```

Trong vòng match floating (đang dùng `FLOATING_KEYWORDS` / `floating_goods` từ catalog):
- Thay substring `.includes()` bằng `containsPhrase(hayNorm, kwNorm)`.
- Trước khi accept một floating match, gọi lại `classifyRoute` (đã làm trên đầu — chỉ check biến `routed`).
- Whitelist riêng `bia`, `ruou`: vẫn cho match dù ≤3 ký tự.
- Bỏ keyword nào sau normalize có length < 2.

Trả về thêm field `route` để client biết.

## 3. Migration — làm sạch `typeb_purpose_catalog.floating_goods`

Một migration idempotent:

```sql
UPDATE public.typeb_purpose_catalog
SET floating_goods = sub.cleaned
FROM (
  SELECT code,
    (SELECT array_agg(DISTINCT x) FROM unnest(
      array_remove(floating_goods, 'nước')
      || ARRAY['nước suối','nước uống','nước đóng chai','nước khoáng']
    ) AS x WHERE length(x) >= 2) AS cleaned
  FROM public.typeb_purpose_catalog
  WHERE 'nước' = ANY(floating_goods)
) sub
WHERE typeb_purpose_catalog.code = sub.code;
```

(Cùng pattern có thể áp cho các token ≤2 ký tự nếu phát hiện — kiểm tra trước bằng `read_query`, không xoá mù.)

## 4. UI `src/components/inbox/inbox-item-sheet.tsx` — PurposePicker

- Nhận thêm `route` từ resolver output.
- Khi `route === "typeA"` và user chưa chọn `purchase_purpose`:
  - Ẩn block "Mục đích chi".
  - Hiển thị link nhỏ: "Đây là chi phí có mục đích cụ thể? Chọn mục đích →" → click mở picker (state `forceShow`).
- Bỏ auto-highlight option đầu tiên: dùng `<Command value="" onValueChange={() => {}}>` hoặc set `defaultValue` sang sentinel không tồn tại.
- Trong `PurposeRow`: thêm tên ngắn TK qua `ACCOUNT_SHORT_NAME` map cục bộ:
  ```ts
  const ACCOUNT_SHORT_NAME: Record<string,string> = {
    "6422": "CP QLDN", "6421": "CP NV QLDN", "6428": "CP bằng tiền khác",
    "642": "CP QLDN", "641": "CP bán hàng", "811": "CP khác",
    "153": "CCDC", "152": "NVL", "156": "Hàng hoá", "242": "CP trả trước",
    "211": "TSCĐ HH", "213": "TSCĐ VH", "627": "CP SXC",
  };
  ```
  Render: `TK 6422 · CP QLDN`.
- Footer popover: nút text "❌ Không phải chi phí mục đích — đây là dịch vụ/hàng hoá" → `onChange(undefined)`, đóng popover, `setForceShow(false)`.

## 5. Test fixtures — `src/lib/items/__tests__/route-line.test.ts`

Regression guard với vitest:

- `normalizeName('Tiền Nước Sạch')` → `'tien nuoc sach'`
- `containsPhrase('tien nuoc sach thang 5','nuoc sach')` → true
- `containsPhrase('mua nuoc ngot','nuoc sach')` → false
- `classifyRoute({ description: 'Vận chuyển hàng từ VP đến Bình Giã', itemNames: ['Thực phẩm rau củ'] })` → `typeA`
- Cases → `typeA`: tiền điện T5, nước sạch sinh hoạt, internet VNPT, cước Grab, thuê văn phòng, bảo hiểm xe, lãi vay, phí chuyển khoản, logistics đầu vào.
- Cases → `unknown`: bánh kem sinh nhật, quà tặng khách hàng, máy in HP, bia Heineken (để Loại B xử lý ở bước sau).

## Out of scope

- Không refactor scoring Loại B.
- Không thêm "Cước vận chuyển/Logistics" vào Loại A catalog.
- Không sửa logic kế toán của Fin (Image 1 đang đúng).
- Không đụng `MissingMasterDataPanel`, schema DB ngoài cột `floating_goods`.

## Thứ tự thực hiện

1. Tạo `route-line.ts` + test fixtures, chạy vitest đỏ trước.
2. Cắm `classifyRoute` vào `suggestPurchasePurpose`, đổi floating match sang `containsPhrase`. Test xanh.
3. Migration làm sạch `floating_goods` (kèm `read_query` xác nhận trước).
4. UI: hide block khi `typeA`, bỏ auto-highlight, thêm TK short name, thêm escape hatch.
5. QA hoá đơn vận chuyển trong Image 1 → không còn hỏi mục đích chi.
