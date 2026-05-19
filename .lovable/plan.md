# Daily Digest tự động trong ChatDock

## Tóm tắt
Mỗi ngày vào giờ user cấu hình, hệ thống tự tạo 1 tin nhắn `assistant` trong thread "📅 Daily Digest" (cố định mỗi user), tổng hợp:
- Cảnh báo AI (AR/AP/tồn kho) từ `ai_insights`
- KPI hôm qua (doanh thu, thu/chi, số HĐ)
- Hoá đơn nhận trong inbox chưa xử lý

ChatDock hiện badge số digest chưa đọc. User tự bật/tắt trong Settings.

## Database

### `user_digest_prefs` (mới)
- `user_id` (PK, FK auth.users)
- `tenant_id` (FK tenants) — digest theo từng tenant active
- `enabled` bool default true
- `send_hour` int (0-23) default 8 — giờ VN
- `last_sent_date` date — chống gửi trùng
- RLS: user chỉ đọc/sửa của chính mình

### Cột mới trên `chat_messages`
- thêm `metadata.kind = 'daily_digest'` để filter (không đổi schema, dùng jsonb sẵn)

### Cột mới trên `chat_threads`
- thêm constant `kind = 'digest'` (text đã free-form) — query 1 thread/user

## Server

### `src/routes/api/public/hooks/daily-digest.ts` (mới)
- POST, bảo vệ bằng `apikey` header = anon key
- Query `user_digest_prefs` WHERE `enabled=true AND last_sent_date < today AND send_hour <= current_hour_vn`
- Với mỗi user:
  1. Lấy ai_insights chưa dismissed của tenant
  2. Query KPI hôm qua (sales_invoices, customer_receipts, supplier_payments)
  3. Đếm inbox documents `status='uploaded'/'ai_read'`
  4. Render markdown digest
  5. Upsert thread `kind='digest'` (title "📅 Daily Digest"), insert message role=assistant với `metadata={kind:'daily_digest', date:today}`
  6. Update `last_sent_date`
- Dùng `supabaseAdmin` (bypass RLS)

### `src/lib/digest-prefs.functions.ts` (mới)
`getDigestPrefs` / `updateDigestPrefs` — server fn cho Settings UI

### pg_cron (qua `supabase--insert`)
- Schedule mỗi giờ: `0 * * * *` → POST hook (mỗi user chỉ gửi 1 lần/ngày khi đến giờ)

## Frontend

### `src/routes/_app/settings/index.tsx` (sửa)
Thêm card "Daily Digest":
- Switch bật/tắt
- Select giờ gửi (6-12h)
- Nút "Gửi thử ngay"

### `src/components/chat/chat-dock.tsx` (sửa)
- Badge đỏ trên icon dock = đếm message có `metadata.kind='daily_digest'` và `created_at > last_seen_digest_at` (lưu localStorage)
- Khi mở dock, clear badge

### `src/components/chat/thread-list.tsx` (sửa)
- Thread digest pin lên đầu với icon 📅 và label đặc biệt

## Test
1. Bật digest 8h → chờ cron / gọi tay endpoint → thấy thread "Daily Digest" với markdown đầy đủ 3 section
2. Gọi 2 lần cùng ngày → chỉ 1 message (idempotent qua `last_sent_date`)
3. Badge ChatDock hiển thị "1", mở dock → tắt
4. Tắt switch → cron skip user đó
