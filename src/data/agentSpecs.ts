import type { AgentId, AgentSpec } from "@/types/agent";

export const agentSpecs: Record<AgentId, AgentSpec> = {
  // ============================================================
  // 1. AGENT TRÍCH XUẤT
  // ============================================================
  extract: {
    inputs: [
      { name: "PDF hóa đơn", format: "application/pdf", notes: "Cả PDF có text-layer và PDF scan" },
      { name: "Ảnh hóa đơn", format: "image/jpeg, image/png, image/heic", notes: "Hỗ trợ HEIC từ iPhone" },
      { name: "Hóa đơn điện tử", format: "XML TT78/TT32", notes: "Validate XSD theo chuẩn GDT" },
      { name: "Email forward", format: "EML/MIME", notes: "Attachment được tách tự động" },
      { name: "Batch upload", format: "ZIP (≤200MB)", notes: "Tối đa 500 file/batch" },
    ],
    outputs: [
      {
        name: "ExtractDTO",
        format: "JSON",
        notes: "vendor_name, tax_id, invoice_no, invoice_serial, issue_date, due_date, currency, subtotal, vat_rate, vat_amount, total, line_items[], payment_method, signature_valid, raw_ocr_confidence",
      },
      { name: "Raw file backup", format: "S3 object + SHA-256 hash", notes: "Lưu 10 năm theo NĐ 123/2020" },
    ],
    decision_tree: [
      {
        id: "d-detect",
        condition: "Phân loại định dạng đầu vào",
        outcome: "Route đến pipeline phù hợp",
        children: [
          { id: "d-xml", condition: "Là XML hđđt", outcome: "Validate XSD → parse trực tiếp", confidence: 0.99 },
          { id: "d-pdf-text", condition: "PDF có text-layer", outcome: "Trích text + regex pattern matching", confidence: 0.97 },
          { id: "d-pdf-scan", condition: "PDF scan hoặc ảnh", outcome: "OCR Vietnamese (Gemini 2.5 Pro Vision)", confidence: 0.92 },
          { id: "d-blurry", condition: "Độ phân giải <150 DPI hoặc blur score >0.6", outcome: "Upscale x2 + denoise rồi mới OCR", confidence: 0.85 },
        ],
      },
      {
        id: "d-validate",
        condition: "Sau khi trích xuất, validate MST + checksum",
        outcome: "Nếu fail → cross-check tên vendor với GDT lookup",
      },
    ],
    rules: [
      { id: "ex-001", title: "Validate MST theo TCVN", detail: "MST 10 số (DN) hoặc 13 số (đơn vị phụ thuộc); checksum theo công thức Bộ TC", severity: "mandatory", reference: "TT80/2021" },
      { id: "ex-002", title: "Cross-check tên với MST", detail: "Gọi GDT lookup tracuunnt.gdt.gov.vn; nếu tên khác >20% → flag warning", severity: "recommended", reference: "GDT API" },
      { id: "ex-003", title: "Phát hiện hóa đơn trùng", detail: "Hash MD5(vendor_tax_id + invoice_serial + invoice_no + issue_date + total); reject nếu trùng trong 24 tháng", severity: "mandatory" },
      { id: "ex-004", title: "Nhận diện hóa đơn hủy/thay thế", detail: "Field <TThai> trong XML = 'huy' hoặc invoice có ký hiệu '/HUY' → đánh dấu void", severity: "mandatory", reference: "TT78/2021 Điều 19" },
      { id: "ex-005", title: "Tách shipping/discount line", detail: "Detect keyword 'phí vận chuyển', 'chiết khấu', 'giảm giá' → tách thành line riêng", severity: "recommended" },
      { id: "ex-006", title: "Parse 5 mức thuế GTGT", detail: "0% (xuất khẩu), 5% (thiết yếu), 8% (NQ110), 10% (thông thường), KCT (không chịu thuế)", severity: "mandatory", reference: "NQ 110/2023" },
      { id: "ex-007", title: "Hóa đơn ngoại tệ", detail: "Bắt buộc ghi tỷ giá ngày phát hành theo NHNN; nếu thiếu → fetch từ exchangerate-api hoặc VCB", severity: "mandatory", reference: "TT200 Điều 6" },
      { id: "ex-008", title: "Verify chữ ký số", detail: "Với hđđt: verify CA certificate + timestamp; signature_valid = false → flag", severity: "mandatory", reference: "NĐ 123/2020 Điều 10" },
      { id: "ex-009", title: "Nhận diện hóa đơn nháp", detail: "Watermark 'DRAFT' hoặc invoice_no rỗng → không xử lý", severity: "mandatory" },
      { id: "ex-010", title: "Lưu raw file 10 năm", detail: "Upload S3 với object lock; metadata: uploaded_by, source, hash", severity: "mandatory", reference: "Luật KT 88/2015 Điều 41" },
      { id: "ex-011", title: "Đa hóa đơn trong 1 file", detail: "Detect page-break + invoice header lặp → split thành nhiều ExtractDTO", severity: "recommended" },
      { id: "ex-012", title: "Confidence per field", detail: "Lưu confidence riêng cho từng field (vendor 0.95, amount 0.99, MST 0.87...)", severity: "recommended" },
    ],
    confidence_matrix: {
      strict: 0.95,
      balanced: 0.85,
      flexible: 0.7,
      fallback_action: "queue_human",
    },
    exceptions: [
      { id: "ex-e1", scenario: "Ảnh nghiêng >15°", handling: "Auto-rotate dùng Hough transform; nếu vẫn fail → queue human" },
      { id: "ex-e2", scenario: "Hóa đơn 2 trang dính", handling: "Detect khoảng trắng ngang → split trước khi OCR" },
      { id: "ex-e3", scenario: "Hóa đơn giấy than mờ", handling: "Áp model handwriting + tăng contrast; confidence cap ở 0.7" },
      { id: "ex-e4", scenario: "Invoice nước ngoài không có MST", handling: "Tạo vendor_id tạm với prefix 'FOREIGN-'; flag để KTT review" },
      { id: "ex-e5", scenario: "Hóa đơn nội bộ (chứng từ thu/chi tay)", handling: "Trích xuất nhưng đánh dấu non_vat_deductible = true" },
    ],
    integrations: [
      { name: "GDT tracuunnt", kind: "tax_authority", direction: "in", notes: "Lookup MST → tên + tình trạng hoạt động" },
      { name: "Lovable AI Gateway", kind: "ai_gateway", direction: "bidirectional", notes: "google/gemini-2.5-pro cho ảnh khó, gemini-2.5-flash cho PDF text" },
      { name: "AWS S3 / R2", kind: "other", direction: "out", notes: "Lưu raw file với object lock" },
    ],
    audit_fields: ["raw_file_hash", "ocr_engine_version", "prompt_id", "confidence_per_field", "gdt_lookup_response", "uploaded_by", "processing_duration_ms"],
    compliance: [
      { id: "c-ex-1", requirement: "Hóa đơn điện tử hợp pháp", reference: "NĐ 123/2020", status: "covered" },
      { id: "c-ex-2", requirement: "Lưu trữ chứng từ 10 năm", reference: "Luật Kế toán 88/2015 Điều 41", status: "covered" },
      { id: "c-ex-3", requirement: "Định dạng hđđt TT78", reference: "TT 78/2021/TT-BTC", status: "covered" },
      { id: "c-ex-4", requirement: "Verify chữ ký số CA", reference: "NĐ 130/2018", status: "partial" },
    ],
    sla: { p50_ms: 850, p95_ms: 3000, max_retry: 2, timeout_ms: 30000 },
  },

  // ============================================================
  // 2. AGENT HẠCH TOÁN
  // ============================================================
  categorize: {
    inputs: [
      { name: "ExtractDTO", format: "JSON từ Agent Trích xuất" },
      { name: "Chart of Accounts", format: "TT200 (mặc định) hoặc TT133 (DN nhỏ)" },
      { name: "Vendor memory", format: "Bảng vendors (128 đối tác đã học)" },
      { name: "Rules từ Trí nhớ AI", format: "47 quy tắc kế toán custom của tenant" },
    ],
    outputs: [
      {
        name: "JournalEntryDTO",
        format: "JSON",
        notes: "debit_account, credit_account, amount, vat_split, cost_center, project_code, description_vn, tags[], confidence, rule_id_applied, alternatives[]",
      },
    ],
    decision_tree: [
      {
        id: "d-vendor",
        condition: "Vendor đã biết?",
        outcome: "Route theo template học sẵn",
        children: [
          { id: "d-known", condition: "Đã hạch toán ≥3 lần với pattern ổn định", outcome: "Auto apply template (vd FPT → Nợ 6427/Có 331, VAT 10%)", confidence: 0.96 },
          { id: "d-new", condition: "Vendor mới hoặc pattern khác", outcome: "Classify by line_items + propose top-3 bút toán", confidence: 0.82 },
        ],
      },
      {
        id: "d-class",
        condition: "Phân loại theo bản chất chi phí",
        outcome: "Map về tài khoản 6xx phù hợp",
        children: [
          { id: "d-cl-642", condition: "Văn phòng, hành chính, marketing", outcome: "6421-6428 (chi tiết theo nội dung)" },
          { id: "d-cl-641", condition: "Bán hàng, hoa hồng, vận chuyển bán hàng", outcome: "6411-6418" },
          { id: "d-cl-627", condition: "Sản xuất chung", outcome: "6271-6278" },
          { id: "d-cl-621", condition: "Nguyên vật liệu trực tiếp", outcome: "621 → kết chuyển 154" },
          { id: "d-cl-211", condition: "Tài sản ≥30tr & dùng >1 năm", outcome: "Nợ 211/Có 331, trích khấu hao 214", reference: "TT45/2013" as any },
        ],
      },
    ],
    rules: [
      { id: "cat-001", title: "VAT đầu vào 133 chỉ khi hợp lệ", detail: "Yêu cầu: MST hợp lệ + hóa đơn GTGT (không phải bán lẻ) + thanh toán không tiền mặt nếu >20tr", severity: "mandatory", reference: "TT219/2013 Điều 15" },
      { id: "cat-002", title: "Ngưỡng TSCĐ 30 triệu", detail: "≥30tr & sử dụng >12 tháng → 211 + 214; <30tr → 242 (CCDC phân bổ) hoặc chi phí 1 lần", severity: "mandatory", reference: "TT45/2013 Điều 3" },
      { id: "cat-003", title: "Tạm ứng 141", detail: "Khi NV ứng tiền → Nợ 141; khi quyết toán → kết chuyển về 642/627 + hoàn 111", severity: "mandatory", reference: "TT200 Điều 23" },
      { id: "cat-004", title: "Phân bổ chi phí trả trước 242", detail: "Auto chia đều theo số kỳ (mặc định 12 tháng) hoặc theo lifecycle nếu có", severity: "recommended" },
      { id: "cat-005", title: "Chênh lệch tỷ giá", detail: "Cuối kỳ đánh giá lại: lãi → 515, lỗ → 635; chênh lệch chưa thực hiện → 413", severity: "mandatory", reference: "TT200 Điều 69" },
      { id: "cat-006", title: "Tồn kho bình quân gia quyền", detail: "Mặc định BQGQ cuối kỳ; chuyển FIFO chỉ khi tenant.inventory_method = 'fifo'", severity: "mandatory", reference: "VAS 02" },
      { id: "cat-007", title: "Làm tròn VND", detail: "Không số lẻ thập phân với tài khoản tiền VND; làm tròn đến đồng theo half-up", severity: "mandatory" },
      { id: "cat-008", title: "Chi không hợp lệ → 811", detail: "Chi không có chứng từ đủ điều kiện → hạch toán 811 + flag non_cit_deductible = true", severity: "mandatory", reference: "TT78/2014 Điều 4" },
      { id: "cat-009", title: "Tách bút toán đa bản chất", detail: "1 HĐ có cả NVL + dịch vụ → tách 2 bút toán riêng để map đúng TK", severity: "recommended" },
      { id: "cat-010", title: "Cost center & Project", detail: "Required cho DN có quản trị; auto-suggest dựa trên vendor history hoặc keyword", severity: "recommended" },
      { id: "cat-011", title: "Phải trả NB 331 vs Phải thu KH 131", detail: "Vendor (bên bán) → 331; Customer (bên mua) → 131; phân biệt qua direction của HĐ", severity: "mandatory" },
      { id: "cat-012", title: "Chiết khấu thương mại vs giảm giá", detail: "CKTM ghi giảm doanh thu (5211); giảm giá hàng bán (5213); chiết khấu thanh toán (635/515)", severity: "mandatory", reference: "TT200 Điều 79" },
      { id: "cat-013", title: "Hóa đơn thay thế/điều chỉnh TT78", detail: "Khi nhận hđ điều chỉnh → tạo bút toán đảo + bút toán mới, không xóa cũ", severity: "mandatory", reference: "TT78/2021 Điều 19" },
      { id: "cat-014", title: "VAS 17 - Thuế thu nhập hoãn lại", detail: "Phát sinh chênh lệch tạm thời → 243 (tài sản) hoặc 347 (nợ phải trả)", severity: "advisory", reference: "VAS 17" },
      { id: "cat-015", title: "Audit trail KTT override", detail: "Mọi override của KTT phải log: user_id, old_entry, new_entry, reason", severity: "mandatory" },
    ],
    confidence_matrix: {
      strict: 0.95,
      balanced: 0.85,
      flexible: 0.7,
      fallback_action: "suggest",
    },
    exceptions: [
      { id: "cat-e1", scenario: "HĐ nhiều mục khác bản chất", handling: "Tách thành nhiều bút toán; tổng amount phải khớp" },
      { id: "cat-e2", scenario: "Chi không chứng từ hợp lệ", handling: "Hạch toán 811 + flag non_cit_deductible cho Agent Thuế" },
      { id: "cat-e3", scenario: "Vendor mới >50tr lần đầu", handling: "Confidence cap 0.7 → bắt buộc KTT duyệt; gửi flag cho Agent Cảnh báo" },
      { id: "cat-e4", scenario: "Hóa đơn không xác định được TK", handling: "Hạch toán tạm vào 1388 (phải thu khác) + queue review" },
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
      { id: "c-cat-3", requirement: "VAS 01-26", reference: "QĐ 165/2002 và các bản cập nhật", status: "covered" },
      { id: "c-cat-4", requirement: "Audit trail bất biến", reference: "Luật KT 88/2015 Điều 8", status: "covered" },
    ],
    sla: { p50_ms: 320, p95_ms: 800, max_retry: 2, timeout_ms: 5000 },
  },

  // ============================================================
  // 3. AGENT ĐỐI SOÁT
  // ============================================================
  reconcile: {
    inputs: [
      { name: "Bút toán mở 131/331", format: "JournalEntries từ Agent Hạch toán" },
      { name: "Sao kê ngân hàng MT940", format: "SWIFT MT940", notes: "Chuẩn quốc tế cho enterprise" },
      { name: "Sao kê CSV", format: "CSV (VCB, TCB, MB, BIDV, ACB)", notes: "Mỗi NH có schema riêng, agent tự detect" },
      { name: "Open Banking API", format: "REST JSON", notes: "VCB digiBiz, TCB Business, MB BizMB" },
    ],
    outputs: [
      {
        name: "ReconciliationResult",
        format: "JSON",
        notes: "matched_pairs, unmatched_invoices, unmatched_statements, partial_matches, suggested_actions",
      },
      { name: "Bút toán đóng công nợ", format: "JournalEntry", notes: "Nợ 331/Có 112 hoặc Nợ 112/Có 131" },
    ],
    decision_tree: [
      {
        id: "d-match",
        condition: "Loại khớp",
        outcome: "Confidence khác nhau",
        children: [
          { id: "d-exact", condition: "amount khớp tuyệt đối + date ±3 ngày + memo chứa invoice_no", outcome: "Auto-close", confidence: 0.99 },
          { id: "d-fuzzy", condition: "amount ±0.5% + date ±7 ngày + memo chứa MST/tên", outcome: "Đề xuất khớp", confidence: 0.85 },
          { id: "d-split", condition: "1 CK ↔ nhiều HĐ cùng vendor đủ tổng amount", outcome: "Split match (FIFO)", confidence: 0.8 },
          { id: "d-partial", condition: "CK > tổng HĐ", outcome: "Khớp một phần + ghi nhận dư có 131", confidence: 0.75 },
          { id: "d-no", condition: "Không khớp gì sau 14 ngày", outcome: "Flag công nợ quá hạn", confidence: 1.0 },
        ],
      },
    ],
    rules: [
      { id: "rec-001", title: "Ưu tiên FIFO khi vendor nhiều HĐ", detail: "Khớp HĐ phát sinh sớm trước; tránh khớp HĐ mới rồi để HĐ cũ quá hạn", severity: "mandatory" },
      { id: "rec-002", title: "Cross-currency với tỷ giá ngày CK", detail: "HĐ USD ↔ CK VND: dùng tỷ giá NHNN ngày CK; chênh lệch → 515/635", severity: "mandatory", reference: "TT200 Điều 69" },
      { id: "rec-003", title: "Cấn trừ công nợ 131↔331", detail: "Cùng đối tác vừa là KH vừa là NCC → đề xuất bù trừ, cần KTT duyệt", severity: "recommended", reference: "TT200 Điều 18" },
      { id: "rec-004", title: "Phí ngân hàng tự động", detail: "Detect line phí (FEE, PHI, CHARGE) → tự hạch toán Nợ 6427/Có 112", severity: "recommended" },
      { id: "rec-005", title: "CK nội bộ giữa 2 TK cùng DN", detail: "Match by amount + opposite direction trong cùng ngày → tự loại, không tạo bút toán", severity: "mandatory" },
      { id: "rec-006", title: "Refund/Reversal trong 3 ngày", detail: "Match ngược lại CK gốc → khớp cặp negative, không tính là thanh toán mới", severity: "mandatory" },
      { id: "rec-007", title: "Đối chiếu công nợ định kỳ", detail: "Sinh biên bản đối chiếu cuối quý cho mỗi vendor có dư >0", severity: "mandatory", reference: "TT200 Điều 12" },
      { id: "rec-008", title: "Cảnh báo HĐ quá hạn", detail: ">7 ngày quá hạn theo due_date → flag warning; >30 ngày → escalate", severity: "recommended" },
      { id: "rec-009", title: "Khớp theo memo pattern", detail: "Detect patterns: 'TT HD XXX', 'INVOICE XXX', 'HOA DON XXX'; case insensitive + remove dấu", severity: "recommended" },
      { id: "rec-010", title: "Lưu version thuật toán", detail: "Mỗi match phải log matching_algorithm_version để có thể replay khi cần audit", severity: "mandatory" },
    ],
    confidence_matrix: {
      strict: 0.95,
      balanced: 0.85,
      flexible: 0.7,
      fallback_action: "suggest",
    },
    exceptions: [
      { id: "rec-e1", scenario: "CK với memo trống hoàn toàn", handling: "Match by amount + date + vendor account number (nếu biết)" },
      { id: "rec-e2", scenario: "1 HĐ ↔ nhiều CK partial", handling: "Tích lũy đến đủ amount thì close; trong khi đó status = 'partially_paid'" },
      { id: "rec-e3", scenario: "CK từ TK không xác định được vendor", handling: "Queue review; suggest top-3 vendor có dư công nợ gần amount nhất" },
      { id: "rec-e4", scenario: "Sao kê có sai số do làm tròn ngoại tệ", handling: "Tolerance ±2 đơn vị tiền tệ nhỏ nhất; vượt → flag" },
    ],
    integrations: [
      { name: "VCB digiBiz API", kind: "bank", direction: "in" },
      { name: "TCB Business API", kind: "bank", direction: "in" },
      { name: "MB BizMB", kind: "bank", direction: "in" },
      { name: "BIDV iBank", kind: "bank", direction: "in", notes: "Hỗ trợ MT940 download" },
      { name: "Sacombank, ACB", kind: "bank", direction: "in", notes: "CSV import thủ công" },
      { name: "ISO 20022 (CAMT.053)", kind: "bank", direction: "in", notes: "Cho enterprise có host-to-host" },
    ],
    audit_fields: ["matching_algorithm_version", "match_type", "manual_override_user", "manual_override_reason", "dispute_log", "statement_file_hash"],
    compliance: [
      { id: "c-rec-1", requirement: "Đối chiếu công nợ ≥1 lần/quý", reference: "TT200 Điều 12", status: "covered" },
      { id: "c-rec-2", requirement: "Lưu sao kê NH 10 năm", reference: "Luật KT 88/2015", status: "covered" },
      { id: "c-rec-3", requirement: "Báo cáo đối soát tự động", reference: "Internal control - COSO", status: "covered" },
    ],
    sla: { p50_ms: 180, p95_ms: 600, max_retry: 3, timeout_ms: 60000 },
  },

  // ============================================================
  // 4. AGENT THUẾ
  // ============================================================
  tax: {
    inputs: [
      { name: "Bút toán có VAT", format: "JournalEntries với vat_split" },
      { name: "Bảng lương", format: "Payroll data từ HR module" },
      { name: "Doanh thu quý", format: "Tổng hợp từ 511/515/711" },
      { name: "Tenant.tax_method", format: "'khấu trừ' | 'trực tiếp'" },
    ],
    outputs: [
      {
        name: "TaxComputation",
        format: "JSON",
        notes: "vat_input, vat_output, vat_payable, cit_quarterly, pit_payroll, declarations_due[], warnings[]",
      },
      { name: "Tờ khai 01/GTGT", format: "XML chuẩn iHTKK" },
      { name: "Tờ khai 03/TNDN", format: "XML iHTKK" },
      { name: "Tờ khai 05/KK-TNCN", format: "XML iHTKK" },
    ],
    decision_tree: [
      {
        id: "d-vat-method",
        condition: "Phương pháp tính VAT",
        outcome: "Route công thức khác nhau",
        children: [
          { id: "d-vat-kt", condition: "Khấu trừ", outcome: "VAT phải nộp = 3331 - 133 (nếu âm → khấu trừ kỳ sau)", confidence: 1.0 },
          { id: "d-vat-tt-1", condition: "Trực tiếp - phân phối hàng hóa", outcome: "1% × doanh thu", confidence: 1.0 },
          { id: "d-vat-tt-2", condition: "Trực tiếp - dịch vụ, xây dựng không bao thầu NVL", outcome: "5% × doanh thu", confidence: 1.0 },
          { id: "d-vat-tt-3", condition: "Trực tiếp - sản xuất, vận tải", outcome: "3% × doanh thu", confidence: 1.0 },
          { id: "d-vat-tt-4", condition: "Trực tiếp - hoạt động khác", outcome: "2% × doanh thu", confidence: 1.0 },
        ],
      },
      {
        id: "d-cit",
        condition: "CIT tạm tính quý",
        outcome: "20% × (DT - CP hợp lệ), DN nhỏ <50 tỷ DT → 15-17%",
      },
      {
        id: "d-pit",
        condition: "PIT lũy tiến 7 bậc",
        outcome: "5/10/15/20/25/30/35% theo từng bậc thu nhập tính thuế",
      },
    ],
    rules: [
      { id: "tax-001", title: "HĐ không MST → không khấu trừ VAT", detail: "Toàn bộ VAT đầu vào bị loại; chuyển vào chi phí TK 6427 hoặc TK gốc", severity: "mandatory", reference: "TT219/2013 Điều 15" },
      { id: "tax-002", title: "HĐ >20tr phải không tiền mặt", detail: "Thanh toán tiền mặt cho HĐ ≥20tr → mất quyền khấu trừ VAT đầu vào", severity: "mandatory", reference: "TT78/2014 Điều 4" },
      { id: "tax-003", title: "VAT 8% theo NQ 110/2023", detail: "Áp dụng cho hàng hóa/dịch vụ không thuộc 11 nhóm loại trừ (viễn thông, BĐS, ngân hàng, chứng khoán...)", severity: "mandatory", reference: "NQ 110/2023" },
      { id: "tax-004", title: "Chi không hóa đơn → loại CIT", detail: "Lưu sổ riêng các chi 811 + non_cit_deductible để cộng lại khi tính TNDN", severity: "mandatory", reference: "TT78/2014 Điều 4" },
      { id: "tax-005", title: "Lịch tờ khai VAT tháng", detail: "Khai và nộp chậm nhất ngày 20 tháng sau; tự sinh trước 5 ngày", severity: "mandatory", reference: "Luật QLT 38/2019 Điều 44" },
      { id: "tax-006", title: "Lịch tờ khai VAT quý", detail: "Áp dụng cho DN có DT năm trước ≤50 tỷ; hạn cuối tháng đầu quý sau", severity: "mandatory", reference: "TT80/2021 Điều 8" },
      { id: "tax-007", title: "CIT tạm tính quý", detail: "Nộp chậm nhất ngày 30 tháng đầu quý sau; tổng 4 quý ≥80% CIT năm, không thì phạt chậm nộp", severity: "mandatory", reference: "Luật QLT Điều 55" },
      { id: "tax-008", title: "Quyết toán CIT năm", detail: "Hạn 90 ngày sau năm tài chính; nếu năm dương lịch → 31/3 năm sau", severity: "mandatory", reference: "Luật QLT Điều 44" },
      { id: "tax-009", title: "PIT khấu trừ tại nguồn", detail: "DN trả lương ≥2tr/lần cho cá nhân không HĐLĐ → khấu trừ 10%", severity: "mandatory", reference: "TT111/2013" },
      { id: "tax-010", title: "Giảm trừ gia cảnh PIT", detail: "Bản thân 11tr/tháng, người phụ thuộc 4.4tr/người/tháng", severity: "mandatory", reference: "NQ 954/2020" },
      { id: "tax-011", title: "Cảnh báo trước hạn", detail: "Gửi noti 10/5/2/1 ngày trước hạn nộp; nếu chưa generate xong → escalate", severity: "mandatory" },
      { id: "tax-012", title: "Hóa đơn điều chỉnh recompute", detail: "Khi nhận hđ điều chỉnh → tính lại VAT kỳ phát sinh, sinh phụ lục 01-1/GTGT", severity: "mandatory", reference: "TT78/2021 Điều 19" },
      { id: "tax-013", title: "Hoàn thuế GTGT dự án đầu tư", detail: "Số dư 133 ≥300tr sau 12 tháng cho dự án → hồ sơ hoàn thuế 01/HT", severity: "advisory", reference: "TT80/2021 Điều 28" },
      { id: "tax-014", title: "Xuất khẩu áp 0%", detail: "Đủ điều kiện: HĐ + tờ khai HQ + thanh toán qua NH + hợp đồng xuất khẩu", severity: "mandatory", reference: "TT219/2013 Điều 9" },
      { id: "tax-015", title: "Hộ kinh doanh khoán thuế", detail: "Nếu tenant là HKD → áp tỷ lệ % thuế khoán theo ngành, không tính chi tiết VAT", severity: "advisory", reference: "TT40/2021" },
      { id: "tax-016", title: "Audit trail tính thuế", detail: "Mọi recompute lưu: tax_period, version, source_invoice_ids, formula_used", severity: "mandatory" },
      { id: "tax-017", title: "Tỷ giá tính thuế ngoại tệ", detail: "Dùng tỷ giá mua chuyển kh