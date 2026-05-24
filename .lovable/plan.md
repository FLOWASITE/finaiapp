# Kế hoạch: Đặc tả nghiệp vụ chi tiết cho 6 Agent của Fin

Mục tiêu: viết spec production-ready cho từng agent — input/output, decision tree, quy tắc VAS/TT99, ngưỡng confidence theo profile, fallback, audit trail, integration points (GDT, MISA/Fast/Bravo, ngân hàng), compliance checklist — rồi nạp vào dữ liệu mẫu và mở rộng Drawer để hiển thị.

---

## 1. Cấu trúc dữ liệu mở rộng (`src/types/agent.ts`)

Thêm vào type `Agent` một trường `spec: AgentSpec` (optional để không vỡ code cũ):

```text
AgentSpec {
  inputs:        AgentIO[]        // nguồn dữ liệu vào (PDF, XML hđđt, MT940, payroll…)
  outputs:       AgentIO[]        // đầu ra (bút toán, tờ khai, alert payload…)
  decision_tree: DecisionNode[]   // các nhánh quyết định chính
  rules:         BusinessRule[]   // 10-20 quy tắc nghiệp vụ VAS/TT99/2025
  confidence_matrix: {            // ngưỡng theo 3 profile
    strict: number, balanced: number, flexible: number,
    fallback_action: 'queue_human' | 'suggest' | 'reject' | 'log_only'
  }
  exceptions:    ExceptionCase[]  // edge case + cách xử lý
  integrations:  Integration[]    // GDT, ngân hàng, MISA…
  audit:         AuditField[]     // log gì để truy vết
  compliance:    ComplianceCheck[] // checklist tuân thủ
  sla:           { p50_ms, p95_ms, max_retry, timeout_ms }
}
```

## 2. Spec từng agent (tóm tắt — bản đầy đủ ghi trong `src/data/agentSpecs.ts`)

### 2.1 Agent Trích xuất (extract)

- **Inputs**: PDF (scan/native), JPG/PNG/HEIC, XML hóa đơn điện tử TT78/TT32, email forwarded, ZIP batch
- **Outputs DTO**: `{vendor_name, tax_id (MST 10/13 số), invoice_no, invoice_serial, issue_date, due_date, currency, subtotal, vat_rate, vat_amount, total, line_items[], payment_method, signature_valid?, raw_ocr_confidence}`
- **Decision tree**: detect type (PDF text-layer → parse trực tiếp / scan → OCR Vietnamese + handwriting model / XML → XSD validate + extract / ảnh mờ → upscale x2 trước OCR)
- **Quy tắc (12)**: validate MST checksum (TCVN), so khớp tên-MST với GDT public lookup, phát hiện hóa đơn trùng (hash vendor+no+date+amount), nhận diện hóa đơn nháp/đã hủy theo TT78, tách shipping/discount line, parse 5 mức thuế (0/5/8/10/KCT), nhận diện hóa đơn ngoại tệ → ghi tỷ giá ngày phát hành, etc.
- **Confidence matrix**: strict 0.95 → reject về Human Queue; balanced 0.85 → đẩy xuống Hạch toán nhưng flag review; flexible 0.70 → auto-pass kèm warning
- **Exceptions**: ảnh nghiêng >15°, hóa đơn 2 trang dính, hóa đơn cũ giấy than mờ, hóa đơn nước ngoài (invoice không có MST), hóa đơn nội bộ không hợp lệ
- **Integrations**: GDT lookup MST (tracuunnt.gdt.gov.vn), Lovable AI Gateway (Gemini 2.5 Pro cho ảnh khó)
- **Audit**: lưu raw_file_hash, ocr_engine_version, confidence per field, prompt_id
- **Compliance**: TT78/2021, NĐ 123/2020 về hóa đơn điện tử; lưu file gốc 10 năm
- **SLA**: p50 850ms, p95 3s, retry 2x, timeout 30s

### 2.2 Agent Hạch toán (categorize)

- **Inputs**: ExtractDTO + Tenant chart-of-accounts + 47 rules từ Trí nhớ AI + vendor memory (128 đối tác đã biết)
- **Outputs**: `{debit_account, credit_account, amount, vat_split?, cost_center, project_code, description_vn, tags[], confidence, rule_id_applied, alternatives[]}`
- **Decision tree**:
  ```
  is_vendor_known? 
    yes → áp template bút toán đã học (vd FPT → 642/331 VAT 10%)
    no  → classify by line_items keywords → match COA TT200
          → propose top-3 bút toán xếp theo điểm
  ```
- **Quy tắc VAS/TT200 (15)**:
  - Chi phí quản lý DN: 642 (1-8 chi tiết), bán hàng 641, sản xuất 627, NVL 621, nhân công 622
  - Tiền mặt 111 / TGNH 112 / Phải trả NB 331 / Phải thu KH 131
  - Thuế GTGT đầu vào 133 (chỉ khi MST hợp lệ + có hóa đơn GTGT), đầu ra 3331
  - TSCĐ ≥30tr & dùng >1 năm → 211, dưới ngưỡng → 242/142 (CCDC)
  - Tạm ứng 141 → quyết toán về 642/627…
  - Phân bổ chi phí trả trước 242 theo kỳ
  - Chênh lệch tỷ giá 413/635/515
  - Hàng tồn kho: bình quân gia quyền cuối kỳ (mặc định) hoặc FIFO theo tenant.accounting_method
  - Quy tắc làm tròn VND (không có số lẻ thập phân với tài khoản tiền VND)
- **Confidence matrix**: strict 0.95 (auto-post), balanced 0.85 (auto-post + queue review nếu <0.92), flexible 0.70 (suggest only, KTT duyệt)
- **Exceptions**: hóa đơn nhiều mục khác bản chất (vd cả NVL + dịch vụ) → tách 2 bút toán; chi không có chứng từ hợp lệ → tự động hậu thuẫn vào 811 + flag "không được trừ khi tính TNDN"
- **Integrations**: export sang MISA SME, Fast Accounting, Bravo qua XML chuẩn TT200
- **Audit**: rule_id, alternatives_rejected, KTT_override (nếu có), vendor_template_version
- **Compliance**: TT200/2014, TT133/2016 (cho DN nhỏ — chọn theo tenant)
- **SLA**: p50 320ms, p95 800ms

### 2.3 Agent Đối soát (reconcile)

- **Inputs**: bút toán 131/331 đang mở + sao kê ngân hàng (MT940, CSV VCB/TCB/MB/BIDV, API Open Banking)
- **Outputs**: `{matched_pairs[{invoice_id, statement_line_id, confidence}], unmatched_invoices[], unmatched_statements[], partial_matches[]}`
- **Decision tree**:
  ```
  exact match (amount + date ±3 + memo chứa invoice_no) → confidence 0.99
  fuzzy   (amount ±0.5% + date ±7 + memo chứa MST/tên) → 0.85
  split   (1 CK ↔ nhiều HĐ cùng vendor đến đủ amount)  → 0.80
  partial (CK lớn hơn tổng HĐ → ghi nhận thanh toán + dư có)
  ```
- **Quy tắc (10)**: ưu tiên FIFO khi vendor có nhiều HĐ; phát hiện thanh toán chéo (cross-currency với tỷ giá ngày CK); cấn trừ công nợ 131↔331 cùng đối tác; xử lý phí ngân hàng tự động vào 6427
- **Confidence**: ≥0.85 auto-close, <0.85 đề xuất KTT duyệt
- **Exceptions**: chuyển khoản nhầm (refund trong 3 ngày → khớp ngược), CK nội bộ giữa 2 TK cùng DN → tự loại
- **Integrations**: VCB EBank API, MB BizMB, ACB Online, Sacombank, OpenAPI banks; chuẩn ISO 20022 cho enterprise
- **Audit**: matching_algorithm_version, manual_override_user, dispute_log
- **Compliance**: TT200 Điều 12 — đối chiếu công nợ ≥1 lần/quý
- **SLA**: p50 180ms/cặp, batch 1000 lines <30s

### 2.4 Agent Thuế (tax)

- **Inputs**: tất cả bút toán có VAT + payroll + doanh thu quý + tenant.tax_method (khấu trừ/trực tiếp)
- **Outputs**: `{vat_input, vat_output, vat_payable, cit_quarterly, pit_payroll, declarations_due[], warnings[]}`
- **Decision tree**:
  - VAT method khấu trừ → 3331 - 133 = phải nộp; nếu âm → khấu trừ kỳ sau
  - VAT trực tiếp trên doanh thu → tỷ lệ % theo ngành (1% phân phối, 5% dịch vụ, 3% sản xuất, 2% khác)
  - CIT tạm tính quý: 20% × (DT - CP hợp lệ), với DN nhỏ <50 tỷ DT → 15-17%
  - PIT lũy tiến 7 bậc 5/10/15/20/25/30/35%
- **Quy tắc (18)**:
  - Hóa đơn không MST hoặc MST sai → không khấu trừ VAT đầu vào (đẩy hết vào chi phí)
  - HĐ >20tr phải thanh toán không tiền mặt mới được khấu trừ VAT
  - Chi không hóa đơn hợp lệ → loại khi tính CIT (báo cáo riêng)
  - Lịch tờ khai: VAT tháng (20 tháng sau), VAT quý (cuối tháng đầu quý sau), CIT tạm tính quý, BC CIT năm (90 ngày sau năm tài chính), PIT tháng/quý
  - Cảnh báo 10/5/2/1 ngày trước hạn
  - VAT 8% áp dụng theo NQ 110/2023 cho hàng hóa không thuộc danh mục loại trừ → tự check danh mục
- **Confidence**: strict 1.00 (tính thuế luôn auto, không suggest mode) — chỉ alert khi sai
- **Exceptions**: hóa đơn điều chỉnh/thay thế theo TT78 → recompute kỳ phát sinh; hoàn thuế GTGT dự án đầu tư → flow riêng
- **Integrations**: Tổng cục Thuế (eTax, iHTKK) export XML tờ khai 01/GTGT, 03/TNDN, 05/KK-TNCN
- **Audit**: tax_period, recalculation_history, source_invoice_ids
- **Compliance**: Luật QLT 38/2019, TT80/2021, NQ 110/2023
- **SLA**: tính per-invoice 95ms, sinh tờ khai quý <5s

### 2.5 Agent Cảnh báo (alert)

- **Inputs**: stream bút toán + lịch sử 12 tháng + benchmark ngành
- **Outputs**: `{flags[{severity, type, evidence[], recommended_action, related_ids}]}`
- **Decision tree (rule-based + ML anomaly)**:
  - Duplicate detection: cùng vendor + amount ±0.1% + date ±2 → flag
  - Velocity: CK cùng người nhận ≥3 lần/tuần → flag
  - Round number bias: >70% giao dịch là số tròn 1tr/5tr/10tr → flag rửa tiền
  - Vendor lạ + amount >50tr lần đầu → cần KTT duyệt
  - Chi tiêu vượt budget department >120%
  - Bút toán cuối ngày/cuối tuần bất thường (off-hours posting)
  - Tỷ lệ 642/Doanh thu vượt benchmark ngành ±2σ
  - Hóa đơn từ vendor có MST đã ngừng hoạt động (check GDT)
- **Confidence**: flexible 0.70 — agent này ưu tiên recall hơn precision; tất cả flag đều cần human review
- **Mode mặc định**: `suggest` (không tự block)
- **Exceptions**: nếu KTT mark "expected pattern" 3 lần → auto-whitelist rule đó cho vendor/cost-center
- **Integrations**: gửi cảnh báo Zalo OA, Email SMTP, Slack webhook, push in-app
- **Audit**: flag_id, ml_model_version, false_positive_feedback, whitelist_log
- **Compliance**: Luật PCRT 14/2022 — báo cáo giao dịch đáng ngờ ≥300tr tiền mặt / ≥500tr CK
- **SLA**: realtime <1.2s per transaction; batch nightly anomaly scan

### 2.6 Agent Báo cáo (report)

- **Inputs**: trial balance + tất cả bút toán kỳ + tax declarations
- **Outputs**: BCĐKT (B01-DN), KQKD (B02-DN), LCTT trực tiếp/gián tiếp (B03-DN), TM (B09-DN); tờ khai 01/GTGT, 03/TNDN, 05/KK-TNCN; dashboard live (revenue, GP%, AR/AP aging, cash position)
- **Decision tree**: month-end close checklist → run depreciation 214 → phân bổ 242 → tỷ giá cuối kỳ 413 → kết chuyển 911 → đóng kỳ → sinh báo cáo
- **Quy tắc (12)**:
  - Cân đối: tổng Nợ = tổng Có (hard check)
  - 911 phải = 0 sau kết chuyển
  - Số dư đầu kỳ N+1 = số dư cuối kỳ N (auto-rollover)
  - Format XBRL cho BCTC nộp Sở KHĐT
  - Hỗ trợ song ngữ Việt-Anh cho FDI
- **Confidence**: strict 1.00 — không auto-publish, luôn cần KTT/Giám đốc duyệt
- **Exceptions**: kỳ có điều chỉnh hồi tố → sinh phiên bản restated kèm note
- **Integrations**: export Excel/PDF/XBRL; nộp eTax; push lên dashboard React
- **Schedule**: cron `0 9 1 * *` (9h ngày 1 hàng tháng); quý cuối tháng đầu quý sau; năm 31/3
- **Audit**: report_version, signed_by, locked_at, restatement_chain
- **Compliance**: TT200 phần III, TT133 (DN nhỏ), Luật KT 88/2015
- **SLA**: BCTC tháng <10s, năm <60s

---

## 3. File deliverables

1. `src/types/agent.ts` — thêm `AgentSpec` + sub-types (`BusinessRule`, `DecisionNode`, `ExceptionCase`, `Integration`, `ComplianceCheck`)
2. `src/data/agentSpecs.ts` — đối tượng `agentSpecs: Record<AgentId, AgentSpec>` chứa nội dung mục §2 ở dạng dữ liệu (mỗi agent ~150-250 dòng)
3. `src/data/sampleAgents.ts` — gắn `spec: agentSpecs[id]` vào từng agent
4. `src/components/ai-memory/agents/AgentDetailDrawer.tsx` — thêm 3 tab mới: **Nghiệp vụ** (decision tree + rules), **Tích hợp** (integrations + compliance), **SLA & Audit**. Giữ 5 tab cũ (Overview/Settings/Rules/Activity/Dependencies) — tổng 8 tab, dùng scroll horizontal trên mobile.
5. `src/components/ai-memory/agents/RuleTable.tsx` — bảng quy tắc tái dùng (id, mô tả, mức độ bắt buộc, nguồn tham chiếu TT/NĐ)
6. `src/components/ai-memory/agents/DecisionTreeView.tsx` — render decision tree dạng nested với badge confidence
7. `src/components/ai-memory/agents/ComplianceChecklist.tsx` — checklist tuân thủ với link tới văn bản pháp luật

## 4. Phạm vi KHÔNG làm trong plan này

- Không kết nối backend thật (vẫn mock)
- Không tích hợp GDT/ngân hàng thật — chỉ liệt kê integration points
- Không animation/UI polish nâng cao
- Không A/B test mode hay simulation

## 5. Acceptance

- Mở Drawer mỗi agent → thấy đủ 8 tab, tab Nghiệp vụ liệt kê 10-18 rules với tham chiếu TT99/TT78/NQ110
- Decision tree render được dạng cây cho cả 6 agent
- Compliance checklist có link văn bản pháp luật (text, không cần URL thật)
- Build pass, không vỡ UI cũ