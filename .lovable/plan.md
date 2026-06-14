## Vấn đề

Bấm nút **Kế toán** trong header không đổi nội dung gợi ý ở trang `/chat`. Đồng thời preview đang báo React error #418 (hydration mismatch) — cùng một nguyên nhân gốc.

Hook `src/hooks/use-chat-mode.ts` hiện đang:
- Khởi tạo `useState` bằng cách đọc trực tiếp `localStorage` → SSR render ra "accounting" nhưng client hydrate có thể ra "ai" → hydration mismatch (#418). Khi mismatch xảy ra trong production build, React bỏ qua state phía client và giữ HTML server, khiến lần click đầu tiên trông như không có tác dụng.
- Mỗi component dùng hook giữ một bản state riêng, chỉ đồng bộ qua custom event. Nếu một instance bị ngắt do hydration mismatch, click ở header không lan sang `chat.index`.

## Cách sửa

Viết lại `src/hooks/use-chat-mode.ts` dùng `useSyncExternalStore`:

- **Snapshot SSR cố định** là `"accounting"` (đúng giá trị fallback trong `read()`), không đọc `localStorage` khi render → hết hydration mismatch.
- **Client snapshot** đọc từ `localStorage` qua một module-level cache, cập nhật khi nhận event hoặc `storage`.
- **Subscribe** một lần ở mức module, tất cả component dùng hook đều re-render đồng bộ khi `setMode` chạy.
- Giữ nguyên API `[mode, setMode]` và export `getChatMode()` để các nơi khác không phải đổi.

Không đụng vào `chat-header.tsx` hay `chat.index.tsx` — toggle hiện tại đã đúng, chỉ cần hook phát tín hiệu đúng cách.

## Kiểm thử

- Mở `/chat`, bấm **AI** → gợi ý đổi sang nhóm AI (BookOpen/Calculator/Mail/FileCheck), greeting đổi.
- Bấm lại **Kế toán** → gợi ý quay về nhóm kế toán (Database/Users/FileCheck/Receipt).
- Reload trang giữ đúng mode đã chọn (vẫn dùng `localStorage`).
- Console không còn báo React error #418.
