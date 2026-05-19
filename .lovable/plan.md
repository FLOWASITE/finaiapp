
## Mục tiêu

Bỏ hẳn pane `InboxChat` chuyên dụng trong `/inbox`. Mọi hội thoại tự do đi qua `ChatDock` (mở bằng `openAskAi`). Thao tác Approve / Skip / Edit / Rule cho từng `InboxItem` chuyển vào một **Sheet chi tiết** mở khi click vào card.

## Trạng thái sau khi đổi

```text
/inbox  ──┬── Header tabs (Inbox AI / Đã hạch toán / …)
          ├── Danh sách ItemCard  (full width, không còn pane phải)
          │     └── click  ──►  InboxItemSheet  (Sheet bên phải)
          │                         ├── Tiêu đề / partner / amount / ngày
          │                         ├── Lý do AI + danh sách Proposals
          │                         ├── Nút  [Duyệt] [Bỏ qua] [Sửa] [Tạo quy tắc]
          │                         └── Nút  "Hỏi AI về mục này"  ──►  openAskAi(prefill)
          └── ChatDock sticky bottom (giữ nguyên — toàn app)
```

## Phạm vi thay đổi

### 1. Component mới — `src/components/inbox/inbox-item-sheet.tsx`
- Dùng `Sheet` (`@/components/ui/sheet`) side="right", width ~520px (mobile full).
- Props: `item: InboxItem | null`, `onClose`, các handler `onApprove/onSkip/onEdit/onRule`, `approving?: boolean`.
- Body tái sử dụng đoạn render proposal hiện có trong `InboxChat` (proposal pills, blocker badge, followup) — copy ra component nhỏ `ProposalList`.
- Footer cố định 4 nút action + nút secondary **"Hỏi AI về mục này"** → gọi `openAskAi` với prefill dạng `"Về mục \"<title>\" (<partner>, <amount>): "`.

### 2. `src/routes/_app/inbox.tsx`
- Xoá:
  - Import `InboxChat`, `ChatEntry`, `chatReducer`, state `chatLog`, `pushSystem`, `pushProposal`.
  - State `paneMode` + thanh chuyển pane (Split/Inbox/Chat).
  - Grid 2 cột desktop + nhánh `tab === "inbox" ? <InboxChat .../> : …` ở mobile.
  - `MobileInboxOverlay` (không còn cần vì list giờ là content chính).
- Giữ:
  - State items, stats, mutations `approveM/skipM/ruleM`, `handleApproveItem/…`.
  - Tabs strip, ListSkeleton, EmptyInbox, ItemCard.
- Thêm:
  - State `sheetItem: InboxItem | null`. Click ItemCard → `setSheetItem(it)`.
  - Render `<InboxItemSheet item={sheetItem} onClose={() => setSheetItem(null)} onApprove={…} onSkip={…} onEdit={…} onRule={…} approving={approveM.isPending} />`.
  - Sau khi `handleApproveItem` / skip thành công: đóng sheet (`setSheetItem(null)`) + `toast.success(...)` thay cho `pushSystem`.
  - Nút "Duyệt nhanh N mục tin cậy cao" ở header: giữ logic mutation, đổi feedback từ `pushSystem` + progress bar sang `toast.promise` (hoặc `Sonner` progress).

### 3. `src/components/inbox/inbox-chat.tsx`
- Xoá file. Không còn nơi import.

### 4. Không đụng
- `ChatDock`, `openAskAi`, schema chat-threads, server functions inbox/approve.
- Mock data, AI reasoning, RLS.

## Mapping hành vi cũ → mới

| Cũ (InboxChat)                             | Mới                                           |
|---------------------------------------------|-----------------------------------------------|
| Click item → push `ai_proposal` vào chat   | Click item → mở Sheet                         |
| Nút Approve trong message bubble            | Nút Approve trong footer Sheet                |
| `pushSystem("✓ Đã ghi sổ …")`              | `toast.success("Đã ghi sổ …")`                |
| `ai_progress` bar khi duyệt nhanh           | `toast.promise(…, { loading, success })`      |
| Composer trong pane chat                    | Dùng ChatDock chung; nút "Hỏi AI về mục này" → `openAskAi(prefill)` |
| Mobile tab "Inbox AI" hiện InboxChat        | Mobile tab "Inbox AI" hiện danh sách ItemCard |

## Rủi ro & lưu ý

- Mất tính liên tục "lịch sử thao tác trong phiên" mà `chatLog` đang giữ. Thay bằng toast là đủ cho phần lớn use-case; nếu sau này cần nhật ký, dùng `record-audit-history`.
- Nút "Duyệt nhanh" hiện ghi progress vào chatLog; chuyển sang toast.promise cần test với list lớn (>10 mục) để đảm bảo UX vẫn ổn.
- `paneMode` đang ảnh hưởng layout/grid — xoá hẳn cả tri-state button group, không để dead code.
- Sheet trên mobile (<707px) phải full-screen để 4 nút action không bị che; dùng `className="w-full sm:max-w-lg"`.

## Không trong phạm vi

- Mở rộng schema thread chat để lưu proposal/approve (đã loại — user chọn Sheet riêng).
- Thay đổi ChatDock UI.
- Thêm tính năng mới ngoài chuyển luồng.
