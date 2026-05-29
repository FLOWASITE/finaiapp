# Kiến trúc hiệu năng cho FinAI — Bản chốt

Dựa trên 3 quyết định của bạn:
- Quy mô < 200K dòng/tenant → **bỏ qua Giai đoạn 3 (Partitioning)**, làm 1 + 2 + 4
- **Giữ 100% Supabase Storage** cho XML/PDF, không thêm AWS S3
- Seal kỳ **có thể unseal** với cơ chế 2-người-ký (owner + KTT)

---

## Giai đoạn 1 — Index + Period Seal + Balance Yearly (1 sprint, ưu tiên cao)

### 1.1 Composite indexes (migration, dùng `CONCURRENTLY`)
- `journal_entries (tenant_id, entry_date DESC)`
- `journal_entries (tenant_id, entry_date DESC, id)` — keyset pagination
- `journal_lines (account_code)` + giữ `(entry_id)` đã có
- `invoices (tenant_id, issue_date DESC, status)`
- `sales_invoices (tenant_id, issue_date DESC, status)`
- `customer_receipts (tenant_id, pay_date DESC)`
- `supplier_payments (tenant_id, pay_date DESC)`
- `documents (tenant_id, sha256)` — chống trùng XML

### 1.2 Period Seal với cơ chế 2-người-ký

**Schema thay đổi:**
```sql
ALTER TABLE fiscal_periods
  ADD COLUMN is_sealed boolean NOT NULL DEFAULT false,
  ADD COLUMN sealed_at timestamptz,
  ADD COLUMN sealed_by uuid REFERENCES auth.users(id),
  ADD COLUMN seal_reason text;

-- Bảng yêu cầu unseal (2-người-ký)
CREATE TABLE fiscal_period_unseal_requests (
  id uuid PK,
  tenant_id uuid,
  period_id uuid REFERENCES fiscal_periods(id),
  requested_by uuid,           -- owner HOẶC KTT khởi tạo
  requested_role text,         -- 'owner' | 'accountant_chief'
  reason text NOT NULL,
  approved_by uuid,            -- người ký thứ 2
  approved_role text,
  status text DEFAULT 'pending', -- pending | approved | rejected | expired
  created_at, approved_at, expires_at  -- TTL 48h
);
```

**Triggers chặn ghi:**
- `BEFORE INSERT OR UPDATE OR DELETE` trên: `journal_entries`, `journal_lines`, `invoices`, `sales_invoices`, `customer_receipts`, `supplier_payments` → raise exception nếu kỳ chứa ngày đó có `is_sealed = true`.

**RPC:**
- `seal_fiscal_period(period_id, reason)` — chỉ owner; ghi `audit_logs`
- `request_unseal_period(period_id, reason)` — owner hoặc KTT khởi tạo
- `approve_unseal_period(request_id)` — phải khác `requested_by` VÀ phải là role còn lại (owner ↔ KTT). Khi approved → set `is_sealed=false`, ghi audit, đóng request.
- Job dọn request `expires_at < now()` mỗi đêm.

**UI mới** (`/admin/data/seal`):
- Danh sách kỳ + trạng thái (open / soft_closed / closed / sealed)
- Nút "Niêm phong kỳ" (owner)
- Nút "Yêu cầu mở niêm phong" + form lý do
- Inbox "Yêu cầu chờ duyệt" cho người ký còn lại
- Banner cảnh báo "Cần chữ ký của KTT để hoàn tất mở niêm phong"

### 1.3 Aggregate yearly (`account_balance_yearly`)
```sql
CREATE TABLE account_balance_yearly (
  tenant_id uuid, account_code text, year int,
  opening_debit numeric, opening_credit numeric,
  period_debit numeric, period_credit numeric,
  closing_debit numeric, closing_credit numeric,
  updated_at timestamptz,
  PRIMARY KEY (tenant_id, account_code, year)
);
```
- Function `rebuild_account_balance_yearly(p_tenant, p_year)` — chạy sau mỗi đợt kết chuyển hoặc nightly cron.
- Báo cáo Sổ cái / BCTC năm đọc từ bảng này → < 200ms kể cả dữ liệu 10 năm.

---

## Giai đoạn 2 — Lifecycle XML/PDF trên Supabase Storage (1 sprint)

Vì giữ 100% Supabase Storage (không có lifecycle native như S3), giải pháp:

### 2.1 Chuẩn hoá path
- Layout mới: `einvoices/{tenant_id}/{year}/{month}/{invoice_id}/{kind}.{ext}`
- Migration đổi `documents.storage_path` (không re-upload file).

### 2.2 Tier hoá ở metadata layer
Thêm cột vào `documents`:
```sql
ALTER TABLE documents
  ADD COLUMN storage_tier text DEFAULT 'hot',  -- hot | warm | archived
  ADD COLUMN last_accessed_at timestamptz DEFAULT now(),
  ADD COLUMN compressed boolean DEFAULT false;
```

### 2.3 Cron job nén & archive
- **> 12 tháng**: server function `archive_old_documents` chạy weekly:
  - Tải XML/PDF từ Storage, gzip, upload lại với suffix `.gz`, xoá bản gốc, set `compressed=true`, `storage_tier='warm'`. Giảm ~70% dung lượng cho XML.
- **> 5 năm**: chuyển sang bucket `einvoices-archive` (cùng project, nhưng tách bucket giúp policy lifecycle dễ áp khi Supabase bổ sung sau).

### 2.4 Signed URL helper
- Function `get_document_url(doc_id)` server-side: tự decompress nếu cần, trả signed URL 5 phút. Update `last_accessed_at`.

---

## Giai đoạn 3 (CŨ — Partitioning): **BỎ QUA**

Lý do: < 200K dòng/tenant, composite index + aggregate yearly đã đủ. Theo dõi sau 6 tháng, nếu tenant nào vượt 500K thì kích hoạt lại.

---

## Giai đoạn 4 — Tìm kiếm nhanh (1 sprint)

Vì giữ stack đơn giản, **chưa cần Meilisearch ngoài**. Tận dụng PostgreSQL:

### 4.1 PG Trigram + Unaccent (built-in, không tốn extra service)
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Index trigram cho tìm kiếm fuzzy + diacritic-insensitive
CREATE INDEX idx_suppliers_name_trgm
  ON suppliers USING gin (unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX idx_invoices_search
  ON invoices USING gin (unaccent(lower(supplier_name || ' ' || coalesce(invoice_no,''))) gin_trgm_ops);
CREATE INDEX idx_products_name_trgm
  ON products USING gin (unaccent(lower(name)) gin_trgm_ops);
```

### 4.2 Search RPC
- `search_global(query, limit)` trả 3 nhóm: suppliers, invoices, products — < 100ms với 100K records.

### 4.3 UI
- CMD+K palette gọi `search_global` thay vì `ILIKE` rải rác.

**Khi nào nâng cấp lên Meilisearch?** Chỉ khi > 1M invoices toàn hệ thống hoặc PG search > 500ms.

---

## Tóm tắt thứ tự thực thi

| Sprint | Hạng mục | Migration count | Risk |
|--------|----------|-----------------|------|
| 1 | GĐ1: indexes + seal + balance_yearly | 3 migrations | Low |
| 2 | GĐ2: lifecycle XML | 1 migration + 1 cron + 1 server fn | Low |
| 3 | GĐ4: PG trigram search + CMD+K | 1 migration + 1 RPC + UI | Low |

Tổng: **3 sprint** để đạt hiệu năng mục tiêu (sổ cái < 200ms, search < 100ms, dung lượng XML giảm 70%, không kỳ đã ghi sổ nào có thể bị sửa lén).

---

## Đề xuất bắt đầu

Bạn duyệt plan này, em sẽ vào build mode và làm theo thứ tự:
1. Migration 1.1 (composite indexes) — an toàn nhất, có thể rollout ngay
2. Migration 1.2 (period seal + 2-người-ký) + UI `/admin/data/seal`
3. Migration 1.3 (account_balance_yearly) + job rebuild

Sau khi GĐ1 ổn định (1 tuần production), tiếp tục GĐ2 rồi GĐ4.
