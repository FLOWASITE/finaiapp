# Hiện ChatDock trên trang Inbox AI

## Vấn đề

Trang `/inbox` đang chạy ở chế độ "chromeless" trong `src/routes/_app.tsx`:

```ts
const chromeless = location.pathname === "/inbox";
const showDock = workspace === "front" && !onChatRoute && !onSuperAdminRoute && !chromeless;
// ...
if (chromeless) {
  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <Outlet />
      <CommandPalette />
    </div>
  );
}
```

Vì `chromeless = true`, layout sớm return và **không render `<ChatDock />`**, nên ở /inbox không thấy chatbot nổi ở góc phải dưới (Sparkles bubble) như các trang khác. Thanh "Chat" xuất hiện trong ảnh chụp là thanh địa chỉ Samsung Internet, không phải UI của app.

## Phạm vi

Chỉ sửa frontend layout. Không đụng logic ChatDock, không đụng business logic Inbox.

## Thay đổi

**File:** `src/routes/_app.tsx`

Trong nhánh `if (chromeless)`, thêm `<ChatDock />` cùng với `<CommandPalette />`, kèm guard `workspace === "front"` để giữ nguyên hành vi ẩn dock ở workspace back-office:

```tsx
if (chromeless) {
  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <Outlet />
      {workspace === "front" ? <ChatDock /> : null}
      <CommandPalette />
    </div>
  );
}
```

## Ngoài phạm vi

- Không đổi vị trí / kích thước ChatDock.
- Không đổi hành vi `openAskAi` / event `app:open-ai`.
- Không sửa header Inbox vừa hoàn thiện.
- Các trang chromeless tương lai sẽ tự động cũng có dock (chấp nhận được vì hiện chỉ có /inbox dùng chromeless).
