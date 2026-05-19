## Mục tiêu

Hệ thống có 2 mode rõ ràng:
- **Mode Kế toán** (workspace `back`) — sidebar/ngôn ngữ kế toán đầy đủ, KHÔNG có khung chat footer.
- **Mode AI** (workspace `front`, hiện đang gắn nhãn "Vận hành") — mọi trang `_app/*` đều có khung chat ở footer để hỏi AI nhanh.

State `workspace` (`front`/`back`) đã tồn tại trong `useWorkspace()` + localStorage. Tận dụng lại, chỉ đổi nhãn và thêm UI footer.

## Thay đổi

### 1. Đổi nhãn "Vận hành" → "AI"
- `src/components/app-sidebar.tsx` (dòng ~48): label `"Vận hành"` → `"AI"`.
- Rà soát các chỗ hiển thị khác cho người dùng (header, tooltip mode switcher nếu có) — đổi đồng bộ "Vận hành" → "AI". Giá trị nội bộ `"front"` giữ nguyên để không phá localStorage cũ.

### 2. Tạo `ChatDock` (khung chat footer toàn app)
- File mới: `src/components/chat/chat-dock.tsx`.
- Layout: sticky/fixed dưới cùng `SidebarInset`, căn giữa max-w-3xl, `rounded-2xl` + `bg-background/80 backdrop-blur` + shadow, padding nhẹ — đồng bộ ngôn ngữ thiết kế hiện tại (giống header bo tròn).
- Dùng lại `Composer` ở `src/components/chat/composer.tsx` (auto-grow textarea, Enter gửi, Shift+Enter xuống dòng).
- Hành vi submit:
  1. Gọi `createThread` (đã có trong `chat-threads.functions.ts`) kèm tin nhắn đầu.
  2. `navigate({ to: "/chat/$threadId", params: { threadId } })` — trang chat sẽ tự stream phần trả lời.
  3. Truyền `pageContext` (route hiện tại) vào thread để AI có context.
- Trạng thái loading: disable input + spinner nhỏ trên nút Send trong khi tạo thread.

### 3. Mount ChatDock có điều kiện
- `src/routes/_app.tsx`: thêm `const { workspace } = useWorkspace();` và `const location = useLocation();`.
- Render `<ChatDock />` sau `<main>` chỉ khi:
  - `workspace === "front"` (Mode AI), VÀ
  - route hiện tại KHÔNG bắt đầu bằng `/chat` (trang `/chat` đã có composer riêng).
- `<main>` thêm `pb-28` (hoặc tương đương) khi dock hiện để nội dung không bị che.

### 4. Không thay đổi
- DB schema, server functions, `/chat` page, accountingMode toggle hiện có.
- Logic streaming AI giữ nguyên — ChatDock chỉ là "shortcut" để mở thread mới trên `/chat/$threadId`.

## Tệp ảnh hưởng
- Mới: `src/components/chat/chat-dock.tsx`
- Sửa: `src/components/app-sidebar.tsx`, `src/routes/_app.tsx`, (nếu có) tooltip/label "Vận hành" khác.

## Ngoài phạm vi
- Gửi trực tiếp không qua `/chat` (vẫn redirect sang trang chat để xem stream + lưu lịch sử).
- Đổi cơ chế lưu trữ workspace (vẫn dùng localStorage hiện tại).
- Tự động chuyển mode khi vào trang nào đó.
