# Trang "Trí nhớ AI" + nhóm sidebar mới

## Phạm vi

UI-first: dùng dữ liệu mẫu (mock) trong file để dựng đủ trải nghiệm. Backend (lưu rules, log lần áp dụng, watch list) chưa có schema — sẽ làm ở turn sau khi user xác nhận data model. Không thay đổi business logic hiện có.

## Sidebar

`src/components/app-sidebar.tsx`:
- Thêm nhóm `{ label: "AI", entries: [...] }` ngay sau "Tổng quan" trong `SECTIONS` (và bản FRONT_SECTIONS cũng có entry tương ứng).
- Entry: `{ to: "/ai/memory", label: "Trí nhớ AI", icon: Brain, badge: { text: "MỚI", color: "#4F46C7" } }`.
- Mở rộng `NavEntry` type để chấp nhận field `badge` optional; renderer trong `EntryButton`/`GroupButton` hiển thị pill bo tròn 9px, padding 0 6px, bg `#4F46C7` text trắng, kích thước 9px, ml-auto.

## Route

`src/routes/_app/ai/memory.tsx` (file mới, dùng dot-flat: `ai.memory.tsx`).
- Layout: 1 cột flex-col, full-height container; main area scroll dọc trong vùng giữa, footer sticky.

### Cấu trúc component (cùng file, tách function nhỏ)

```text
<AIMemoryPage>
  <MemoryHeader />            -- icon + tiêu đề + pill + tagline + StatsGrid 4 ô
  <SubTabs value/onChange />  -- 5 tabs underline-style, badge "3" cho "Đang học"
  <ScrollArea>
    {tab === 'rules'    && <RuleList items={mockRules} />}
    {tab === 'partners' && <ComingSoon label="Đối tác" />}
    {tab === 'context'  && <ComingSoon label="Bối cảnh DN" />}
    {tab === 'limits'   && <ComingSoon label="Giới hạn" />}
    {tab === 'learning' && <WatchList items={mockWatch} />}
  </ScrollArea>
  <WatchFooter count={12} />  -- sticky, chấm tím pulse
</AIMemoryPage>
```

### RuleCard — 4 variants (A/B/C/D)

Single component `<RuleCard rule={...} />` chuyển style theo `rule.type + rule.source`:

- **A — Suggestion**: bg `#F5F4FE`, border 1px `#4F46C7`, badge "ĐỀ XUẤT QUY TẮC MỚI" với `Sparkles`, actions: `[Tạo quy tắc(primary), Tinh chỉnh, Bỏ qua, "Xem 5 lần →"(muted, ml-auto)]`.
- **B — AI tự học**: badge "AI TỰ HỌC" với `Bot`, status dot xanh.
- **C — Bạn dạy**: badge "BẠN DẠY" với `User`, màu `#0F6E56`.
- **D — Tạm tắt**: opacity 0.65, badge "TẠM TẮT" với `PauseCircle`, title strikethrough, dot xám, hiện `disableReason` thay cho block KHI/THÌ + stats.

Chip KHI/THÌ là 2 sub-component:
- `<ChipWhen>`: bg `#26215C`, text white, font-size 10, font-weight 500, padding `1px 6px`, rounded `3px`.
- `<ChipThen>`: bg `#0F6E56`, cùng style.
- Đặt trong block `rounded-md bg-muted/40 p-3` 2 dòng (KHI ở dòng 1, THÌ ở dòng 2).

Stats row: 3 cluster icon + text (Zap "Áp dụng N lần", Target "Đúng %", Clock "Cuối: …"). Actions row dùng `<Button variant="ghost" size="sm">`.

### Tương tác (UI-only, state local trong page)

1. **Tạo quy tắc** (thẻ A): mở `<Dialog>` preview hiển thị KHI/THÌ + nút "Xác nhận". Confirm → `setRules(r => r.map(...))` chuyển type='active', source='user-taught'; thẻ animate `animate-fade-in`.
2. **Xem N lần áp dụng**: mở `<Sheet side="right">` với danh sách mock 5–10 mục, mỗi mục có "Xem chi tiết" (no-op stub) và "Báo cáo sai" (toast "Đã gửi phản hồi cho AI").
3. **Sửa**: `<Dialog>` 2 `<Textarea>` cho điều kiện KHI và hành động THÌ, kèm dòng "Sẽ áp dụng cho **X** mục trong 30 ngày qua" (X = stats.appliedCount stub). Save → cập nhật rule local.
4. **Tắt**: `<AlertDialog>` với `<Textarea>` "Lý do tắt" required → confirm → rule chuyển type='disabled', lưu `disableReason`, ngày = hôm nay.
5. **Tab "Đang học"**: render 12 mẫu mock (`{ vendor, account, current, target }`). Mỗi item card có "Tạo quy tắc luôn" → thêm vào rules list dạng C; "Bỏ theo dõi" → remove local.

### Footer "AI đang theo dõi"

Sticky bottom, `bg-muted/50 border-t`, 1 dòng:
- Chấm `h-2 w-2 rounded-full bg-[#4F46C7]` + class `animate-pulse`.
- Text "AI đang theo dõi 12 mẫu chưa đủ tin cậy để tạo quy tắc · cần ~3-5 lần lặp lại nữa".
- Nút phải "Xem chi tiết" → set tab = 'learning'.

## Files

- **Edit** `src/components/app-sidebar.tsx`: thêm nhóm "AI", import `Brain`, mở rộng `NavEntry` + renderer cho `badge`.
- **New** `src/routes/_app/ai.memory.tsx`: toàn bộ page + 4 sub-component + mock data + dialogs/sheet.
- (Optional refactor nếu file phình to: tách `src/components/ai-memory/rule-card.tsx`, `watch-list.tsx`, `mock.ts`.)

## Kiểm thử thủ công

1. Sidebar hiện nhóm "AI" với badge tím "MỚI" cạnh "Trí nhớ AI".
2. Click vào → trang load, 4 stats hiển thị, sub-tab "Quy tắc hạch toán (47)" active.
3. Cuộn xem 4 loại thẻ A/B/C/D đúng style.
4. Bấm "Tạo quy tắc" trên thẻ A → dialog → confirm → thẻ A biến thành thẻ C ở vị trí mới.
5. Bấm "Tắt" trên thẻ B → nhập lý do → thẻ B fade thành thẻ D.
6. Footer luôn dính đáy với chấm pulse; bấm "Xem chi tiết" chuyển sang tab "Đang học".
