// Mã thuế GTGT Việt Nam (TT78/TT44)
export type VatCode = "0" | "5" | "8" | "10" | "KCT" | "KKKNT";

export const VAT_CODES: { code: VatCode; rate: number; label: string; hasOutputTax: boolean }[] = [
  { code: "0", rate: 0, label: "0% (xuất khẩu, vận tải QT)", hasOutputTax: true },
  { code: "5", rate: 5, label: "5%", hasOutputTax: true },
  { code: "8", rate: 8, label: "8% (giảm thuế)", hasOutputTax: true },
  { code: "10", rate: 10, label: "10% (thông thường)", hasOutputTax: true },
  { code: "KCT", rate: 0, label: "KCT — Không chịu thuế", hasOutputTax: false },
  { code: "KKKNT", rate: 0, label: "KKKNT — Không kê khai, không nộp", hasOutputTax: false },
];

export function vatRate(code: VatCode): number {
  return VAT_CODES.find((v) => v.code === code)?.rate ?? 0;
}

export function vatHasOutputTax(code: VatCode): boolean {
  return VAT_CODES.find((v) => v.code === code)?.hasOutputTax ?? false;
}

/** Tính tiền trước thuế + VAT cho 1 dòng, đã tính chiết khấu dòng. */
export function calcLineTax(opts: {
  qty: number;
  unit_price: number;
  line_discount_percent?: number;
  line_discount_amount?: number;
  vat_code: VatCode;
}) {
  const gross = opts.qty * opts.unit_price;
  const discPct = (opts.line_discount_percent ?? 0) / 100;
  const discAbs = opts.line_discount_amount ?? 0;
  const preVat = Math.max(0, gross * (1 - discPct) - discAbs);
  const rate = vatRate(opts.vat_code);
  const vat = vatHasOutputTax(opts.vat_code) ? preVat * (rate / 100) : 0;
  return { pre_vat_amount: preVat, line_vat_amount: vat, line_total: preVat + vat };
}
