## Hoàn thiện "Bối cảnh doanh nghiệp" (Context Tab)

Hiện trạng:
- Đã có bảng `ai_memory_context` + CRUD UI (`ContextTab` trong `ai-memory-tabs.tsx`).
- 3 lỗ hổng cốt lõi:
  1. **AI không thực sự đọc bối cảnh** — `chat.functions.ts` chỉ inject profile + tenant; chưa nạp `ai_memory_context` vào system prompt.
  2. **Badge đếm cứng** `(12)` ở tab — không phản ánh số dòng thật.
  3. **Tenant mới trống trơn** — chưa có gợi ý/seed mẫu để user bắt đầu.
- Phụ: dialog tạo mới chưa có ordering UI, chưa có nút "Xem 5 dòng gần đây mà AI sẽ áp dụng", chưa search/filter khi danh sách dài.

### Phạm vi làm trong lần này

**1. Inject bối cảnh vào AI (quan trọng nhất)** — `src/lib/chat.functions.ts`
- Load `ai_memory_context` theo `tenantId` (đã có `supabase` scoped trong handler).
- Group theo `category`, render thành block markdown `## Bối cảnh doanh nghiệp` với các sub-heading theo `CATEGORY_LABEL` (Tổ chức, Kế toán, Thuế…), mỗi dòng `- {label}: {value_text}`.
- Append vào `systemParts` sau `userContextBlock`, trước `SCHEMA_HINT`.
- Cache nhẹ trong request (1 query duy nhất, best-effort, không chặn chat nếu lỗi).

**2. Badge đếm thật** — `src/routes/_app/ai.memory.tsx`
- Thêm `useQuery(['ai-memory','context'], listContext)` ở component cha (hoặc dùng `useQueryClient().getQueryData`), truyền `contextCount` vào `SubTabs` thay cho hằng `12`.
- Tương tự fix nhanh `partners` (đang cứng `128`) và `limits` (đang cứng `8`) bằng cách dùng cùng pattern khi data đã có sẵn trong cache; nếu chưa load thì hiển thị không có số.

**3. Seed gợi ý cho tenant mới** — `src/components/ai-memory-tabs.tsx`
- Khi `ContextTab` rỗng (`data?.length === 0`), render empty state với grid 6-8 "thẻ gợi ý" (label + value mẫu, theo các category phổ biến: Kế toán, Thuế, Doanh thu, Ngân hàng…).
- Mỗi thẻ có nút "Thêm vào bối cảnh" → gọi `createContext` với key tự sinh từ slug(label).
- Danh sách gợi ý hardcode trong file (không cần migration), ví dụ:
  - Kế toán: "Áp dụng Thông tư 200", "Kỳ kế toán theo năm dương lịch"
  - Thuế: "Kê khai VAT theo tháng, phương pháp khấu trừ"
  - Doanh thu: "Ghi nhận doanh thu khi xuất hoá đơn"
  - Ngân hàng: "Tài khoản chính tại Vietcombank"

**4. UX nhỏ trong ContextTab**
- Thêm ô search ở đầu (filter client-side theo `label + value_text`), chỉ hiện khi `data.length > 6`.
- Sửa nút "Thêm mục bối cảnh": pre-fill `key` tự động từ slug(label) khi user gõ label (chỉ khi key đang trống), giảm friction.

### Ngoài phạm vi (không làm lần này, ghi nhận để pha sau)
- Node "Bối cảnh" trong Memory Graph (sẽ làm cùng phase mở rộng graph).
- Versioning / lịch sử thay đổi từng dòng context.
- Import/export bối cảnh dạng YAML.

### Files chạm vào
- `src/lib/chat.functions.ts` (inject context block)
- `src/routes/_app/ai.memory.tsx` (badge đếm thật)
- `src/components/ai-memory-tabs.tsx` (empty-state seed, search, auto-slug key)

Không cần migration, không thay đổi schema, không đụng business logic khác.