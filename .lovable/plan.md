
# Memory Graph view — Trí nhớ AI

Thêm tab mới **"Sơ đồ trí nhớ"** vào trang `/ai/memory`, trực quan hoá toàn bộ "bộ não" của AI dưới dạng đồ thị tương tác: rules, đối tác (vendors), tài khoản kế toán, hàng hoá/DV — và cách chúng liên kết với nhau qua các quy tắc IF/AND/OR/THEN.

## Mục tiêu

1. **Một cái nhìn toàn cảnh** — người dùng thấy ngay AI "biết gì" và các mối liên hệ giữa chúng (vendor nào dẫn về tài khoản nào, rule nào chi phối nhiều vendor…).
2. **Phát hiện vấn đề trực quan** — node cô lập (chưa có rule), cụm chồng chéo (nhiều rule cùng vendor → xung đột), rule "chết" (chưa từng dùng).
3. **Điều hướng nhanh** — click node mở chi tiết / sửa rule / xem vendor.

Phase 1 dựng prototype frontend bằng mock data (mở rộng từ `sampleRules.ts`), chưa kết DB.

## Thư viện

Dùng **React Flow** (`@xyflow/react`) — chuẩn cho graph tương tác, hỗ trợ pan/zoom/minimap, custom node, layout sẵn. Layout tự động bằng **dagre** (`@dagrejs/dagre`) — đơn giản, ổn định, không nặng như elkjs.

## Data model

Tạo `src/lib/graph/build-graph.ts`:
- Input: `Rule[]` (từ sampleRules) + danh sách mock `vendors[]`, `accounts[]`, `goods[]` (extract từ rule conditions/actions).
- Output: `{ nodes: GraphNode[], edges: GraphEdge[] }` cho React Flow.

Node types:
- `rule` (tím #4F46C7) — hiển thị tên rule, mode badge (auto/suggest), accuracy %.
- `vendor` (xanh #0F6E56) — tên NCC + count rules liên quan.
- `account` (cam #BA7517) — mã TK + tên.
- `goods` (xám) — hàng hoá/DV đã phân loại (Phase 2, ẩn ban đầu).

Edge types:
- `rule → vendor`: rule có condition về vendor.
- `rule → account`: rule có action `book` với debit/credit.
- Màu edge: xanh nếu rule active+auto, xám nhạt nếu suggest, đỏ đứt nét nếu paused.
- Độ dày edge ~ `applied_count` (1px → 4px).

## UI

`src/components/ai-memory/graph/MemoryGraph.tsx` — container chính:

```text
┌──────────────────────────────────────────────────────┐
│ [Filter chips: All ▾] [Mode: auto/suggest/paused]   │
│ [Search nodes…]                          [Reset view]│
├──────────────────────────────────────────────────────┤
│                                                      │
│         ┌──Vendor──┐                                 │
│         │ Grab     │──┐                              │
│         └──────────┘  │                              │
│                       ▼                              │
│              ┌──Rule──────┐    ┌──Account──┐         │
│              │ R-002 auto │───▶│ 641       │         │
│              └────────────┘    └───────────┘         │
│                                                      │
│         [MiniMap]                          [Legend]  │
└──────────────────────────────────────────────────────┘
```

Components:
- `MemoryGraph.tsx` — React Flow canvas, layout dagre, controls (zoom/fit/lock).
- `nodes/RuleNode.tsx`, `nodes/VendorNode.tsx`, `nodes/AccountNode.tsx` — custom nodes, kích thước nhỏ gọn, badge trạng thái.
- `GraphSidebar.tsx` — panel bên phải, hiển thị chi tiết khi click node:
  - Rule node → tên, conditions tóm tắt, actions, applied/accuracy, nút "Sửa quy tắc" (mở `RuleEditor` đã có).
  - Vendor node → MST, ngành, các rule liên quan (list link).
  - Account node → mã TK, các rule dùng TK này.
- `GraphFilters.tsx` — chips lọc theo loại node, mode, source (ai_learned/user_taught), trạng thái.
- `GraphLegend.tsx` — chú thích màu/đường.

Tương tác:
- **Hover node** → highlight các neighbor, mờ phần còn lại (opacity 0.2).
- **Click node** → mở sidebar chi tiết.
- **Double-click rule** → mở `RuleEditor` drawer (re-use sẵn).
- **Drag** node → tự lưu vị trí vào zustand (giữ layout custom của user).

Insight banner trên đầu graph:
- "3 rule chưa từng dùng" — click filter ra.
- "2 vendor có ≥3 rule chồng chéo" — click highlight.
- "1 rule paused đang ngắt 5 vendor khỏi đồ thị".

## Tích hợp vào tab

Sửa `src/routes/_app/ai.memory.tsx`:
- Thêm tab `"graph"` vào `TabKey`, label "Sơ đồ trí nhớ", icon `Network` từ lucide.
- Render `<MemoryGraph />` khi `tab === "graph"`.
- Vì graph cần full-width/full-height, khi tab này active sẽ bỏ `max-w-4xl` wrapper (conditional class).

## Files tạo / sửa

Tạo mới:
- `src/lib/graph/build-graph.ts` — transform rules → nodes+edges.
- `src/lib/graph/layout.ts` — dagre auto-layout helper.
- `src/components/ai-memory/graph/MemoryGraph.tsx`
- `src/components/ai-memory/graph/GraphSidebar.tsx`
- `src/components/ai-memory/graph/GraphFilters.tsx`
- `src/components/ai-memory/graph/GraphLegend.tsx`
- `src/components/ai-memory/graph/nodes/RuleNode.tsx`
- `src/components/ai-memory/graph/nodes/VendorNode.tsx`
- `src/components/ai-memory/graph/nodes/AccountNode.tsx`
- `src/data/sampleEntities.ts` — mock vendors/accounts dùng cho demo.

Sửa:
- `src/routes/_app/ai.memory.tsx` — thêm tab "Sơ đồ trí nhớ".
- `package.json` — thêm `@xyflow/react`, `@dagrejs/dagre`.

## Phạm vi Phase 1

- Frontend-only, mock data (extend từ sampleRules).
- Chưa lưu layout xuống DB.
- Chưa wire vào DB thật — sẽ thay `sampleRules` bằng query từ `ai_memory_rules` trong Phase 2.

## Phạm vi Phase 2 (sau khi duyệt prototype)

- Query rules + vendors thật từ Supabase qua `createServerFn`.
- Lưu layout custom của user (column `layout_position` jsonb trong `ai_memory_rules` hoặc bảng riêng).
- Thêm node type `goods` (hàng hoá/DV) — liên kết với rules qua line classifications.
- Real-time update khi rule mới sinh ra.
