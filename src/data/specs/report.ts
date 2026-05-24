import type { AgentSpec } from "@/types/agent";

export const reportSpec: AgentSpec = {
  inputs: [
    { name: "Trial Balance", format: "Bảng cân đối số phát sinh" },
    { name: "Tất cả bút toán kỳ", format: "JournalEntries đã post + đã đóng" },
    { name: "Tax declarations", format: "TaxComputation từ Agent Thuế" },
    { name: "Asset register", format: "TSCĐ + khấu hao 214 từ module quản trị TS" },
  ],
  outputs: [
    { name: "BCĐKT B01-DN", format: "Excel + PDF + XBRL", notes: "Theo TT200" },
    { name: "KQKD B02-DN", format: "Excel + PDF + XBRL" },
    { name: "LCTT B03-DN", format: "Excel + PDF + XBRL", notes: "Trực tiếp hoặc gián tiếp" },
    { name: "Thuyết minh B09-DN", format: "Word + PDF", notes: "Sinh từ template + auto-fill số liệu" },
    { name: "Dashboard live", format: "JSON cho React UI", notes: "Revenue, GP%, AR/AP aging, cash position" },
  ],
  decision_tree: [
    {
      id: "d-close", condition: "Month-end close checklist", outcome: "Chạy tuần tự",
      children: [
        { id: "d-dep", condition: "Trích khấu hao TSCĐ", outcome: "214 → 6274/6424 theo cost-center" },
        { id: "d-alloc", condition: "Phân bổ chi phí trả trước 242", outcome: "Chia kỳ theo lifecycle" },
        { id: "d-fx", condition: "Đánh giá lại tỷ giá cuối kỳ", outcome: "413/635/515 với số dư ngoại tệ" },
        { id: "d-trans", condition: "Kết chuyển 5xx/6xx/7xx/8xx về 911", outcome: "911 phải = 0 sau kết chuyển" },
        { id: "d-cit", condition: "Trích CIT 821 → 3334", outcome: "Tự động theo TaxComputation" },
        { id: "d-result", condition: "Kết chuyển 911 → 421", outcome: "Lãi/lỗ về lợi nhuận chưa phân phối" },
        { id: "d-lock", condition: "Đóng kỳ", outcome: "Set period_status=locked; sinh báo cáo" },
      ],
    },
  ],
  rules: [
    { id: "rep-001", title: "Cân đối Nợ = Có (hard check)", detail: "Tổng phát sinh Nợ = tổng phát sinh Có trên mọi tài khoản; fail thì block close", severity: "mandatory" },
    { id: "rep-002", title: "TK 911 = 0 sau kết chuyển", detail: "Nếu 911 còn dư thì truy ngược tìm bút toán thiếu", severity: "mandatory" },
    { id: "rep-003", title: "Số dư đầu kỳ N+1 = cuối kỳ N", detail: "Auto-rollover; phát hiện mismatch thì alert", severity: "mandatory" },
    { id: "rep-004", title: "Định dạng XBRL nộp Sở KHĐT", detail: "BCTC nộp online qua Cổng DKKD: format XBRL chuẩn của Bộ TC", severity: "mandatory", reference: "TT200 Phần III" },
    { id: "rep-005", title: "Song ngữ Việt-Anh", detail: "DN FDI cần BCTC song ngữ; auto-translate label theo dictionary VAS-IFRS", severity: "recommended" },
    { id: "rep-006", title: "Phân loại LCTT theo VAS 24", detail: "3 nhóm: hoạt động kinh doanh, đầu tư, tài chính; mặc định gián tiếp", severity: "mandatory", reference: "VAS 24" },
    { id: "rep-007", title: "Thuyết minh bắt buộc", detail: "Tối thiểu 11 mục theo TT200 + chính sách kế toán + đánh giá rủi ro", severity: "mandatory", reference: "TT200 Điều 95" },
    { id: "rep-008", title: "So sánh kỳ trước", detail: "BCĐKT và KQKD bắt buộc có cột kỳ trước; auto-pull từ kỳ N-1", severity: "mandatory" },
    { id: "rep-009", title: "Sign-off workflow", detail: "Sinh BCTC → KTT review → GĐ ký → lock vĩnh viễn; log signed_by + signed_at", severity: "mandatory", reference: "Luật KT 88/2015 Điều 32" },
    { id: "rep-010", title: "Restatement với điều chỉnh hồi tố", detail: "Khi có điều chỉnh kỳ đã đóng thì sinh phiên bản restated kèm note giải trình", severity: "mandatory", reference: "VAS 29" },
    { id: "rep-011", title: "Báo cáo nội bộ realtime", detail: "Dashboard cập nhật mỗi 5 phút; không chờ kỳ close", severity: "recommended" },
    { id: "rep-012", title: "Audit trail bất biến", detail: "Mọi version BCTC lưu hash SHA-256 + signed_at; không cho phép xóa", severity: "mandatory" },
  ],
  confidence_matrix: { strict: 1.0, balanced: 1.0, flexible: 1.0, fallback_action: "queue_human" },
  exceptions: [
    { id: "rep-e1", scenario: "Kỳ có điều chỉnh hồi tố", handling: "Sinh phiên bản restated; giữ phiên bản gốc; note rõ lý do điều chỉnh trong B09" },
    { id: "rep-e2", scenario: "DN có công ty con (consolidation)", handling: "Out-of-scope phase này; flag cần module consolidation riêng" },
    { id: "rep-e3", scenario: "Thay đổi chính sách kế toán giữa năm", handling: "Apply retrospective + thuyết minh ảnh hưởng" },
    { id: "rep-e4", scenario: "Năm tài chính khác năm dương lịch", handling: "Đọc tenant.fiscal_year_end; sinh báo cáo theo lịch riêng" },
  ],
  integrations: [
    { name: "Cổng DKKD Sở KHĐT", kind: "tax_authority", direction: "out", notes: "Nộp BCTC online XBRL" },
    { name: "eTax Tổng cục Thuế", kind: "tax_authority", direction: "out", notes: "Nộp 03/TNDN quyết toán năm" },
    { name: "Excel/PDF export", kind: "other", direction: "out" },
    { name: "Email scheduled delivery", kind: "messaging", direction: "out", notes: "Gửi BCTC tới CEO/CFO/HĐQT theo lịch" },
  ],
  audit_fields: ["report_version", "report_hash_sha256", "signed_by", "signed_at", "locked_at", "restatement_chain", "source_period", "generation_duration_ms"],
  compliance: [
    { id: "c-rep-1", requirement: "BCTC theo TT200", reference: "TT 200/2014/TT-BTC Phần III", status: "covered" },
    { id: "c-rep-2", requirement: "BCTC theo TT133 (DN siêu nhỏ)", reference: "TT 133/2016/TT-BTC", status: "covered" },
    { id: "c-rep-3", requirement: "Luật Kế toán nguyên tắc thận trọng", reference: "Luật 88/2015 Điều 6", status: "covered" },
    { id: "c-rep-4", requirement: "VAS 21 - Trình bày BCTC", reference: "QĐ 234/2003", status: "covered" },
    { id: "c-rep-5", requirement: "VAS 29 - Thay đổi chính sách kế toán", reference: "QĐ 12/2005", status: "covered" },
    { id: "c-rep-6", requirement: "Nộp BCTC trong 90 ngày sau năm tài chính", reference: "Luật KT Điều 33", status: "covered" },
  ],
  sla: { p50_ms: 8500, p95_ms: 30000, max_retry: 1, timeout_ms: 120000 },
};
