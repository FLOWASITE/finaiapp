# Làm UI khu vực Chatbot đẹp hơn

Mục tiêu: nâng tầm thẩm mỹ khu vực `/chat` (sidebar + transcript + composer + empty state + tool calls) theo hướng ChatGPT/Claude — tinh tế, có chiều sâu, nhịp khoảng trống tốt hơn, vẫn dùng đúng design tokens hiện có (oklch trong `src/styles.css`). Không đổi logic/business.

## Phạm vi (chỉ frontend, presentation)

- `src/routes/_app/chat.tsx` — khung layout
- `src/routes/_app/chat.index.tsx` — empty state / welcome
- `src/routes/_app/chat.$threadId.tsx` — vùng footer + nội dung
- `src/components/chat/thread-list.tsx` — sidebar danh sách hội thoại
- `src/components/chat/message-list.tsx` — transcript
- `src/components/chat/composer.tsx` — ô nhập
- `src/components/chat/tool-calls.tsx` — accordion tool
- `src/components/chat/message-actions.tsx` — copy/regenerate

Không động vào: server functions, schema DB, logic streaming, PendingActions, ChatDock (đã ẩn ở SuperAdmin theo yêu cầu trước).

## Thay đổi chi tiết

### 1) Layout chat (`chat.tsx`)
- Thêm nền gradient mờ rất nhẹ (radial từ `--primary` ~3% ở góc trên-phải) phủ toàn bộ vùng chat để tạo chiều sâu, không chói.
- Sidebar và transcript tách biệt bằng đường viền hairline + bóng `inset` thay vì border cứng.
- Đảm bảo `min-h` ổn định, không nhảy layout khi tool-call mở/đóng.

### 2) Sidebar `ThreadList`
- Header sidebar: thêm tiêu đề nhỏ "Trợ lý kế toán" với icon Sparkles + subtitle muted; nút "Cuộc trò chuyện mới" chuyển thành dạng outline có icon Plus tròn, hover sáng dần.
- Bucket headings (Hôm nay / 7 ngày…): chữ uppercase, kerning rộng, có divider mảnh phía dưới.
- Item: bo `rounded-xl`, padding cao hơn, hiện preview snippet (1 dòng truncate từ `last_message_at` format thời gian tương đối — "2 giờ trước"). Active item dùng nền gradient nhẹ `from-primary/15 to-primary/5` + thanh accent 2px bên trái.
- Hover: nâng nhẹ background, icon đổi màu primary.
- Empty state: minh hoạ icon to mờ + text hướng dẫn.
- Nút "…" (more): chuyển thành button ghost tròn, chỉ hiện khi hover hoặc focus.

### 3) Transcript `MessageList`
- Tăng khoảng cách giữa messages từ `space-y-6` → `space-y-8` cho dễ đọc.
- Avatar AI: đổi từ vòng tròn nhỏ Sparkles sang badge gradient (primary → primary-glow nếu có) bo `rounded-xl`, kích thước 8x8, có shadow nhẹ.
- Avatar user: bo `rounded-xl` đồng bộ, dùng `bg-muted` thay vì `bg-secondary` để bớt nổi.
- User bubble: vẫn primary nhưng padding rộng hơn (`px-5 py-3`), bo `rounded-2xl` đều (không vát góc), shadow mềm hơn.
- Assistant: thêm tên nhỏ "Trợ lý" muted phía trên đoạn đầu tiên của mỗi message; markdown prose dùng class `prose-invert` (nếu dark) với tinh chỉnh `prose-p:my-2 prose-pre:rounded-xl prose-pre:bg-muted/40`.
- Thinking indicator: thay 3 chấm bouncing bằng hiệu ứng "shimmer text" trên chữ "Đang suy nghĩ…" (gradient chạy qua text) — dùng utility CSS có sẵn hoặc thêm keyframes `shimmer` trong `styles.css`.
- Hover message: actions (copy/regenerate) fade-in mượt với `transition-opacity duration-200`.

### 4) Composer
- Khung `rounded-3xl` (mềm hơn), viền 1px `border-white/10`, focus-within thêm ring gradient mảnh `ring-1 ring-primary/30`.
- Bỏ icon Sparkles cố định bên trái (gây thừa khi đã có avatar AI); chuyển thành hint text "Shift+Enter để xuống dòng" ở góc dưới phải khi focus.
- Nút Send: gradient primary → primary-glow, scale nhẹ khi hover, disabled state mờ rõ ràng hơn.
- Nút Stop: viền đỏ + nền trong suốt thay vì destructive đặc — tinh tế hơn.
- Footer chat: gradient fade từ background lên trong suốt (mask) để tin nhắn cuối "chìm" vào composer thay vì bị cắt cứng bởi border-top.

### 5) Empty state `chat.index.tsx`
- Hero: icon Sparkles to 16x16 trong khối bo `rounded-3xl` với glow radial; tiêu đề chuyển sang font cỡ `text-3xl` tracking-tight; subtitle 2 dòng có khoảng trống thoáng.
- Suggestions: chuyển từ grid 2 cột text-only sang **card có icon + label nhỏ** (Database / Users / FileCheck / Receipt), 4 card 2x2, hover nâng nhẹ + đổi border sang primary.
- Thêm dòng helper "Hoặc nhập câu hỏi bên dưới" trước composer.

### 6) Tool calls (`tool-calls.tsx`)
- Card bo `rounded-xl` viền `border-primary/15`, nền `bg-primary/[0.03]` thay vì muted xám.
- Header: icon trong khối tròn primary mờ, status badge (Đang chạy / Xong / Lỗi) dạng pill nhỏ bên phải với màu phù hợp.
- Khi mở: panel input/output trong `bg-background/60 backdrop-blur` viền inset; pre code dùng font mono cỡ 11px như cũ nhưng line-height thoáng hơn và scrollbar mảnh.
- Animation accordion: `data-[state=open]:animate-accordion-down` (đã có trong tailwind config).

### 7) Message actions
- Hàng action chỉ hiện khi hover message (đã có), nhưng đổi sang ghost button nhỏ 28px, icon-only mặc định, tooltip rõ ràng (Sao chép / Tạo lại). Khi copy thành công đổi icon Check trong 1.2s.

### 8) Tokens & assets phụ trợ
- Thêm vào `src/styles.css`:
  - keyframes `shimmer` cho thinking indicator.
  - utility class `.chat-surface` (nếu cần dùng nhiều nơi) cho gradient nền chat.
  - đảm bảo có `--primary-glow` token; nếu chưa có thì derive từ `--primary` bằng `color-mix`.
- Không thêm dependency mới.

## Lưu ý
- Tất cả màu/độ mờ qua semantic tokens (`primary`, `muted`, `foreground`, `background`, `destructive`), không hard-code hex.
- Giữ nguyên props/contract của tất cả component để không vỡ chỗ gọi khác (ChatDock vẫn dùng `Composer` với `compact`).
- Sau khi áp dụng: kiểm tra preview ở `/chat` (empty state), `/chat/:id` (có/đang stream/có tool calls), responsive ≥1280px (viewport hiện tại 1538).
