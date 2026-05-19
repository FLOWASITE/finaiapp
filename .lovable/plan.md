# Mở rộng SUGGESTED_MODELS + tự động tải full list

## Mục tiêu
Khi mở trang `/superadmin/ai-model`, danh sách model luôn đầy đủ và cập nhật theo OpenRouter — không cần bấm nút "Tải danh sách đầy đủ".

## Thay đổi

### 1. Tự động fetch full list khi mở trang
Trong `src/routes/_app/superadmin/ai-model.tsx`:
- Thêm `useEffect` chạy 1 lần sau khi `form` được khởi tạo (có `base_url`) → gọi `onLoadModels()` âm thầm.
- Nếu fetch thành công → `setModels` với full list (hiện tại đã merge với SUGGESTED_MODELS làm fallback).
- Nếu fetch lỗi (mất mạng, key sai) → giữ nguyên SUGGESTED_MODELS, không hiện toast lỗi (chỉ log console), để user vẫn chọn được.
- Nút "Tải danh sách đầy đủ" giữ lại để reload thủ công.

### 2. Mở rộng SUGGESTED_MODELS thành ~40 model phổ biến của OpenRouter
Phủ đủ các provider lớn để danh sách offline vẫn dùng được ngay:

- **OpenAI**: gpt-4o-mini, gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-5, gpt-5-mini, gpt-5-nano, o1, o1-mini, o3-mini
- **Anthropic**: claude-sonnet-4.5, claude-haiku-4.5, claude-3.7-sonnet, claude-3.5-sonnet, claude-3.5-haiku, claude-opus-4
- **Google**: gemini-2.5-flash, gemini-2.5-pro, gemini-2.5-flash-lite, gemini-3-flash-preview, gemini-3.1-pro-preview, gemini-2.0-flash
- **xAI**: grok-4, grok-3, grok-3-mini, grok-2-vision
- **DeepSeek**: deepseek-r1, deepseek-chat, deepseek-v3, deepseek-r1-distill-llama-70b
- **Qwen**: qwen-vl-max, qwen-2.5-72b-instruct, qwen-2.5-coder-32b-instruct, qwq-32b
- **Meta**: llama-3.3-70b-instruct, llama-3.2-90b-vision-instruct
- **Mistral**: mistral-large, mistral-small-3.1, codestral-2501
- **Perplexity**: sonar, sonar-pro, sonar-reasoning

Mỗi entry có `context_length` đúng theo doc OpenRouter để hiện badge "k" ngay.

### 3. UX nhỏ
- Trong thời gian auto-load chạy, badge "Đang tải…" nhỏ cạnh `onlyFree` toggle (dùng `loadingModels` state đã có).

## Phạm vi code
- Chỉ sửa `src/routes/_app/superadmin/ai-model.tsx`.
- Không động backend `ai-config.functions.ts`, `ai-gateway.server.ts`.

## Kiểm tra
- Mở trang lần đầu: thấy ngay danh sách suggested ~40 model. Vài giây sau full list (300+) thay thế.
- Disable mạng → vẫn dùng được ~40 model suggested.
- Bấm "Tải danh sách đầy đủ" → reload thủ công như cũ.
