/**
 * Tenant ↔ document identity matching.
 *
 * Đối chiếu MST + tên tổ chức trích xuất từ OCR/XML với tenant đang
 * hoạt động để chặn người dùng vô tình tải tài liệu của doanh nghiệp
 * khác vào kho dữ liệu của mình.
 */

export type TenantIdentity = {
  tax_id: string; // normalized digits-only
  tax_id_raw: string;
  name: string; // human display
};

export type MatchStatus = "ok" | "warn" | "reject" | "skip";

export type MatchResult = {
  status: MatchStatus;
  reason: string;
  expected: { tax_id: string; name: string };
  found: { tax_id: string | null; name: string | null; side: "buyer" | "seller" | "account_holder" | null };
};

// ---------- Normalization ----------

export function normalizeTaxId(s: string | null | undefined): string {
  if (!s) return "";
  // Drop all non-digits. VN tax id: 10 digits (main) or 13 (main-branch).
  // Treat the first 10 digits as the canonical identity.
  const digits = String(s).replace(/\D+/g, "");
  if (digits.length >= 10) return digits.slice(0, 10);
  return digits;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const ORG_PREFIX_RE = /\b(cong ty|cty|cong\s*ty\s*tnhh|tnhh|cp|co phan|cong ty co phan|cong ty tnhh|chi nhanh|cn|hop tac xa|htx|doanh nghiep tu nhan|dntn|mtv|mot thanh vien)\b/g;

export function normalizeOrgName(s: string | null | undefined): string {
  if (!s) return "";
  let x = stripDiacritics(String(s)).toLowerCase();
  x = x.replace(/[^a-z0-9\s]+/g, " ");
  x = x.replace(ORG_PREFIX_RE, " ");
  x = x.replace(/\s+/g, " ").trim();
  return x;
}

/** Dice coefficient on character bigrams. 0..1 */
export function nameSimilarity(a: string, b: string): number {
  const A = normalizeOrgName(a);
  const B = normalizeOrgName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      out.set(bg, (out.get(bg) ?? 0) + 1);
    }
    return out;
  };
  const ba = bigrams(A);
  const bb = bigrams(B);
  let overlap = 0;
  for (const [k, v] of ba) {
    const w = bb.get(k);
    if (w) overlap += Math.min(v, w);
  }
  const totA = Array.from(ba.values()).reduce((a, b) => a + b, 0);
  const totB = Array.from(bb.values()).reduce((a, b) => a + b, 0);
  if (totA + totB === 0) return 0;
  return (2 * overlap) / (totA + totB);
}

// ---------- Tenant identity ----------

export async function getTenantIdentity(
  supabase: any,
  tenantId: string,
): Promise<TenantIdentity | null> {
  if (!supabase || !tenantId) return null;
  const { data } = await supabase
    .from("tenants")
    .select("name, company_name, tax_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const taxRaw = String(data.tax_id ?? "");
  return {
    tax_id: normalizeTaxId(taxRaw),
    tax_id_raw: taxRaw,
    name: String(data.company_name || data.name || ""),
  };
}

// ---------- Extract counterpart from parsed payload ----------

type DocKind =
  | "purchase_invoice"
  | "sales_invoice"
  | "bank_statement"
  | string;

function extractCounterpart(parsed: any, kind: DocKind): {
  side: "buyer" | "seller" | "account_holder" | null;
  tax_id: string | null;
  name: string | null;
} {
  if (!parsed || typeof parsed !== "object") {
    return { side: null, tax_id: null, name: null };
  }
  if (kind === "purchase_invoice") {
    // Bên cần match = BUYER (tenant là người mua)
    const ei = parsed._einvoice;
    const buyerTax =
      parsed.buyer_tax_id ?? parsed.customer_tax_id ?? ei?.buyer?.tax_id ?? null;
    const buyerName =
      parsed.buyer_name ?? parsed.customer_name ?? ei?.buyer?.name ?? null;
    return { side: "buyer", tax_id: buyerTax || null, name: buyerName || null };
  }
  if (kind === "sales_invoice") {
    // Bên cần match = SELLER (tenant là người bán)
    const ei = parsed._einvoice;
    const sellerTax =
      parsed.vendor_tax_id ??
      parsed.supplier_tax_id ??
      parsed.seller_tax_id ??
      ei?.seller?.tax_id ??
      null;
    const sellerName =
      parsed.vendor_name ??
      parsed.supplier_name ??
      parsed.seller_name ??
      ei?.seller?.name ??
      null;
    return { side: "seller", tax_id: sellerTax || null, name: sellerName || null };
  }
  if (kind === "bank_statement") {
    return {
      side: "account_holder",
      tax_id: parsed.account_holder_tax_id ?? null,
      name: parsed.account_holder ?? null,
    };
  }
  return { side: null, tax_id: null, name: null };
}

// ---------- Match ----------

const NAME_OK = 0.82;
const NAME_WARN = 0.6;

export function matchDocumentToTenant(
  parsed: any,
  kind: DocKind,
  tenant: TenantIdentity | null,
): MatchResult {
  const expected = {
    tax_id: tenant?.tax_id_raw ?? "",
    name: tenant?.name ?? "",
  };
  const cp = extractCounterpart(parsed, kind);
  const found = { tax_id: cp.tax_id, name: cp.name, side: cp.side };

  // Skip nếu kind không thuộc 3 nhóm có tín hiệu
  if (!cp.side) {
    return { status: "skip", reason: "Loại tài liệu không cần đối chiếu tổ chức.", expected, found };
  }
  // Skip nếu tenant không khai báo cả MST lẫn tên
  if (!tenant || (!tenant.tax_id && !tenant.name)) {
    return {
      status: "skip",
      reason: "Doanh nghiệp chưa khai báo MST/tên — bỏ qua đối chiếu.",
      expected,
      found,
    };
  }

  const tTax = tenant.tax_id;
  const fTax = normalizeTaxId(cp.tax_id);
  const tName = tenant.name;
  const fName = cp.name ?? "";

  // 1. Khớp MST chuẩn hoá
  if (tTax && fTax) {
    if (tTax === fTax) {
      return { status: "ok", reason: "MST khớp doanh nghiệp.", expected, found };
    }
    // Cả hai có MST nhưng khác → REJECT cứng cho HĐ mua/bán.
    // Sao kê: WARN (vì MST trên sao kê hiếm khi có; nếu có thì vẫn nghi ngờ).
    if (kind === "bank_statement") {
      return {
        status: "warn",
        reason: `MST chủ tài khoản (${cp.tax_id}) khác MST doanh nghiệp (${tenant.tax_id_raw}).`,
        expected,
        found,
      };
    }
    return {
      status: "reject",
      reason: `Tài liệu thuộc về MST ${cp.tax_id}${cp.name ? ` — ${cp.name}` : ""}, không khớp MST doanh nghiệp ${tenant.tax_id_raw}${tenant.name ? ` (${tenant.name})` : ""}.`,
      expected,
      found,
    };
  }

  // 2. Có tên hai bên → so sánh tên
  if (tName && fName) {
    const sim = nameSimilarity(tName, fName);
    if (sim >= NAME_OK) {
      return { status: "ok", reason: `Tên tổ chức khớp (~${Math.round(sim * 100)}%).`, expected, found };
    }
    if (sim >= NAME_WARN) {
      return {
        status: "warn",
        reason: `Tên tổ chức trên tài liệu ("${cp.name}") gần giống doanh nghiệp ("${tenant.name}") (~${Math.round(sim * 100)}%). Vui lòng kiểm tra.`,
        expected,
        found,
      };
    }
    // Tên khác hẳn:
    //  - HĐ mua/bán: reject (vì OCR tên hoá đơn thường khá chuẩn).
    //  - Sao kê: warn.
    if (kind === "bank_statement") {
      return {
        status: "warn",
        reason: `Chủ tài khoản "${cp.name}" không khớp doanh nghiệp "${tenant.name}".`,
        expected,
        found,
      };
    }
    return {
      status: "reject",
      reason: `Tài liệu thuộc về "${cp.name}", không khớp doanh nghiệp "${tenant.name}".`,
      expected,
      found,
    };
  }

  // 3. Không đủ tín hiệu để đối chiếu
  return {
    status: "warn",
    reason: "Không trích xuất được MST/tên tổ chức từ tài liệu — không thể đối chiếu.",
    expected,
    found,
  };
}
