# Trả lời 5 câu hỏi trước khi vào plan

Em đã đọc schema thực tế của `products`, `invoice_lines`, `supplier_item_mappings`. Trả lời thẳng:

1. **TK 242 prepaid allocation** — chưa có cron. Hiện chỉ ghi `Nợ 242 / Có 331` lúc nhập, không phân bổ định kỳ. → Backlog P2.
2. **Manual override** — `invoice_lines` KHÔNG có cột `manual_account` / `user_override_kind`. KTV chỉ sửa được ở bước `approveJournalEntry` (lines của journal), không tag được vào invoice_line. → Cần thêm ở P0.
3. **Confidence per line** — KHÔNG lưu. Chỉ có ở `supplier_item_mappings.confidence` (mapping-level), không có ở `invoice_lines`. Resolver trả `confidence` nhưng đang bị throw away. → P1.
4. **L2 fuzzy** — text-only (textSim trong `resolver.server.ts`, có embeddings rerank). Chưa multi-signal (supplier_history, amount_range, frequency). → P1.
5. **Master ↔ tenant versioning** — không. `promoteCatalogToProduct` copy 1 chiều, không lưu `source_catalog_id` để diff sau này. → P2.

Thêm 1 phát hiện CRITICAL anh chưa biết:

> **`products.item_type` CHECK constraint chỉ cho phép `('goods','service','combo')`** — không có `material`, `ccdc`, `fixed_asset`, `prepaid`. Nghĩa là dù em viết `mapItemTypeToLineKind('ccdc')` thì DB cũng không lưu được. Trước khi fix Vấn đề 1, phải mở rộng enum này.

---

# Plan P0 — Sprint hiện tại

Scope: fix Vấn đề 1 (line_type sync) + Vấn đề 4 (L0 manual override). Đây là 2 thứ em đề xuất P0, low effort, high impact.

## 1. Migration — mở rộng item_type + thêm cột

```sql
-- 1a. Drop CHECK cũ, thêm các loại VAS
ALTER TABLE public.products DROP CONSTRAINT products_item_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_item_type_check
  CHECK (item_type IN ('goods','service','combo','material','ccdc','fixed_asset','prepaid'));

-- 1b. Cột override + confidence ở invoice_lines (cho P0 + chuẩn bị P1)
ALTER TABLE public.invoice_lines
  ADD COLUMN user_override_kind text
    CHECK (user_override_kind IN ('goods','ccdc','asset','service')),
  ADD COLUMN resolved_kind text
    CHECK (resolved_kind IN ('goods','ccdc','asset','service')),
  ADD COLUMN resolved_account text,
  ADD COLUMN resolution_source text
    CHECK (resolution_source IN ('manual','product','classify','none')),
  ADD COLUMN resolution_confidence numeric(5,2);
```

Lưu ý: tạm thời giữ `line_type` cho backward compat (journal.functions.ts đang đọc). Resolved_kind sẽ là source of truth mới; line_type sẽ deprecate sau.

## 2. Helper mới — `src/lib/items/resolve-line-kind.server.ts`

```ts
export type LineKind = "goods" | "ccdc" | "asset" | "service";

export function mapItemTypeToLineKind(itemType: string | null): LineKind {
  switch (itemType) {
    case "material":    return "goods";   // 152
    case "ccdc":        return "ccdc";    // 153 — tách khỏi goods để journal biết
    case "goods":       return "goods";   // 156
    case "fixed_asset": return "asset";   // 211/213
    case "prepaid":     return "service"; // 242 — chưa có lifecycle, tạm gom service
    case "service":     return "service";
    case "combo":       return "goods";
    default:            return "goods";
  }
}

export async function resolveLineKind(
  supabase, line: { id; product_id; user_override_kind?; description; unit_price; amount; qty; unit }
): Promise<{ kind: LineKind; source: "manual"|"product"|"classify"; confidence: number; account: string }> {
  // P0 — manual override
  if (line.user_override_kind) {
    return { kind: line.user_override_kind, source: "manual", confidence: 100,
             account: defaultAccountForKind(line.user_override_kind) };
  }
  // P1 — product knowledge
  if (line.product_id) {
    const { data: p } = await supabase.from("products")
      .select("item_type, stock_account, expense_account").eq("id", line.product_id).single();
    if (p) {
      const kind = mapItemTypeToLineKind(p.item_type);
      const account = p.stock_account ?? p.expense_account ?? defaultAccountForKind(kind);
      return { kind, source: "product", confidence: 95, account };
    }
  }
  // P2 — classify-line fallback
  const c = classifyLine(line);
  return { kind: mapClassifyToKind(c.kind), source: "classify", confidence: c.confidence,
           account: c.account };
}
```

## 3. Patch `journal.functions.ts` — `approveJournalEntry`

Trong vòng `for (const line of invLines ?? [])`:

- Trước khi check `line.line_type === "asset"` / `=== "goods"`, gọi `resolveLineKind()` lấy `kind` mới.
- Dùng `kind` thay cho `line.line_type`.
- Write back vào invoice_lines: `resolved_kind`, `resolved_account`, `resolution_source`, `resolution_confidence` (để audit).

Hệ quả ngay:
- PC gaming 35tr với product.item_type='ccdc' → kind='ccdc' → KHÔNG vào fixed_assets, KHÔNG khấu hao.
- Lot NVL 80tr với product.item_type='material' → kind='goods' → vào stock_movements TK 152.
- KTV chọn override='service' trên UI → bỏ qua product, đi thẳng 642x.

## 4. UI — thêm dropdown override ở `item-resolution-panel.tsx`

Sau khi resolver đề xuất, hiển thị badge nhỏ "Đổi loại" với 4 lựa chọn (Hàng/CCDC/TSCĐ/Dịch vụ). Click → PATCH `invoice_lines.user_override_kind`. Re-run resolveLineKind → update preview bút toán.

## 5. Không động vào (giữ cho sprint sau)

- Refactor split stock_account/asset_account/prepaid_account (Vấn đề 2) — schema change lớn, đụng nhiều report. P1.
- TK 242 cron amortization (Vấn đề 3) — feature mới. P2.
- Multi-signal fuzzy (Vấn đề 6) — cần data lịch sử đủ lớn. P1.
- Mapping decay (Vấn đề 7) — không gấp khi user base còn nhỏ. P2.

---

# Diagram resolveLineKind

```text
invoice_line
   │
   ├─ user_override_kind set? ──► [MANUAL]   conf=100
   │
   ├─ product_id set?
   │     │
   │     └─► products.item_type ──► mapItemTypeToLineKind
   │                                 ├─ material    → goods   (152)
   │                                 ├─ ccdc        → ccdc    (153)
   │                                 ├─ goods       → goods   (156)
   │                                 ├─ fixed_asset → asset   (211/213)
   │                                 ├─ prepaid     → service (242)
   │                                 └─ service     → service (6xx)
   │                                              conf=95 [PRODUCT]
   │
   └─ classifyLine(text+amount+unit) ──► fallback   conf≈30-70 [CLASSIFY]
                                              ↓
                              persist resolved_kind, resolved_account,
                              resolution_source, resolution_confidence
                                              ↓
                                  journal.functions.ts đọc → bút toán
```

# Effort

- Migration: 15 phút
- resolve-line-kind.server.ts: 30 phút
- Patch journal.functions.ts: 20 phút
- UI override dropdown: 30 phút
- Test EVN + PC 35tr + NVL 80tr: 30 phút

**Tổng ~2 tiếng**. Eliminate 80% rủi ro hạch toán sai như anh nói.

Anh approve plan này thì em vào build mode triển khai.
