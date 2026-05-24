## Mục tiêu
Người dùng không thấy phần cấu hình model theo Agent vì nó nằm ở trang riêng (`/superadmin/ai-agents`) chỉ truy cập qua một link nhỏ. Plan này:
1. **Gộp** trang con vào `/superadmin/ai-model` bằng **2 tab**: *Provider chung* | *Theo Agent*.
2. **Bổ sung 3 agent rule-based** (`categorize_purchase`, `categorize_sales`, `inbox_reason`) vào danh sách, đánh dấu disabled + tooltip "Chưa gọi LLM".

## 1. Database
Migration seed thêm 3 hàng vào `ai_agent_models`:
- `categorize_purchase` (purpose=reasoning) – Đề xuất bút toán mua vào
- `categorize_sales` (purpose=reasoning) – Đề xuất bút toán bán ra
- `inbox_reason` (purpose=reasoning) – Inbox AI giải thích

Thêm cột `is_active boolean default true`. Set `false` cho 3 agent trên để UI hiển thị disabled.

## 2. UI gộp tab
Sửa `src/routes/_app/superadmin/ai-model.tsx`:
- Bọc nội dung hiện tại bằng component `<Tabs>` (shadcn) với 2 tab:
  - **Provider chung** — toàn bộ form hiện tại (presets, base URL, API key, model purposes...).
  - **Theo Agent** — nhúng nội dung lấy từ `ai-agents.tsx`: list card 10 agent + input model.
- Bỏ link "Cấu hình model riêng cho từng AI Agent →" (không còn cần).
- Giữ route `/superadmin/ai-agents` redirect sang `/superadmin/ai-model?tab=agents` để khỏi vỡ link cũ.

## 3. UI agent card (cho rule-based)
Trong tab "Theo Agent":
- Hiển thị 10 card. Agent có `is_active=false` → input disabled, badge "Chưa dùng LLM", tooltip giải thích "Engine rule-based, sẽ kích hoạt khi tích hợp LLM".
- Vẫn hiển thị `purpose` + `effective_model` để khi tương lai bật LLM thì chỉ cần đổi flag.

## 4. Files thay đổi
- **Migration**: seed 3 agent + thêm cột `is_active`.
- **Sửa**: `src/routes/_app/superadmin/ai-model.tsx` (thêm Tabs + import lại logic từ ai-agents).
- **Sửa**: `src/routes/_app/superadmin/ai-agents.tsx` → đổi thành redirect, hoặc xoá và đăng ký redirect ở route khác.
- **Sửa**: `src/lib/ai-agent-models.functions.ts` → trả thêm field `is_active`.

## 5. Không đụng tới
- Resolver `resolveAgentModel`, call-sites trong các function file.
- Logic Calibration / Feedback / Promote rules.

## Kết quả
Vào `/superadmin/ai-model` → thấy ngay 2 tab. Tab "Theo Agent" hiển thị 10 card; 7 agent đang dùng LLM có thể chỉnh model, 3 agent rule-based hiển thị disabled kèm ghi chú.
