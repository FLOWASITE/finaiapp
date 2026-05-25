
## Hoàn thiện V2 classifier & Product catalog — Plan triển khai

Đã chốt 3 câu hỏi:
1. **A1 — TSCĐ**: dùng bảng `fixed_assets` hiện có, auto chọn `fa_category` mặc định theo `asset_kind` (211/213), KTT sửa sau.
2. **A2 — 242**: chỉ tạo record `allocated_assets` ở trạng thái `pending`, KTT vào trang Phân bổ duyệt từng kỳ.
3. **B1 — Roles NCC**: 4 checkbox đơn giản trong form NCC.

---

### Bước 1 — Chặn rò rỉ TSCĐ & 242 (A1 + A2 + A3)

**Server (`src/lib/categorize.functions.ts` — `approveProposal`)**
- Mở rộng Zod schema:
  ```
  tscd_confirm: z.object({
    useful_life_years: z.number().int().min(1).max(50),
    asset_kind: z.enum(['tangible','intangible']),
  }).optional(),
  allocate_242: z.object({
    months: z.number().int().min(1).max(60),
  }).optional(),
  ```
- Sau khi insert `journal_entries` + `journal_lines` thành công:
  - **Nếu có `tscd_confirm`**: tìm line có account bắt đầu `211`/`213`, insert vào `fixed_assets` với:
    - `cost = debit của line đó`, `useful_life_years`, `start_date = entry_date`
    - `fa_category_id`: chọn category mặc định theo `asset_kind` (query `fa_categories` lấy 1 row tương ứng, hoặc null nếu chưa có — KTT sửa sau)
    - `supplier_id`, `tenant_id`, `description` từ invoice
  - **Nếu line nào có account = `242`**: insert vào `allocated_assets` với `status='pending'`, `total_amount = debit`, `months_allocated = allocate_242.months ?? amortize_months trong dto`, `start_date = entry_date`, `account_target` mặc định (642 — hoặc lấy từ tenant.default_cost_center).

**Frontend (`ProposalCard.tsx` + `/categorize` batch bar)**
- Đã có `TscdConfirmDialog` mở khi single approve. Bổ sung:
  - Khi `cat-242-allocate` warning có mặt → mở thêm `Allocate242Dialog` nhỏ (chỉ 1 ô input `months`, default từ warning), kết quả gửi vào `allocate_242`.
  - **Batch approve**: filter `eligibleIds` để loại proposal có warning `cat-tscd-confirm` hoặc `cat-242-allocate`. Tooltip: "Cần xác nhận từng cái — bấm vào để mở".

---

### Bước 2 — UI Roles NCC (B1)

**Migration**: cột `suppliers.roles text[]` đã có (đã verify). Không cần migration mới.

**`src/components/parties/party-form.tsx`** (hoặc tương đương)
- Thêm section "Vai trò cho AI hạch toán" (chỉ hiện cho supplier, không cho customer):
  - 4 checkbox: "Nguồn hàng bán lại (156)", "Nguồn NVL (152)", "NCC dịch vụ (642/641)", "NCC tài sản (211/242)"
  - Lưu vào `roles` array
- Bonus: filter chip trong danh sách `/suppliers`.

---

### Bước 3 — Ghi & dùng `kind_v2` (B3 + B2)

**B3 — Ghi `kind_v2`**:
- Tại nơi insert `ai_line_classifications` (tìm trong `feedback/emit.server.ts` và bất cứ chỗ nào ghi memory), thêm `kind_v2: classified.kind_v2 ?? null`.

**B2 — History boost v2**:
- Sửa `getVendorHistoryDistCached` để trả về thêm `dist_v2` (group by `kind_v2` thay vì `kind`).
- `engine.classifyLines` truyền `historyDist: dist_v2` vào `ctxV2` qua `buildClassifyContextV2({...ctx, historyDist})`. Mở rộng signature `buildClassifyContextV2` để nhận historyDist.

---

### Bước 4 — Onboarding step (B4)

**`src/components/onboarding/setup-stepper.tsx`** (hoặc nơi định nghĩa steps):
- Thêm step "Hoạt động kinh doanh & Danh mục mặt hàng" trỏ tới `/settings/business-activity`.
- Copy ngắn: "Giúp Fin hạch toán đúng 152/153/156/211/213/242 cho từng mặt hàng. Bỏ qua bước này → Fin sẽ phải đoán."
- Mark step done khi `business_types.length > 0`.

---

### Bước 5 — Mở rộng v2 sang bulk intake & sales (C1 + C2)

**C1 — Bulk intake**:
- `src/lib/ai/classify-import.functions.ts` + `bulk-intake.server.ts`: thay `classifyLine` bằng `classifyLineV2` khi `tenantCfg.business_types.length > 0`, fallback v1 khi rỗng.

**C2 — Sales engine**:
- `sales-engine.server.ts`: dùng v2 để chọn 156 vs 1561 cho DN trading. Tác động thấp, làm cuối.

---

### Bước 6 — Import CSV catalog (C3)

- Trong trang `/settings/business-activity`, thêm nút "Import CSV":
  - Format: `name,sku,aliases,note` (aliases phân cách bằng `|`)
  - Parse client-side với PapaParse (đã có trong dự án nếu không thì `bun add papaparse`), gọi `upsertProductCatalog` tuần tự.

---

### Database changes

Không cần migration mới — tất cả cột (`suppliers.roles`, `ai_line_classifications.kind_v2`, `tenant_product_catalog`, `tenants.business_types/ccdc_allocation_threshold/default_cost_center`) đã có ở migration `20260525035002`.

### Thứ tự build đề nghị

1. **Bước 1** — Critical, chặn rò rỉ TSCĐ. Build trước.
2. **Bước 2** — Unlock signal mạnh nhất của v2.
3. **Bước 3** — Học vendor pattern v2.
4. **Bước 4** — Đưa vào onboarding.
5. **Bước 5–6** — Mở rộng phạm vi (làm sau khi 1–4 ổn).

Sau khi bạn duyệt plan, mình sẽ build từ Bước 1.
