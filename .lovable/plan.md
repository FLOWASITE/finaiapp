## Mục tiêu
Bấm nút trong `WorkspaceSwitcher` sẽ vừa đổi workspace vừa điều hướng:
- **AI (front)** → `/chat`
- **Kế toán (back)** → `/dashboard`

Nếu đang ở đúng mode rồi thì không điều hướng (tránh reload trang khi click lại).

## File thay đổi
`src/components/workspace-switcher.tsx`
- Import `useNavigate` từ `@tanstack/react-router`.
- Trong handler mỗi nút: nếu `workspace` đã đúng thì bỏ qua; nếu không, gọi `setWorkspace(next)` rồi `navigate({ to: "/chat" })` hoặc `navigate({ to: "/dashboard" })`.

Không động vào `useWorkspace`, sidebar, hay route khác.
