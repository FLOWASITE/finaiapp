## Mục tiêu
Thay icon Sparkles/mặc định bằng Fin mascot nhỏ (24–32px) bên cạnh tiêu đề ở 3 nơi, và chỉnh tiêu đề mang "giọng" Fin.

## Thay đổi

### 1. `src/components/ai/InsightWidget.tsx` (line 41–44)
- Bỏ `<Sparkles className="h-4 w-4 text-primary" />`
- Thay bằng `<FinMascot size="xs" />` (24px)
- Đổi tiêu đề: `"Cảnh báo từ AI"` → `"Fin phát hiện"`

### 2. `src/components/ai/PendingActions.tsx` (line 106–109)
- Bỏ `<Sparkles className="h-3 w-3" />`
- Thay bằng `<FinMascot size="xs" />` (24px). Vì hàng này là `text-xs`, tăng container về `text-sm` cho cân với mascot.
- Đổi tiêu đề: `"Hành động chờ duyệt (N)"` → `"Fin gợi ý hành động · N"`

### 3. `src/components/notifications-menu.tsx` (line 120–126)
- Trong header `"Thông báo"`, thêm `<FinMascot size="xs" />` đứng trước title (vì notifications phần lớn do Fin đẩy).
- Giữ nguyên text "Thông báo" và subtitle.
- Wrap title row bằng `flex items-center gap-2`.

## Lưu ý
- `FinMascot` size `"xs"` = 24px theo `SIZE_PX` đã có — đúng spec 24–32px.
- Không tạo component mới, chỉ chỉnh inline.
- Giữ `Sparkles` import nếu còn dùng chỗ khác trong file (PendingActions vẫn dùng ở dòng 149 cho ActionCard status — không động).

## Kiểm tra
- Build pass.
- Screenshot dashboard (InsightWidget), chat dock (PendingActions), header (notifications-menu) xem icon Fin hiển thị đúng kích thước, không vỡ layout.