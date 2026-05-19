# Hoàn tất cấu hình AI Model cho Super Admin

## 1. Refactor `src/lib/ai/parse-document.functions.ts`
- Thay thế hardcoded Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1` + `LOVABLE_API_KEY`) bằng `resolveActiveModel("parsing")` từ `ai-gateway.server.ts`.
- Giữ nguyên logic prompt, schema, retry, error handling (429/402).
- Khi config custom được bật → dùng `base_url` + API key đã giải mã + model name của purpose `parsing`.
- Khi tắt/chưa cấu hình → fallback Lovable AI Gateway như cũ.

## 2. UI Super Admin `/superadmin/ai-model`
Tạo route mới `src/routes/_app/superadmin.ai-model.tsx`:

**Bảo vệ truy cập**
- Dùng `is_superadmin(auth.uid())` ở loader/component; non-superadmin redirect về `/`.

**Form cấu hình** (gọi `ai-config.functions.ts`)
- Toggle "Bật custom AI model" (enabled).
- Provider name (label tự do, vd: "OpenAI", "Groq", "OpenRouter").
- Base URL (vd: `https://api.openai.com/v1`).
- API Key (input password, hiển thị "••••• đã lưu" nếu đã có, cho phép nhập mới để thay).
- 3 model fields theo purpose:
  - Chat model (vd: `gpt-4o-mini`)
  - Parsing model (vd: `gpt-4o`)
  - Reasoning model (vd: `o1-mini`)
- Nút **Lưu** → `saveAiConfig`.
- Nút **Test kết nối** → `testAiConfig` (ping `/models` hoặc 1 completion ngắn), hiển thị success/error.

**Trạng thái hiển thị**
- Badge "Đang dùng: Custom" hoặc "Đang dùng: Lovable AI (mặc định)".
- Cảnh báo nếu enabled nhưng thiếu base_url/api_key/model.

## 3. Navigation
- Thêm tab "AI Model" vào sidebar/menu khu vực Super Admin (cùng nhóm với các trang superadmin hiện có).
- Ẩn tab nếu user không có role `superadmin`.

## 4. Verify
- Build pass.
- Test: bật custom config với key giả → `testAiConfig` báo lỗi rõ ràng.
- Tắt custom → các flow chat/parse/journal/bank/invoice fallback Lovable AI bình thường.

## Files
- edit: `src/lib/ai/parse-document.functions.ts`
- create: `src/routes/_app/superadmin.ai-model.tsx`
- edit: sidebar/nav component (xác định khi implement)
