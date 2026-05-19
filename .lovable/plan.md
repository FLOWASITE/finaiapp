# Nâng cấp khả năng đọc PDF hoá đơn & sao kê ngân hàng

## 1. Hiện trạng

`src/lib/ai/parse-document.functions.ts` đang gọi 1 lượt vision duy nhất:

```
PDF (base64) ──► Gemini 2.5 Pro (vision) ──► JSON
```

- Không tách trang, không OCR, không pre-extract text/table.
- Schema chặt chỉ áp dụng cho `purchase_invoice`; `bank_statement` để model "tự trả JSON" rồi regex.
- Chạy trên Cloudflare Workers (no native binaries) → không dùng được sharp / pdfium / poppler trực tiếp.

Hệ quả thực tế với chứng từ VN:

- Sao kê dài (30–100 trang) → token cao, model bỏ dòng, dễ sai cột Nợ/Có.
- Bảng hoá đơn nhiều dòng → vision dồn dòng hoặc lệch cột số tiền.
- Số kiểu `1.234.567,89` và dấu tiếng Việt thi thoảng bị decode sai.
- Một số PDF scan (ảnh) → Gemini OCR khá nhưng không có lớp text để đối chiếu.

## 2. Bối cảnh thị trường (12/2025)

Tham chiếu PDFbench (Applied AI, 800+ docs, 17 parser) + LlamaIndex + Mistral docs:


| Lựa chọn                                                                       | Vai trò                                         | Giá / trang        | Điểm mạnh                                                                                         | Điểm yếu                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **LlamaParse** (LlamaIndex Cloud)                                              | Layout-aware parse → Markdown / JSON            | ~$0.003 (Balanced) | Best value, bảng + chữ + chữ ký, hỗ trợ tiếng Việt, schema-extract sẵn cho invoice/bank statement | SaaS, gửi file ra ngoài                              |
| **Mistral OCR 3** (`mistral-ocr-2512`)                                         | OCR + Markdown + HTML table                     | ~$0.001            | Rẻ nhất, nhanh (≈1s/trang), multilingual tốt                                                      | Mới ra, chưa có template hoá đơn VN                  |
| **Google Document AI** – Invoice Parser / Bank Statement Parser                | Pretrained schema cho invoice & statement Mỹ-EU | ~$0.03–0.10        | Key-value sẵn, độ ổn định cao                                                                     | Bank-statement parser tối ưu cho Mỹ; cần GCP project |
| **Azure Document Intelligence** – `prebuilt-invoice`, `prebuilt-bankStatement` | Tương tự GDI                                    | ~$0.01–0.05        | Schema field sẵn, chấp nhận tiếng Việt                                                            | Cần Azure subscription                               |
| **AWS Textract** – `AnalyzeExpense`, `AnalyzeDocument(TABLES)`                 | Bảng + key-value                                | ~$0.01–0.065       | Bảng rất tốt                                                                                      | Tiếng Việt yếu hơn LLM                               |
| **FPT.AI Reader / VNPT eKYC OCR**                                              | OCR chuyên VN (invoice, CMND…)                  | Theo gói VN        | Tối ưu hoá đơn GTGT VN, có template sẵn                                                           | Tích hợp B2B, ít doc kỹ thuật                        |
| **Frontier LLM vision** (Gemini 3 Pro / GPT-5.1) – đang dùng                   | One-shot vision → JSON                          | ~$0.01–0.06        | Linh hoạt, không cần preprocess                                                                   | Trang dài giảm chất lượng, đắt khi scale             |
| **Pure JS trích text** (`unpdf` / `pdfjs-dist`)                                | Lấy text layer cho PDF digital                  | $0                 | Chạy được trong Worker, miễn phí                                                                  | Không OCR ảnh, không nhận bảng                       |


Kết luận benchmark: không có "parser tốt nhất". Với hoá đơn / bảng tài chính, hybrid **layout parser → markdown → LLM structurer** (LlamaParse hoặc Mistral OCR + Gemini Flash) cho kết quả tốt hơn và rẻ hơn one-shot vision 5–10×.

## 3. Đề xuất kiến trúc mới

```text
File upload
   │
   ├── digital PDF? ── unpdf trích text (free, in-Worker)
   │       │                │
   │       │                └─ nếu có text + bảng rõ → bỏ qua OCR
   │       │
   │       └── nếu text rỗng/scan
   │                └── LlamaParse (Balanced) hoặc Mistral OCR ──► Markdown
   │
   ├── ảnh JPG/PNG ── Mistral OCR / LlamaParse
   │
   └── XML hoá đơn điện tử ── giữ pipeline einvoice-xml hiện có
                                    │
                                    ▼
                    Gemini 3 Flash structured output
                    (Output.object + zod schema riêng cho
                     purchase_invoice / bank_statement)
                                    │
                                    ▼
                          parsed JSON về client
```

**Lý do chia 2 tầng:**

- Tầng parser (LlamaParse / Mistral OCR) lo *layout + table + OCR* — việc mà LLM vision làm dở.
- Tầng LLM Flash lo *map field tiếng Việt, normalize số, suy luận tài khoản đối ứng* — rẻ vì input đã là markdown thay vì 30 trang ảnh.

## 4. Việc cần làm (research, chưa code)

### 4.1 Spike LlamaParse trên 5 mẫu thực

- 2 hoá đơn GTGT (1 PDF text, 1 PDF scan)
- 2 sao kê (Vietcombank, Techcombank) dài 20–60 trang
- 1 hoá đơn dịch vụ nhiều dòng
- So sánh: số dòng trích đúng, accuracy cột số, độ trễ, chi phí.

### 4.2 Spike Mistral OCR 3 cùng 5 mẫu — so sánh chéo với LlamaParse và Gemini hiện tại.

### 4.3 Đo baseline pipeline hiện tại (Gemini 2.5 Pro vision) trên cùng 5 mẫu để có số đối chứng.

### 4.4 Đánh giá ràng buộc Worker

- Xác nhận `unpdf` (pure JS, đã chạy được trên Workers) đáp ứng tách text cho PDF digital.
- Quyết định: chỉ giữ 1 nhà cung cấp parser hay cho phép fallback (LlamaParse → Mistral OCR khi 429/credit hết).

### 4.5 Thiết kế schema chặt cho `bank_statement`

- Thêm `BankStatementSchema` (zod) tương tự `PurchaseInvoiceSchema`, dùng `Output.object` để bỏ regex `extractJSON`.
- Bao gồm: `account_no`, `period`, `opening_balance`, `closing_balance`, `transactions[{date, value_date, description, debit, credit, balance, ref_no, counterparty?}]`.

### 4.6 Chính sách dữ liệu

- LlamaParse / Mistral OCR gửi file ra hạ tầng EU/US → confirm với user về compliance trước khi chốt vendor (chứng từ chứa MST, số TK ngân hàng).
- Nếu cần "on-prem only": fallback FPT.AI (datacenter VN) hoặc giữ Gemini vision + tự cắt trang.

## 5. Deliverable của giai đoạn research

1. Bảng điểm 3 pipeline (Gemini hiện tại / LlamaParse+Flash / Mistral OCR+Flash) trên 5 file mẫu — accuracy + chi phí + latency.
2. Khuyến nghị vendor chính + vendor fallback.
3. Phác thảo API key cần thêm (`LLAMA_CLOUD_API_KEY` hoặc `MISTRAL_API_KEY`) và biến cấu hình bật/tắt trong AI settings.
4. Phác thảo `parse-document.functions.ts` mới: `parser` (LlamaParse/Mistral/none) → `structurer` (Gemini Flash structured output) với `BankStatementSchema` mới.

## Phạm vi

Đây là plan **research + thiết kế**, chưa cài đặt code, chưa thêm secret, chưa đổi pipeline production. Sau khi user duyệt vendor sẽ tạo plan triển khai riêng.