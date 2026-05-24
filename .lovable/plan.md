
# Memory Graph — Phase 2: kết nối DB thật

Thay mock `sampleRules` + `sampleVendors` + `sampleAccounts` bằng dữ liệu thật từ Supabase, và lưu vị trí layout user kéo thả.

## Khác biệt schema cần xử lý

Bảng `ai_memory_rules` hiện đang là **v1** (text-based: `title`, `when_text`, `then_text`, `type: suggestion|active|disabled`), trong khi `Rule` type ở frontend là **v2** (IF/AND/OR/THEN có `conditions[]`, `actions[]`, `mode`, `confidence_threshold`…).

Phase 2 KHÔNG migrate v1→v2 (phạm vi lớn, để sau). Thay vào đó, **adapter** sẽ map row v1 → cấu trúc tối thiểu đủ render graph:
- `name` ← `title`
- `mode` ← `type === "active" ? "auto" : type === "suggestion" ? "suggest" : "disabled"`
- `source` ← `source === "user-taught" ? "user_taught" : "ai_learned"`
- `status` ← `type === "disabled" ? "paused" : "active"`
- `conditions`/`actions` ← **rỗng** (graph cần extract vendor/account theo cách khác — xem dưới)
- `applied_count`/`correct_count` ← `applied_count`/`accuracy_correct`

## Extract vendor/account khi không có conditions/actions có cấu trúc

Vì rule v1 chỉ có text, không có field rõ ràng để build edge. Sẽ extract theo:

1. **Account refs** — regex `\b(1[0-9]{2,3}|2[0-9]{2,3}|[3-9][0-9]{2})\b` (3-4 chữ số bắt đầu 1-9) trên cả `when_text + then_text`. Khớp với `account_period_balances.account_code` (hoặc danh sách TK chuẩn VAS hardcoded).
2. **Vendor refs** — fuzzy match (substring, lowercase, bỏ dấu) `when_text` với `suppliers.name`. Bonus: nếu rule có `ai_memory_partners` row với `display_name` chứa supplier → link mạnh hơn.
3. **`ai_memory_partners`** — bảng này đã có sẵn `default_account` + `party_id` (uuid trỏ về supplier). Đây là **nguồn edge tin cậy nhất**: vendor → account (qua partner row), không cần regex.
4. **`ai_line_classifications`** — vendor (qua `supplier_id`) → account (`account`). Cho phép vẽ "hàng hóa của vendor X mặc định vào TK Y" — đẹp cho insight.

## Server function

Tạo `src/lib/graph/memory-graph.functions.ts`:

```ts
export const getMemoryGraphData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [rules, suppliers, partners, classifications] = await Promise.all([
      supabase.from("ai_memory_rules").select("*").in("type", ["active","suggestion","disabled"]),
      supabase.from("suppliers").select("id,name,tax_id,industry_code,default_expense_account").eq("is_active", true).limit(200),
      supabase.from("ai_memory_partners").select("id,party_id,display_name,default_account,sample_count,confidence"),
      supabase.from("ai_line_classifications").select("supplier_id,line_name,kind,account,hit_count").limit(300),
    ]);
    return { rules, suppliers, partners, classifications };
  });
```

Tất cả dữ liệu đều scope theo `tenant_id` qua RLS — server fn không cần filter thêm.

## Adapter ở frontend

Tạo `src/lib/graph/adapt-db.ts`:

```ts
export function adaptDbToGraph(input: GraphDbData): GraphBuildInput {
  // 1. Map ai_memory_rules → Rule (lite)
  const rules: Rule[] = input.rules.map(rowToRule);

  // 2. Build vendors từ suppliers
  const vendors: VendorEntity[] = input.suppliers.map(s => ({
    id: s.id, name: s.name, tax_id: s.tax_id ?? undefined,
    industry: s.industry_code ?? undefined,
  }));

  // 3. Build accounts: union từ
  //    - default_expense_account (suppliers)
  //    - default_account (partners)
  //    - account (classifications)
  //    - regex extract từ rules.then_text/when_text
  const accountSet = new Set<string>();
  // … gom code
  const accounts = Array.from(accountSet).map(code => ({
    id: `a-${code}`, code, name: VAS_ACCOUNTS[code] ?? `TK ${code}`,
  }));

  return { rules, vendors, accounts };
}
```

Mở rộng `buildGraph` (`src/lib/graph/build-graph.ts`) để **chấp nhận edge "ngoài rule"**:
- Partner-edge: `vendor → account` (trực tiếp, label "mặc định", màu xanh nhạt, không qua rule).
- Classification-edge: `vendor → account` (label "hàng hóa", đứt nét xám).

Hiện `buildGraph` chỉ tạo edge từ rule conditions/actions; sẽ thêm tham số `extraEdges` (vendor→account) để bổ sung.

## Lưu layout user kéo thả

Thêm migration tạo bảng `ai_memory_graph_layout` (1 row / user / tenant):
```sql
CREATE TABLE public.ai_memory_graph_layout (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  positions jsonb NOT NULL DEFAULT '{}'::jsonb, -- { nodeId: {x,y} }
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);
-- RLS: chỉ owner đọc/ghi.
```

Server fn:
- `getGraphLayout()` — đọc positions.
- `saveGraphLayout({ positions })` — upsert.

Frontend: debounce 600ms trên `onNodeDragStop` → gọi `saveGraphLayout`. Khi load: nếu node có position lưu → dùng; nếu chưa → fallback dagre auto.

## UI ở frontend

Sửa `MemoryGraph.tsx`:
- Bỏ `useRuleStore` cho graph, thay bằng `useQuery(['memory-graph'], getMemoryGraphData)`.
- Loading state: skeleton fullscreen.
- Empty state: nếu < 1 rule + < 1 supplier → hiện CTA "Chưa có dữ liệu — bắt đầu chat với AI để xây trí nhớ" thay vì graph rỗng.
- Khi click **rule node**, sidebar mở chi tiết rule **v1 text** (when_text / then_text plain) thay vì conditions builder.
- Nút "Sửa quy tắc" trên sidebar → mở dialog `EditRuleDialog` đã có sẵn trong `ai.memory.tsx` (re-use), không dùng `RuleEditor` v2.

## Files tạo / sửa

Tạo mới:
- `src/lib/graph/memory-graph.functions.ts` — server fn fetch + save layout.
- `src/lib/graph/adapt-db.ts` — DB → GraphBuildInput.
- `src/lib/graph/vas-accounts.ts` — map mã TK VAS → tên TK (cache cứng cho hiển thị).
- `supabase/migrations/...` — bảng `ai_memory_graph_layout` + RLS.

Sửa:
- `src/lib/graph/build-graph.ts` — thêm `extraEdges` để render partner/classification edges.
- `src/components/ai-memory/graph/MemoryGraph.tsx` — dùng `useQuery`, persist layout, loading/empty states, dispatch sang dialog edit rule v1.
- `src/components/ai-memory/graph/GraphSidebar.tsx` — branch render cho rule v1 (text) vs v2 (structured).
- `src/components/ai-memory/graph/GraphLegend.tsx` — thêm chú thích cho partner edge & classification edge.

Giữ nguyên:
- `src/data/sampleEntities.ts`, `src/data/sampleRules.ts` — vẫn dùng cho tab Rules-v2 prototype.

## Phạm vi

- Frontend đọc/ghi qua server fn, không gọi supabase trực tiếp từ component.
- RLS đảm bảo dữ liệu cross-tenant không leak.
- Không migrate rule v1 → v2 (việc đó tách thành plan riêng nếu cần).
- Realtime auto-refresh khi rule thay đổi: dùng channel `ai-memory-live` đã có ở `ai.memory.tsx`, chỉ thêm invalidate `['memory-graph']`.
