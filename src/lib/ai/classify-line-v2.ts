/**
 * Phân loại mặt hàng v2 — 7 nhãn theo TT200/TT133, kết hợp MỤC ĐÍCH SỬ DỤNG.
 *
 * Cùng 1 item có thể vào TK khác nhau tuỳ DN làm gì:
 *   - DN trading + có item trong product_catalog → 156
 *   - DN manufacturing + vendor là NVL → 152
 *   - DN dịch vụ mua dùng nội bộ → 211/213/153/242
 *
 * Pure rules — browser & server safe.
 */
import { normalizeLineName, type RawLine } from "./classify-line";

export type LineKindV2 =
  | "service"
  | "raw_material"
  | "tools"
  | "prepaid"
  | "goods_for_resale"
  | "fixed_asset_tangible"
  | "fixed_asset_intangible";

export type AccountingStandard = "TT200" | "TT133" | "TT99";
export type BusinessType = "trading" | "manufacturing" | "service";
export type SupplierRole =
  | "resale_source"
  | "raw_material_source"
  | "service_provider"
  | "asset_vendor";

export type ClassifyContextV2 = {
  tenant: {
    accounting_standard: AccountingStandard;
    business_types: BusinessType[];
    ccdc_allocation_threshold: number; // VND
    default_cost_center: "627" | "641" | "642";
    vsic_codes?: string[];
    /** Đã normalize (lowercased, no-diacritic). */
    product_catalog_norm: Set<string>;
  };
  vendor?: {
    mst?: string | null;
    vsic?: string | null;
    roles?: SupplierRole[];
  };
  historyDist?: Partial<Record<LineKindV2, number>> | null;
};

export type ClassifySignalV2 = {
  label: string;
  weight: number;
  votes: LineKindV2;
};

export type ClassifyResultV2 = {
  kind: LineKindV2;
  account: string;
  /** Khi prepaid: số kỳ phân bổ gợi ý (mặc định 12 nếu không rõ). */
  amortize_months?: number | null;
  /** TSCĐ: buộc KTT xác nhận thời gian sử dụng > 1 năm. */
  need_useful_life_confirm?: boolean;
  /** 0..100 */
  confidence: number;
  signals: ClassifySignalV2[];
  /** Mục đích đã detect ở Stage 2 (debug). */
  purpose?: "resell" | "production" | "internal" | "service";
};

const KIND_META_V2: Record<
  LineKindV2,
  { label: string; defaultAccount: string }
> = {
  service: { label: "Dịch vụ", defaultAccount: "642" },
  raw_material: { label: "Nguyên vật liệu", defaultAccount: "152" },
  tools: { label: "Công cụ dụng cụ", defaultAccount: "153" },
  prepaid: { label: "Chi phí trả trước", defaultAccount: "242" },
  goods_for_resale: { label: "Hàng hoá (bán lại)", defaultAccount: "156" },
  fixed_asset_tangible: { label: "TSCĐ hữu hình", defaultAccount: "211" },
  fixed_asset_intangible: { label: "TSCĐ vô hình", defaultAccount: "213" },
};

export function kindMetaV2(kind: LineKindV2) {
  return KIND_META_V2[kind];
}

// ---------- Regex tín hiệu ----------
const UNIT_GOODS =
  /\b(kg|gam|g|tan|hop|thung|chai|lon|goi|cuon|bao|tui|lit|l|m3|m2|met|cay|cuc|vien|tam|ream|toa)\b/;
const UNIT_DURABLE =
  /\b(cai|chiec|bo|may|xe|don vi|item|pc|pcs|unit)\b/;
const UNIT_SERVICE =
  /\b(lan|gio|h|ngay|thang|nam|ky|km|chuyen|tour|dich vu|service|hop dong|goi dv)\b/;

const KW_SERVICE =
  /\b(phi|cuoc|dich vu|tu van|consult|thue|rent|bao tri|sua chua|van chuyen|ship|giao hang|logistic|internet|tien dien|tien nuoc|dien thoai|telecom|quang cao|advertis|marketing|hoa hong|commission|bao hiem|insurance|ve sinh|cleaning|kiem toan|audit|dao tao|training|khach san|hotel|an uong|nha hang|restaurant|tiep khach|cafe|tien xang|nhien lieu|toll|cau duong|grab|taxi|uber)\b/;

const KW_FINANCE_EXPENSE =
  /\b(lai vay|lãi vay|phi ngan hang|phí ngân hàng|chiet khau thanh toan|chuyển tiền|lệ phí|le phi)\b/i;

const KW_SELLING_EXPENSE =
  /\b(quang cao|advertising|marketing|hoa hong|commission|van chuyen ban hang|giao hang|ship|cuoc van chuyen|hoi cho|trien lam)\b/;

const KW_PRODUCTION_EXPENSE =
  /\b(san xuat|nha may|phan xuong|bao tri may|may moc thiet bi|nguyen lieu phu|nhien lieu sx)\b/;

const KW_RAW_MATERIAL =
  /\b(vai|thep|nhom|dong|sat|go|xi mang|gach|cat|da|son|hoa chat|bot mi|duong|muoi|gao|nuoc mam|nhua|cao su|da nguyen lieu|nguyen lieu|vat lieu thô|nvl|raw material)\b/;

const KW_FIXED_ASSET =
  /\b(may chu|server|laptop|workstation|desktop|may tinh|o to|xe tai|xe hoi|xe nang|xe may|may moc|day chuyen|nha xuong|kho bai|thiet bi|may in|may chieu|may lanh|may giat|dieu hoa cong nghiep)\b/;

const KW_INTANGIBLE =
  /\b(phan mem ban quyen|ban quyen vinh vien|perpetual license|license perpetual|quyen su dung dat|qsdd|bang sang che|nhan hieu|thuong hieu|bi quyet ky thuat|know.?how|copyright|patent|trademark)\b/i;

const KW_RECURRING_SUBSCRIPTION =
  /\b(thue bao|subscription|monthly|annual recurring|saas|cloud subscription)\b/i;

const KW_CCDC =
  /\b(ban|ghe|tu|ke|may in|dieu hoa|quat|den|may anh|may quay|dien thoai di dong|cong cu|dung cu|do dung)\b/;

const KW_PREPAID_PERIOD =
  /\b(phi nam|cuoc nam|thue bao nam|license nam|premium annual|bao hiem nam|bao hiem|annual|yearly|12 thang|niên độ|nien do|tron goi nam)\b/i;

const DATE_RANGE_REGEX =
  /tu\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*(?:den|->|đến)\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i;

const FIXED_ASSET_MIN = 30_000_000;

const norm = normalizeLineName;

// ---------- VSIC helpers ----------
function vsicIsTrading(code?: string | null) {
  const c = (code ?? "").replace(/\D+/g, "").slice(0, 2);
  return ["45", "46", "47"].includes(c);
}
function vsicIsManufacturing(code?: string | null) {
  const c = (code ?? "").replace(/\D+/g, "").slice(0, 2);
  const n = Number(c);
  return n >= 10 && n <= 33;
}
function vsicIsService(code?: string | null) {
  const c = (code ?? "").replace(/\D+/g, "").slice(0, 2);
  if (!c) return false;
  if (vsicIsTrading(code) || vsicIsManufacturing(code)) return false;
  const n = Number(c);
  return n >= 35 && n <= 96; // construction/utility/service heads
}

// ---------- Detect helpers ----------
function effectivePreVatUnitPrice(line: RawLine): number {
  const up = Number(line.unit_price ?? 0);
  if (up > 0) return up;
  const qty = Number(line.qty ?? 0);
  const amt = Number(line.amount ?? 0);
  if (qty > 0 && amt > 0) return amt / qty;
  return amt;
}

function isMultiPeriodPrepaid(line: RawLine): boolean {
  const hay = `${norm(line.description)} ${norm(line.unit)}`;
  if (KW_RECURRING_SUBSCRIPTION.test(line.description ?? "")) return false;
  if (KW_PREPAID_PERIOD.test(line.description ?? "")) return true;
  if (DATE_RANGE_REGEX.test(line.description ?? "")) return true;
  if (/\b(nam|ky|niên độ|nien do|12 thang)\b/.test(hay)) return true;
  return false;
}

function inferAmortizeMonths(line: RawLine): number {
  const text = (line.description ?? "").toLowerCase();
  const m = text.match(/(\d{1,3})\s*(thang|tháng|month)/);
  if (m) return Math.max(1, Math.min(60, Number(m[1])));
  if (/\b(nam|năm|year|annual|yearly|12 thang)\b/i.test(text)) return 12;
  if (/\b(quy|quý|quarter)\b/i.test(text)) return 3;
  // Dải ngày từ ... đến ...
  const range = text.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:den|->|đến)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
  );
  if (range) {
    const [, , m1, y1, , m2, y2] = range;
    const y1n = Number(y1.length === 2 ? `20${y1}` : y1);
    const y2n = Number(y2.length === 2 ? `20${y2}` : y2);
    const months = (y2n - y1n) * 12 + (Number(m2) - Number(m1)) + 1;
    if (months > 0 && months <= 60) return months;
  }
  return 12;
}

function isIntangible(line: RawLine): boolean {
  return KW_INTANGIBLE.test(line.description ?? "");
}

function isBulkQty(line: RawLine): boolean {
  const qty = Number(line.qty ?? 0);
  if (!qty) return false;
  const u = norm(line.unit);
  if (UNIT_DURABLE.test(u)) return qty >= 10;
  if (UNIT_GOODS.test(u)) return qty >= 100;
  return qty >= 50;
}

function isDurableToolHint(line: RawLine): boolean {
  const desc = norm(line.description);
  const unit = norm(line.unit);
  return (
    KW_CCDC.test(desc) ||
    UNIT_DURABLE.test(`${desc} ${unit}`)
  );
}

function rawMaterialKeyword(name: string): boolean {
  return KW_RAW_MATERIAL.test(norm(name));
}

// ---------- Resolve account ----------
export function pickPrepaidAccount(_standard: AccountingStandard): string {
  // TT200 & TT133 & TT99 đều dùng 242 thống nhất theo chốt với người dùng.
  return "242";
}

export function pickExpenseAccount(
  line: RawLine,
  defaultCostCenter: "627" | "641" | "642",
): string {
  const desc = (line.description ?? "").toLowerCase();
  if (KW_FINANCE_EXPENSE.test(desc)) return "635";
  if (KW_SELLING_EXPENSE.test(desc)) return "641";
  if (KW_PRODUCTION_EXPENSE.test(desc)) return "627";
  return defaultCostCenter;
}

export function resolveAccountV2(
  kind: LineKindV2,
  ctx: ClassifyContextV2,
  line?: RawLine,
): string {
  switch (kind) {
    case "service":
      return line
        ? pickExpenseAccount(line, ctx.tenant.default_cost_center)
        : ctx.tenant.default_cost_center;
    case "raw_material":
      return "152";
    case "tools":
      return "153";
    case "prepaid":
      return pickPrepaidAccount(ctx.tenant.accounting_standard);
    case "goods_for_resale":
      return "156";
    case "fixed_asset_tangible":
      return "211";
    case "fixed_asset_intangible":
      // TT133 gộp về 211
      return ctx.tenant.accounting_standard === "TT133" ? "211" : "213";
  }
}

// ---------- Main ----------
export function classifyLineV2(
  line: RawLine,
  ctx: ClassifyContextV2,
): ClassifyResultV2 {
  const desc = norm(line.description);
  const unit = norm(line.unit);
  const hay = `${desc} ${unit}`;
  const signals: ClassifySignalV2[] = [];
  const push = (votes: LineKindV2, weight: number, label: string) =>
    signals.push({ votes, weight, label });

  const netPrice = effectivePreVatUnitPrice(line);

  // -------- STAGE 1: Service / Prepaid-service --------
  const isServiceUnit = UNIT_SERVICE.test(hay);
  const isServiceKw = KW_SERVICE.test(desc);
  const vendorIsService = vsicIsService(ctx.vendor?.vsic);
  const vendorIsServiceProvider =
    (ctx.vendor?.roles ?? []).includes("service_provider");

  if (isServiceUnit || isServiceKw || vendorIsService || vendorIsServiceProvider) {
    if (isServiceUnit) push("service", 25, `ĐVT "${unit || "—"}" → Dịch vụ`);
    if (isServiceKw) push("service", 30, `Từ khóa dịch vụ`);
    if (vendorIsService)
      push("service", 15, `Ngành NCC (VSIC) → dịch vụ`);
    if (vendorIsServiceProvider)
      push("service", 18, `NCC được gắn nhãn "Nhà cung cấp dịch vụ"`);

    if (isMultiPeriodPrepaid(line)) {
      const months = inferAmortizeMonths(line);
      push("prepaid", 40, `Trả trước nhiều kỳ → 242 phân bổ ${months} tháng`);
      return finalize({
        kind: "prepaid",
        account: resolveAccountV2("prepaid", ctx),
        amortize_months: months,
        signals,
        purpose: "service",
        ctx,
      });
    }
    return finalize({
      kind: "service",
      account: resolveAccountV2("service", ctx, line),
      signals,
      purpose: "service",
      ctx,
    });
  }

  // -------- STAGE 2: Purpose detection --------
  const businessTypes = new Set(ctx.tenant.business_types);
  const vendorRoles = new Set(ctx.vendor?.roles ?? []);

  let purpose: "resell" | "production" | "internal" = "internal";

  // Ưu tiên 1: product catalog
  if (desc && ctx.tenant.product_catalog_norm.has(desc)) {
    purpose = "resell";
    push("goods_for_resale", 50, `Item nằm trong Danh mục mặt hàng kinh doanh`);
  }
  // Ưu tiên 2: vendor role
  else if (vendorRoles.has("resale_source")) {
    purpose = "resell";
    push("goods_for_resale", 35, `NCC được gắn nhãn "Nguồn hàng bán lại"`);
  } else if (
    vendorRoles.has("raw_material_source") &&
    businessTypes.has("manufacturing")
  ) {
    purpose = "production";
    push("raw_material", 35, `NCC được gắn nhãn "Nguồn NVL" + DN sản xuất`);
  }
  // Ưu tiên 3: business_type heuristic
  else if (
    businessTypes.has("trading") &&
    isBulkQty(line) &&
    !isIntangible(line)
  ) {
    purpose = "resell";
    push("goods_for_resale", 25, `DN thương mại + số lượng lớn`);
  } else if (
    businessTypes.has("manufacturing") &&
    (rawMaterialKeyword(line.description ?? "") ||
      vsicIsManufacturing(ctx.vendor?.vsic))
  ) {
    purpose = "production";
    push("raw_material", 25, `DN sản xuất + tín hiệu NVL`);
  }

  if (purpose === "resell") {
    return finalize({
      kind: "goods_for_resale",
      account: resolveAccountV2("goods_for_resale", ctx),
      signals,
      purpose,
      ctx,
    });
  }
  if (purpose === "production") {
    return finalize({
      kind: "raw_material",
      account: resolveAccountV2("raw_material", ctx),
      signals,
      purpose,
      ctx,
    });
  }

  // -------- STAGE 3: Internal use → giá + bản chất --------
  const intangible = isIntangible(line);
  const durable = isDurableToolHint(line) || KW_FIXED_ASSET.test(desc);

  if (netPrice >= FIXED_ASSET_MIN && (durable || intangible)) {
    if (intangible) {
      push("fixed_asset_intangible", 45, `Giá ≥ 30tr + tài sản vô hình`);
      return finalize({
        kind: "fixed_asset_intangible",
        account: resolveAccountV2("fixed_asset_intangible", ctx),
        need_useful_life_confirm: true,
        signals,
        purpose: "internal",
        ctx,
      });
    }
    push("fixed_asset_tangible", 45, `Giá ≥ 30tr + có hình hài, dùng lâu dài`);
    return finalize({
      kind: "fixed_asset_tangible",
      account: resolveAccountV2("fixed_asset_tangible", ctx),
      need_useful_life_confirm: true,
      signals,
      purpose: "internal",
      ctx,
    });
  }

  // CCDC giá cao → prepaid (242) phân bổ
  if (
    netPrice >= ctx.tenant.ccdc_allocation_threshold &&
    isDurableToolHint(line)
  ) {
    const months = inferAmortizeMonths(line);
    push(
      "prepaid",
      30,
      `CCDC giá ≥ ${(ctx.tenant.ccdc_allocation_threshold / 1_000_000).toFixed(0)}tr → 242 phân bổ ${months} tháng`,
    );
    return finalize({
      kind: "prepaid",
      account: resolveAccountV2("prepaid", ctx),
      amortize_months: months,
      signals,
      purpose: "internal",
      ctx,
    });
  }

  // CCDC giá thấp / không có tín hiệu khác → 153
  push("tools", 18, `Dùng nội bộ, giá thấp → CCDC (153)`);
  return finalize({
    kind: "tools",
    account: resolveAccountV2("tools", ctx),
    signals,
    purpose: "internal",
    ctx,
  });
}

function finalize(input: {
  kind: LineKindV2;
  account: string;
  amortize_months?: number;
  need_useful_life_confirm?: boolean;
  signals: ClassifySignalV2[];
  purpose?: ClassifyResultV2["purpose"];
  ctx: ClassifyContextV2;
}): ClassifyResultV2 {
  const { kind, signals, ctx } = input;

  // History boost
  const hist = ctx.historyDist;
  if (hist) {
    const total = Object.values(hist).reduce(
      (s, v) => s + (v || 0),
      0,
    );
    if (total > 0) {
      const v = hist[kind] || 0;
      const ratio = v / total;
      if (ratio >= 0.6)
        signals.push({
          votes: kind,
          weight: 12,
          label: `Lịch sử với NCC này ${Math.round(ratio * 100)}% là ${KIND_META_V2[kind].label}`,
        });
    }
  }

  // Confidence từ signals của winner
  const winnerWeight = signals
    .filter((s) => s.votes === kind)
    .reduce((s, v) => s + v.weight, 0);
  const total = signals.reduce((s, v) => s + v.weight, 0) || 1;
  let confidence = Math.round((winnerWeight / total) * 100);
  if (winnerWeight >= 50) confidence = Math.max(confidence, 85);
  if (winnerWeight >= 75) confidence = Math.max(confidence, 92);
  if (input.need_useful_life_confirm) confidence = Math.min(confidence, 75);
  confidence = Math.max(20, Math.min(99, confidence));

  return {
    kind,
    account: input.account,
    amortize_months: input.amortize_months ?? null,
    need_useful_life_confirm: input.need_useful_life_confirm,
    confidence,
    signals,
    purpose: input.purpose,
  };
}

// ---------- Backward compat helpers ----------
import type { LineKind } from "./classify-line";

/** Map nhãn cũ → nhãn mới (best-effort, dùng khi tenant đã set business_types). */
export function legacyKindToV2(
  legacy: LineKind,
  businessTypes: BusinessType[],
): LineKindV2 {
  switch (legacy) {
    case "service":
      return "service";
    case "fixed_asset":
      return "fixed_asset_tangible";
    case "ccdc":
      return "tools";
    case "goods":
      return businessTypes.includes("trading") ? "goods_for_resale" : "tools";
  }
}
