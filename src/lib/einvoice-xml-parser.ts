/**
 * Parser HĐĐT chuẩn TT78/TT32 (PBan 2.x).
 * Module thuần (không phụ thuộc Supabase), dùng chung cho:
 *   - import XML người dùng tải lên
 *   - đọc lại XML để hiển thị chi tiết
 *   - đồng bộ từ cổng TCT (khi có file XML kèm theo)
 */
import { XMLParser } from "fast-xml-parser";

// ---------- helpers ----------
const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim();
  if (!s) return 0;
  // Hỗ trợ định dạng VN: "1.234.567,89" → "1234567.89"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/[,\s]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const asArray = <T,>(v: T | T[] | undefined | null): T[] =>
  v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Đọc node text hoặc object {#text,...} hoặc string thuần. */
const textOf = (v: any): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") return str(v["#text"] ?? "");
  return "";
};

/** Chuẩn hoá NLap: chấp nhận ISO, DD/MM/YYYY, DD-MM-YYYY. */
function normalizeDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return null;
}

/** Phân tích TSuat HĐĐT: "8%", "0%", "KCT", "KKKNT", "KHAC", "\", "-" ... */
function parseVatRate(v: unknown): {
  raw: string;
  rate: number | null;
  taxable: boolean;
  code: "0" | "5" | "8" | "10" | "KCT" | "KKKNT";
} {
  const raw = str(v);
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  if (!upper || upper === "\\" || upper === "-" || upper === "/" || upper === "KCT" || upper === "KCTGT") {
    return { raw, rate: null, taxable: false, code: "KCT" };
  }
  if (upper === "KKKNT" || upper === "KHONGKEKHAI" || upper === "KKKNTH") {
    return { raw, rate: null, taxable: false, code: "KKKNT" };
  }
  if (upper === "KHAC") {
    // Một số NCC đẩy "KHAC" với TSuatKhac đi kèm — caller xử lý
    return { raw, rate: null, taxable: true, code: "KCT" };
  }
  const m = upper.match(/-?\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  if (!Number.isFinite(n)) {
    return { raw, rate: null, taxable: false, code: "KCT" };
  }
  // Map về vat_code hợp lệ trên DB (0/5/8/10)
  const rounded = Math.round(n);
  const code: "0" | "5" | "8" | "10" =
    rounded === 5 ? "5" : rounded === 8 ? "8" : rounded === 10 ? "10" : "0";
  return { raw, rate: n, taxable: n > 0, code };
}

/** TChat: 1=hàng/dv, 2=khuyến mãi, 3=chiết khấu, 4=ghi chú. */
function parseLineKind(v: unknown): "item" | "promo" | "discount" | "note" {
  const s = str(v);
  if (s === "2") return "promo";
  if (s === "3") return "discount";
  if (s === "4") return "note";
  return "item";
}

/** Tách TCHDon → loại HĐ: gốc/thay thế/điều chỉnh/huỷ. */
function parseAdjustmentKind(
  v: unknown,
): "original" | "replacement" | "adjustment" | "cancelled" {
  const s = str(v);
  if (s === "2") return "replacement";
  if (s === "3") return "adjustment";
  if (s === "4") return "cancelled";
  return "original";
}

/** Phẳng hoá TTKhac → Record<TTruong, DLieu>. Chấp nhận node hoặc array nhiều wrapper. */
function flattenTTKhac(node: any): Record<string, string> {
  const out: Record<string, string> = {};
  const wrappers = asArray<any>(node);
  for (const w of wrappers) {
    const items = asArray<any>(w?.TTin);
    for (const it of items) {
      const key = str(it?.TTruong);
      const val = str(it?.DLieu);
      if (key) out[key] = val;
    }
  }
  return out;
}

// ---------- types ----------
export type ParsedLine = {
  seq: number;
  kind: "item" | "promo" | "discount" | "note";
  code: string;
  description: string;
  unit: string;
  qty: number;
  unit_price: number;
  discount_pct: number;
  discount_amount: number;
  amount: number; // ThTien (trước thuế, sau CK dòng)
  vat_rate_raw: string;
  vat_rate: number | null;
  vat_code: "0" | "5" | "8" | "10" | "KCT" | "KKKNT";
  vat_taxable: boolean;
  vat_amount: number;
  gross_amount: number; // từ TTKhac "Thành tiền thanh toán của hàng hóa"
};

export type ParsedEinvoice = {
  version: string;
  template: string; // KHMSHDon
  series: string; // KHMSHDon + KHHDon
  series_short: string; // KHHDon (để tương thích)
  invoice_no: string;
  issue_date: string | null;
  sign_date_seller: string | null;
  sign_date_cqt: string | null;
  currency: string;
  fx_rate: number;
  payment_method: string;
  has_cqt_code: boolean;
  cqt_code: string | null;
  cqt_signed: boolean;
  seller_signed: boolean;
  adjustment_kind: "original" | "replacement" | "adjustment" | "cancelled";
  related_invoice: { series?: string; no?: string; date?: string } | null;

  seller: {
    name: string;
    tax_id: string;
    address: string;
    phone: string;
    email: string;
    bank_account: string;
    bank_name: string;
    district: string;
    province: string;
    country: string;
  };
  buyer: {
    name: string;
    tax_id: string;
    address: string;
    phone: string;
    email: string;
    bank_account: string;
    bank_name: string;
    contact_person: string;
    id_type: string;
    id_no: string;
  };

  lines: ParsedLine[];

  totals: {
    subtotal: number; // TgTCThue
    vat_amount: number; // TgTThue
    discount_total: number; // TTCKTMai
    total: number; // TgTTTBSo
    total_in_words: string; // TgTTTBChu
    by_rate: Array<{ rate_raw: string; rate: number | null; taxable: number; tax: number }>;
  };

  raw_ttkhac: Record<string, string>;
  warnings: string[];
};

export class EinvoiceParseError extends Error {
  warnings: string[];
  constructor(message: string, warnings: string[] = []) {
    super(message);
    this.name = "EinvoiceParseError";
    this.warnings = warnings;
  }
}

// ---------- parser ----------
const ARRAY_TAGS = new Set(["HHDVu", "LTSuat", "TTin", "TTKhac"]);

let _parser: XMLParser | null = null;
function getParser(): XMLParser {
  if (_parser) return _parser;
  _parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ARRAY_TAGS.has(name),
  });
  return _parser;
}

export function parseEinvoiceXml(xmlText: string): ParsedEinvoice {
  const warnings: string[] = [];
  if (!xmlText || typeof xmlText !== "string") {
    throw new EinvoiceParseError("Nội dung XML rỗng", warnings);
  }
  // Strip BOM, CRLF
  let xml = xmlText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!xml.startsWith("<")) {
    // Một số NCC bọc XML trong JSON {data:"<..."} hoặc trả về base64
    const m = xml.match(/<\?xml[\s\S]+$/);
    if (m) xml = m[0];
    else throw new EinvoiceParseError("Không nhận diện được dữ liệu XML", warnings);
  }

  let doc: any;
  try {
    doc = getParser().parse(xml);
  } catch (e: any) {
    throw new EinvoiceParseError(`Lỗi parse XML: ${e?.message || e}`, warnings);
  }

  // Dò root linh hoạt: HDon → DLHDon (chuẩn TT78), hoặc bọc thêm Invoice/...
  const root = doc?.HDon ?? doc?.Invoice ?? doc;
  const dl =
    root?.DLHDon ??
    (Array.isArray(root?.HDon) ? root.HDon[0]?.DLHDon : undefined) ??
    root?.DLieuHoaDon;
  if (!dl) {
    throw new EinvoiceParseError(
      "Không tìm thấy node DLHDon trong XML",
      warnings,
    );
  }

  const tt = dl.TTChung ?? {};
  const nd = dl.NDHDon ?? {};
  const nban = nd.NBan ?? {};
  const nmua = nd.NMua ?? {};
  const toan = nd.TToan ?? {};

  // ----- TTChung -----
  const version = str(tt.PBan);
  const template = str(tt.KHMSHDon);
  const seriesShort = str(tt.KHHDon);
  const series = template ? `${template}${seriesShort}` : seriesShort;
  const invoiceNo = str(tt.SHDon);
  const issueDate = normalizeDate(tt.NLap);
  if (tt.NLap && !issueDate) {
    warnings.push(`Không nhận diện được ngày lập "${str(tt.NLap)}"`);
  }
  const currency = str(tt.DVTTe) || "VND";
  const fxRate = num(tt.TGia) || 1;
  const paymentMethod = str(tt.HTTToan);
  const adjKind = parseAdjustmentKind(tt.TCHDon);

  // HDLQuan: tham chiếu HĐ gốc (khi điều chỉnh/thay thế)
  let related: ParsedEinvoice["related_invoice"] = null;
  const hdlq = tt.HDLQuan;
  if (hdlq && typeof hdlq === "object") {
    related = {
      series: str(hdlq.KHMSHDon) + str(hdlq.KHHDon) || undefined,
      no: str(hdlq.SHDon) || undefined,
      date: normalizeDate(hdlq.NLap) || undefined,
    };
  }

  // ----- MCCQT (mã của cơ quan thuế) -----
  // Có thể là: string thuần, { "#text", "@_Id" }, hoặc thiếu.
  const mccqtRaw = root?.MCCQT;
  const cqtCode = textOf(mccqtRaw) || null;
  const hasCqtCode = !!cqtCode;

  // ----- Chữ ký (DSCKS) -----
  const dscks = root?.DSCKS ?? {};
  const sellerSig = dscks?.NBan?.Signature;
  const cqtSig = dscks?.CQT?.Signature;
  const sellerSigned = !!sellerSig;
  const cqtSigned = !!cqtSig;

  const extractSigningTime = (sig: any): string | null => {
    if (!sig) return null;
    const objs = asArray<any>(sig?.Object);
    for (const o of objs) {
      const props = o?.SignatureProperties;
      const arr = asArray<any>(props?.SignatureProperty);
      for (const p of arr) {
        const t = str(p?.SigningTime);
        if (t) return t;
      }
    }
    return null;
  };
  const signDateSeller = extractSigningTime(sellerSig);
  const signDateCqt = extractSigningTime(cqtSig);

  // ----- Bên bán -----
  const sellerTTKhac = flattenTTKhac(nban.TTKhac);
  const seller: ParsedEinvoice["seller"] = {
    name: str(nban.Ten),
    tax_id: str(nban.MST).replace(/\D/g, ""),
    address: str(nban.DChi),
    phone: str(nban.SDThoai),
    email: str(nban.DCTDTu),
    bank_account: str(nban.STKNHang),
    bank_name: str(nban.TNHang),
    district: sellerTTKhac["Quận, huyện người bán"] || "",
    province: sellerTTKhac["Tỉnh/Thành phố người bán"] || "",
    country: sellerTTKhac["Mã quốc gia người bán"] || "",
  };

  // ----- Bên mua -----
  const buyerTTKhac = flattenTTKhac(nmua.TTKhac);
  const buyer: ParsedEinvoice["buyer"] = {
    name: str(nmua.Ten),
    tax_id: str(nmua.MST).replace(/\D/g, ""),
    address: str(nmua.DChi),
    phone: str(nmua.SDThoai),
    email: str(nmua.DCTDTu),
    bank_account: str(nmua.STKNHang),
    bank_name: str(nmua.TNHang),
    contact_person: str(nmua.HVTNMHang),
    id_type: buyerTTKhac["Loại giấy tờ người mua"] || "",
    id_no: buyerTTKhac["Số giấy tờ người mua"] || "",
  };

  // ----- Dòng hàng -----
  const linesRaw = asArray<any>(nd?.DSHHDVu?.HHDVu);
  const lines: ParsedLine[] = linesRaw.map((h, idx) => {
    const vat = parseVatRate(h.TSuat);
    const lineTTKhac = flattenTTKhac(h.TTKhac);
    const gross = num(lineTTKhac["Thành tiền thanh toán của hàng hóa"]);
    return {
      seq: Number(str(h.STT)) || idx + 1,
      kind: parseLineKind(h.TChat),
      code: str(h.MHHDVu),
      description: str(h.THHDVu),
      unit: str(h.DVTinh),
      qty: num(h.SLuong),
      unit_price: num(h.DGia),
      discount_pct: num(h.TLCKhau),
      discount_amount: num(h.STCKhau),
      amount: num(h.ThTien),
      vat_rate_raw: vat.raw,
      vat_rate: vat.rate,
      vat_code: vat.code,
      vat_taxable: vat.taxable,
      vat_amount: num(h.TThue),
      gross_amount: gross,
    };
  });

  // ----- Tổng -----
  const byRateRaw = asArray<any>(toan?.THTTLTSuat?.LTSuat);
  const byRate = byRateRaw.map((r) => {
    const vat = parseVatRate(r.TSuat);
    return {
      rate_raw: vat.raw,
      rate: vat.rate,
      taxable: num(r.ThTien),
      tax: num(r.TThue),
    };
  });
  const topTTKhac = flattenTTKhac(dl.TTKhac);
  const toanTTKhac = flattenTTKhac(toan.TTKhac);

  const totals = {
    subtotal: num(toan.TgTCThue),
    vat_amount: num(toan.TgTThue),
    discount_total: num(toan.TTCKTMai),
    total: num(toan.TgTTTBSo),
    total_in_words: str(toan.TgTTTBChu) || topTTKhac["Tổng tiền thanh toán bằng chữ"] || "",
    by_rate: byRate,
  };

  // Sanity check tổng
  const calc = totals.subtotal + totals.vat_amount;
  if (Math.abs(calc - totals.total) > 1) {
    warnings.push(
      `Tổng không khớp: ${totals.subtotal} + ${totals.vat_amount} ≠ ${totals.total}`,
    );
  }

  // ----- Gom TTKhac toàn HĐ (debug & hiển thị) -----
  const raw_ttkhac: Record<string, string> = {
    ...flattenTTKhac(tt.TTKhac),
    ...topTTKhac,
    ...toanTTKhac,
  };

  // Validate tối thiểu
  if (!invoiceNo) {
    warnings.push("Thiếu số hoá đơn (SHDon)");
  }
  if (!seller.tax_id && !buyer.tax_id) {
    warnings.push("Thiếu MST cả bên bán lẫn bên mua");
  }

  return {
    version,
    template,
    series,
    series_short: seriesShort,
    invoice_no: invoiceNo,
    issue_date: issueDate,
    sign_date_seller: signDateSeller,
    sign_date_cqt: signDateCqt,
    currency,
    fx_rate: fxRate,
    payment_method: paymentMethod,
    has_cqt_code: hasCqtCode,
    cqt_code: cqtCode,
    cqt_signed: cqtSigned,
    seller_signed: sellerSigned,
    adjustment_kind: adjKind,
    related_invoice: related,
    seller,
    buyer,
    lines,
    totals,
    raw_ttkhac,
    warnings,
  };
}
