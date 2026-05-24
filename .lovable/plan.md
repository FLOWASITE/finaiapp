
## Mục tiêu
Hiện tại chỉ có **1 provider duy nhất** (bảng `ai_model_config` 1 dòng) → mọi agent buộc dùng chung base_url/api_key, chỉ đổi được tên model. Cần nâng cấp để:
- Super-admin tạo **nhiều provider** song song (OpenAI, OpenRouter, Anthropic, Alibaba, Together, custom…).
- Mỗi **agent** chọn `provider + model + temperature + max_tokens` riêng, hoàn toàn độc lập.
- **Lovable AI** giữ vai trò fallback ẩn (khi agent không cấu hình hoặc provider lỗi).

## 1. Database (mở rộng, không drop)

### a) Bảng mới `ai_providers`
| cột | kiểu | ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `code` | text unique | slug, vd `openrouter_main` |
| `label` | text | "OpenRouter — prod" |
| `base_url` | text | OpenAI-compatible endpoint |
| `api_key_encrypted` | text | mã hoá bằng `crypto-secret.server` hiện có |
| `extra_headers` | jsonb | |
| `enabled` | boolean default true | |
| `is_default` | boolean default false | dùng khi agent không set provider |
| `notes` | text | |
| timestamps + `updated_by` | | |

RLS: chỉ superadmin SELECT/INSERT/UPDATE/DELETE (dùng `has_role`).

### b) Mở rộng `ai_agent_models`
Thêm cột:
- `provider_id uuid references ai_providers(id) on delete set null`
- `temperature numeric(3,2) null` (0–2)
- `max_tokens integer null`

Giữ `model_name`, `is_active`, `purpose` như cũ.

### c) Migrate dữ liệu cũ
- Nếu `ai_model_config.enabled = true` và có `api_key_encrypted` → tạo 1 row `ai_providers` (`code='legacy_default'`, `is_default=true`) copy base_url/key/headers.
- Mọi agent đang có `model_name` non-null → gán `provider_id` = provider legacy đó.
- Giữ nguyên bảng `ai_model_config` (deprecated, không dùng nữa) — sẽ bỏ trong release sau, không xoá ngay để tránh vỡ.

## 2. Backend resolver

Sửa `src/lib/ai-gateway.server.ts`:
- Xoá logic `loadConfig()` + `pickModelName(cfg, purpose)`.
- `resolveAgentModel(agentKey, fallbackModel)` mới:
  1. Lookup agent row → có `provider_id` + `model_name` không.
  2. Nếu có → load provider, decrypt key, build `createOpenAICompatible({baseURL, headers, key})` → trả `{model, providerSettings: {temperature, max_tokens}}`.
  3. Nếu agent thiếu provider/model → dùng provider `is_default=true` + `model_name` của agent (hoặc `fallbackModel`).
  4. Nếu không có provider default nào enabled → fallback **Lovable AI Gateway** (LOVABLE_API_KEY) với `fallbackModel`.
- Cache 30s như cũ, invalidate khi save provider hoặc agent.
- Trả thêm `temperature`/`maxTokens` để các call-site (`generateText`, `streamText`) merge vào options. Cập nhật ~7 call-sites đang dùng `resolveAgentModel`.

## 3. Server functions (mới `src/lib/ai-providers.functions.ts`)
- `listProviders()` — superadmin, trả danh sách (mask key).
- `saveProvider({id?, code, label, base_url, api_key?, extra_headers, enabled, is_default, notes})` — upsert, encrypt key. Đảm bảo duy nhất 1 `is_default=true`.
- `deleteProvider(id)` — chặn nếu còn agent ref; offer reassign.
- `testProvider(id, {model})` — gửi 1 prompt "ping" qua provider để verify.
- `listProviderModels(id)` — gọi `GET {base_url}/models` (như `listAiModels` hiện tại) để autocomplete.

Sửa `ai-agent-models.functions.ts`:
- `listAgentModels` trả thêm `provider_id`, `provider_label`, `temperature`, `max_tokens`, `available_providers[]`.
- `saveAgentModel` nhận thêm 4 field trên (schema Zod).

## 4. UI rework `/superadmin/ai-model`

### Tab 1 — **Providers** (thay "Provider chung")
- Danh sách provider dạng card: label, host, badge "Default", switch enabled, nút Test/Edit/Delete.
- Nút **+ Thêm Provider** mở dialog với preset (OpenAI, OpenRouter, Anthropic, Alibaba Intl/CN, Together, Groq, Custom).
- Form: label, base_url, api_key (eye toggle), extra headers JSON editor, enabled, set-default.
- Nút "Tải models" gọi `listProviderModels` (autocomplete dùng ở tab Agent).

### Tab 2 — **Agents** (thay `AiAgentsPanel`)
Mỗi card agent có **3 control inline**:
- Select **Provider** (dropdown danh sách providers enabled + option "Mặc định").
- Combobox **Model** (autocomplete từ `listProviderModels(selectedProvider)` + danh sách suggested fallback).
- Advanced expander: Temperature (slider 0–2 step 0.1, có "Mặc định = bỏ trống"), Max tokens (number).
- Vẫn hiển thị badge "Chưa dùng LLM" cho 3 rule-based agent (disabled toàn bộ).
- Nút Save per-row + "Reset tất cả" giữ nguyên.

Xoá `ai-config.functions.ts` legacy field `model_chat/parse/reasoning/classify` ở UI (giữ DB cho tới khi drop). Form FormState cũ → bỏ.

## 5. Files đụng tới

**Tạo mới:**
- `supabase/migrations/<ts>_ai_providers_multi.sql` (bảng + migrate)
- `src/lib/ai-providers.functions.ts`
- `src/components/ai-providers-panel.tsx`
- `src/components/ai-provider-dialog.tsx`

**Sửa:**
- `src/lib/ai-gateway.server.ts` — resolver mới
- `src/lib/ai-agent-models.functions.ts` — thêm 4 field
- `src/components/ai-agents-panel.tsx` — UI provider/temp/maxtok
- `src/routes/_app/superadmin/ai-model.tsx` — 2 tab mới (xoá nhiều logic cũ)
- Các call-site `resolveAgentModel` (7 file: `bank.functions`, `chat.functions`, `invoices.functions`, `journal.functions`, `bank-reconcile.functions`, `ai/classify-file.server`, `ai/parse-document.functions`) — merge `temperature`/`max_tokens` vào options.

**Giữ nguyên:**
- `ai_model_config` table (deprecated, có thể drop ở release sau)
- `crypto-secret.server.ts`, `ai-gateway.ts`, calibration/feedback/promote.

## 6. Kết quả
- Tab **Providers**: add/edit/test nhiều endpoint, đặt 1 cái làm default.
- Tab **Agents**: mỗi agent tự chọn provider + model + temp + max_tokens → linh hoạt tối đa.
- Provider legacy được migrate tự động, hệ thống chạy tiếp không gián đoạn.
- Lovable AI tự động fallback khi không có provider enabled.
