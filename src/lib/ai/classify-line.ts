/**
 * Phân loại từng dòng hóa đơn mua vào thành Hàng hóa / TSCĐ / CCDC / Dịch vụ.
 * Pure rules (price + unit + keyword) — browser & server safe.
 *
 * Tham khảo Thông tư 45/2013/TT-BTC: TSCĐ khi nguyên giá ≥ 30tr + thời gian sử
 * dụng > 1 năm. CCDC: < 30tr nhưng vẫn có giá trị (≥ 3tr) và bền.
 */

export type LineKind = "goods" | "fixed_asset" | "ccdc" | "service";

export type ClassifySignal = {
  label: string;
  weight: number; // 0..100
  votes: LineKind;
};

export type LineClassification = {
  kind: LineKind;
  account: string;
  label: string;
  confidence: number; // 0..100
  signals: ClassifySignal[];
};

const KIND_META: Record<LineKind, { label: string; account: string; color: string }> = {
  goods: { label: "Hàng hóa", account: "156", color: "emerald" },
  fixed_asset: { label: "TSCĐ", account: "211", color: "sky" },
  ccdc: { label: "CCDC", account: "153", color: "violet" },
  service: { label: "Dịch vụ", account: "642", color: "amber" },
};

export function kindMeta(kind: LineKind) {
  return KIND_META[kind];
}

export const normalizeLineName = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();

const norm = normalizeLineName;

// ---- Đơn vị tính ----------------------------------------------------------
const UNIT_GOODS = /\b(kg|gam|g|tan|hop|thung|chai|lon|goi|cuon|bao|tui|lit|l|m3|m2|met|cay|cuc|vien|tam|cuon|ream|toa|cuon)\b/;
const UNIT_DURABLE = /\b(cai|chiec|bo|may|xe|don vi|item|pc|pcs|unit)\b/;
const UNIT_SERVICE = /\b(lan|gio|h|ngay|thang|nam|ky|km|chuyen|tour|dich vu|service|hop dong|goi dv)\b/;

// ---- Từ khóa tên hàng ----------------------------------------------------
const KW_FIXED_ASSET =
  /\b(may (chu|tinh|in|chieu|lanh|giat|moc)|server|laptop|workstation|o to|xe (tai|hoi|nang|may)|thiet bi|he thong|day chuyen|phan mem ban quyen|license|nha xuong|kho bai|may moc thiet bi|tscd|tsdd)\b/;

const KW_SERVICE =
  /\b(phi|cuoc|dich vu|tu van|consult|thue|rent|thuê|bao tri|sua chua|van chuyen|ship|giao hang|logistic|internet|tien dien|tien nuoc|dien thoai|telecom|quang cao|advertis|marketing|hoa hong|commission|bao hiem|insurance|ve sinh|cleaning|kiem toan|audit|dao tao|training|khach san|hotel|an uong|nha hang|restaurant|tiep khach|cafe|tien xang|nhien lieu|toll|cau duong|grab|taxi|uber)\b/;

const KW_CCDC =
  /\b(ban|ghe|tu|ke|may tinh tay|may in|dieu hoa|quat|den|may anh|may quay|dien thoai di dong|cong cu|dung cu)\b/;

const KW_GOODS_HINT =
  /\b(hang hoa|san pham|nguyen lieu|vat lieu|nvl|bia|ruou|nuoc ngot|sua|thuc pham|gao|duong|muoi|xi mang|thep|gach|son|vai|quan ao)\b/;

// Ngưỡng (VND) — theo TT 45/2013
const FIXED_ASSET_MIN = 30_000_000;
const CCDC_MIN = 3_000_000;

export type RawLine = {
  description?: string | null;
  qty?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  amount?: number | null;
};

export type ClassifyContext = {
  /** Gợi ý kind từ ngành nghề NCC (VSIC) — vd transport/telecom → "service". */
  industryHint?: LineKind | null;
  industryLabel?: string | null;
  /** Phân bố kind 12 tháng qua với NCC này (tổng số tiền hoặc lần). */
  historyDist?: Partial<Record<LineKind, number>> | null;
};

/**
 * Map VSIC 4-6 số → kind mặc định. Chỉ cover những ngành rõ ràng nhất.
 */
export function vsicToKindHint(code?: string | null): { kind: LineKind; label: string } | null {
  if (!code) return null;
  const c = String(code).replace(/\D+/g, "");
  if (!c) return null;
  const head2 = c.slice(0, 2);
  const head1 = c.slice(0, 1);

  const serviceHeads = new Set([
    "49","50","51","52","53","55","56","58","59","60","61","62","63",
    "64","65","66","68","69","70","71","72","73","74","75",
    "77","78","79","80","81","82","85","86","87","88",
    "90","91","92","93","94","95","96",
  ]);
  if (serviceHeads.has(head2)) {
    return { kind: "service", label: `Ngành NCC (VSIC ${head2}) thiên về dịch vụ` };
  }
  if (["45", "46", "47"].includes(head2)) {
    return { kind: "goods", label: `Ngành NCC (VSIC ${head2}) bán buôn/bán lẻ → hàng hóa` };
  }
  const n2 = Number(head2);
  if (n2 >= 10 && n2 <= 33) {
    return { kind: "goods", label: `Ngành NCC (VSIC ${head2}) sản xuất → hàng hóa/NVL` };
  }
  if (head1 === "0") {
    return { kind: "goods", label: `Ngành NCC (VSIC ${head2}) → nguyên liệu/hàng hóa` };
  }
  if (["41", "42", "43"].includes(head2)) {
    return { kind: "service", label: `Ngành NCC (VSIC ${head2}) xây dựng → dịch vụ` };
  }
  if (["35", "36", "37", "38", "39"].includes(head2)) {
    return { kind: "service", label: `Ngành NCC (VSIC ${head2}) điện/nước → dịch vụ` };
  }
  return null;
}

/** Map account code → kind cho việc dựng historyDist từ bảng invoices. */
export function accountToKind(account?: string | null): LineKind | null {
  if (!account) return null;
  const a = String(account).trim();
  if (!a) return null;
  if (/^15[26]/.test(a)) return "goods"; // 152 NVL, 156 hàng hoá
  if (/^153/.test(a)) return "ccdc";
  if (/^21[1-8]/.test(a)) return "fixed_asset";
  if (/^(62[1-8]|6[3-4][0-9])/.test(a)) return "service"; // 627,641,642,635...
  return null;
}

export function classifyLine(line: RawLine, ctx?: ClassifyContext): LineClassification {
  const desc = norm(line.description);
  const unit = norm(line.unit);
  const haystack = `${desc} ${unit}`;
  const unitPrice = Number(line.unit_price ?? 0);
  const amount = Number(line.amount ?? 0);
  const qty = Number(line.qty ?? 0);
  const effectiveUnitPrice =
    unitPrice > 0 ? unitPrice : qty > 0 && amount > 0 ? amount / qty : amount;

  const scores: Record<LineKind, number> = { goods: 0, fixed_asset: 0, ccdc: 0, service: 0 };
  const signals: ClassifySignal[] = [];

  const vote = (kind: LineKind, weight: number, label: string) => {
    scores[kind] += weight;
    signals.push({ label, weight, votes: kind });
  };

  // 1) Đơn giá (trọng số 30)
  if (effectiveUnitPrice >= FIXED_ASSET_MIN) {
    vote("fixed_asset", 35, `Đơn giá ≥ 30tr → TSCĐ`);
  } else if (effectiveUnitPrice >= CCDC_MIN && UNIT_DURABLE.test(haystack)) {
    vote("ccdc", 25, `Đơn giá 3–30tr + ĐVT đếm được → CCDC`);
  } else if (effectiveUnitPrice > 0 && effectiveUnitPrice < CCDC_MIN) {
    vote("goods", 10, `Đơn giá nhỏ → thiên về hàng hóa`);
  }

  // 2) Đơn vị tính (trọng số 20)
  if (UNIT_SERVICE.test(haystack)) {
    vote("service", 25, `ĐVT "${unit || "—"}" → Dịch vụ`);
  } else if (UNIT_GOODS.test(haystack)) {
    vote("goods", 22, `ĐVT "${unit || "—"}" → Hàng hóa`);
  } else if (UNIT_DURABLE.test(haystack) && effectiveUnitPrice < FIXED_ASSET_MIN) {
    vote("goods", 8, `ĐVT đếm được, giá thấp → Hàng hóa`);
  }

  // 3) Từ khóa tên hàng (trọng số 25)
  if (KW_FIXED_ASSET.test(desc)) {
    vote("fixed_asset", 30, `Từ khóa TSCĐ trong tên hàng`);
  }
  if (KW_SERVICE.test(desc)) {
    vote("service", 30, `Từ khóa dịch vụ trong tên hàng`);
  }
  if (KW_CCDC.test(desc) && effectiveUnitPrice < FIXED_ASSET_MIN) {
    vote("ccdc", 20, `Từ khóa CCDC trong tên hàng`);
  }
  if (KW_GOODS_HINT.test(desc)) {
    vote("goods", 18, `Từ khóa hàng hóa trong tên hàng`);
  }

  // Pick winner
  let winner: LineKind = "goods";
  let max = -1;
  for (const k of Object.keys(scores) as LineKind[]) {
    if (scores[k] > max) {
      max = scores[k];
      winner = k;
    }
  }

  // Nếu không có tín hiệu nào → fallback theo giá
  if (max <= 0) {
    if (effectiveUnitPrice >= FIXED_ASSET_MIN) winner = "fixed_asset";
    else if (effectiveUnitPrice >= CCDC_MIN) winner = "ccdc";
    else winner = "goods";
    signals.push({
      label: "Không đủ tín hiệu, fallback theo đơn giá",
      weight: 10,
      votes: winner,
    });
  }

  // Confidence = winner / (sum của tất cả) * 100, clamp
  const totalScore = Object.values(scores).reduce((s, v) => s + v, 0) || 1;
  const winnerScore = scores[winner] || max;
  let confidence = Math.round((winnerScore / totalScore) * 100);
  // Boost khi winner cao tuyệt đối
  if (winnerScore >= 50) confidence = Math.max(confidence, 80);
  if (winnerScore >= 75) confidence = Math.max(confidence, 90);
  confidence = Math.max(20, Math.min(99, confidence));

  const meta = KIND_META[winner];
  return {
    kind: winner,
    account: meta.account,
    label: meta.label,
    confidence,
    signals,
  };
}

/** Tóm tắt phân loại cấp hóa đơn (kind chiếm tỷ trọng giá trị lớn nhất). */
export function summarizeInvoiceKind(
  lines: Array<RawLine & { classification?: LineClassification }>,
): { dominant: LineKind; account: string; label: string; mixed: boolean } | null {
  if (!lines || lines.length === 0) return null;
  const totals: Record<LineKind, number> = { goods: 0, fixed_asset: 0, ccdc: 0, service: 0 };
  for (const l of lines) {
    const k = l.classification?.kind;
    if (!k) continue;
    totals[k] += Math.abs(Number(l.amount ?? 0)) || 1;
  }
  let dominant: LineKind = "goods";
  let max = -1;
  let nonZero = 0;
  for (const k of Object.keys(totals) as LineKind[]) {
    if (totals[k] > 0) nonZero++;
    if (totals[k] > max) {
      max = totals[k];
      dominant = k;
    }
  }
  const meta = KIND_META[dominant];
  return { dominant, account: meta.account, label: meta.label, mixed: nonZero > 1 };
}
