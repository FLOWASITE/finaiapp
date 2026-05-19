## Mục tiêu
Bổ sung **Alibaba Cloud DashScope (Qwen)** làm provider thứ 2 trong trang Super Admin → AI Model, song song với OpenRouter. DashScope cung cấp OpenAI-compatible endpoint nên tận dụng được toàn bộ pipeline hiện có (`base_url + /chat/completions`, `Authorization: Bearer`).

## Bối cảnh kỹ thuật

DashScope OpenAI-compatible mode:
- **Quốc tế (Singapore)**: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Trung Quốc (Bắc Kinh)**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Auth: `Authorization: Bearer <DASHSCOPE_API_KEY>` (lấy từ https://bailian.console.alibabacloud.com/?apiKey=1)
- Endpoint `/models` có hoạt động → tận dụng `listAiModels` hiện tại để fetch dynamic.
- Model khuyến nghị:
  - Default/Chat: `qwen-plus` (cân bằng giá/chất lượng)
  - Parse (hoá đơn, OCR/JSON): `qwen-vl-max` (đa phương thức)
  - Reasoning: `qwq-plus` (chuỗi suy luận dài)
- Không cần extra headers bắt buộc (khác OpenRouter).

## Thay đổi

### 1. `src/routes/_app/superadmin/ai-model.tsx`
- Thêm hằng `ALIBABA_PRESET` (cùng cấu trúc với `OPENROUTER_PRESET`) với 2 region:
  ```ts
  const ALIBABA_PRESETS = {
    intl: { provider_label: "Alibaba Qwen (Intl)", base_url: ".../dashscope-intl..." , ... },
    cn:   { provider_label: "Alibaba Qwen (CN)",   base_url: ".../dashscope.aliyuncs..." , ... },
  };
  ```
- Detector: `isAlibaba = /dashscope.*aliyuncs\.com/i.test(form.base_url)`.
- Cập nhật badge provider hiện tại (đoạn `{isOpenRouter ? "OpenRouter" : "Custom"}`) để hiển thị "Alibaba Qwen" khi phù hợp.
- Khối "Khuyến nghị preset" hiện chỉ có OpenRouter → đổi thành 1 card với **2 nút preset** (OpenRouter, Alibaba Qwen) + dropdown region (Intl/CN) cho Alibaba; mỗi nút gọi `applyPreset(preset)`.
- Ghi chú riêng cho Alibaba ở khu vực Models tab: "Qwen hỗ trợ `qwen-plus`, `qwen-max`, `qwen-vl-max`, `qwq-plus`… không cần extra headers."

### 2. `src/lib/ai-config.functions.ts`
- `listAiModels`: hiện đã generic theo `base_url + /models`. DashScope trả `{ data: [{id, ...}] }` đúng chuẩn OpenAI → không cần sửa logic. Chỉ thêm fallback default `baseUrl` không đổi.
- `testAiModelConfig`: không cần thay đổi (đã dùng `/chat/completions`).

### 3. UX phụ
- Khi áp Alibaba preset: nếu `extra_headers_json` đang chứa headers OpenRouter (`HTTP-Referer`, `X-Title`) → xoá để tránh request thừa.
- Toast: "Đã áp preset Alibaba Qwen (Intl) — nhập API key DashScope rồi lưu."
- Link helper trong card preset:
  - OpenRouter → https://openrouter.ai/keys
  - Alibaba → https://bailian.console.alibabacloud.com/?apiKey=1

## Không thay đổi
- Schema DB `ai_model_config` (vẫn là 1 dòng cấu hình duy nhất, chuyển provider bằng cách bấm preset khác).
- `ai-gateway.server.ts` (đã hoạt động với mọi OpenAI-compatible endpoint).
- Không thêm secret mới — API key vẫn lưu encrypted trong `ai_model_config.api_key_encrypted`.

## Kiểm tra sau khi triển khai
1. Bấm preset Alibaba (Intl) → các trường tự fill đúng.
2. Nhập DashScope API key → "Test connection" trả `pong` với latency < 3s.
3. "Load Models" hiển thị danh sách Qwen.
4. Bấm preset OpenRouter trở lại → headers `HTTP-Referer` được khôi phục.
