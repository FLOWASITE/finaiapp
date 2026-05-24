import type { AgentSpec } from "@/types/agent";

export const reconcileSpec: AgentSpec = {
  inputs: [
    { name: "Bút toán mở 131/331", format: "JournalEntries từ Agent Hạch toán" },
    { name: "Sao kê MT940", format: "SWIFT MT940", notes: "Chuẩn quốc tế cho enterprise" },
    { name: "Sao kê CSV", format: "CSV (VCB, TCB, MB, BIDV, ACB)", notes: "Mỗi NH schema riêng, agent tự detect" },
    { name: "Open Banking API", format: "REST JSON", notes: "VCB digiBiz, TCB Business, MB BizMB" },
  ],
  outputs: [
    { name: "ReconciliationResult", format: "JSON", notes: "matched_pairs, unmatched_invoices, unmatched_statements, partial_matches, suggested_actions" },
    { name: "Bút toán đóng công nợ", format: "JournalEntry", notes: "Nợ 331/Có 112 hoặc Nợ 112/Có 131" },
  ],
  decision_tree: [
    {
      id: "d-match", condition: "Loại khớp", outcome: "Confidence khác nhau",
      children: [
        { id: "d-exact", condition: "Amount khớp tuyệt đối + date ±3 ngày + memo chứa invoice_no", outcome: "Auto-close", confidence: 0.99 },
        { id: "d-fuzzy", condition: "Amount ±0.5% + date ±7 ngày + memo chứa MST/tên", outcome: "Đề xuất khớp", confidence: 0.85 },
        { id: "d-split", condition: "1 CK ↔ nhiều HĐ cùng vendor đủ tổng amount", outcome: "Split match (FIFO)", confidence: 0.8 },
        { id: "d-partial", condition: "CK lớn hơn tổng HĐ", outcome: "Khớp một phần và ghi nhận dư có 131", confidence: 0.75 },
        { id: "d-no", condition: "Không khớp sau 14 ngày", outcome: "Flag công nợ quá hạn", confidence: 1.0 },
      ],
    },
  ],
  rules: [
    { id: "rec-001", title: "Ưu tiên FIFO khi vendor nhiều HĐ", detail: "Khớp HĐ phát sinh sớm trước; tránh khớp HĐ mới rồi để HĐ cũ quá hạn", severity: "mandatory" },
    { id: "rec-002", title: "Cross-currency với tỷ giá ngày CK", detail: "HĐ USD ↔ CK VND dùng tỷ giá NHNN ngày CK; chênh lệch thì 515/635", severity: "mandatory", reference: "TT200 Điều 69" },
    { id: "rec-003", title: "Cấn trừ công nợ 131↔331", detail: "Cùng đối tác vừa là KH vừa là NCC thì đề xuất bù trừ, cần KTT duyệt", severity: "recommended", reference: "TT200 Điều 18" },
    { id: "rec-004", title: "Phí ngân hàng tự động", detail: "Detect line phí (FEE, PHI, CHARGE) thì tự hạch toán Nợ 6427/Có 112", severity: "recommended" },
    { id: "rec-005", title: "CK nội bộ giữa 2 TK cùng DN", detail: "Match by amount + opposite direction trong cùng ngày thì tự loại", severity: "mandatory" },
    { id: "rec-006", title: "Refund/Reversal trong 3 ngày", detail: "Match ngược lại CK gốc thì khớp cặp negative, không tính là thanh toán mới", severity: "mandatory" },
    { id: "rec-007", title: "Đối chiếu công nợ định kỳ", detail: "Sinh biên bản đối chiếu cuối quý cho mỗi vendor có dư khác 0", severity: "mandatory", reference: "TT200 Điều 12" },
    { id: "rec-008", title: "Cảnh báo HĐ quá hạn", detail: "Trên 7 ngày quá hạn theo due_date thì flag warning; trên 30 ngày thì escalate", severity: "recommended" },
    { id: "rec-009", title: "Khớp theo memo pattern", detail: "Detect patterns TT HD XXX, INVOICE XXX, HOA DON XXX; case insensitive và remove dấu", severity: "recommended" },
    { id: "rec-010", title: "Lưu version thuật toán", detail: "Mỗi match log matching_algorithm_version để có thể replay khi audit", severity: "mandatory" },
  ],
  confidence_matrix: { strict: 0.95, balanced: 0.85, flexible: 0.7, fallback_action: "suggest" },
  exceptions: [
    { id: "rec-e1", scenario: "CK với memo trống hoàn toàn", handling: "Match by amount + date + vendor account number (nếu biết)" },
    { id: "rec-e2", scenario: "1 HĐ ↔ nhiều CK partial", handling: "Tích lũy đến đủ amount thì close; status = partially_paid" },
    { id: "rec-e3", scenario: "CK từ TK không xác định vendor", handling: "Queue review; suggest top-3 vendor có dư công nợ gần amount nhất" },
    { id: "rec-e4", scenario: "Sao kê sai số làm tròn ngoại tệ", handling: "Tolerance ±2 đơn vị tiền tệ nhỏ nhất; vượt thì flag" },
  ],
  integrations: [
    { name: "VCB digiBiz API", kind: "bank", direction: "in" },
    { name: "TCB Business API", kind: "bank", direction: "in" },
    { name: "MB BizMB", kind: "bank", direction: "in" },
    { name: "BIDV iBank", kind: "bank", direction: "in", notes: "Hỗ trợ MT940 download" },
    { name: "Sacombank, ACB", kind: "bank", direction: "in", notes: "CSV import thủ công" },
    { name: "ISO 20022 CAMT.053", kind: "bank", direction: "in", notes: "Cho enterprise host-to-host" },
  ],
  audit_fields: ["matching_algorithm_version", "match_type", "manual_override_user", "manual_override_reason", "dispute_log", "statement_file_hash"],
  compliance: [
    { id: "c-rec-1", requirement: "Đối chiếu công nợ ≥1 lần/quý", reference: "TT200 Điều 12", status: "covered" },
    { id: "c-rec-2", requirement: "Lưu sao kê NH 10 năm", reference: "Luật KT 88/2015", status: "covered" },
    { id: "c-rec-3", requirement: "Báo cáo đối soát tự động", reference: "Internal control COSO", status: "covered" },
  ],
  sla: { p50_ms: 180, p95_ms: 600, max_retry: 3, timeout_ms: 60000 },
};
