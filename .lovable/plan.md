## Mục tiêu

Đưa `industry_code` (mã VSIC) và phân bố lịch sử 12 tháng của NCC vào UI Trí Nhớ AI — vừa để **xem nhanh** (Memory Graph), vừa để **sửa tại chỗ** (sidebar), không cần đi sang trang NCC.

---

## Phần 1 — Hiển thị ngành + lịch sử 12 tháng trong Memory Graph

### 1.1. Mở rộng dữ liệu graph
**File:** `src/lib/graph/memory-graph.functions.ts`
- `GraphSupplierRow` đã có `industry_code` → tốt, giữ nguyên.
- Thêm query phụ: với mỗi `supplier_id` trong graph, lấy `kind` distribution từ `invoices` 12 tháng gần nhất (join `expense_account` → `accountToKind`). Trả về `supplierHistory: Record<supplier_id, Partial<Record<LineKind, number>>>`.
- Giới hạn: chỉ tính cho top ~50 NCC có nhiều hit nhất (tránh query nặng).

### 1.2. Truyền vào node data
**File:** `src/lib/graph/adapt-db.ts`
- Khi build `VendorNode` data, thêm `industryCode`, `industryLabel` (lookup từ `VSIC`), `historyDist`, `historyTotal`.
- Mở rộng `GraphNodeData` trong `src/lib/graph/build-graph.ts`.

### 1.3. VendorNode hiển thị badge ngành
**File:** `src/components/ai-memory/graph/nodes/VendorNode.tsx`
- Thêm 1 dòng nhỏ: badge `📊 6201 Lập trình…` (truncate, tooltip full name).
- Nếu chưa có industry → badge xám "Chưa gắn ngành" để user thấy gap.

### 1.4. VendorDetail sidebar hiển thị ngành + biểu đồ phân bố
**File:** `src/components/ai-memory/graph/GraphSidebar.tsx`
- Section "Ngành nghề": hiện code + tên VSIC, nút "Sửa" (mở Phần 2).
- Section "Lịch sử 12 tháng": bar chart đơn giản (div + width %) cho từng `LineKind` (HH/TSCĐ/CCDC/DV/CP), kèm tổng số hit.
- Nếu rỗng: "Chưa có dữ liệu lịch sử".

### 1.5. Legend bổ sung
**File:** `src/components/ai-memory/graph/GraphLegend.tsx`
- Thêm chú thích nhỏ: "Badge ngành trên NCC → AI dùng để gợi ý HH/TSCĐ/DV".

---

## Phần 2 — Sửa industry_code ngay trong Trí Nhớ AI

### 2.1. Server function update
**File mới:** `src/lib/ai-memory-supplier.functions.ts`
- `updateSupplierIndustry`: input `{ supplier_id, industry_code, industry_label }`, dùng `withTenant` middleware, update `suppliers.industry_code` (và `industry_name` nếu cột tồn tại — cần check schema).
- Validate: `industry_code` phải match regex `/^\d{4,6}$/` hoặc null (cho phép xoá).
- Sau khi update, invalidate query `["ai-memory-graph"]`.

### 2.2. Dialog/Popover sửa ngành trong sidebar
**File mới:** `src/components/ai-memory/graph/EditIndustryDialog.tsx`
- Trigger từ nút "Sửa" ở Phần 1.4.
- Dùng lại `IndustryCombobox` có sẵn (`src/components/industry-combobox.tsx`).
- Submit → gọi `updateSupplierIndustry` → toast + đóng dialog + invalidate graph.

### 2.3. Empty-state nudge
**File:** `src/components/ai-memory/graph/GraphSidebar.tsx`
- Khi `historyDist` lệch mạnh về 1 `kind` (ví dụ >70% là HH) nhưng `industry_code` rỗng → hiện nudge: "Gợi ý: gắn ngành 4631 (Bán buôn thực phẩm) để AI đoán chính xác hơn" + nút "Gắn ngay".

---

## Phần 3 — Wiring & QA

- Chạy graph với 1-2 NCC mẫu, kiểm tra badge + biểu đồ render đúng.
- Test flow sửa ngành: mở dialog → chọn VSIC → save → badge update ngay trên node.
- Test responsive 707×662 (viewport hiện tại): sidebar không tràn, badge truncate gọn.
- Không tạo bảng mới, không migration — chỉ tận dụng `suppliers.industry_code` đã có.

---

## Phạm vi KHÔNG làm (giữ scope gọn)

- Không đụng `ai_memory_partners` (đó là bảng riêng cho cá nhân/NV, không có ngành).
- Không tự suy luận ngành từ lịch sử (chỉ nudge, user vẫn phải chọn tay).
- Không thay đổi pipeline `classifyLine` / `supplier-signals` — Phần 1+2 chỉ là UI cho dữ liệu đã có.

---

## Files sẽ chạm

**Sửa:**
- `src/lib/graph/memory-graph.functions.ts`
- `src/lib/graph/adapt-db.ts`
- `src/lib/graph/build-graph.ts`
- `src/components/ai-memory/graph/nodes/VendorNode.tsx`
- `src/components/ai-memory/graph/GraphSidebar.tsx`
- `src/components/ai-memory/graph/GraphLegend.tsx`

**Tạo mới:**
- `src/lib/ai-memory-supplier.functions.ts`
- `src/components/ai-memory/graph/EditIndustryDialog.tsx`
