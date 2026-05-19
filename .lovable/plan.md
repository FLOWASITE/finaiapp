# Chat panel hai chiều cho Sổ AI

## Mục tiêu
Biến `/inbox` thành layout 2 cột: **Inbox list (trái) | Chat panel (phải)**. Bỏ hoàn toàn Reasoning panel ở giữa — mọi lập luận, bút toán đề xuất và nút duyệt chuyển vào trong bubble chat. Inbox và Chat đồng bộ qua một "ngữ cảnh" (context item) duy nhất.

## Layout

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: [S] Sổ AI · ● AI online · vừa đọc 4 hoá đơn mới   ⌘K  T11   │
├──────────────────────────────────────────────────────────────────────┤
│ Stats strip · [Duyệt tất cả tin cậy cao (32)]                        │
├──────────────────────────────────────────────────────────────────────┤
│ Tabs: Inbox AI 47 · Đã hạch toán · Cần review · Tài liệu · Báo cáo  │
├──────────────────────────────────┬───────────────────────────────────┤
│ Inbox cards                      │ Chat panel                        │
│ (border-l-4 band)                │ ┌───────────────────────────────┐ │
│ • selected → viền xanh           │ │ chip: Đang xem: CTY XYZ +55tr ×│ │
│   + badge "● Đang chat"          │ └───────────────────────────────┘ │
│                                  │ Sổ AI 7:02                        │
│                                  │ Chào sếp. Đêm qua đã hạch toán    │
│                                  │ 132 mục… 47 mục cần duyệt …       │
│                                  │ [Duyệt 32 mục] [Xem 3 cần review] │
│                                  │                                   │
│                                  │ ─ bubble với BÚT TOÁN inline ─    │
│                                  │ ✓ Duyệt & ghi sổ  · Sửa           │
│                                  │ ──────────────────────────────    │
│                                  │ Input: Hỏi gì đó hoặc kéo HĐ…  ↑  │
└──────────────────────────────────┴───────────────────────────────────┘
```

Width: Inbox ~55%, Chat ~45% (min 420px). Trên màn <1100px, Chat collapse thành sheet, có nút mở ở header.

## Card Inbox (gọn hơn vì không còn panel giữa)

Giữ nguyên layout card hiện tại (border-l-4 band, source pill, title, amount, inline lines, blocker banner) — đây là "preview". Khi click:
- Card nhận `border-l-4 border-primary` + badge `● Đang chat` góc phải.
- Set `contextItemId` → Chat phản hồi.
- **Không** mở reasoning panel nữa. Toàn bộ lập luận + nút Duyệt sống trong chat bubble.

## Ngữ cảnh hai chiều

State trong `inbox.tsx`:
- `contextItemId: string | null` — mục được "ghim" vào chat.

Luồng:
1. **Click card** → set `contextItemId` → card highlight + badge → Chat hiện chip `Đang xem: {title} {±amount}` và push một bubble AI mới chứa: lập luận (`reasoning.summary`), bút toán mono (`proposal.lines`), signal pills, nút `✓ Duyệt & ghi sổ` / `Sửa` / `Áp dụng quy tắc`.
2. **AI nhắc tên mục** (`HĐ 00125`, `131`, `511`, `112`) → render thành chip button. Click → cuộn Inbox tới mục tương ứng + set context.
3. **Đóng chip ×** → `contextItemId = null` → Chat trở về chế độ chung.
4. **Duyệt từ bubble** → gọi handler `onApprove` đã có → card biến mất khỏi Inbox → chat push system `✓ Đã ghi sổ: {title}` → tự đóng context.

## Sự kiện hệ thống đồng bộ

`chatLog` quản lý bằng `useReducer`:
- `approveAllHigh()` → push 2 events:
  - `{ kind: "system", text: "↑ Sếp vừa nhấn Duyệt 32 mục tin cậy cao ở thanh trên" }`
  - `{ kind: "ai_progress", current: 0, total: 32 }` → bubble live-update `Đang duyệt ⟳ {n}/{total}…`. Mỗi mock item dismiss tăng counter. Xong: `✓ Đã duyệt 32/32 mục`.
- Approve đơn lẻ từ bubng chat → system line `✓ Đã ghi sổ: {title}`.

## Header pill "AI online"

Bên cạnh "AI đang xử lý":
- `● AI online · vừa đọc {n} hoá đơn mới` (n = delta `data.stats.pending` so với render trước, fallback `đang theo dõi`).
- Pulse dot xanh. Tooltip hover: "Cập nhật cuối: 2 phút trước".

## Chat panel chi tiết

Component mới `src/components/inbox/inbox-chat.tsx`. Không nối backend — mock responder dựa trên `contextItemId`:

- Seed ban đầu: bubble AI "Chào sếp. Đêm qua tôi đã hạch toán **132 mục** tự động. Còn **47 mục** cần sếp duyệt — trong đó **32 mục tin cậy cao** có thể duyệt hàng loạt." + quick actions `Duyệt 32 mục tin cậy cao`, `Xem 3 mục cần review`.
- Khi set context → push bubble AI với:
  - `reasoning.summary` (markdown bold cho từ khoá).
  - Khối `BÚT TOÁN` mono (giống screenshot).
  - Signal pills (`✓ Khớp HĐ`, `✓ Pattern x17`, `Tin cậy 99%`).
  - Action row: `✓ Duyệt & ghi sổ` (primary, gọi `onApprove`), `Sửa` (toast tạm), `Áp dụng quy tắc cho tương lai`.
- User gõ "131" hoặc "511" khi context = mock-2 → trả lời canned giải thích 131 vs 511 với bút toán mono.
- Không có context + user hỏi → "Em chưa có ngữ cảnh, sếp chọn 1 mục bên trái hoặc hỏi tự do".
- Hậu xử lý regex: `HĐ \d+`, mã TK 3 chữ số (`131`, `511`, `112`, `642`, `133`, `331`, `138`) → chip clickable.
- Footer composer: textarea + nút mic (icon, no-op), nút gửi (mũi tên xanh).

## Files thay đổi

1. **`src/routes/_app/inbox.tsx`** — xoá cột Reasoning, layout 2 cột, state `contextItemId` + `chatLog` reducer, wire `approveAllHigh` để emit chat events, header pill "AI online".
2. **`src/components/inbox/inbox-chat.tsx`** (mới) — UI chat panel, mock responder, chip parser, bubble bút toán.
3. **`src/data/mockInbox.ts`** — thêm `mockChatSeed` (tin nhắn AI đầu tiên).

Không đụng backend, không sửa `inbox-ai.functions.ts`, không sửa sidebar/header global.

## Edge cases

- Màn <1100px: Chat collapse → nút "Mở chat" trên header mở sheet phải.
- `mockInboxItems` rỗng: Chat vẫn render với seed message; click card không khả thi → chip context ẩn.
- User gửi tin trong lúc `ai_progress` chạy: cho phép, không khoá input.
- Mục context bị duyệt/biến mất: tự đóng chip + system line "Mục đã ghi sổ, đóng ngữ cảnh".
