# Pane mode ⌘1/⌘2 + Mobile-first Chat

## 1. Desktop: 3 chế độ pane

State mới trong `src/routes/_app/inbox.tsx`:
```ts
type PaneMode = "split" | "inbox" | "chat";
const [paneMode, setPaneMode] = useState<PaneMode>("split");
```

Đổi grid (line 549):
- `split` → `lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]` (60/40 hiện tại)
- `inbox` → `lg:grid-cols-[1fr]`, ẩn cột Chat
- `chat`  → `lg:grid-cols-[1fr]`, ẩn cột Inbox

Khi `paneMode==="chat"` → render `<InboxChat>` full-width thay vì list. Khi `inbox` → chỉ list.

## 2. Keyboard shortcuts

Thêm useEffect bắt phím (chỉ desktop, bỏ qua khi đang gõ input/textarea):
- `⌘1` / `Ctrl+1` → `setPaneMode(m => m === "inbox" ? "split" : "inbox")`
- `⌘2` / `Ctrl+2` → `setPaneMode(m => m === "chat" ? "split" : "chat")`
- `Esc` khi đang ở `inbox`/`chat` → về `split`

## 3. Pane toggle UI (desktop)

Thêm cụm 3 nút segmented control ở header cạnh nút `MoreHorizontal` (line 488), `hidden lg:flex`:
```
[ Inbox ⌘1 ] [ Split ] [ Chat ⌘2 ]
```
Active state = highlight. Tooltip hiển thị shortcut.

## 4. Mobile: đảo logic (Chat-first)

Hiện tại mobile mặc định Inbox, nút mở Chat overlay. Đổi:

- **Mặc định mở Chat full-screen** trên mobile (`<lg`).
- Header mobile: nút `Inbox (47)` (badge = `stats.pending`) thay nút `MessageSquare` hiện tại (line 481–487). Tap → mở overlay Inbox trượt từ trái (`fixed inset-0 z-40 flex`, panel `w-[92vw] max-w-md` ở bên trái, backdrop bên phải).
- Click 1 item trong overlay → `handleCardClick(id)` + `setInboxOpenMobile(false)` → Chat đã có `contextItem`.

Mobile rendering (thay block 600–638):
```tsx
{/* Mobile: Chat full-screen, Inbox overlay */}
<div className="block lg:hidden h-full">
  <InboxChat ... />
</div>
{inboxOpenMobile && (
  <div className="fixed inset-0 z-40 flex lg:hidden">
    <div className="h-full w-[92vw] max-w-md bg-background shadow-2xl overflow-y-auto">
      {/* danh sách ItemCard, click → pickItem + đóng overlay */}
    </div>
    <div className="flex-1 bg-background/60" onClick={()=>setInboxOpenMobile(false)} />
  </div>
)}
```

Desktop (`hidden lg:grid`) giữ logic split/inbox/chat ở phần 1.

## 5. Dọn dẹp

- Bỏ state `chatOpenMobile` cũ, thay bằng `inboxOpenMobile`.
- Import icon `Inbox` từ lucide-react cho nút mobile.
- Không đổi business logic, chỉ layout + shortcuts.

## Files
- `src/routes/_app/inbox.tsx` — state `paneMode`, `inboxOpenMobile`, useEffect shortcuts, segmented toggle, đảo mobile rendering, đổi grid theo paneMode.

Không tạo file mới. Không đụng `inbox-chat.tsx`, `mockInbox.ts`, hay backend.
