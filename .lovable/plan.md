
## Mục tiêu

Nâng cấp `classifyLine()` từ 4 nhãn (`goods/fixed_asset/ccdc/service`) lên **7 nhãn** tương ứng 7 TK; bổ sung **tầng "purpose detection"** (mục đích sử dụng của DN mua) — bước hiện chưa có. Tôn trọng chế độ kế toán của tenant (TT200 vs TT133).

## Quyết định đã chốt (theo trả lời của user)

1. **TT200 vs TT133**: TK chính map theo `tenants.accounting_standard`.
   - TT200: 211 (TSCĐ hữu hình) / 213 (TSCĐ vô hình) / 242 (chi phí trả trước dài hạn).
   - TT133: gộp **211** cho cả hữu hình lẫn vô hình; **242** thay cho 1421/242 (dùng 242 thống nhất).
2. **Ưu tiên rule khi DN vừa thương mại vừa sản xuất**: `product_catalog` THẮNG `raw_material_suppliers`. Item có trong danh mục mặt hàng kinh doanh → 156 chắc chắn.
3. **TK 242 là NHÃN CHÍNH** (không phải flag). 7 nhãn gồm:
   - `service` → 627/641/642/635
   - `raw_material` → 152
   - `tools` → 153 (CCDC giá thấp, xuất 1 lần)
   - `prepaid` → **242** (CCDC giá cao dùng nhiều kỳ HOẶC dịch vụ trả trước nhiều kỳ — VD thuê văn phòng 12 tháng, bảo hiểm năm, license SaaS năm)
   - `goods_for_resale` → 156
   - `fixed_asset_tangible` → 211
   - `fixed_asset_intangible` → 213 (TT200) / 211 (TT133)
4. **Onboarding product catalog**: BẮT BUỘC nhập ngay. UI phải nêu rõ lý do: "Fin cần biết mặt hàng DN kinh doanh để hạch toán đúng TK 156 (hàng hoá) thay vì nhầm sang 153/152/211."

## Phạm vi thay đổi

### 1. Migration database

**`tenants` — thêm cột config purpose detection:**
| Cột | Kiểu | Default | Ý nghĩa |
|---|---|---|---|
| `business_types` | `text[]` | `'{}'` | `trading` / `manufacturing` / `service` (multi-select) |
| `ccdc_allocation_threshold` | `bigint` | `5000000` | VND ≥ ngưỡng & dùng nhiều kỳ → nhãn `prepaid` (242) |
| `default_cost_center` | `text` | `'642'` | TK chi phí mặc định cho dịch vụ: 627 / 641 / 642 |

**`tenant_product_catalog` (mới)** — danh mục mặt hàng DN kinh doanh:
- `id`, `tenant_id` (FK), `sku` (nullable), `name`, `name_norm` (lowercased, no-diacritic, indexed), `aliases text[]`, `note`, `created_at`, `updated_at`
- RLS: tenant member đọc/ghi theo `current_tenant_id()`.

**`supplier_role` (mới hoặc cột mới trên `suppliers`)** — đánh dấu NCC:
- Thêm cột `suppliers.role text[]` (`resale_source` | `raw_material_source` | `service_provider` | `asset_vendor`). Tận dụng bảng `suppliers` đã có thay vì duplicate list MST.

**`ai_line_classifications`**: thêm cột `kind_v2 text` để học dần, giữ `kind` cũ để backward compat.

### 2. `src/lib/ai/classify-line.ts` — viết lại

```ts
export type LineKind =
  | 'service' | 'raw_material' | 'tools' | 'prepaid'
  | 'goods_for_resale' | 'fixed_asset_tangible' | 'fixed_asset_intangible';

export type AccountingStandard = 'TT200' | 'TT133' | 'TT99';

export type ClassifyResult = {
  kind: LineKind;
  account: string;                    // TK đã resolve theo standard
  need_useful_life_confirm?: boolean; // TSCĐ: buộc KTT xác nhận >1 năm
  amortize_months?: number | null;    // gợi ý số kỳ phân bổ cho 'prepaid'
  confidence: number;
  signals: ClassifySignal[];
};

export type ClassifyContext = {
  tenant: {
    accounting_standard: AccountingStandard;
    business_types: ('trading'|'manufacturing'|'service')[];
    ccdc_allocation_threshold: number; // default 5_000_000
    default_cost_center: '627'|'641'|'642';
    vsic_codes: string[];
    product_catalog_norm: Set<string>;     // mặt hàng kinh doanh đã norm
  };
  vendor?: {
    mst?: string;
    vsic?: string;
    roles?: ('resale_source'|'raw_material_source'|'service_provider'|'asset_vendor')[];
  };
  historyDist?: Partial<Record<LineKind, number>>;
};
```

**Pipeline 3 stage — early exit:**

```text
STAGE 1 — Service vs Prepaid-service detection
  isService = UoM dịch vụ | keyword (phí/cước/dịch vụ/tư vấn/thuê/bảo trì/
              vận chuyển/hoa hồng/quảng cáo/đào tạo/kiểm toán) | vendor VSIC 49-96 (trừ TM)
  if isService:
    if isMultiPeriodPrepaid(line):   # "từ dd/mm/yyyy đến dd/mm/yyyy", "năm", "12 tháng",
                                     # "annual", "license năm", "bảo hiểm"
      return { kind:'prepaid', account: pickPrepaidAccount(standard),
               amortize_months: inferMonths(line) ?? 12 }
    return { kind:'service', account: pickExpenseAccount(ctx) }  # 627/641/642/635

STAGE 2 — Purpose detection (ƯU TIÊN từ trên xuống)
  # Rule ưu tiên: product_catalog > supplier role > business_type heuristic > history
  if name_norm ∈ tenant.product_catalog_norm:
    purpose = 'resell'                            # chắc chắn
  elif vendor.roles ⊇ {'resale_source'}:
    purpose = 'resell'
  elif vendor.roles ⊇ {'raw_material_source'} AND 'manufacturing' ∈ business_types:
    purpose = 'production'
  elif 'trading' ∈ business_types AND isBulkQty(line) AND not isIntangible(line):
    purpose = 'resell'
  elif 'manufacturing' ∈ business_types AND (rawMaterialKeyword(name) OR vendor VSIC 10-33):
    purpose = 'production'
  else:
    purpose = 'internal'

  if purpose == 'resell':
    return { kind:'goods_for_resale', account:'156' }
  if purpose == 'production':
    return { kind:'raw_material', account:'152' }

STAGE 3 — Internal use → giá + bản chất
  netPrice = effectivePreVatUnitPrice(line)
  intangible = isIntangible(line)
    # +: phần mềm bản quyền vĩnh viễn, perpetual license, quyền sd đất, bằng sáng chế, nhãn hiệu
    # -: thuê bao/subscription/annual recurring (đã bị Stage 1 bắt)

  if netPrice >= 30_000_000 AND durableHint(line):
    if intangible:
      return { kind:'fixed_asset_intangible',
               account: standard==='TT133' ? '211' : '213',
               need_useful_life_confirm: true }
    return { kind:'fixed_asset_tangible', account:'211', need_useful_life_confirm:true }

  # CCDC giá cao dùng nhiều kỳ → prepaid (242)
  if netPrice >= ctx.tenant.ccdc_allocation_threshold AND isDurableTool(line):
    return { kind:'prepaid', account: pickPrepaidAccount(standard),
             amortize_months: inferMonths(line) ?? 12 }

  return { kind:'tools', account:'153' }
```

**Helpers mới:**
- `isMultiPeriodPrepaid(line)`: regex `năm|kỳ|niên độ|12 tháng|annual|yearly`, dải ngày `từ \d{2}/\d{2}/\d{4} đến \d{2}/\d{2}/\d{4}`, keyword `bảo hiểm|thuê.*văn phòng|license năm|premium annual`.
- `inferMonths(line)`: từ dải ngày hoặc keyword (năm → 12, quý → 3).
- `isIntangible(line)`: keyword vĩnh viễn/perpetual/quyền sd đất/bằng sáng chế/nhãn hiệu/bí quyết.
- `pickPrepaidAccount(standard)`: trả `'242'` cho cả TT200/TT133/TT99 (TT133 dùng 242 thống nhất theo chốt).
- `pickExpenseAccount(ctx)`:
  - keyword "lãi vay/phí ngân hàng" → 635
  - keyword "quảng cáo/hoa hồng/vận chuyển bán hàng/marketing" → 641
  - keyword "sản xuất/điện nhà máy/bảo trì máy móc" → 627
  - else → `tenant.default_cost_center`
- `isBulkQty(line)`: qty ≥ 10 với UoM đếm được, hoặc qty ≥ 100 với UoM khối lượng/thể tích.

### 3. `src/lib/categorize/engine.server.ts` & `cache.server.ts`

- `getTenantConfigCached(tenantId)`: load `tenants` + `tenant_product_catalog` (build Set name_norm) + cache 5 phút.
- `getVendorRoleCached(supplierId)`: load `suppliers.role`.
- Truyền `ClassifyContext` đầy đủ vào `classifyLine()` cho mỗi dòng.
- Nếu `kind === 'prepaid'`: engine sinh bút toán **1 entry** Nợ 242 / Có 331, và emit `ProposalSignal { label:'Phân bổ qua ${months} tháng', ... }` + `amortize_months` vào DTO. (Lịch sinh bút toán phân bổ hàng tháng để pha sau, không thuộc scope này.)
- Nếu `need_useful_life_confirm`: cap `confidence ≤ 0.75`, set `band='review'`, emit warning `cat-tscd-life`.

### 4. `src/lib/categorize/rules.ts` — `defaultAccountFor`

Map 7 kind × accounting_standard → account:

| kind | TT200 | TT133 | TT99 |
|---|---|---|---|
| service | 627/641/642/635 (theo cost_center) | — | — |
| raw_material | 152 | 152 | 152 |
| tools | 153 | 153 | 153 |
| prepaid | 242 | 242 | 242 |
| goods_for_resale | 156 | 156 | 156 |
| fixed_asset_tangible | 211 | 211 | 211 |
| fixed_asset_intangible | 213 | **211** | 213 |

### 5. UI — Onboarding & Settings (bắt buộc)

5a. **Setup wizard mới** (`src/components/setup-stepper.tsx` + step component):

Step "**Hoạt động kinh doanh & Danh mục Fin cần biết**":
- Banner: "Fin cần thông tin này để hạch toán đúng. Cùng 1 cái laptop 50tr, nếu DN bán laptop thì là TK 156 (hàng hoá), nếu mua dùng nội bộ thì là TK 211 (TSCĐ). Không có thông tin, Fin sẽ đoán mò và bạn phải sửa thủ công nhiều."
- Checkbox đa chọn: Thương mại / Sản xuất / Dịch vụ
- Conditional — nếu **Thương mại** được tick → bắt buộc nhập **Danh mục mặt hàng kinh doanh** (chips + import CSV):
  - Hint: "Liệt kê mặt hàng DN nhập về để BÁN LẠI. Fin sẽ tự động map về TK 156."
  - Tối thiểu 1 dòng.
- Conditional — nếu **Sản xuất** → input các nhóm NVL chính (chips).
- Input ngưỡng phân bổ CCDC (default 5,000,000 VND).
- Select TK chi phí mặc định: 627 / 641 / 642.

5b. **`src/lib/tenant-setup-fields.ts`**: thêm `business_types` và (conditional) `product_catalog_min_1` vào `REQUIRED_TENANT_FIELDS` để `setup_completed` chỉ true khi đã khai báo.

5c. **Settings page (Trí nhớ AI / Tenant settings)**:
- Tab "Hoạt động kinh doanh" — sửa các trường trên sau onboarding.
- Tab "Mặt hàng kinh doanh" — CRUD `tenant_product_catalog`.
- Trên trang Nhà cung cấp — thêm multi-select `role` để gắn nhãn NCC (resale_source / raw_material_source / service_provider / asset_vendor).

### 6. UI — Hiển thị classification

`src/components/categorize/ProposalCard.tsx` & `src/components/inbox/inbox-item-sheet.tsx`:
- Badge 7 màu cho 7 nhãn — đặc biệt phân biệt rõ 152/153/156/242/211/213.
- Khi `kind === 'prepaid'` → chip vàng "Phân bổ {N} tháng (242)".
- Khi `need_useful_life_confirm` → banner vàng + 2 nút "Xác nhận TSCĐ >1 năm" / "Chuyển sang CCDC (153)".
- Tooltip "Vì sao TK này?" liệt kê `signals[]` (đã có sẵn cơ chế signals).

### 7. Backward compatibility

- `classifyLine()` cũ vẫn export wrapper: 4 nhãn cũ map sang 7 nhãn mới (`goods → goods_for_resale` nếu trading, ngược lại `tools`; `fixed_asset → fixed_asset_tangible`; `ccdc → tools`; `service → service`).
- `ai_line_classifications.kind` cũ giữ nguyên; ghi đồng thời `kind_v2`.
- Học dần (memory): khi user chốt nhãn v2, tăng confidence cho item+vendor lần sau.

## Thứ tự thực hiện

1. **Migration**: cột `tenants` mới + bảng `tenant_product_catalog` + cột `suppliers.role` + cột `kind_v2` + RLS.
2. Cập nhật `src/lib/ai/classify-line.ts` (giữ wrapper backward compat).
3. Cập nhật `rules.ts` `defaultAccountFor` theo bảng TT200/TT133/TT99.
4. Wire context trong `engine.server.ts` + `cache.server.ts` (load tenant config + product catalog).
5. Onboarding wizard step "Hoạt động kinh doanh" + ràng buộc `setup_completed`.
6. Settings UI: CRUD product catalog + edit business_types + supplier role.
7. UI badges 7 nhãn + confirm dialog TSCĐ + chip "Phân bổ N tháng".
8. QA test case:
   - Laptop 50tr — DN trading có "Laptop" trong catalog → 156.
   - Laptop 50tr — DN consulting (service) → 211 + need_useful_life_confirm.
   - Bao gạo — quán cơm (manufacturing, vendor VSIC 10–11) → 152.
   - Bao gạo — cửa hàng gạo có "Gạo" trong catalog → 156.
   - Bao gạo — DN văn phòng (không trading, không manufacturing) → 153 (mua tặng NV).
   - Hợp đồng thuê văn phòng 12 tháng (50tr/năm) → 242, amortize_months=12.
   - License Office 365 năm → 242.
   - Office 365 perpetual (1 lần) 35tr → 213 (TT200) / 211 (TT133).
   - Bàn ghế 8tr (CCDC giá cao) → 242, amortize 12.
   - Bút bi 50k → 153.
