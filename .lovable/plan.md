# Kế hoạch: Đồng bộ giao dịch MB Bank vào hệ thống

## Kiến trúc tổng thể

```text
┌─────────────────────┐    HTTPS POST     ┌──────────────────────────┐
│  mbbank-worker      │  (HMAC signed)    │  Lovable App (Worker)    │
│  (Node.js – VPS /   │ ────────────────► │  /api/public/mbbank/*    │
│   Railway / Render) │                   │                          │
│                     │                   │  ├─ ingest (transactions)│
│  - thư viện mbbank  │   GET creds       │  ├─ balance (số dư)      │
│  - cron 5 phút      │ ◄──────────────── │  └─ accounts (config)    │
│  - WASM captcha     │                   └────────────┬─────────────┘
└─────────────────────┘                                │
                                                       ▼
                                          ┌────────────────────────┐
                                          │  Postgres (Supabase)   │
                                          │  bank_accounts +       │
                                          │  bank_transactions +   │
                                          │  auto-match engine     │
                                          └────────────────────────┘
```

Lovable **không** chạy thư viện `mbbank` (Cloudflare Workers không hỗ trợ axios cookie-jar + WASM Node bindings). Toàn bộ logic gọi MB Bank nằm trong một service Node riêng do bạn deploy; Lovable đóng vai trò control-plane + data store + UI + đối soát.

---

## Phần 1 — Thay đổi Database (migration)

### 1.1. Mở rộng `bank_accounts` để lưu credential MB Bank
- `mb_username` text (nullable) — CIF hoặc SĐT đăng ký
- `mb_password_enc` text (nullable) — mã hoá AES-GCM bằng `EINVOICE_ENC_KEY`
- `mb_password_iv` text — IV của AES-GCM
- `sync_enabled` boolean default false
- `sync_interval_minutes` int default 5
- `last_synced_at` timestamptz
- `last_sync_status` text — 'ok' | 'error' | 'running'
- `last_sync_error` text
- `current_balance` numeric — cập nhật mỗi lần sync
- `balance_synced_at` timestamptz

### 1.2. Khoá chống trùng giao dịch
- Thêm cột `external_ref` text vào `bank_transactions` (refNo MB Bank trả về)
- UNIQUE INDEX `(bank_account_id, external_ref) WHERE external_ref IS NOT NULL`

### 1.3. Bảng log
- `bank_sync_logs` (tenant_id, bank_account_id, started_at, finished_at, status, txn_fetched, txn_new, error_text)

### 1.4. Function đối soát
- `fn_auto_match_bank_txn(p_txn_id uuid)` — tìm `customer_receipts` (amount > 0) hoặc `supplier_payments` (amount < 0) cùng `tenant_id`, ±3 ngày, cùng số tiền, fuzzy match nội dung CK (số HĐ, mã KH, tên).
- Trigger `AFTER INSERT ON bank_transactions` → gọi function → set `status='matched'/'suggested'/'unmatched'` + `match_confidence`.

### 1.5. RLS
- Mở rộng policies hiện có cho cột mới. Worker dùng service-role nên RLS không cản.

---

## Phần 2 — Server routes (TanStack, trong Lovable)

Tất cả đặt dưới `src/routes/api/public/mbbank/` để bypass auth gateway, **bảo mật bằng HMAC-SHA256** với secret `MBBANK_WORKER_SECRET`.

### 2.1. `POST /api/public/mbbank/ingest`
- Body: `{ bank_account_id, balance, transactions: [{ external_ref, txn_date, amount, description, counterparty, running_balance }] }`
- Verify HMAC header `x-mb-signature`
- Dùng `supabaseAdmin` → upsert vào `bank_transactions` (ON CONFLICT external_ref DO NOTHING)
- Update `bank_accounts.current_balance`, `last_synced_at`, `last_sync_status='ok'`
- Insert `bank_sync_logs`
- Trigger DB sẽ tự match.

### 2.2. `GET /api/public/mbbank/accounts`
- Worker gọi để lấy danh sách TK cần sync + credential
- Verify HMAC
- Trả về `[{ id, mb_username, mb_password (đã giải mã trong server fn), sync_interval_minutes }]`
- **Chỉ trả TK có `sync_enabled=true`**

### 2.3. `POST /api/public/mbbank/sync-error`
- Worker báo lỗi → update `last_sync_status='error'`, `last_sync_error=...`

### 2.4. Helper crypto (`src/lib/crypto.server.ts`)
- `encryptAesGcm(plain, key)` / `decryptAesGcm(cipher, iv, key)` dùng Node `crypto`.

---

## Phần 3 — Server functions cho UI (createServerFn)

`src/lib/mbbank.functions.ts`:
- `setMbCredentials({ bank_account_id, username, password })` — mã hoá rồi lưu
- `toggleMbSync({ bank_account_id, enabled })`
- `triggerMbSyncNow({ bank_account_id })` — POST sang worker URL (`MBBANK_WORKER_URL`)
- `getMbSyncStatus({ bank_account_id })` — đọc log mới nhất
- `listUnmatchedTransactions()`
- `manualMatchTransaction({ txn_id, entry_type, entry_id })`

---

## Phần 4 — UI

### 4.1. Trang `/banking/accounts` (sửa trang hiện có nếu đã có)
- Mỗi TK có nút "Kết nối MB Bank" → mở dialog nhập username + password
- Toggle bật/tắt auto-sync
- Hiển thị số dư realtime + thời điểm sync cuối + status badge

### 4.2. Trang `/banking/transactions`
- Tab: Tất cả | Chưa khớp | Đề xuất khớp | Đã khớp
- Mỗi giao dịch: ngày, số tiền (xanh thu/đỏ chi), nội dung, đối tác
- Cột "Đối soát": badge confidence + nút "Khớp với phiếu thu/chi" mở picker
- Nút "Đồng bộ ngay" gọi `triggerMbSyncNow`

### 4.3. Widget Dashboard
- Card "Số dư ngân hàng" tổng hợp các TK đã sync
- Card "Giao dịch chưa đối soát" với count

---

## Phần 5 — Worker Node bên ngoài (bạn deploy)

Repo riêng (tôi sẽ tạo trong thư mục `external/mbbank-worker/` để bạn copy ra). Lovable không build nó, chỉ giữ source tham khảo.

- `package.json`: `mbbank`, `node-cron`, `axios`
- `index.ts`:
  1. Mỗi 5 phút: GET `/api/public/mbbank/accounts` (HMAC) → danh sách TK
  2. Với mỗi TK: `new MB({ username, password })` → `login()` → `getBalance()` + `getTransactionsHistory({ from: lastSync - 1d, to: now })`
  3. POST `/api/public/mbbank/ingest` với HMAC
  4. Lỗi → POST `/api/public/mbbank/sync-error`
- Biến môi trường: `LOVABLE_INGEST_URL`, `MBBANK_WORKER_SECRET`
- README hướng dẫn deploy Railway/Render/VPS.

---

## Phần 6 — Bảo mật

- Mật khẩu MB Bank: AES-256-GCM với `EINVOICE_ENC_KEY` (đã có)
- Webhook HMAC-SHA256 + `timingSafeEqual`, reject request quá 5 phút (chống replay)
- Worker chỉ giữ password trong RAM khi đang gọi
- Audit log tất cả thao tác đối soát thủ công
- Secret mới cần xin: `MBBANK_WORKER_SECRET`, `MBBANK_WORKER_URL`

---

## Thứ tự thực hiện

1. **Migration** — schema + trigger đối soát + RLS
2. **Crypto helper** + **server routes** ingest/accounts/sync-error
3. **Server functions** quản lý credential + sync
4. **UI**: trang TK ngân hàng (kết nối/toggle) + trang giao dịch (đối soát)
5. **Widget** dashboard
6. **Worker repo** `external/mbbank-worker/` + README deploy
7. Yêu cầu bạn add 2 secrets `MBBANK_WORKER_SECRET` + `MBBANK_WORKER_URL`, deploy worker, test end-to-end với 1 TK thật

---

## Phần kỹ thuật cần lưu ý

- **Idempotency**: dùng `external_ref` của MB Bank làm khoá chống trùng. Lần đầu sync bạn nên giới hạn 30–90 ngày để tránh nuốt lịch sử quá lớn.
- **Đối soát fuzzy**: bước 1 chỉ match exact theo số tiền + ngày ±3 + chứa mã phiếu trong description. Sau này có thể nâng cấp bằng AI (Lovable AI Gateway có sẵn `google/gemini-2.5-flash-lite`) để parse nội dung CK tiếng Việt phức tạp.
- **Rate limit MB Bank**: thư viện đã giữ session, tuyệt đối không < 3 phút/lần; nếu fail captcha quá 3 lần liên tiếp → tạm dừng 1 giờ.
- **Không hỗ trợ Transfer/OTP** trong phase này (đã loại theo ý bạn) — giảm rủi ro pháp lý + bảo mật.
