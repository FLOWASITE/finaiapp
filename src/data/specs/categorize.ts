import type { AgentSpec } from "@/types/agent";

export const categorizeSpec: AgentSpec = {
  inputs: [
    { name: "ExtractDTO", format: "JSON từ Agent Trích xuất" },
    { name: "Chart of Accounts", format: "TT200 (mặc định) hoặc TT133 (DN nhỏ)" },
    { name: "Vendor memory", format: "Bảng vendors (128 đối tác đã học)" },
    { name: "Rules từ Trí nhớ AI", format: "47 quy tắc kế toán custom của tenant" },
  ],
  outputs: [
    { name: "JournalEntryDTO", format: "JSON", notes: "debit_account, credit_account, amount, vat_split, cost_center, project_code, description_vn, tags[], confidence, rule_id_applied, alternatives[]" },
  ],
  decision_tree: [
    {
      id: "d-vendor", condition: "Vendor đã biết?", outcome: "Route theo template học sẵn",
      children: [
        { id: "d-known", condition: "Đã hạch toán ≥3 lần với pattern ổn định", outcome: "Auto apply template (FPT → Nợ 6427/Có 331, VAT 10%)", confidence: 0.96 },
        { id: "d-new", condition: "Vendor mới hoặc pattern khác", outcome: "Classify by line_items và propose top-3 bút toán", confidence: 0.82 },
      ],
    },
    {
      id: "d-class", condition: "Phân loại theo bản chất chi phí", outcome: "Map về TK 6xx phù hợp",
      children: [
        { id: "d-cl-642", condition: "Văn phòng, hành chính, marketing", outcome: "6421-6428 chi tiết theo nội dung" },
        { id: "d-cl-641", condition: "Bán hàng, hoa hồng, vận chuyển bán hàng", outcome: "6411-6418" },
        { id: "d-cl-627", condition: "Sản xuất chung", outcome: "6271-6278" },
        { id: "d-cl-621", condition: "Nguyên vật liệu trực tiếp", outcome: "621 kết chuyển 154" },
        { id: "d-cl-211", condition: "Tài sản ≥30tr và dùng trên 1 năm", outcome: "Nợ 211/Có 331, trích khấu hao 214" },
      ],
    },
  ],
  rules: [
    { id: "cat-001", title: "VAT đầu vào 133 chỉ khi hợp lệ", detail: "Yêu cầu MST hợp lệ + hóa đơn GTGT (không phải bán lẻ) + thanh toán không tiền mặt nếu trên 20tr", severity: "mandatory", reference: "TT219/2013 Điều 15" },
    { id: "cat-002", title: "Ngưỡng TSCĐ 30 triệu", detail: "≥30tr và dùng trên 12 tháng thì 211 + 214; nhỏ hơn thì 242 (CCDC phân bổ) hoặc chi phí 1 lần", severity: "mandatory", reference: "TT45/2013 Điều 3" },
    { id: "cat-003", title: "Tạm ứng 141", detail: "Khi NV ứng tiền thì Nợ 141; khi quyết toán thì kết chuyển về 642/627 và hoàn 111", severity: "mandatory", reference: "TT200 Điều 23" },
    { id: "cat-004", title: "Phân bổ chi phí trả trước 242", detail: "Auto chia đều theo số kỳ (mặc định 12 tháng) hoặc theo lifecycle nếu có", severity: "recommended" },
    { id: "cat-005", title: "Chênh lệch tỷ giá", detail: "Cuối kỳ đánh giá lại: lãi thì 515, lỗ thì 635; chênh lệch chưa thực hiện thì 413", severity: "mandatory", reference: "TT200 Điều 69" },
    { id: "cat-006", title: "Tồn kho bình quân gia quyền", detail: "Mặc định BQGQ cuối kỳ; chuyển FIFO chỉ khi tenant.inventory_method = fifo", severity: "mandatory", reference: "VAS 02" },
    { id: "cat-007", title: "Làm tròn VND", detail: "Không số lẻ thập phân với TK tiền VND; làm tròn đến đồng theo half-up", severity: "mandatory" },
    { id: "cat-008", title: "Chi không hợp lệ thành 811", detail: "Chi không có chứng từ đủ điều kiện thì hạch toán 811 + flag non_cit_deductible", severity: "mandatory", reference: "TT78/2014 Điều 4" },
    { id: "cat-009", title: "Tách bút toán đa bản chất", detail: "1 HĐ có cả NVL và dịch vụ thì tách 2 bút toán riêng để map đúng TK", severity: "recommended" },
    { id: "cat-010", title: "Cost center và Project", detail: "Required cho DN có quản trị; auto-suggest dựa trên vendor history hoặc keyword", severity: "recommended" },
    { id: "cat-011", title: "Phải trả NB 331 vs Phải thu KH 131", detail: "Vendor (bên bán) thì 331; Customer (bên mua) thì 131; phân biệt qua direction HĐ", severity: "mandatory" },
    { id: "cat-012", title: "Chiết khấu thương mại vs giảm giá", detail: "CKTM ghi giảm DT (5211); giảm giá hàng bán (5213); chiết khấu thanh toán (635/515)", severity: "mandatory", reference: "TT200 Điều 79" },
    { id: "cat-013", title: "Hóa đơn thay thế/điều chỉnh TT78", detail: "Khi nhận hđ điều chỉnh thì tạo bút toán đảo và bút toán mới, không xóa cũ", severity: "mandatory", reference: "TT78/2021 Điều 19" },
    { id: "cat-014", title: "VAS 17 Thuế thu nhập hoãn lại", detail: "Phát sinh chênh lệch tạm thời thì 243 (tài sản) hoặc 347 (nợ phải trả)", severity: "advisory", reference: "VAS 17" },
    { id: "cat-015", title: "Audit trail KTT override", detail: "Mọi override của KTT phải log user_id, old_entry, new_entry, reason", severity: "mandatory" },
  ],
  confidence_matrix: { strict: 0.95, balanced: 0.85, flexible: 0.7, fallback_action: "suggest" },
  exceptions: [
    { id: "cat-e1", scenario: "HĐ nhiều mục khác bản chất", handling: "Tách thành nhiều bút toán; tổng amount phải khớp" },
    { id: "cat-e2", scenario: "Chi không chứng từ hợp lệ", handling: "Hạch toán 811 và flag non_cit_deductible cho Agent Thuế" },
    { id: "cat-e3", scenario: "Vendor mới trên 50tr lần đầu", handling: "Confidence cap 0.7 thì bắt buộc KTT duyệt; gửi flag cho Agent Cảnh báo" },
    { id: "cat-e4", scenario: "Hóa đơn không xác định được TK", handling: "Hạch toán tạm vào 1388 (phải thu khác) và queue review" },
  ],
  integrations: [
    { name: "MISA SME", kind: "accounting_software", direction: "out", notes: "Export XML chuẩn TT200 phụ lục 12" },
    { name: "Fast Accounting", kind: "accounting_software", direction: "out" },
    { name: "Bravo 8R2", kind: "accounting_software", direction: "out" },
    { name: "AMIS Kế toán", kind: "accounting_software", direction: "bidirectional", notes: "API REST" },
  ],
  audit_fields: ["rule_id_applied", "alternatives_rejected", "ktt_override_user", "ktt_override_reason", "vendor_template_version", "coa_version"],
  compliance: [
    { id: "c-cat-1", requirement: "Hạch toán theo TT200/2014", reference: "TT 200/2014/TT-BTC", status: "covered" },
    { id: "c-cat-2", requirement: "TT133 cho DN siêu nhỏ", reference: "TT 133/2016/TT-BTC", status: "covered" },
    { id: "c-cat-3", requirement: "VAS 01-26", reference: "QĐ 165/2002 và các cập nhật", status: "covered" },
    { id: "c-cat-4", requirement: "Audit trail bất biến", reference: "Luật KT 88/2015 Điều 8", status: "covered" },
  ],
  sla: { p50_ms: 320, p95_ms: 800, max_retry: 2, timeout_ms: 5000 },
};
