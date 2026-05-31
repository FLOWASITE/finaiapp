## Vấn đề

Khi vào `/chat`, UI đang render **2 sidebar song song**:

```text
┌──────────────┬──────────────┬────────────────────┐
│ AppSidebar   │ ThreadList   │  Chat Outlet       │
│ (Inbox, Mua, │ (Lịch sử     │                    │
│  Bán, …)     │  Fin Chat)   │                    │
└──────────────┴──────────────┴────────────────────┘
```

- `AppSidebar` đến từ `src/routes/_app.tsx` (layout chung của toàn app).
- `ThreadList` đến từ `src/routes/_app/chat.tsx` (layout riêng của Fin Chat).

Trên viewport hẹp (≤ ~900px) hai cột sidebar đè/chen nhau gây cảm giác "2 lớp chồng lên".

## Giải pháp

Khi đang ở bất kỳ route `/chat/*` nào → **không render `AppSidebar`** (và cụm header app cũng đã ẩn sẵn). Fin Chat tự quản sidebar riêng (ThreadList desktop + Sheet mobile) — đủ cho điều hướng trong phạm vi chat. Người dùng quay về app chính qua menu "Thoát Fin Chat" đã có trong footer ThreadList.

### Thay đổi

**`src/routes/_app.tsx`** — nhánh chính (không phải `chromeless`):

- Khi `onChatRoute === true`: bỏ qua `SidebarProvider` + `AppSidebar` + `SidebarInset` wrapper, render thẳng `<Outlet />` trong một container full-screen flex (giống nhánh `chromeless` nhưng vẫn giữ `UploadQueueProvider`, `UploadDock`, `CommandPalette`, không render `ChatDock` — `showDock` vốn đã false trên chat route).
- Khi không phải chat: giữ nguyên cấu trúc hiện tại (AppSidebar + header + Outlet).

Sơ đồ sau khi sửa:

```text
/chat/*  →  [ ThreadList | Chat Outlet ]
/khác    →  [ AppSidebar | Header + Outlet ]   (không đổi)
```

### Không đụng tới

- `ThreadList`, `ChatLayout`, `ChatHeader`, `chat-layout-context` — giữ nguyên.
- Logic auth `beforeLoad` — giữ nguyên.
- Các route khác và `AppSidebar` — không đổi hành vi.

### Kết quả mong đợi

Vào `/chat` chỉ còn **đúng 1 sidebar** (ThreadList của Fin Chat) bên cạnh khung hội thoại. Không còn cảnh hai cột sidebar chồng nhau trên mobile/desktop hẹp.
