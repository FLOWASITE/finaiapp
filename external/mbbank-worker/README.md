# MB Bank Sync Worker

Worker Node.js chạy ngoài Lovable (Cloudflare Workers không tương thích với thư viện `mbbank` vì cần WASM OCR + native crypto). Worker:

- Cron 5 phút/lần tự kéo sao kê + số dư từ MB → đẩy về Lovable qua webhook ký HMAC.
- Lắng nghe HTTP `POST /sync-now` để hỗ trợ nút "Đồng bộ ngay" trong UI.
- Cache session đăng nhập 30 phút (tránh login spam bị MB khoá tài khoản).
- Backoff: account fail ≥3 lần liên tiếp sẽ tạm dừng đến khi user bấm "Đồng bộ ngay".

## 1. Cài đặt nhanh (VPS Ubuntu 22.04+, Node 20+)

```bash
# Cài Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Lấy mã nguồn
git clone <repo> /opt/mbbank-worker   # hoặc copy thư mục external/mbbank-worker
cd /opt/mbbank-worker
npm install
cp .env.example .env
nano .env   # điền LOVABLE_INGEST_URL + MBBANK_WORKER_SECRET

# Test
node index.mjs
curl http://localhost:3000/healthz
```

## 2. Biến môi trường (`.env`)

| Biến | Mô tả |
|---|---|
| `LOVABLE_INGEST_URL` | URL gốc Lovable, ví dụ `https://app.finai.one/api/public/mbbank` |
| `MBBANK_WORKER_SECRET` | Giống secret cấu hình trong Lovable (`MBBANK_WORKER_SECRET`) |
| `SYNC_INTERVAL_CRON` | Mặc định `*/5 * * * *` |
| `HISTORY_DAYS` | Số ngày sao kê lấy mỗi lần (mặc định 7) |
| `PORT` / `HOST` | Mặc định `3000` / `0.0.0.0` |
| `SESSION_TTL_MS` | Cache session MB (mặc định 30 phút) |
| `MAX_FAIL_STREAK` | Số lần fail liên tiếp trước khi tạm dừng (mặc định 3) |

## 3. Reverse proxy Nginx + HTTPS Let's Encrypt

> **Quan trọng**: Lovable yêu cầu `MBBANK_WORKER_URL` phải là **domain HTTPS** (Cloudflare/edge sẽ chặn IP trần — lỗi 1003). Đừng dùng `http://14.225.x.x:3000`.

### Trỏ DNS

Tạo A record `mbworker.your-domain.com` → IP VPS. Nếu dùng Cloudflare, để **DNS only (mây xám)** cho subdomain này, hoặc bật proxy nhưng phải có chứng chỉ Origin.

### Nginx config

```nginx
# /etc/nginx/sites-available/mbworker
server {
    listen 80;
    server_name mbworker.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mbworker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mbworker.your-domain.com
```

Sau khi cài certbot, kiểm tra:

```bash
curl https://mbworker.your-domain.com/healthz
# {"ok":true,"cron":"*/5 * * * *",...}
```

## 4. systemd service (auto-restart)

`/etc/systemd/system/mbbank-worker.service`:

```ini
[Unit]
Description=MB Bank Sync Worker
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/mbbank-worker
EnvironmentFile=/opt/mbbank-worker/.env
ExecStart=/usr/bin/node /opt/mbbank-worker/index.mjs
Restart=always
RestartSec=10
StandardOutput=append:/var/log/mbbank-worker.log
StandardError=append:/var/log/mbbank-worker.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mbbank-worker
sudo systemctl status mbbank-worker
sudo tail -f /var/log/mbbank-worker.log
```

## 5. Cấu hình Lovable

Vào **Settings → Backend → Secrets** và đảm bảo:

- `MBBANK_WORKER_URL` = `https://mbworker.your-domain.com` (KHÔNG có dấu `/` cuối)
- `MBBANK_WORKER_SECRET` = chuỗi ngẫu nhiên, giống hệt `.env` trên VPS

## 6. Endpoint Lovable mà worker gọi

| Method & Path | Mục đích |
|---|---|
| `GET  /accounts` | Lấy danh sách TK cần sync + credential (giải mã server-side) |
| `POST /sync-log-start` | Tạo bản ghi log "running" trước mỗi lần sync |
| `POST /ingest` | Đẩy giao dịch + số dư, đóng log |
| `POST /sync-error` | Báo lỗi, đóng log |

Tất cả request đều ký HMAC-SHA256 với secret + timestamp; Lovable reject nếu chữ ký lệch hoặc cũ hơn 5 phút.

## 7. Bảo mật

- Mật khẩu MB lưu mã hoá AES-256-GCM trong DB, chỉ giải mã trong RAM của worker khi đăng nhập.
- Khử trùng giao dịch nhờ `external_ref` (refNo MB) + UNIQUE INDEX.
- Worker tự cache session 30 phút, **không** login lại mỗi tick → tránh MB khoá tài khoản.

## 8. Troubleshooting

| Triệu chứng | Nguyên nhân |
|---|---|
| `Worker trả về 401` từ Lovable | `MBBANK_WORKER_SECRET` lệch giữa 2 nơi |
| UI báo "Không kết nối được Worker" | `MBBANK_WORKER_URL` sai, Nginx chưa chạy, hoặc firewall chặn 443 |
| Lỗi Cloudflare 1003 | Đang dùng IP thay vì domain. Đổi sang HTTPS domain |
| `login failed` mỗi lần | Captcha OCR fail. Kiểm tra `saveWasm` đã tạo file `.wasm` trong working dir; thử xoá file đó để tải lại model |
| Tài khoản MB bị khoá | MB phát hiện login quá nhiều — vào app MB đổi mật khẩu, đợi 24h |
