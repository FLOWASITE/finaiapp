
## Mục tiêu

Trang `/tax/gtgt` hiện là placeholder. Trang `/tax/` (index) có 1 tab VAT đơn giản nhưng bị "kẹt" trong cùng route với TNDN/TNCN, không khớp menu sidebar (sidebar trỏ `/tax/gtgt`). Cần dựng `/tax/gtgt` thành workspace Thuế GTGT đầy đủ, theo đúng đặc tả trong `src/data/specs/tax.ts` và TT 219/2013 + TT 80/2021.

## Phạm vi (scope)

**Trong scope** — chỉ phân hệ GTGT:
- Trang `/tax/gtgt` đầy đủ.
- Server functions mới trong `src/lib/tax-vat.functions.ts`.
- 2 bảng mới: `vat_filings` (tờ khai đã chốt) + `vat_filing_adjustments` (phụ lục điều chỉnh 01-1/GTGT).
- 1 trường mới ở `tenants`: `vat_method` (khấu trừ | trực tiếp_pp_kd | trực tiếp_dt) + `vat_declaration_freq` (monthly | quarterly).

**Ngoài scope** (giữ nguyên):
- TNDN, TNCN (vẫn placeholder ở route riêng, dùng logic sẵn có trong `tax.functions.ts`).
- Tích hợp eTax/TVAN (chỉ xuất XML HTKK để upload thủ công, như hiện tại).
- Sửa engine hạch toán/đối soát.

## Cấu trúc trang `/tax/gtgt`

```text
┌───────────────────────────────────────────────────────────────┐
│ Thuế GTGT                                  [Xuất XML HTKK ▼] │
│ Kỳ: [Tháng ▼] [11/2026 ▼]   PP: Khấu trừ   ● Đã chốt: chưa  │
├───────────────────────────────────────────────────────────────┤
│ TỔNG QUAN  | BẢNG KÊ BÁN  | BẢNG KÊ MUA  | ĐIỀU CHỈNH | LỊCH SỬ│
├───────────────────────────────────────────────────────────────┤
│ Stat cards: DT chưa VAT • VAT đầu ra • Mua vào • VAT đầu vào │
│             VAT phải nộp • Chuyển kỳ sau                      │
│                                                               │
│ Bảng phân bổ theo thuế suất (0/5/8/10/KCT/KKKNT) — mã CT HTKK│
│                                                               │
│ Cảnh báo (warnings):                                          │
│   ⚠ 3 hóa đơn mua không có MST — bị loại VAT (tax-001)        │
│   ⚠ 2 hóa đơn ≥20tr thanh toán tiền mặt — loại VAT (tax-002)  │
│   ⚠ Chênh sổ cái: VAT 3331 = 12.4tr, tính từ sales = 12.1tr   │
│                                                               │
│ [Chốt tờ khai 01/GTGT kỳ này]   [Xem trước XML]               │
└───────────────────────────────────────────────────────────────┘
```

### Tab 1 — Tổng quan
- Stat cards (đã có ở `tax/index.tsx`) + nâng cấp: thêm "VAT bị loại khấu trừ" do vi phạm điều kiện.
- Bảng phân bổ theo thuế suất 0/5/8/10/KCT/KKKNT (mở rộng từ hiện tại + 2 nhóm KCT/KKKNT từ `src/lib/vat-codes.ts`).
- Khu vực **Cảnh báo trước khi chốt**:
  - `tax-001`: liệt kê HĐ mua thiếu MST nhà cung cấp.
  - `tax-002`: HĐ mua ≥20tr có payment_method = "cash" / không có chứng từ NH.
  - **Đối chiếu sổ cái**: so VAT đầu ra (sales_invoices) vs số dư phát sinh có TK 3331 trong kỳ; VAT đầu vào (invoices) vs phát sinh nợ TK 133. Highlight chênh lệch >1.000đ.
- Hai nút action: "Chốt tờ khai" và "Xem trước XML".

### Tab 2 — Bảng kê bán ra
- Bảng đầy đủ: mã/số HĐ, ngày, người mua, MST, mặt hàng (rút gọn), DT chưa VAT, thuế suất, VAT, tổng, trạng thái (`issued|cancelled|adjusted|replaced`).
- Filter: thuế suất, có/không MST, trạng thái.
- Cột "Nguồn": einvoice / nhập tay.
- Export CSV.

### Tab 3 — Bảng kê mua vào
- Tương tự bảng bán + cột "Đủ điều kiện khấu trừ" (Yes/No + lý do).
- Filter: đủ/không đủ điều kiện, hình thức thanh toán.

### Tab 4 — Điều chỉnh (phụ lục 01-1/GTGT)
- List các hóa đơn điều chỉnh/thay thế đã được ghi nhận trong kỳ (sales_invoices.adjusts_invoice_id, invoices.adjusts_invoice_id — kiểm tra schema; nếu chưa có sẽ dùng `vat_filing_adjustments`).
- Form thêm điều chỉnh thủ công: chọn kỳ gốc, số HĐ, lý do, số tiền điều chỉnh +/-, VAT điều chỉnh.
- Hiển thị nét gạch đỏ/xanh: điều chỉnh tăng/giảm.

### Tab 5 — Lịch sử & trạng thái
- List `vat_filings` đã chốt theo kỳ: kỳ, ngày chốt, người chốt, VAT phải nộp, link tải XML.
- Mỗi dòng có nút "Xem lại snapshot" (mở dialog hiển thị summary tại thời điểm chốt).
- Nút "Mở khóa" (nếu chưa nộp eTax và user là kế toán trưởng).

## Logic nghiệp vụ (server)

File mới: `src/lib/tax-vat.functions.ts`. Refactor `loadVatData` từ `tax.functions.ts` sang đây; `tax.functions.ts` re-export để không vỡ trang `/tax/`.

### `getVatPeriod({ year, period })`
- `period` = `"YYYY-MM"` (tháng) hoặc `"YYYY-Qn"` (quý). Tự suy từ `tenants.vat_declaration_freq`.
- Trả về:
  - `summary` (như hiện tại + `disallowedInputVat`, `byRate` mở rộng 6 nhóm).
  - `sales`, `purchases` đầy đủ trường.
  - `warnings[]`: mảng `{ rule: "tax-001"|"tax-002"|"reconcile_3331"|"reconcile_133", severity, invoiceIds[], delta? }`.
  - `reconcile`: `{ outputVatLedger, outputVatInvoices, inputVatLedger, inputVatInvoices }`.
  - `filing`: bản ghi `vat_filings` của kỳ nếu đã chốt (null nếu chưa).

### `commitVatFiling({ period })`
- Bắt buộc kỳ chưa bị chốt.
- Snapshot toàn bộ summary + ids hóa đơn nguồn vào `vat_filings.snapshot` (jsonb).
- Tạo bản ghi `vat_filings` (period, method, snapshot, xml, status='draft', committed_by, committed_at).
- Ghi `audit_logs` action `tax.vat.commit`.

### `reopenVatFiling({ filingId })`
- Chỉ user role `accountant`/`admin`/`owner` (kiểm qua `tenant_members`).
- Set status='reopened', ghi audit_log.

### `buildVatXml`
- Refactor: dùng snapshot từ `vat_filings` nếu đã chốt; nếu chưa thì compute on-the-fly.
- Support cả phương pháp **trực tiếp**: dùng template `04/GTGT-TT` thay vì `01/GTGT` (mapped theo `tenants.vat_method`).
- Mã chỉ tiêu HTKK đầy đủ hơn (ct22, ct23-43 như hiện tại + ct40a/40b cho điều chỉnh).

### `listVatFilings({ year })`
- Trả về tất cả filings trong năm + tổng VAT đã nộp/chuyển kỳ.

## Thay đổi schema (1 migration)

```sql
-- tenants: thêm cấu hình VAT
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vat_method text NOT NULL DEFAULT 'deduction'
    CHECK (vat_method IN ('deduction','direct_revenue','direct_value')),
  ADD COLUMN IF NOT EXISTS vat_declaration_freq text NOT NULL DEFAULT 'monthly'
    CHECK (vat_declaration_freq IN ('monthly','quarterly'));

-- Bảng tờ khai GTGT đã chốt
CREATE TABLE public.vat_filings (
  id uuid PK default gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,           -- giữ tương thích pattern cũ (user_id = tenant owner)
  period text NOT NULL,            -- "2026-11" | "2026-Q4"
  freq text NOT NULL,              -- monthly | quarterly
  method text NOT NULL,            -- deduction | direct_*
  snapshot jsonb NOT NULL,         -- summary + line ids
  xml text,
  status text NOT NULL DEFAULT 'draft',  -- draft | committed | submitted | reopened
  committed_by uuid,
  committed_at timestamptz,
  submitted_at timestamptz,
  ack_code text,                   -- mã giao dịch eTax (nhập tay)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  UNIQUE (tenant_id, period, status) DEFERRABLE INITIALLY DEFERRED
);

-- Bảng phụ lục điều chỉnh
CREATE TABLE public.vat_filing_adjustments (
  id uuid PK,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  filing_period text NOT NULL,        -- kỳ đang khai
  original_period text NOT NULL,      -- kỳ gốc bị điều chỉnh
  original_invoice_no text,
  direction text NOT NULL CHECK (direction IN ('increase','decrease')),
  base_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz default now()
);

-- GRANT + RLS theo pattern tenant scope (auth.uid() = user_id hoặc has_tenant_role)
```

(Cả hai bảng đều: GRANT to authenticated/service_role, ENABLE RLS, policies scope theo `auth.uid() = user_id` để đồng nhất với pattern hiện có của project — các bảng `invoices`, `sales_invoices`, `report_notes` đều đang dùng `user_id`.)

## Tệp sẽ tạo/sửa

**Tạo:**
- `supabase/migrations/<ts>_vat_module.sql`
- `src/lib/tax-vat.functions.ts` — `getVatPeriod`, `commitVatFiling`, `reopenVatFiling`, `listVatFilings`, `addVatAdjustment`, `removeVatAdjustment`, refactor `buildVatXml`.
- `src/routes/_app/tax/gtgt.tsx` — workspace 5 tab.
- `src/components/tax/vat-warnings.tsx` — UI cảnh báo điều kiện khấu trừ.
- `src/components/tax/vat-period-picker.tsx` — chọn tháng/quý theo `vat_declaration_freq`.
- `src/components/tax/vat-filings-history.tsx`.
- `src/components/tax/vat-adjustment-dialog.tsx`.

**Sửa:**
- `src/lib/tax.functions.ts` — chuyển `loadVatData`/`getVatReturn`/`buildVatXml` thành re-export từ `tax-vat.functions.ts` để `/tax/` index không vỡ; deprecate dần.
- `src/routes/_app/tax/index.tsx` — chuyển hướng tab VAT sang `/tax/gtgt` (vẫn giữ tab TNDN/TNCN tại đây, hoặc redirect sang `/tax/gtgt`).
- `src/components/app-sidebar.tsx` — nếu cần đồng bộ badge `taxDaysLeft` cho `/tax/gtgt` (đã trỏ đúng).

## Điểm cần xác nhận

1. **Phương pháp khấu trừ vs trực tiếp**: dự định mặc định "deduction" cho tất cả tenant hiện tại. Có cần migration đọc từ field nào hiện có không? (Không thấy field tương đương trong schema.)
2. **Cảnh báo `tax-002` (≥20tr không TM)**: phụ thuộc field `payment_method` trên `invoices`. Nếu schema chưa có sẽ chỉ cảnh báo dựa trên `total >= 20_000_000` + thiếu reference tới bank_transactions.
3. **Đối chiếu sổ cái 3331/133**: dùng `journal_entries` + `journal_lines` (đã có trong CIT logic).
4. **Phụ lục điều chỉnh**: thiết kế bảng riêng `vat_filing_adjustments` (đơn giản, không phụ thuộc field `adjusts_invoice_id` trên invoices/sales_invoices).

Sau khi user duyệt plan: chạy migration trước, chờ xác nhận, rồi mới code phần TS/TSX.
