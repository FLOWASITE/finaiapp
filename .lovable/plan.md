
## Mục tiêu
Hiện tại mọi agent chia sẻ chung 5 purpose (`default/chat/parse/reasoning/classify`) trong `ai_model_config`. Plan này cho phép **gán model riêng cho từng AI Agent** (10 agent) mà vẫn giữ tương thích ngược.

## 1. Database migration
Tạo bảng `ai_agent_models`:
- `agent_key` text PK
- `label` text, `description` text, `purpose` text (fallback purpose)
- `model_name` text NULL (NULL = kế thừa purpose)
- `updated_at`, `updated_by`
- RLS: chỉ superadmin read/write
- Seed 10 hàng với `model_name = NULL`:
  - `categorize_purchase` (reasoning) – Đề xuất bút toán mua vào
  - `categorize_sales` (reasoning) – Đề xuất bút toán bán ra
  - `inbox_reason` (reasoning) – Inbox AI giải thích
  - `bank_reconcile` (reasoning) – Gợi ý đối soát bank
  - `journal` (reasoning) – Soạn bút toán thủ công
  - `parse_doc_vision` (parse) – OCR/đọc PDF, ảnh
  - `parse_doc_text` (parse) – Đọc tài liệu text/markdown
  - `invoice_extract` (parse) – Trích xuất hoá đơn
  - `classify_file` (classify) – Phân loại file upload
  - `chat` (chat) – Trợ lý kế toán viên

## 2. Resolver
Trong `src/lib/ai-gateway.server.ts` thêm:
```ts
export type AgentKey =
  | "categorize_purchase" | "categorize_sales" | "inbox_reason"
  | "bank_reconcile" | "journal" | "parse_doc_vision"
  | "parse_doc_text" | "invoice_extract" | "classify_file" | "chat";

export async function resolveAgentModel(agentKey: AgentKey, fallback: string)
```
Logic:
1. Đọc `ai_agent_models[agentKey]` (cache chung TTL 30s).
2. Nếu `model_name` có → build provider (custom hoặc Lovable) với model đó.
3. Nếu NULL → gọi `resolveActiveModel(row.purpose, fallback)`.

Giữ `resolveActiveModel` để không phá API cũ.

## 3. Đổi call-site
Sửa 10 chỗ gọi `resolveActiveModel(...)` sang `resolveAgentModel(agentKey, fallback)`:
- `categorize/engine.server.ts`, `categorize/sales-engine.server.ts`
- `ai/inbox-reason.server.ts`
- `bank.functions.ts` (suggest reconcile)
- `journal.functions.ts`
- `ai/parse-document.functions.ts` (2 chỗ: visionModel, textModel)
- `invoices.functions.ts`
- `ai/classify-file.server.ts` (cả 2 nhánh)
- `chat.functions.ts`

## 4. Server functions mới
Trong `src/lib/ai-config.functions.ts` (hoặc file mới `ai-agent-models.functions.ts`):
- `getAgentModels()` → list 10 agent + model hiện effective
- `saveAgentModel({ agentKey, modelName })` (superadmin only) → invalidate cache

## 5. UI Super Admin
Tại `/superadmin/ai-model`, thêm tab **"Theo Agent"** (giữ nguyên tab cấu hình provider hiện có):
- Hiển thị 10 card agent (icon, tên, mô tả, purpose fallback)
- Mỗi card: dropdown chọn model (dùng `listAiModels()` sẵn có) + option "Kế thừa mặc định ({purpose})"
- Badge: "Đang dùng: {modelName}" (effective)
- Nút **Lưu** từng agent + **Reset tất cả**

## 6. Không đụng tới
- Calibration / Promote Rules / Feedback loop (không gọi LLM)
- Schema và logic nghiệp vụ khác

## Kết quả
Super Admin có thể, ví dụ:
- Đặt Categorize dùng `gpt-5-mini` (chính xác hơn)
- Đặt Inbox dùng `gemini-2.5-flash-lite` (rẻ, nhanh)
- Đặt Parse Vision dùng `gemini-2.5-pro`
- Các agent khác vẫn kế thừa cấu hình purpose mặc định.
