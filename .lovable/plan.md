## Vấn đề phát hiện sau khi review

Tôi đã đọc lại worker hiện tại + tài liệu chính thức của thư viện [`mbbank` (CookieGMVN)](https://github.com/CookieGMVN/MBBank). Có **6 lỗi nghiêm trọng** khiến đồng bộ không thể hoạt động ổn định:

### 1. Sai định dạng ngày (chắc chắn fail)
- Thư viện yêu cầu `fromDate`/`toDate` dạng **`dd/mm/yyyy`**.
- Worker đang gửi `yyyymmdd` (`fmtDate` strip dấu `-`). → MB trả lỗi/empty.

### 2. Thiếu cấu hình OCR captcha (login fail ~100%)
MB Bank chặn login bằng captcha. Thư viện cần khai báo:
- `preferredOCRMethod: "default"` (tự dùng WASM model)
- `saveWasm: true` (cache model, login nhanh hơn từ lần 2)

Worker hiện tại `new MB({ username, password })` thiếu hẳn → login lần đầu rất chậm, lần sau tải lại WASM, dễ timeout.

### 3. Worker KHÔNG có HTTP server → nút "Đồng bộ ngay" không bao giờ chạy được
- `triggerMbSyncNow` ở Lovable gọi `POST {WORKER_URL}/sync-now`.
- Nhưng `external/mbbank-worker/index.mjs` chỉ có `cron.schedule(...)` — **không listen port nào**.
- → mọi request `/sync-now` đều fail. Đây là lý do user gặp lỗi Cloudflare 1003 / không kết nối được.

### 4. Không gửi `sync_log_id` ⇒ không tạo được audit trail mỗi lần chạy
Endpoint `/ingest` và `/sync-error` đã hỗ trợ field `sync_log_id` nhưng worker không tạo & truyền vào. UI "Lịch sử gần đây" sẽ trống.

### 5. Parse response chưa khớp shape thực
- `balance.acct_list` / `acctNo` / `currentBalance`: tên field thư viện trả là `acctList` (camelCase) — `find` bằng `acctNo` đúng nhưng cần fallback.
- `running_balance` thư viện trả `availableBalance` chứ không phải `runningBalance`.

### 6. Login mỗi tick (5 phút/lần) → MB block tài khoản
Theo cảnh báo trong README: spam login dễ bị **suspended account**. Cần cache session/`mb` instance, chỉ relogin khi 401.

---

## Kế hoạch sửa

### A. Viết lại `external/mbbank-worker/index.mjs`

Cấu trúc mới: **Fastify HTTP server + cron job nội bộ**, expose 2 endpoint:
- `GET  /healthz` — health-check cho reverse proxy.
- `POST /sync-now` — ký HMAC, body `{ bank_account_id }`. Đẩy account đó vào queue chạy ngay.

Sửa logic:
1. Khởi tạo `new MB({ username, password, preferredOCRMethod: "default", saveWasm: true })`.
2. **Cache MB instance** theo `account_no` trong `Map`, TTL 30 phút; chỉ relogin khi expired hoặc bắt lỗi auth.
3. Đổi `fmtDate` → `dd/MM/yyyy`.
4. Trước mỗi lần sync: `POST /api/public/mbbank/sync-log-start` (endpoint mới) để lấy `sync_log_id`, rồi gửi kèm khi gọi `/ingest` hoặc `/sync-error`.
5. Mapping mới cho transaction:
   - `external_ref`: `refNo` → fallback `transactionId` → fallback hash.
   - `txn_date`: parse `dd/MM/yyyy HH:mm:ss` → ISO date.
   - `amount = creditAmount - debitAmount`.
   - `running_balance`: `availableBalance ?? runningBalance ?? null`.
6. Backoff: nếu account fail 3 lần liên tiếp → `last_sync_status='error'` và skip cron đến khi user can thiệp.
7. Concurrency: queue tuần tự, delay 5s giữa account để tránh rate-limit.

### B. Thêm endpoint Lovable `src/routes/api/public/mbbank/sync-log-start.ts`

`POST { bank_account_id }` → tạo row `bank_sync_logs(status='running')` và trả `{ sync_log_id }`. Worker gọi trước mỗi lần sync.

### C. Cập nhật `src/lib/mbbank.functions.ts` (`triggerMbSyncNow`)

Giữ nguyên logic, chỉ thêm timeout 15s + thông báo rõ ràng khi worker không phản hồi.

### D. Cập nhật `external/mbbank-worker/package.json` + README

- Thêm `fastify`, `pino` deps.
- README mới gồm:
  - Cài đặt VPS Ubuntu (Node 20+).
  - **Cài tesseract optional** (chỉ khi chọn OCR mode tesseract).
  - Mẫu config Nginx reverse-proxy + Let's Encrypt → để `MBBANK_WORKER_URL` là domain HTTPS (giải quyết luôn lỗi Cloudflare 1003 trước đó).
  - Mẫu `systemd` service để auto-restart.
  - Lệnh kiểm tra: `curl https://your-domain/healthz`.

### E. Migration nhỏ (nếu chưa có)

Đảm bảo `bank_sync_logs` có `status` chấp nhận `'running'` (hiện đã free-text → OK, không cần sửa).

---

## Technical details

**File mới/sửa:**
- `external/mbbank-worker/index.mjs` — viết lại hoàn toàn (~200 dòng): Fastify + cron + cache + queue.
- `external/mbbank-worker/package.json` — thêm `fastify@^4`.
- `external/mbbank-worker/README.md` — guide deploy mới có Nginx + systemd.
- `src/routes/api/public/mbbank/sync-log-start.ts` — endpoint mới (HMAC-protected).
- `src/lib/mbbank.functions.ts` — thêm `AbortSignal.timeout(15000)` trong `triggerMbSyncNow`.

**Không động đến:** schema DB, RLS, UI dialog, crypto helpers, `/ingest`, `/accounts`, `/sync-error`.

---

Bấm **Implement plan** để mình bắt tay vào sửa.