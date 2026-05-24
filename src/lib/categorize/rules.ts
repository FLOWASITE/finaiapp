/**
 * Quy tắc nghiệp vụ cho Agent Hạch toán.
 * Pure functions — không phụ thuộc Supabase, dễ test.
 *
 * Mapping với spec categorize.ts:
 *  - cat-001: VAT đầu vào 133 chỉ khi MST + amount + thanh toán hợp lệ
 *  - cat-002: ngưỡng TSCĐ 30tr (đã làm trong classify-line.ts)
 *  - cat-008: Chi không hợp lệ → 811 + flag non_cit_deductible
 *  - cat-009: Tách bút toán đa bản chất
 *  - cat-012: CKTM 5211 vs giảm giá 5213
 *  - cat-013: Hoá đơn điều chỉnh TT78 — tạo bút toán đảo + mới
 */

import type {
  ProposalEntry,
  ProposalLine,
  ProposalWarning,
} from "./types";
import type { LineKind } from "@/lib/ai/classify-line";

export const FIXED_ASSET_MIN = 30_000_000;
export const VAT_CASH_LIMIT = 20_000_000;

/** Mã TK theo TT133 (mặc định). Có thể mở rộng theo coa của tenant về sau. */
export const ACCOUNT_VAT_INPUT = "133";       // GTGT khấu trừ HHDV
export const ACCOUNT_VAT_FIXED = "1332";      // GTGT khấu trừ TSCĐ
export const ACCOUNT_PAYABLE = "331";         // Phải trả NCC
export const ACCOUNT_CASH = "111";            // Tiền mặt
export const ACCOUNT_BANK = "112";            // TGNH
export const ACCOUNT_NON_DEDUCT_EXPENSE = "811"; // Chi phí khác (chi không hợp lệ)

/** Số tiền 1 dòng — sign by debit/credit. */
export function lineMag(l: ProposalLine): number {
  return Math.max(Math.abs(l.debit || 0), Math.abs(l.credit || 0));
}

/** Kiểm tra cân Nợ = Có. */
export function isBalanced(lines: ProposalLine[]): boolean {
  const d = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const c = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  return Math.abs(d - c) < 0.5; // tolerance 0.5đ làm tròn
}

/**
 * cat-001: VAT đầu vào chỉ được khấu trừ khi:
 *  - Có MST nhà cung cấp hợp lệ (10-14 ký tự, gồm số/gạch)
 *  - Nếu tổng ≥ 20tr phải thanh toán không tiền mặt (TK 331/112, không phải 111)
 */
export function checkVatDeductibility(input: {
  supplier_tax_id?: string | null;
  total: number;
  vat_amount: number;
  payment_account: string; // TK đối ứng dự kiến (331/111/112)
}): { deductible: boolean; warning?: ProposalWarning } {
  if (!input.vat_amount || input.vat_amount <= 0) {
    return { deductible: false };
  }
  const tax = (input.supplier_tax_id ?? "").replace(/[^0-9-]/g, "");
  if (tax.length < 10 || tax.length > 14) {
    return {
      deductible: false,
      warning: {
        code: "cat-001",
        severity: "warn",
        message: `MST NCC không hợp lệ (${input.supplier_tax_id || "trống"}) — không khấu trừ VAT`,
      },
    };
  }
  if (input.total >= VAT_CASH_LIMIT && input.payment_account === ACCOUNT_CASH) {
    return {
      deductible: false,
      warning: {
        code: "cat-001",
        severity: "warn",
        message: `Hoá đơn ≥ 20tr nhưng thanh toán tiền mặt — không khấu trừ VAT (TT219/2013 Điều 15)`,
      },
    };
  }
  return { deductible: true };
}

/**
 * cat-008: Chi không hợp lệ → 811 + non_cit_deductible.
 * Trigger: không có HĐ GTGT (chỉ có bán lẻ) hoặc MST sai.
 * Caller pass `is_non_deductible` boolean đã đánh giá trước.
 */
export function applyNonDeductibleAccount(
  line: ProposalLine,
  isNonDeductible: boolean,
): { line: ProposalLine; warning?: ProposalWarning } {
  if (!isNonDeductible) return { line };
  if (!line.debit || line.debit <= 0) return { line }; // chỉ swap dòng chi phí
  // Swap account → 811
  const original = line.account_code;
  return {
    line: { ...line, account_code: ACCOUNT_NON_DEDUCT_EXPENSE, memo: `[Không khấu trừ] ${line.memo ?? ""}` },
    warning: {
      code: "cat-008",
      severity: "warn",
      message: `Chi không hợp lệ — chuyển ${original} → 811, flag non_cit_deductible`,
    },
  };
}

/**
 * cat-009: Tách bút toán nếu hoá đơn chứa nhiều bản chất (NVL + dịch vụ + TSCĐ).
 * Input: lines per invoice với kind đã classify.
 * Output: groups[] — mỗi group là 1 bút toán riêng.
 */
export function splitByNature<T extends { kind: LineKind; amount: number }>(
  lines: T[],
): { groups: T[][]; mixed: boolean } {
  if (lines.length <= 1) return { groups: [lines], mixed: false };
  const byKind = new Map<LineKind, T[]>();
  for (const l of lines) {
    const arr = byKind.get(l.kind) ?? [];
    arr.push(l);
    byKind.set(l.kind, arr);
  }
  const groups = Array.from(byKind.values());
  return { groups, mixed: groups.length > 1 };
}

/**
 * cat-012: CKTM (5211) vs giảm giá hàng bán (5213).
 * Tạm chỉ detect dựa keyword trong description.
 */
export function detectDiscountAccount(description: string): string | null {
  const d = description.toLowerCase();
  if (/chi[ếe]t kh[ấa]u th[ưu]?[ơo]ng m[ạa]i|cktm/.test(d)) return "5211";
  if (/gi[ảa]m gi[áa] h[àa]ng b[áa]n/.test(d)) return "5213";
  if (/chi[ếe]t kh[ấa]u thanh to[áa]n/.test(d)) return "635"; // chi phí tài chính
  return null;
}

/**
 * cat-013: Hoá đơn điều chỉnh TT78 — nhận diện qua notes/raw_ocr.
 * Nếu là HĐ điều chỉnh giảm → tạo 2 entry: đảo bút toán cũ + bút toán mới.
 * Tạm chỉ detect; logic đảo do caller xử lý.
 */
export function detectAdjustmentInvoice(input: {
  notes?: string | null;
  raw_ocr?: Record<string, unknown> | null;
}): { is_adjustment: boolean; direction?: "increase" | "decrease"; original_no?: string } {
  const text = `${input.notes ?? ""} ${JSON.stringify(input.raw_ocr ?? {})}`.toLowerCase();
  if (!/h[óo]a đơn (đi[ềe]u ch[ỉi]nh|thay th[ếe])|đi[ềe]u ch[ỉi]nh|adjust/.test(text)) {
    return { is_adjustment: false };
  }
  const direction = /gi[ảa]m|decrease|negative/.test(text) ? "decrease" : "increase";
  const noMatch = text.match(/(?:hđ|hoá đơn|original)\s*(?:số)?\s*[:#]?\s*([a-z0-9-]+)/i);
  return { is_adjustment: true, direction, original_no: noMatch?.[1] };
}

/** Map LineKind → mã TK chi phí mặc định khi không có học. */
export function defaultAccountFor(kind: LineKind): string {
  switch (kind) {
    case "fixed_asset": return "211";
    case "ccdc": return "153";
    case "goods": return "156";
    case "service":
    default: return "6422"; // CP QLDN
  }
}

/** Tính fingerprint pattern cho bút toán — dùng để so sánh template vendor. */
export function entryFingerprint(entry: ProposalEntry): string {
  // sort by account để không phụ thuộc thứ tự
  const sig = entry.lines
    .map((l) => `${l.account_code}:${l.debit > 0 ? "D" : "C"}`)
    .sort()
    .join("|");
  return sig;
}

/** Tính tỷ lệ amount của mỗi dòng — so sánh template "tỷ lệ" giống nhau. */
export function entryRatios(entry: ProposalEntry): Record<string, number> {
  const total = entry.lines.reduce((s, l) => s + lineMag(l), 0) || 1;
  const out: Record<string, number> = {};
  for (const l of entry.lines) {
    out[`${l.account_code}:${l.debit > 0 ? "D" : "C"}`] = lineMag(l) / total;
  }
  return out;
}

/** Hai entry "tương đương template" nếu fingerprint giống và mọi ratio chênh ≤8%. */
export function entryMatchesTemplate(a: ProposalEntry, b: ProposalEntry): boolean {
  if (entryFingerprint(a) !== entryFingerprint(b)) return false;
  const ra = entryRatios(a);
  const rb = entryRatios(b);
  for (const k of Object.keys(ra)) {
    if (Math.abs(ra[k] - (rb[k] ?? 0)) > 0.08) return false;
  }
  return true;
}
