## Mục tiêu

Làm lại UI của **Dialog Kết nối MB Bank** (`src/components/mbbank-connect-dialog.tsx`) để hiện đại, dễ hiểu, dẫn dắt người dùng theo từng bước rõ ràng — thay vì gom tất cả trạng thái/credentials/lịch sử vào một khối dày đặc như hiện tại.

Phạm vi: **chỉ UI/UX của dialog**, không đổi server functions, schema, hay luồng đồng bộ Worker.

## Vấn đề của UI hiện tại

- Mọi thông tin (trạng thái sync, toggle, form mật khẩu, log) xếp dọc trong 1 dialog hẹp → trông rối.
- Khi chưa kết nối, người dùng vẫn thấy block "trạng thái rỗng" mơ hồ.
- Không có hướng dẫn bảo mật/giải thích MB OTP/Captcha → người dùng e ngại nhập mật khẩu.
- Badge trạng thái, lịch sử log nhỏ, khó scan.
- Nút "Đồng bộ ngay" và toggle chen chúc cùng khối.

## Hướng thiết kế đề xuất

Chuyển sang **dialog 2 trạng thái rõ ràng** + **Sheet rộng hơn** thay cho Dialog hẹp:

```text
┌──────────────────────────────────────────────┐
│  [MB logo]  Kết nối MB Bank      [ x ]       │
│  TK: Vietcombank 123***  •  TT133            │
├──────────────────────────────────────────────┤
│  ● Stepper:  1 Đăng nhập → 2 Tự động → 3 Sẵn │
├──────────────────────────────────────────────┤
│   <Nội dung theo trạng thái>                 │
└──────────────────────────────────────────────┘
```

### Trạng thái A — Chưa kết nối (empty state)
- Hero nhỏ: icon shield + 1 dòng "Đồng bộ sao kê tự động 5 phút/lần".
- 3 bullet trust-signal có icon: mã hoá AES-256-GCM · Không lưu OTP · Có thể tắt bất cứ lúc nào.
- Form 2 trường (username + password có show/hide) trong **Card** riêng.
- Nút primary lớn: "Kết nối & bật đồng bộ".
- Link nhỏ: "MB Bank yêu cầu gì? →" mở popover giải thích captcha/OCR.

### Trạng thái B — Đã kết nối
Chia thành **3 vùng** rõ ràng (tab hoặc section):

1. **Tổng quan** (mặc định)
   - Card lớn: tên user MB, badge trạng thái lần sync cuối (success/error/running) với màu nền nhẹ.
   - 2 metric ngang: "Lần cuối" (timestamp tương đối — "2 phút trước") · "Số dư hiện tại".
   - Hàng action: Toggle "Tự động đồng bộ" + Button "Đồng bộ ngay" (icon refresh, có animation khi pending).
   - Nếu `last_sync_error`: Alert đỏ inline + nút "Xem chi tiết".

2. **Lịch sử** (tab)
   - Bảng gọn: Thời gian · Trạng thái · GD mới/GD lấy · (Lỗi rút gọn nếu có).
   - Empty state: "Chưa có lần đồng bộ nào".

3. **Bảo mật** (tab)
   - Hiện username MB (mask: `09xx•••234`).
   - Nút "Cập nhật mật khẩu" → mở inline form (collapsible).
   - Nút "Ngắt kết nối" (destructive, có confirm) — clear creds + tắt sync.

### Tinh chỉnh visual

- Dùng **Sheet** (`side="right"`, `w-[480px]`) thay `Dialog max-w-lg` → đủ chỗ thở, không che bảng tài khoản.
- Header có icon MB Bank (dùng `Banknote` lucide hoặc text "MB" trên nền đỏ MB `#E60012` để brand-aware).
- Badge trạng thái dùng dot + label thay vì pill nặng:
  - success: `bg-emerald-500` dot + "Thành công"
  - error: `bg-destructive` dot + "Lỗi"
  - running: dot có animate-pulse + "Đang chạy"
- Timestamp dùng `formatDistanceToNow` (date-fns vi) thay vì datetime đầy đủ → ngắn gọn, dễ đọc.
- Toggle "Tự động đồng bộ" có sub-label: "Chạy mỗi 5 phút qua Worker an toàn".
- Spacing dùng `space-y-5`, card padding `p-4`, không dồn quá sát.

### Tiểu tiết UX

- Khi `saveCreds` thành công → tự động chuyển sang trạng thái B mà không cần đóng dialog.
- Sau khi bấm "Đồng bộ ngay", thay vì toast + setTimeout, **poll** `getMbSyncStatus` mỗi 2s trong 30s đến khi status đổi → cập nhật real-time. Hiển thị spinner inline trên card trạng thái.
- Nút "Đồng bộ ngay" disable khi `last_sync_status === "running"`.
- Có ô tooltip giải thích "Worker là gì?" để user không kỹ thuật hiểu.

## Files sẽ thay đổi

| File | Thay đổi |
|---|---|
| `src/components/mbbank-connect-dialog.tsx` | Viết lại toàn bộ UI theo cấu trúc 2 trạng thái + 3 tab. Dùng `Sheet` thay `Dialog`. Thêm polling sau "Đồng bộ ngay". |
| `src/components/mbbank-status-badge.tsx` (mới) | Tách `StatusBadge` ra component riêng có dot+label+animate-pulse. |

Không đổi: server functions, API endpoints, schema, Worker.

## Không bao gồm trong phạm vi này

- Không thêm OAuth/OTP flow MB (MB chưa có Open Banking công khai cho cá nhân).
- Không đổi logic mã hoá / Worker / cron.
- Không thêm trang riêng — vẫn dùng dialog/sheet mở từ trang `/bank/accounts`.

Bấm **Implement plan** để mình thực hiện.