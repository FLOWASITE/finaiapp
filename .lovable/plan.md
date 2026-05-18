# Kế hoạch: Khắc phục lỗi không kết nối được TCT

## Nguyên nhân

Server function gọi `https://hoadondientu.gdt.gov.vn:30000` và trả `fetch failed`. Backend của Lovable Cloud chạy trên Cloudflare Workers — runtime này **chặn outbound tới các cổng không chuẩn** (chỉ cho 80/443/8080/8443…). Cổng `:30000` của Tổng cục Thuế nằm ngoài whitelist, nên không có cách nào "fix trong code" để gọi thẳng được. Đây không phải bug trong app — là giới hạn hạ tầng.

Việc retry, đổi header, dùng IP, hay đổi `User-Agent` đều **không giải quyết** được, vì kết nối TCP bị chặn trước khi HTTPS handshake.

## Giải pháp: Relay proxy

Bạn chạy một **proxy nhỏ** ở nơi không bị chặn (VPS, máy văn phòng, Render/Railway/Fly…), proxy này forward request từ Lovable Cloud → TCT. Server functions chỉ cần đổi base URL.

```text
Browser → Lovable Cloud (Workers) → [Your Proxy :443] → hoadondientu.gdt.gov.vn:30000
```

## Các bước

### 1. Thêm secret `TCT_PROXY_URL`
- Ví dụ: `https://tct-proxy.your-domain.com` (phải là HTTPS, cổng 443).
- Nếu không set, server fn vẫn fallback gọi trực tiếp (giữ tương thích cho ai chạy local).

### 2. Sửa `src/lib/einvoices-sync.functions.ts`
- Thay hằng số `TCT_BASE` bằng hàm `getTctBase()` đọc `process.env.TCT_PROXY_URL` (nếu có) hoặc dùng URL gốc.
- Áp dụng cho mọi chỗ đang `fetch(\`${TCT_BASE}/...\`)`: captcha, login, query invoices, verify…
- Cải thiện error message: khi `fetch failed` và chưa cấu hình proxy → gợi ý user thiết lập `TCT_PROXY_URL`.

### 3. Cung cấp proxy mẫu (file mới `docs/tct-proxy/`)
Một script Node/Express ~30 dòng:

```js
// server.js
import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
const app = express();
app.use("/", createProxyMiddleware({
  target: "https://hoadondientu.gdt.gov.vn:30000",
  changeOrigin: true,
  secure: true,
}));
app.listen(process.env.PORT || 8080);
```

Kèm README hướng dẫn deploy nhanh lên Render hoặc chạy `node server.js` trên VPS có tên miền + SSL (Caddy / Cloudflare Tunnel cũng được).

### 4. Cập nhật trang `credentials.tsx`
Thêm callout nhỏ ở đầu trang:
> Lovable Cloud không gọi trực tiếp được tới cổng :30000 của TCT. Hãy thiết lập secret `TCT_PROXY_URL` trỏ tới proxy của bạn (xem docs/tct-proxy).

## Phạm vi không thay đổi
- Schema DB, encryption, captcha flow, UI dialog đồng bộ — giữ nguyên.
- Không đụng tới các route khác.

## Lựa chọn thay thế (nếu bạn không muốn tự host proxy)
- **Cloudflare Tunnel** từ một máy có internet bình thường → public HTTPS URL → dùng làm `TCT_PROXY_URL`.
- **Đẩy toàn bộ phần đồng bộ TCT ra ngoài** Lovable Cloud (vd: chạy worker trên VPS, ghi kết quả thẳng vào DB qua REST API của Lovable Cloud).

Bạn duyệt plan thì mình triển khai code + viết sẵn proxy mẫu để bạn copy chạy.
