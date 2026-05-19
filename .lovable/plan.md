## Mục tiêu

Thay dữ liệu mock trên trang **Trí nhớ AI** bằng dữ liệu thật trong database, với đầy đủ API tạo / sửa / tắt / bật lại / xoá quy tắc và quản lý mẫu "Đang học" (watch list).

## 1. Database (migration)

Tạo 2 bảng mới, scope theo `tenant_id` + `user_id`, RLS dùng `is_tenant_member(auth.uid(), tenant_id)`:

**`ai_memory_rules`**
- `id uuid pk`, `tenant_id uuid`, `created_by uuid` (user tạo)
- `type text check in ('suggestion','active','disabled')`
- `source text check in ('ai-learned','user-taught')` nullable
- `title text`, `when_text text`, `then_text text`
- `origin text` (mô tả nguồn gốc, vd "Học từ 5 lần duyệt liên tiếp")
- `applied_count int default 0`, `accuracy_correct int default 0`, `accuracy_total int default 0`
- `last_used_at timestamptz`, `disable_reason text`
- `created_at`, `updated_at` + trigger `set_updated_at`

**`ai_memory_watch`** (mẫu AI đang theo dõi)
- `id uuid pk`, `tenant_id uuid`, `created_by uuid`
- `text text`, `seen_count int default 0`, `target_count int default 5`
- `created_at`, `updated_at`

RLS: SELECT/INSERT/UPDATE/DELETE chỉ cho thành viên active của tenant.

## 2. Server functions

File mới `src/lib/ai-memory.functions.ts` (dùng middleware `withTenant` giống `digest-prefs.functions.ts`):

- `listAiMemory()` → `{ rules: Rule[]; watch: Watch[] }` — đọc cả 2 bảng cho tenant hiện tại.
- `createRule(input)` — tạo quy tắc mới (mặc định `type='active'`, `source='user-taught'`).
- `promoteSuggestion({ id })` — chuyển 1 quy tắc từ `suggestion` → `active` + `source='user-taught'`.
- `updateRule({ id, when_text?, then_text?, title? })`.
- `disableRule({ id, reason })` — `type='disabled'` + lưu `disable_reason`.
- `enableRule({ id })` — `type='active'`, xoá `disable_reason`.
- `deleteRule({ id })` — DELETE (dùng cho "Bỏ qua" đề xuất).
- `promoteWatchToRule({ watch_id, when_text, then_text, title })` — INSERT rule + DELETE watch trong cùng handler.
- `dismissWatch({ id })` — DELETE watch.

Validation bằng `zod`, tất cả `.eq("tenant_id", tenantId)` trước khi UPDATE/DELETE.

## 3. Seed dữ liệu mẫu

Sau migration, dùng tool `insert` chèn 6 quy tắc + 12 watch (tương ứng `INITIAL_RULES` và `INITIAL_WATCH` hiện có) cho mọi tenant đang có trong `tenants` để demo không trống.

## 4. UI — `src/routes/_app/ai.memory.tsx`

Refactor để dùng **TanStack Query**:

- `useQuery(['ai-memory'], listAiMemory)` cho rules + watch.
- `useMutation` cho từng action (create/promote/update/disable/enable/delete/promoteWatch/dismissWatch), `onSuccess` → `queryClient.invalidateQueries(['ai-memory'])` + `toast`.
- Bỏ `INITIAL_RULES`, `INITIAL_WATCH`, các `setRules/setWatch` local state.
- `RuleCard` nhận thêm các mutation handlers thay vì cập nhật `setRules` cục bộ.
- Loading skeleton + empty state khi chưa có rule/watch.
- Stat cards: `Quy tắc hoạt động` đếm từ rules, `Đề xuất mới` đếm `type='suggestion'`. Hai số tĩnh ("1,284", "98.4%") tạm tính từ `SUM(applied_count)` và `SUM(accuracy_correct)/SUM(accuracy_total)` của tenant.

## 5. Không thay đổi

- Giữ nguyên layout, màu sắc, chip KHI/THÌ, dialog/sheet.
- Không đụng sidebar, không tạo edge function.
- Sheet "Xem N lần áp dụng" tạm vẫn render mock (chưa có bảng lịch sử áp dụng) — sẽ ghi chú là follow-up.

## Thứ tự thực hiện

1. Gọi `supabase--migration` tạo 2 bảng + RLS + triggers.
2. Gọi `supabase--insert` seed dữ liệu mẫu.
3. Tạo `src/lib/ai-memory.functions.ts`.
4. Refactor `src/routes/_app/ai.memory.tsx` sang React Query + mutations.
