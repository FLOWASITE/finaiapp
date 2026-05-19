import type { InboxItem } from "@/lib/ai/inbox-types";

/**
 * Dữ liệu mẫu cho Inbox AI — hiển thị khi tenant chưa có giao dịch thật.
 * Mọi id bắt đầu bằng "mock-" để handler nhận diện & xử lý cục bộ (không gọi server).
 */
const today = new Date();
const iso = (minutesAgo: number) =>
  new Date(today.getTime() - minutesAgo * 60_000).toISOString();
const dateOnly = today.toISOString().slice(0, 10);

export const mockInboxItems: InboxItem[] = [
  {
    id: "mock-1",
    external_id: "mock-1",
    source: "tct_einvoice",
    source_label: "Hoá đơn vào · Tổng cục Thuế",
    source_short: "Hoá đơn vào",
    title: "FPT Telecom",
    subtitle: "Cước Internet T11 · HĐ 00128456",
    partner: "FPT Telecom",
    amount: 2_695_000,
    occurred_at: iso(2),
    confidence: 96,
    confidence_band: "high",
    proposal: {
      description: "Cước Internet T11 — FPT Telecom (HĐ 00128456)",
      entry_date: dateOnly,
      lines: [
        { account: "642", debit: 2_450_000, memo: "Cước Internet T11" },
        { account: "133", debit: 245_000, memo: "VAT 10%" },
        { account: "331", credit: 2_695_000, memo: "Phải trả FPT" },
      ],
    },
    reasoning: {
      summary:
        "Hoá đơn từ FPT Telecom 2.695.000 ₫ là cước Internet định kỳ tháng. Pattern này đã lặp 11 tháng liền, luôn vào TK 642 (chi phí quản lý) + VAT 10% trên TK 133.",
      signals: [
        { kind: "partner", label: "Đối tác đã có", ok: true },
        { kind: "pattern", label: "Pattern lặp ×11", ok: true },
        { kind: "rule", label: "Quy tắc: FPT → 642", ok: true },
      ],
    },
    followups: ["Xem các tháng trước của FPT", "Đổi sang phân bổ theo phòng ban"],
  },
  {
    id: "mock-2",
    external_id: "mock-2",
    source: "bank_statement",
    source_label: "Sao kê Vietcombank ··1234",
    source_short: "Sao kê VCB",
    title: "CTY TNHH XYZ chuyển khoản",
    subtitle: "TT HD 125 thang 10 CTY XYZ",
    partner: "CTY TNHH XYZ",
    amount: 55_000_000,
    occurred_at: iso(25),
    confidence: 99,
    confidence_band: "high",
    match_ref: { kind: "sales_invoice", id: "mock-inv-125", ref: "HĐ 00125" },
    proposal: {
      description: "Thu tiền CTY XYZ — HĐ 00125",
      entry_date: dateOnly,
      lines: [
        { account: "112", debit: 55_000_000, memo: "TG Vietcombank" },
        { account: "131", credit: 55_000_000, memo: "Phải thu CTY XYZ" },
      ],
    },
    reasoning: {
      summary:
        "Khoản tiền vào 55.000.000 ₫ từ CTY TNHH XYZ khớp với hoá đơn bán hàng HĐ 00125 ngày 28/10 (cùng số tiền, đúng đối tác, ghi chú chuyển khoản có mã hoá đơn).",
      signals: [
        { kind: "match", label: "Khớp hoá đơn HĐ 00125", ok: true },
        { kind: "partner", label: "Đối tác đã có", ok: true },
        { kind: "pattern", label: "Pattern tương tự ×17", ok: true },
        { kind: "memo", label: "Memo chứa mã HĐ", ok: true },
      ],
    },
    followups: [
      "Tại sao lại là TK 131 mà không phải 511?",
      "Tổng đã thu của XYZ là bao nhiêu?",
      "Áp dụng quy tắc này cho mục tương lai",
    ],
  },
  {
    id: "mock-3",
    external_id: "mock-3",
    source: "email_forward",
    source_label: "Hoá đơn vào · Email forward",
    source_short: "Hoá đơn vào",
    title: "Grab for Business",
    subtitle: "14 chuyến đi · nhiều người dùng",
    partner: "Grab for Business",
    amount: 1_287_000,
    occurred_at: iso(12),
    confidence: 72,
    confidence_band: "medium",
    proposal: {
      description: "Grab for Business — 14 chuyến đi T11",
      entry_date: dateOnly,
      lines: [
        { account: "642", debit: 1_170_000, memo: "Tạm phân vào QLDN" },
        { account: "133", debit: 117_000, memo: "VAT 10%" },
        { account: "331", credit: 1_287_000, memo: "Phải trả Grab" },
      ],
    },
    reasoning: {
      summary:
        "Hoá đơn Grab gộp 14 chuyến của nhiều người dùng. Cần xác nhận: chi phí bán hàng (641) hay quản lý (642)? Hoặc phân theo phòng ban.",
      signals: [
        { kind: "partner", label: "Đối tác đã có", ok: true },
        { kind: "warn", label: "Chưa rõ trung tâm chi phí", ok: false },
      ],
    },
    followups: [
      "Phân theo phòng ban (Sales/QLDN)",
      "Luôn ghi vào TK 642",
      "Mở chi tiết 14 chuyến",
    ],
  },
  {
    id: "mock-4",
    external_id: "mock-4",
    source: "bank_statement",
    source_label: "Sao kê Techcombank ··5678",
    source_short: "Sao kê TCB",
    title: "Chuyển khoản đến NGUYEN VAN A",
    subtitle: "thanh toan",
    amount: -5_000_000,
    occurred_at: iso(360),
    confidence: 28,
    confidence_band: "low",
    blocker: {
      reason: "Cần cung cấp chứng từ — không có hoá đơn khớp.",
      notified: "Kế toán trưởng",
    },
    proposal: {
      description: "Chuyển khoản NGUYEN VAN A — chờ chứng từ",
      entry_date: dateOnly,
      lines: [
        { account: "138", debit: 5_000_000, memo: "Tạm treo chờ chứng từ" },
        { account: "112", credit: 5_000_000, memo: "TG Techcombank" },
      ],
    },
    reasoning: {
      summary:
        "Khoản chi 5.000.000 ₫ tới NGUYEN VAN A, memo chỉ ghi \"thanh toan\". Không tìm thấy hoá đơn, hợp đồng, hay đề nghị thanh toán nào khớp.",
      signals: [
        { kind: "warn", label: "Không khớp hoá đơn", ok: false },
        { kind: "warn", label: "Người nhận lần đầu", ok: false },
        { kind: "memo", label: "Memo không có mã HĐ", ok: false },
      ],
    },
    followups: ["Gửi nhắc cho người chi", "Đính kèm chứng từ", "Đánh dấu tạm ứng"],
  },
];

export const mockInboxStats = {
  pending: 47,
  posted_today: 132,
  accuracy: 98.4 as number | null,
  high_conf_count: 32,
};
