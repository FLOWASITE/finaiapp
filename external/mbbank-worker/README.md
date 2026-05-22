# MB Bank Sync Worker

Worker Node chạy ngoài Lovable (Cloudflare Workers không tương thích với thư viện `mbbank`). Định kỳ 5 phút gọi MB Bank lấy số dư + giao dịch, đẩy về Lovable qua webhook HMAC.

## Deploy

### Railway / Render / VPS Node 20+

```bash
cd external/mbbank-worker
npm install
cp .env.example .env
# Sửa .env với LOVABLE_INGEST_URL + MBBANK_WORKER_SECRET
npm start
```

### Biến môi trường

| Biến | Mô tả |
|---|---|
| `LOVABLE_INGEST_URL` | URL gốc Lovable, ví dụ `https://app.finai.one/api/public/mbbank` |
| `MBBANK_WORKER_SECRET` | Giống secret cấu hình trong Lovable |
| `SYNC_INTERVAL_CRON` | Mặc định `*/5 * * * *` |
| `HISTORY_DAYS` | Số ngày sao kê lấy mỗi lần (mặc định 7) |

## Bảo mật

- Mật khẩu MB Bank chỉ giữ trong RAM khi đang gọi.
- Mọi request HTTP tới Lovable đều ký HMAC-SHA256 với secret + timestamp, server reject nếu > 5 phút.
- Giao dịch trùng được khử nhờ `external_ref` (refNo MB Bank).

## Endpoint Lovable

- `GET  /accounts` → danh sách TK cần sync + credential (giải mã server-side)
- `POST /ingest` → đẩy giao dịch + số dư
- `POST /sync-error` → báo lỗi
