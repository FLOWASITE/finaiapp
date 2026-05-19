/**
 * Keyword-based counter account suggestion for bank statement transactions.
 * Returns a counter account code + reason + confidence (0..1).
 * Mirrors the rules in src/lib/ai/system-prompt.ts so the chat AI and the
 * batch UI both speak the same language.
 */
export type Suggestion = {
  counter_account: string;
  reason: string;
  confidence: number;
  party_hint?: string;
};

const norm = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

const RECEIPT_RULES: Array<{ kw: RegExp; code: string; reason: string; conf: number }> = [
  { kw: /(thu (tien |)kh|thanh toan hoa don|tt cong no|tt hd|payment for invoice|tt hd|thu no)/, code: "131", reason: "Khách hàng thanh toán công nợ", conf: 0.85 },
  { kw: /(doanh thu|sales|ban hang|thu tu ban)/, code: "511", reason: "Doanh thu bán hàng", conf: 0.75 },
  { kw: /(lai (tien |)gui|lai ngan hang|interest)/, code: "515", reason: "Lãi tiền gửi", conf: 0.95 },
  { kw: /(hoan thue|hoan vat|tax refund)/, code: "3331", reason: "Hoàn thuế GTGT", conf: 0.9 },
  { kw: /(vay (ngan han|ngn|nh)|loan)/, code: "341", reason: "Nhận tiền vay", conf: 0.85 },
  { kw: /(gop von|capital|von gop)/, code: "411", reason: "Vốn góp chủ sở hữu", conf: 0.85 },
  { kw: /(thu tam ung|hoan tam ung)/, code: "141", reason: "Thu hoàn tạm ứng", conf: 0.8 },
  { kw: /(nop tien mat|nop quy)/, code: "1111", reason: "Nộp tiền mặt vào TK", conf: 0.85 },
  { kw: /(thu nhap khac|other income)/, code: "711", reason: "Thu nhập khác", conf: 0.7 },
];

const PAYMENT_RULES: Array<{ kw: RegExp; code: string; reason: string; conf: number }> = [
  { kw: /(thanh toan (cho |)ncc|tra ncc|tt ncc|payment to supplier|tt hd mua)/, code: "331", reason: "Thanh toán cho NCC", conf: 0.85 },
  { kw: /(phi (ngan hang|nh|chuyen tien|gd|sms|qly)|bank fee|service fee|phi dich vu)/, code: "6427", reason: "Phí ngân hàng (QLDN)", conf: 0.9 },
  { kw: /(luong|salary|payroll)/, code: "334", reason: "Trả lương nhân viên", conf: 0.9 },
  { kw: /(bhxh|bhyt|bhtn|bao hiem xa hoi|bao hiem y te)/, code: "3383", reason: "Nộp BHXH/BHYT", conf: 0.9 },
  { kw: /(thue gtgt|nop thue gtgt|vat)/, code: "3331", reason: "Nộp thuế GTGT", conf: 0.9 },
  { kw: /(thue tncn|tncn)/, code: "3335", reason: "Nộp thuế TNCN", conf: 0.9 },
  { kw: /(thue tndn|tndn)/, code: "3334", reason: "Nộp thuế TNDN", conf: 0.9 },
  { kw: /(thue mon bai|nop thue khac)/, code: "3338", reason: "Nộp thuế khác", conf: 0.8 },
  { kw: /(van phong pham|vpp|office supplies|in an|cuoc dien thoai|tien dien|tien nuoc|internet)/, code: "6428", reason: "Chi phí văn phòng (QLDN)", conf: 0.8 },
  { kw: /(quang cao|marketing|ads|facebook|google)/, code: "6418", reason: "Chi phí bán hàng - quảng cáo", conf: 0.8 },
  { kw: /(van chuyen|ship|giao hang|logistics)/, code: "6417", reason: "Chi phí vận chuyển (CPBH)", conf: 0.75 },
  { kw: /(tra no vay|tra goc vay|tra lai vay)/, code: "341", reason: "Trả nợ vay", conf: 0.85 },
  { kw: /(mua tscd|mua tai san|mua may moc|mua thiet bi)/, code: "211", reason: "Mua TSCĐ", conf: 0.75 },
  { kw: /(mua hang|mua nhap|nhap kho|mua nvl)/, code: "152", reason: "Mua NVL/Hàng hoá", conf: 0.7 },
  { kw: /(tam ung|chi tam ung)/, code: "141", reason: "Chi tạm ứng cho NV", conf: 0.85 },
];

const INTERNAL_TRANSFER_KW = /(chuyen khoan noi bo|chuyen giua tk|cktn|internal transfer|chuyen tu tk \d+ den tk \d+)/;

export function suggestCounterAccount(input: {
  description?: string | null;
  amount: number;
  counterparty?: string | null;
}): Suggestion {
  const text = `${norm(input.description)} ${norm(input.counterparty)}`;
  const isReceipt = input.amount >= 0;

  if (INTERNAL_TRANSFER_KW.test(text)) {
    return {
      counter_account: isReceipt ? "1121" : "1121",
      reason: "Chuyển khoản nội bộ giữa các TK ngân hàng",
      confidence: 0.7,
    };
  }

  const rules = isReceipt ? RECEIPT_RULES : PAYMENT_RULES;
  for (const r of rules) {
    if (r.kw.test(text)) {
      return {
        counter_account: r.code,
        reason: r.reason,
        confidence: r.conf,
        party_hint: input.counterparty ?? undefined,
      };
    }
  }

  // Fallback
  return {
    counter_account: isReceipt ? "131" : "331",
    reason: isReceipt
      ? "Mặc định: thu khách hàng (cần xác nhận)"
      : "Mặc định: trả NCC (cần xác nhận)",
    confidence: 0.3,
    party_hint: input.counterparty ?? undefined,
  };
}

/** Convert parsed bank statement (from AI) into normalized rows. */
export function normalizeStatementRows(parsed: any): Array<{
  txn_date: string;
  description: string;
  amount: number;
  counterparty?: string;
}> {
  const txns: any[] = Array.isArray(parsed?.transactions)
    ? parsed.transactions
    : Array.isArray(parsed)
      ? parsed
      : [];
  return txns
    .map((t) => {
      const date = t.txn_date || t.date || t.transaction_date || t.value_date || "";
      const desc = String(t.description || t.memo || t.narration || t.detail || "");
      // amount: ưu tiên amount; nếu có credit/debit riêng thì credit - debit
      let amt = 0;
      if (typeof t.amount === "number") amt = t.amount;
      else if (typeof t.amount === "string") amt = Number(t.amount.replace(/[^\d\-.]/g, "")) || 0;
      else {
        const credit = Number(t.credit ?? t.co ?? 0) || 0;
        const debit = Number(t.debit ?? t.no ?? 0) || 0;
        amt = credit - debit;
      }
      return {
        txn_date: String(date).slice(0, 10),
        description: desc,
        amount: amt,
        counterparty: t.counterparty || t.partner || t.beneficiary || undefined,
      };
    })
    .filter((r) => r.txn_date && r.amount !== 0);
}
