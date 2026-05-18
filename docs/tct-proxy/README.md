# TCT Proxy

Cloudflare Workers (runtime của Lovable Cloud) **chỉ cho phép outbound qua các cổng chuẩn (80/443/8080/8443…)**. Cổng `:30000` của cổng HĐĐT Tổng cục Thuế (`https://hoadondientu.gdt.gov.vn:30000`) bị chặn ở tầng TCP, không thể "fix bằng code" trên Lovable Cloud.

Cách giải quyết: bạn tự host một HTTPS proxy nhỏ ở nơi không bị chặn (VPS, máy văn phòng, Render/Railway/Fly…). Proxy chỉ forward 1:1 mọi request sang TCT.

```
Browser → Lovable Cloud (Workers) → [Your Proxy :443] → hoadondientu.gdt.gov.vn:30000
```

Sau khi có URL proxy (vd `https://tct-proxy.your-domain.com`), thêm secret **`TCT_PROXY_URL`** trong project và mọi server function sẽ tự dùng nó.

---

## Cách 1 — Node + Express (đơn giản nhất)

### 1. Cài

```bash
mkdir tct-proxy && cd tct-proxy
npm init -y
npm i express http-proxy-middleware
```

### 2. `server.js`

Copy nguyên file `server.js` trong thư mục này.

### 3. Chạy local (test)

```bash
node server.js
# proxy chạy ở http://localhost:8080
```

### 4. Deploy

Bất kỳ host nào có public HTTPS đều dùng được:

- **Render.com (free):** New Web Service → connect repo → Build `npm install`, Start `node server.js`. Render tự cấp HTTPS.
- **Railway / Fly.io:** tương tự.
- **VPS có tên miền:** chạy `node server.js` rồi đặt Caddy / Nginx phía trước cho HTTPS.
- **Không có domain?** Dùng [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — `cloudflared tunnel --url http://localhost:8080` cho ra URL HTTPS miễn phí.

### 5. Set secret trên Lovable

Project Settings → Backend / Secrets → thêm:

```
TCT_PROXY_URL = https://tct-proxy.your-domain.com
```

(Không có dấu `/` ở cuối.)

Xong. Vào lại trang **HĐĐT → Khai báo tài khoản → Kiểm tra kết nối**.

---

## Cách 2 — Cloudflare Tunnel siêu nhanh (không cần code)

```bash
# Trên một máy có internet bình thường (Mac/Linux/WSL):
brew install cloudflared      # hoặc tải binary từ cloudflare
cloudflared tunnel --url https://hoadondientu.gdt.gov.vn:30000 \
  --http-host-header hoadondientu.gdt.gov.vn:30000
```

Cloudflared in ra URL dạng `https://random-words.trycloudflare.com` → dùng làm `TCT_PROXY_URL`. Lưu ý URL miễn phí này là tạm; production nên gắn domain riêng.

---

## Bảo mật

- Proxy này về cơ bản là open — ai biết URL đều dùng được để gọi tới TCT. Nên:
  - Đặt URL khó đoán, hoặc
  - Thêm header `x-proxy-token` so sánh với env trong `server.js` (tự bổ sung).
- Không log body request (chứa username/password TCT).
