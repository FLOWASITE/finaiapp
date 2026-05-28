# Thư viện 2 trục — fix gốc rễ "1 mặt hàng, nhiều TK theo mục đích"

Dùng nguyên spec `TYPEB_ITEMS` + `routeLineItem` anh vừa cấp (21 items, có căn cứ pháp lý 2026). Không tự bịa item, không hard-code lại.

## Tóm tắt thay đổi

| Lớp | Hiện tại | Sau khi fix |
|---|---|---|
| Thư viện | Chỉ Loại A (mặt hàng) | + 21 items Loại B (mục đích) — seed từ spec |
| Resolver | Chỉ match Loại A | `routeLineItem` phân luồng A / B / unknown theo `FLOATING_KEYWORDS` |
| UI sheet | 3 radio hard-code (Hàng bán lại / NVL / Chi phí) | Combobox tra Loại B, mỗi item kèm TK + `citWarning` + `vatOutputRequired` badge |
| Approve | `PURCHASE_PURPOSE_OVERRIDE` map cứng 3 phần tử | Override TK + line_type theo `typeB_item.accountTT99/TT133` |
| Cache | Không | `supplier_item_mappings.purpose_code` → lần 2 cùng NCC + cùng line auto gán |

## 1. Source of truth — spec Loại B (anh đã viết)

Tạo file mới `src/lib/items/typeb-catalog.ts` chứa **đúng nguyên văn** spec anh paste:
- type `TypeBGroup`, `TypeBItem`, `ResolverRoute`
- const `TYPEB_ITEMS` (21 items, 9 nhóm)
- const `FLOATING_KEYWORDS`
- hàm `routeLineItem`, `suggestByGroup`, `getTypeBItem`, `searchTypeB`

Không sửa nội dung. Đây là "luật" — code phải đọc từ đây.

## 2. Migration — bridge spec vào DB

Cần persist để query/cache, không lưu cả object JSON dày trong từng bút toán.

```sql
-- Seed table: 21 items Loại B (global, dùng cho mọi tenant)
CREATE TABLE public.typeb_purpose_catalog (
  code text PRIMARY KEY,                  -- 'CP-PL-LIENHOAN'
  name text NOT NULL,
  group_code text NOT NULL,               -- TypeBGroup
  account_tt99 text NOT NULL,
  account_tt133 text NOT NULL,
  alt_accounts text[] NOT NULL DEFAULT '{}',
  vat_rate numeric NOT NULL,
  vat_deductible boolean NOT NULL,
  cit_deductible boolean NOT NULL,
  cit_cap text,
  cit_warning text,
  vat_output_required boolean NOT NULL DEFAULT false,
  required_docs text[] NOT NULL DEFAULT '{}',
  aliases text[] NOT NULL DEFAULT '{}',
  floating_goods text[] NOT NULL DEFAULT '{}',
  legal_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- GRANT + RLS: ai cũng đọc được (global reference data)
GRANT SELECT ON public.typeb_purpose_catalog TO authenticated, anon;
GRANT ALL ON public.typeb_purpose_catalog TO service_role;
ALTER TABLE public.typeb_purpose_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads typeb catalog" ON public.typeb_purpose_catalog
  FOR SELECT USING (true);

-- Cache học: gắn mục đích cho cặp (NCC, raw_name)
ALTER TABLE public.supplier_item_mappings
  ADD COLUMN IF NOT EXISTS purpose_code text REFERENCES public.typeb_purpose_catalog(code);
CREATE INDEX IF NOT EXISTS idx_sim_purpose ON public.supplier_item_mappings(purpose_code);
```

Seed 21 rows từ `TYPEB_ITEMS` bằng `supabase--insert` (chạy sau khi migration approve).

## 3. Resolver — cắm `routeLineItem` vào pipeline thật

File `src/lib/items/resolver.server.ts`:
- Sau Layer 1 (cache) và Layer 2 (fuzzy), thêm bước gọi `routeLineItem(rawName, hasTypeAExactMatch, hasCacheHit)`.
- Nếu kết quả là `route: 'typeB'` → trả về `ResolveResult` mới có `status: "needs_purpose"` + `typebCandidates: TypeBItem[]` (top 3–5 từ `candidates`).
- Nếu cache hit có `purpose_code` → load từ `typeb_purpose_catalog`, override `stock_account`/`expense_account` = `account_tt99` (hoặc TT133 tuỳ `tenants.accounting_standard`), bỏ qua bước hỏi.

File `src/lib/items/resolve-line-kind.server.ts`:
- Thêm priority L0.5 (trên L1 product): nếu line có `purpose_code` đã chốt → kind + account lấy từ Loại B (TK 6428 → `service`, 811 → `service`, 153 → `ccdc`, v.v. — map sẵn 1 bảng nhỏ trong file).

## 4. Schema KTV xác nhận

`src/lib/ai/inbox-types.ts`:
- **Xoá** `PURCHASE_PURPOSE_MAP` 3 phần tử cứng + `PURCHASE_PURPOSE_SWAPPABLE_ACCOUNTS`.
- Đổi `PurchasePurpose` từ enum 3 giá trị → `{ purpose_code: string; account: string; line_type: string; vat_output_required: boolean; cit_warning?: string }`.
- Thêm field cho line: `needs_purpose?: boolean; typeb_candidates?: Array<{ code, name, account, cit_warning, vat_output_required }>`.

## 5. UI — thay block 3 radio bằng PurposePicker

File mới `src/components/inbox/purpose-picker.tsx` (combobox shadcn):
- Query server fn `listTypeBCatalog({ floatingHint: line.name })` → trả về candidates (top từ resolver) + full list.
- Render:
  - Top section "Fin gợi ý cho line này": 2–3 item từ `routeLineItem.candidates`, mỗi item hiện `name · TK xxx · badge cảnh báo`.
  - Search box → `searchTypeB(query)`.
  - Khi chọn 1 item → callback `onSelect({ purpose_code, account, line_type, vat_output_required, cit_warning })`.
  - Hiển thị inline `cit_warning` ngay dưới item đã chọn (vd. "Cộng dồn với phúc lợi khác, vượt 1 tháng lương BQ → không trừ").
  - Nếu `vat_output_required` → banner cam **"⚠ Quà tặng KH — phải xuất HĐ VAT đầu ra"**.

File `src/components/inbox/inbox-item-sheet.tsx`:
- Xoá block 3 radio hiện tại.
- Với mỗi line có `needs_purpose: true` → render `<PurposePicker>` ngay dưới line trong "KHỚP MẶT HÀNG".
- Khi user chọn → cập nhật `workingItem` (line_type + debit_account), trigger lại tính bút toán đề xuất.
- Nếu cả invoice có ≥ 1 line `needs_purpose` chưa chọn → disable nút "Duyệt" + label "Chọn mục đích cho N dòng".

## 6. Approve handler — đọc Loại B thay vì map cứng

File `src/lib/inbox-ai.functions.ts`:
- `ApproveInput` đổi `purchase_purpose` thành mảng: `z.array(z.object({ line_id, purpose_code, account, line_type })).optional()`.
- Bỏ const `PURCHASE_PURPOSE_OVERRIDE`. Thay bằng: với mỗi line có `purpose_code` → fetch row từ `typeb_purpose_catalog` 1 lần (cache trong handler), override `debit_account = account_tt99` (hoặc TT133), `line_type` map từ account.
- Sau khi tạo voucher xong → upsert `supplier_item_mappings(supplier_id, raw_name, product_id, purpose_code)` để lần sau auto.
- Nếu `vat_output_required` → ghi 1 followup task "Tạo HĐ VAT đầu ra biếu tặng cho ..." vào `inbox_followups`.

## 7. Không đụng

- OCR / extract, KHỚP MẶT HÀNG, đối soát hoá đơn, layout sheet hiện tại.
- Schema `tenant_product_catalog` (Loại A) — giữ nguyên.
- Auth / RLS pattern hiện có.

## 8. Thứ tự thực hiện

1. Tạo `typeb-catalog.ts` (paste nguyên spec anh cấp).
2. Migration: `typeb_purpose_catalog` + cột `purpose_code` trên `supplier_item_mappings` → user approve.
3. `supabase--insert`: seed 21 rows từ `TYPEB_ITEMS`.
4. Server fn `listTypeBCatalog`, cập nhật resolver trả `needs_purpose`.
5. Refactor `inbox-types.ts` + viết `PurposePicker`.
6. Cắm picker vào `inbox-item-sheet.tsx`, xoá block 3 radio.
7. Cập nhật `approveInboxItem`: đọc Loại B, ghi cache, sinh followup VAT đầu ra.
8. QA E2E: Tấm Bakery (bánh kem) lần 1 chọn "Liên hoan NV (6428)" → lần 2 cùng NCC auto gán 6428, không hỏi lại.

## Câu hỏi xác nhận trước khi build

1. **Tiêu chuẩn kế toán**: lấy `account_tt99` hay `account_tt133` dựa trên `tenants.accounting_standard` đúng không? (hiện DB đã có cột này — em sẽ đọc).
2. **Quyền** sửa/tạo item Loại B mới: em đề xuất Loại B là **global, read-only** (vì có căn cứ pháp lý). Tenant muốn override → dùng cơ chế Mục của tôi (Loại A) như cũ. Anh OK chứ?
3. **Followup VAT đầu ra**: tự tạo task ở `inbox_followups` (anh approve voucher xong sẽ thấy 1 mục cần làm), hay chỉ hiện cảnh báo trong sheet rồi để KTV tự nhớ?
