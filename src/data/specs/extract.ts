import type { AgentSpec } from "@/types/agent";

export const extractSpec: AgentSpec = {
  inputs: [
    { name: "PDF hóa đơn", format: "application/pdf", notes: "Cả PDF có text-layer và PDF scan" },
    { name: "Ảnh hóa đơn", format: "image/jpeg, image/png, image/heic", notes: "Hỗ trợ HEIC từ iPhone" },
    { name: "Hóa đơn điện tử", format: "XML TT78/TT32", notes: "Validate XSD theo chuẩn GDT" },
    { name: "Email forward", format: "EML/MIME", notes: "Attachment tự tách" },
    { name: "Batch upload", format: "ZIP (≤200MB)", notes: "Tối đa 500 file/batch" },
  ],
  outputs: [
    { name: "ExtractDTO", format: "JSON", notes: "vendor_name, tax_id, invoice_no, invoice_serial, issue_date, due_date, currency, subtotal, vat_rate, vat_amount, total, line_items[], payment_method, signature_valid, raw_ocr_confidence" },
    { name: "Raw file backup", format: "S3 + SHA-256", notes: "Lưu 10 năm theo NĐ 123/2020" },
  ],
  decision_tree: [
    {
      id: "d-detect", condition: "Phân loại định dạng đầu vào", outcome: "Route đến pipeline phù hợp",
      children: [
        { id: "d-xml", condition: "Là XML hđđt TT78", outcome: "Validate XSD và parse trực tiếp", confidence: 0.99 },
        { id: "d-pdf-text", condition: "PDF có text-layer", outcome: "Trích text và regex pattern matching", confidence: 0.97 },
        { id: "d-pdf-scan", condition: "PDF scan hoặc ảnh", outcome: "OCR Vietnamese (Gemini 2.5 Pro Vision)", confidence: 0.92 },
        { id: "d-blurry", condition: "DPI dưới 150 hoặc blur score trên 0.6", outcome: "Upscale x2 và denoise rồi OCR", confidence: 0.85 },
      ],
    },
    { id: "d-validate", condition: "Validate MST và checksum sau OCR", outcome: "Nếu fail thì cross-check tên vendor với GDT lookup" },
  ],
  rules: [
    { id: "ex-001", title: "Validate MST theo TCVN", detail: "MST 10 số (DN) hoặc 13 số (đơn vị phụ thuộc); checksum theo công thức Bộ TC", severity: "mandatory", reference: "TT80/2021" },
    { id: "ex-002", title: "Cross-check tên với MST", detail: "Gọi GDT lookup tracuunnt.gdt.gov.vn; nếu tên khác trên 20% thì flag warning", severity: "recommended", reference: "GDT API" },
    { id: "ex-003", title: "Phát hiện hóa đơn trùng", detail: "Hash MD5 (tax_id + invoice_serial + invoice_no + issue_date + total); reject nếu trùng trong 24 tháng", severity: "mandatory" },
    { id: "ex-004", title: "Nhận diện hóa đơn hủy/thay thế", detail: "Field TThai trong XML bằng huy hoặc có ký hiệu /HUY thì đánh dấu void", severity: "mandatory", reference: "TT78/2021 Điều 19" },
    { id: "ex-005", title: "Tách shipping/discount line", detail: "Detect keyword phí vận chuyển, chiết khấu, giảm giá thì tách thành line riêng", severity: "recommended" },
    { id: "ex-006", title: "Parse 5 mức thuế GTGT", detail: "0% xuất khẩu, 5% thiết yếu, 8% NQ110, 10% thông thường, KCT không chịu thuế", severity: "mandatory", reference: "NQ 110/2023" },
    { id: "ex-007", title: "Hóa đơn ngoại tệ", detail: "Bắt buộc ghi tỷ giá ngày phát hành theo NHNN; nếu thiếu thì fetch từ VCB", severity: "mandatory", reference: "TT200 Điều 6" },
    { id: "ex-008", title: "Verify chữ ký số", detail: "Với hđđt verify CA certificate và timestamp; signature_valid false thì flag", severity: "mandatory", reference: "NĐ 123/2020 Điều 10" },
    { id: "ex-009", title: "Nhận diện hóa đơn nháp", detail: "Watermark DRAFT hoặc invoice_no rỗng thì không xử lý", severity: "mandatory" },
    { id: "ex-010", title: "Lưu raw file 10 năm", detail: "Upload S3 với object lock; metadata uploaded_by, source, hash", severity: "mandatory", reference: "Luật KT 88/2015 Điều 41" },
    { id: "ex-011", title: "Đa hóa đơn trong 1 file", detail: "Detect page-break và invoice header lặp thì split thành nhiều ExtractDTO", severity: "recommended" },
    { id: "ex-012", title: "Confidence per field", detail: "Lưu confidence riêng cho từng field (vendor 0.95, amount 0.99, MST 0.87...)", severity: "recommended" },
  ],
  confidence_matrix: { strict: 0.95, balanced: 0.85, flexible: 0.7, fallback_action: "queue_human" },
  exceptions: [
    { id: "ex-e1", scenario: "Ảnh nghiêng trên 15 độ", handling: "Auto-rotate dùng Hough transform; nếu vẫn fail thì queue human" },
    { id: "ex-e2", scenario: "Hóa đơn 2 trang dính", handling: "Detect khoảng trắng ngang và split trước khi OCR" },
    { id: "ex-e3", scenario: "Hóa đơn giấy than mờ", handling: "Áp model handwriting và tăng contrast; confidence cap ở 0.7" },
    { id: "ex-e4", scenario: "Invoice nước ngoài không có MST", handling: "Tạo vendor_id tạm prefix FOREIGN-; flag KTT review" },
    { id: "ex-e5", scenario: "Hóa đơn nội bộ chứng từ thu/chi tay", handling: "Trích xuất nhưng đánh dấu non_vat_deductible = true" },
  ],
  integrations: [
    { name: "GDT tracuunnt", kind: "tax_authority", direction: "in", notes: "Lookup MST tới tên và tình trạng hoạt động" },
    { name: "Lovable AI Gateway", kind: "ai_gateway", direction: "bidirectional", notes: "Gemini 2.5 Pro cho ảnh khó, Flash cho PDF text" },
    { name: "AWS S3 / Cloudflare R2", kind: "other", direction: "out", notes: "Lưu raw file với object lock" },
  ],
  audit_fields: ["raw_file_hash", "ocr_engine_version", "prompt_id", "confidence_per_field", "gdt_lookup_response", "uploaded_by", "processing_duration_ms"],
  compliance: [
    { id: "c-ex-1", requirement: "Hóa đơn điện tử hợp pháp", reference: "NĐ 123/2020", status: "covered" },
    { id: "c-ex-2", requirement: "Lưu trữ chứng từ 10 năm", reference: "Luật Kế toán 88/2015 Điều 41", status: "covered" },
    { id: "c-ex-3", requirement: "Định dạng hđđt TT78", reference: "TT 78/2021/TT-BTC", status: "covered" },
    { id: "c-ex-4", requirement: "Verify chữ ký số CA", reference: "NĐ 130/2018", status: "partial" },
  ],
  sla: { p50_ms: 850, p95_ms: 3000, max_retry: 2, timeout_ms: 30000 },
};
