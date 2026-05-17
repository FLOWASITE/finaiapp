# Roadmap: Chuyển Database + File Storage sang on-premise

> Đây là **roadmap chuẩn bị**, chưa thực hiện ngay. App tiếp tục build trên Lovable Cloud cho đến khi đóng băng tính năng → migrate trước khi go-live.

## Bối cảnh hiện tại
- App đang dùng Lovable Cloud (hosted Supabase): Postgres + Auth + Storage + RLS + auto-generated TypeScript types.
- 26 bảng nghiệp vụ + RLS theo `auth.uid()`, 1 bucket `invoices` (private), 5 database functions, dùng `has_role()` + `app_role` enum.
- Backend code: TanStack `createServerFn` với `requireSupabaseAuth` middleware → mọi query đi qua Supabase client.

## Khuyến nghị: Self-host **full Supabase stack** bằng Docker

**Lý do** (so với managed Postgres khác như Neon/RDS):
1. **Không phải viết lại code** — `@supabase/supabase-js` trỏ URL khác là xong. Auth, RLS, Storage, types đều hoạt động y nguyên.
2. **Giữ RLS theo `auth.uid()`** — đây là tuyến phòng thủ chính của app. Nếu bỏ Supabase Auth phải tự viết JWT + rewrite mọi `WHERE user_id = auth.uid()`.
3. **Giữ luôn File Storage** — `storage.objects` + RLS giống hệt, chỉ cần migrate bucket `invoices`.
4. **Đáp ứng tuân thủ on-premise** — toàn bộ stack chạy trên server công ty/VN.
5. **Có docker-compose chính thức** ([supabase/supabase](https://github.com/supabase/supabase/tree/master/docker)) — cài 30 phút.

**Trade-off**:
- Tự lo backup, monitoring, SSL, upgrade.
- Cần server ≥ 4 vCPU / 8 GB RAM cho production VN-scale.

## Lộ trình 5 giai đoạn

### Giai đoạn 0 — Bây giờ → trước khi migrate (chuẩn bị code)
Việc làm song song trong lúc tiếp tục build feature:
- ✅ Đã dùng `createServerFn` (không phụ thuộc Edge Functions cụ thể).
- ⚠️ Refactor mọi import secret để **chỉ đọc trong `.handler()`**, không ở module scope (đã đúng).
- ⚠️ Tránh dùng tính năng Supabase độc quyền: Realtime, pgvector, Vault, pg_graphql. Hiện app **không dùng** → ok.
- ⚠️ Thêm tag `[migration-sensitive]` vào comment chỗ nào hardcode `supabase.co` hoặc URL Cloud (hiện không có).

### Giai đoạn 1 — Chuẩn bị hạ tầng (1-2 ngày)
**Khuyến nghị hạ tầng tối thiểu cho app kế toán VN (~20 user, ~100k journal_lines/năm)**:
- VPS: Vietnix / VinaHost / FPT Cloud / tự dựng — Ubuntu 22.04, 4 vCPU, 8 GB RAM, 100 GB SSD.
- Domain con: `db.congty.vn` + SSL Let's Encrypt qua Caddy/Nginx reverse proxy.
- Firewall: chỉ mở 443 ra ngoài; Postgres 5432 chỉ nội bộ docker network.

**Cài Supabase stack**:
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env       # đổi JWT_SECRET, POSTGRES_PASSWORD, SITE_URL
docker compose up -d
```
Cho ra:
- Postgres: `postgres://postgres:***@localhost:5432/postgres`
- API gateway (Kong): `https://db.congty.vn` — thay cho `*.supabase.co`
- Studio (admin UI): `https://db.congty.vn:3000`
- Storage API + bucket lưu local volume / S3.

### Giai đoạn 2 — Dump schema + data (1 ngày)
1. **Dump schema** từ Lovable Cloud:
   ```bash
   supabase db dump --schema public,storage --file schema.sql
   supabase db dump --schema auth --data-only --file auth-data.sql
   supabase db dump --schema public --data-only --file data.sql
   ```
2. **Restore** vào server mới (đúng thứ tự: schema → auth users → data).
3. **Storage objects**: dùng `rclone` copy bucket `invoices` từ Supabase S3 endpoint → local MinIO/disk.
4. **Verify**: chạy script đếm `journal_lines`, `invoices`, `sales_invoices` → khớp số.

### Giai đoạn 3 — Switch app sang DB mới (vài giờ)
File cần đổi (rất ít):
- `.env` production:
  ```
  VITE_SUPABASE_URL=https://db.congty.vn
  VITE_SUPABASE_PUBLISHABLE_KEY=<anon key sinh từ JWT_SECRET mới>
  SUPABASE_URL=https://db.congty.vn
  SUPABASE_PUBLISHABLE_KEY=<anon>
  SUPABASE_SERVICE_ROLE_KEY=<service role mới>
  ```
- `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`: **không đổi** — đọc từ env.
- `src/integrations/supabase/types.ts`: regen bằng `supabase gen types typescript --db-url=postgres://...` → output y hệt vì schema giống.

**Người dùng phải reset password** (vì JWT secret khác → token cũ vô hiệu). Cách giảm đau: import `auth.users` qua dump → user vẫn còn, chỉ đổi mật khẩu lần đầu.

### Giai đoạn 4 — Frontend deploy ở đâu
2 lựa chọn:
- **A. Vẫn deploy frontend trên Lovable** → trỏ env sang DB on-prem. Đơn giản nhất. Yêu cầu: DB phải có public HTTPS endpoint (qua domain công ty).
- **B. Self-host cả frontend**: build `bun run build` → đưa output lên cùng VPS, serve qua Caddy. Hoàn toàn on-premise, kể cả khi đứt internet vẫn dùng được nội bộ LAN.

Khuyến nghị **B** vì mục tiêu là tuân thủ on-premise.

### Giai đoạn 5 — Vận hành (định kỳ)
- **Backup**: `pg_dump` cron hàng đêm → S3/MinIO/NAS, giữ 30 bản. Storage bucket rsync hàng giờ.
- **Monitoring**: Grafana + Prometheus (có sẵn trong supabase docker), alert qua Telegram khi disk > 80%, query > 5s.
- **Upgrade**: bám theo release Supabase tự host, test ở staging trước.
- **Sao lưu khẩn**: dump → encrypt → sync sang tủ NAS thứ 2 (rule 3-2-1).

## So sánh nhanh các phương án

| Tiêu chí | Self-host Supabase | Managed Postgres + tự code Auth | Giữ Lovable Cloud |
|---|---|---|---|
| Đáp ứng on-premise | ✅ | ⚠️ (DB only, Auth vẫn cloud) | ❌ |
| Code phải sửa | ~0 dòng | Rất nhiều (Auth, RLS, Storage) | 0 |
| Thời gian migrate | 2-3 ngày | 2-4 tuần | — |
| Chi phí hạ tầng/tháng | ~500k-2tr (VPS) | 200k-1tr | Theo usage Cloud |
| Tự vận hành | Cao | Trung | Thấp |

→ **Self-host Supabase là lựa chọn cân bằng nhất cho use case này.**

## Việc cần làm ngay (trong giai đoạn 0)
Không có. Code hiện tại đã sẵn sàng cho migration. **Tiếp tục hoàn thiện feature** theo kế hoạch:
- Phase 3 BCTC: drill-down chỉ tiêu → journal_lines
- Phase 4: PDF có chữ ký
- Phase 11: Quản trị bán hàng / mua hàng nâng cao

Khi nào sắp go-live → mình tạo plan triển khai chi tiết Giai đoạn 1-4.

## Câu hỏi để chốt (trả lời khi tới giai đoạn 1)
1. Server đặt ở đâu? VPS thuê (Vietnix/FPT) hay máy chủ vật lý nội bộ?
2. Domain con dự kiến cho DB? (`db.tencongty.vn` chẳng hạn)
3. Có cần multi-tenant (mỗi khách hàng 1 DB riêng) hay 1 stack dùng chung?
4. SLA backup: chấp nhận mất tối đa bao nhiêu giờ data nếu sự cố?
