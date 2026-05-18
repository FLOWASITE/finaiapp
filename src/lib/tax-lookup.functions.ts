import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaxLookupResult = {
  taxId: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
  director?: string | null;
  tradeName?: string | null;
  phone?: string | null;
  email?: string | null;
  taxAuthority?: string | null;
  taxAuthorityCode?: string | null;
  registrationNo?: string | null;
  registrationDate?: string | null; // YYYY-MM-DD
  establishedDate?: string | null;  // YYYY-MM-DD
  legalForm?: string | null;        // mapped enum: llc/jsc/partnership/sole_prop/household/branch/other
  industryCode?: string | null;
  industryName?: string | null;
  provinceCode?: string | null;
  source: "vietqr" | "ttdn";
};

const InputSchema = z.object({
  taxCode: z
    .string()
    .transform((s) => s.replace(/\D/g, "").slice(0, 13))
    .pipe(z.string().min(10, "MST tối thiểu 10 chữ số").max(13, "MST tối đa 13 chữ số")),
});

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(t);
  }
}

// Map LoaiHinhDN tiếng Việt → enum tenants.legal_form
function mapLegalForm(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.toLowerCase();
  if (s.includes("trách nhiệm hữu hạn") || s.includes("tnhh")) return "llc";
  if (s.includes("cổ phần")) return "jsc";
  if (s.includes("hợp danh")) return "partnership";
  if (s.includes("hộ kinh doanh")) return "household";
  if (s.includes("chi nhánh")) return "branch";
  if (s.includes("tư nhân") || s.includes("cá nhân")) return "sole_prop";
  return "other";
}

// Chuẩn hoá date về YYYY-MM-DD; trả null nếu không hợp lệ hoặc trong tương lai.
function normalizeDate(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  // TTDN có thể trả "2018-05-23T00:00:00" hoặc "23/05/2018"
  let iso: string | null = null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!iso && dmy) iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now()) return null; // tránh vi phạm tenants_validate_dates
  return iso;
}

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function tryVietQR(taxCode: string): Promise<TaxLookupResult | null> {
  try {
    const res = await fetchWithTimeout(`https://api.vietqr.io/v2/business/${encodeURIComponent(taxCode)}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json?.code !== "00" || !json?.data?.name) return null;
    return {
      taxId: String(json.data.id ?? taxCode),
      name: String(json.data.name),
      shortName: nonEmpty(json.data.shortName),
      address: nonEmpty(json.data.address),
      director: null,
      source: "vietqr",
    };
  } catch {
    return null;
  }
}

async function tryTTDN(taxCode: string): Promise<TaxLookupResult | null> {
  try {
    const res = await fetchWithTimeout(`https://thongtindoanhnghiep.co/api/company/${encodeURIComponent(taxCode)}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json?.Title) return null;
    const industry = json.NganhNgheKinhDoanhChinh || json.NganhNgheTitle || null;
    return {
      taxId: String(json.MaSoThue ?? taxCode),
      name: String(json.Title),
      shortName: nonEmpty(json.TitleEn) || nonEmpty(json.ShortName),
      address: nonEmpty(json.DiaChiCongTy),
      director: nonEmpty(json.GiamDocCongTy) || nonEmpty(json.ChuSoHuu),
      tradeName: nonEmpty(json.TitleEn),
      phone: nonEmpty(json.DienThoai),
      email: nonEmpty(json.Email),
      taxAuthority: nonEmpty(json?.NoiDangKyQuanLy?.Title),
      taxAuthorityCode: nonEmpty(json?.NoiDangKyQuanLy?.Code),
      registrationNo: nonEmpty(json.GiayPhepKinhDoanh) || nonEmpty(json.MaSoThue),
      registrationDate: normalizeDate(json.NgayCapGiayPhepKinhDoanh ?? json.NgayCap),
      establishedDate: normalizeDate(json.NgayBatDauHopDong ?? json.NgayCap),
      legalForm: mapLegalForm(json.LoaiHinhDN),
      industryCode: nonEmpty(typeof industry === "object" ? industry?.MaNganhNghe : null),
      industryName: nonEmpty(typeof industry === "object" ? industry?.TenNganhNghe : industry),
      provinceCode: nonEmpty(json.MaTinh != null ? String(json.MaTinh) : null),
      source: "ttdn",
    };
  } catch {
    return null;
  }
}

// Server-side in-memory cache (per worker instance). Public data → an toàn để share.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const NEG_TTL_MS = 5 * 60 * 1000; // 5 phút cho "không tìm thấy"
const cache = new Map<string, { at: number; data: TaxLookupResult | null }>();

export const lookupTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const code = data.taxCode.trim();
    const now = Date.now();
    const hit = cache.get(code);
    if (hit) {
      const ttl = hit.data ? CACHE_TTL_MS : NEG_TTL_MS;
      if (now - hit.at < ttl) {
        if (hit.data) return hit.data;
        throw new Error(`Không tìm thấy thông tin cho MST ${code}`);
      }
      cache.delete(code);
    }
    // TTDN ưu tiên (nhiều field hơn), fallback VietQR.
    const r1 = await tryTTDN(code);
    if (r1) { cache.set(code, { at: now, data: r1 }); return r1; }
    const r2 = await tryVietQR(code);
    if (r2) { cache.set(code, { at: now, data: r2 }); return r2; }
    cache.set(code, { at: now, data: null });
    throw new Error(`Không tìm thấy thông tin cho MST ${code}`);
  });
