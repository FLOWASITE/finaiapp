import type { AgentSpec } from "@/types/agent";

export const alertSpec: AgentSpec = {
  inputs: [
    { name: "Stream bút toán", format: "JournalEntries realtime" },
    { name: "Lịch sử 12 tháng", format: "Aggregated metrics per vendor/cost-center" },
    { name: "Benchmark ngành", format: "Internal dataset theo VSIC 2018" },
    { name: "Whitelist user-defined", format: "JSON rules từ KTT" },
  ],
  outputs: [
    { name: "Flag payload", format: "JSON", notes: "{severity (low|medium|high|critical), type, evidence[], recommended_action, related_ids, ml_score, rule_id}" },
    { name: "Notification", format: "Zalo OA / Email / Slack / In-app push" },
  ],
  decision_tree: [
    {
      id: "d-detect", condition: "Loại pattern bất thường", outcome: "Severity và channel khác nhau",
      children: [
        { id: "d-dup", condition: "Cùng vendor + amount ±0.1% + date ±2", outcome: "Flag duplicate (high)", confidence: 0.9 },
        { id: "d-vel", condition: "CK cùng người nhận ≥3 lần/tuần", outcome: "Flag velocity (medium)", confidence: 0.75 },
        { id: "d-round", condition: "Trên 70% giao dịch số tròn 1tr/5tr/10tr", outcome: "Flag pattern rửa tiền (critical)", confidence: 0.7 },
        { id: "d-new-big", condition: "Vendor lạ + amount trên 50tr lần đầu", outcome: "Flag KYC (high) cần KTT duyệt", confidence: 0.85 },
        { id: "d-budget", condition: "Chi tiêu vượt budget department trên 120%", outcome: "Flag budget (medium)", confidence: 0.95 },
        { id: "d-off-hours", condition: "Bút toán cuối ngày hoặc cuối tuần bất thường", outcome: "Flag off-hours (low)", confidence: 0.6 },
        { id: "d-ratio", condition: "Tỷ lệ 642/Doanh thu vượt benchmark ngành ±2σ", outcome: "Flag financial anomaly (medium)", confidence: 0.7 },
        { id: "d-dead-mst", condition: "HĐ từ vendor có MST đã ngừng hoạt động", outcome: "Flag invalid vendor (critical)", confidence: 0.99 },
      ],
    },
  ],
  rules: [
    { id: "alt-001", title: "Duplicate detection 24h", detail: "Hash (vendor + amount + date trong 2 ngày) → flag nếu collision", severity: "mandatory" },
    { id: "alt-002", title: "Velocity check người nhận", detail: "CK cùng beneficiary ≥3 lần trong 7 ngày → flag", severity: "recommended" },
    { id: "alt-003", title: "Round number bias", detail: "Phát hiện tỷ lệ số tròn bất thường trong 30 ngày → flag PCRT", severity: "mandatory", reference: "Luật PCRT 14/2022" },
    { id: "alt-004", title: "Vendor mới + amount lớn", detail: "Vendor chưa từng giao dịch + amount trên 50tr → bắt buộc KTT duyệt", severity: "mandatory" },
    { id: "alt-005", title: "Budget overrun department", detail: "Chi tiêu cost-center vượt 120% budget tháng → noti department head", severity: "recommended" },
    { id: "alt-006", title: "Off-hours posting", detail: "Bút toán tạo ngoài giờ hành chính (18:00-08:00) hoặc weekend → flag low severity", severity: "advisory" },
    { id: "alt-007", title: "Benchmark ngành VSIC", detail: "So sánh tỷ lệ chi phí/doanh thu với median ngành; ±2σ thì flag", severity: "advisory" },
    { id: "alt-008", title: "MST vendor ngừng hoạt động", detail: "Daily sync GDT → flag HĐ từ MST status = ngừng hoạt động hoặc chờ đóng MST", severity: "mandatory" },
    { id: "alt-009", title: "Báo cáo giao dịch đáng ngờ", detail: "Tiền mặt ≥300tr hoặc CK ≥500tr cùng 1 đối tác 1 ngày → tự sinh báo cáo PCRT", severity: "mandatory", reference: "Luật PCRT 14/2022 Điều 26" },
    { id: "alt-010", title: "ML anomaly nightly batch", detail: "Isolation Forest + LOF trên feature set 30 ngày; top 1% outlier → flag", severity: "recommended" },
    { id: "alt-011", title: "Self-learning whitelist", detail: "KTT mark expected pattern 3 lần thì auto-whitelist rule đó cho vendor/cost-center", severity: "recommended" },
    { id: "alt-012", title: "False positive feedback", detail: "Mọi flag bị dismiss phải log lý do; feed lại model để fine-tune", severity: "mandatory" },
  ],
  confidence_matrix: { strict: 0.85, balanced: 0.75, flexible: 0.6, fallback_action: "log_only" },
  exceptions: [
    { id: "alt-e1", scenario: "Mùa lễ tết (Tết, 30/4, 2/9)", handling: "Adjust budget threshold +30%; suppress off-hours flag" },
    { id: "alt-e2", scenario: "Whitelist pattern đã được KTT confirm 3 lần", handling: "Auto-suppress flag tương tự cho vendor/cost-center đó" },
    { id: "alt-e3", scenario: "Vendor trong nội bộ tập đoàn", handling: "Bypass KYC flag nếu vendor có tag intra_group=true" },
    { id: "alt-e4", scenario: "Flag bị dismiss lặp lại", handling: "Sau 5 lần dismiss cùng rule_id+vendor thì đề xuất tạo whitelist permanent" },
  ],
  integrations: [
    { name: "Zalo OA Webhook", kind: "messaging", direction: "out", notes: "Template message duyệt nhanh" },
    { name: "Email SMTP", kind: "messaging", direction: "out" },
    { name: "Slack Webhook", kind: "messaging", direction: "out" },
    { name: "In-app push", kind: "other", direction: "out" },
    { name: "GDT tracuunnt daily sync", kind: "tax_authority", direction: "in", notes: "Cập nhật trạng thái MST" },
  ],
  audit_fields: ["flag_id", "rule_id", "ml_model_version", "ml_score", "false_positive_feedback", "whitelist_log", "dismissed_by", "dismissed_reason"],
  compliance: [
    { id: "c-alt-1", requirement: "Luật PCRT giao dịch đáng ngờ", reference: "Luật 14/2022/QH15", status: "covered" },
    { id: "c-alt-2", requirement: "Báo cáo SAR (Suspicious Activity Report)", reference: "NĐ 19/2023", status: "partial" },
    { id: "c-alt-3", requirement: "Lưu log cảnh báo 5 năm", reference: "NĐ 19/2023 Điều 23", status: "covered" },
    { id: "c-alt-4", requirement: "Internal control framework", reference: "COSO 2013", status: "covered" },
  ],
  sla: { p50_ms: 1200, p95_ms: 3000, max_retry: 2, timeout_ms: 15000 },
};
