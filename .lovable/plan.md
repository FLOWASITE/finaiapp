# Thống kê tác vụ AI hiện có & đề xuất chọn model

## Inventory: 5 call sites, 3 purpose

| # | File / Function | Mục đích nghiệp vụ | `purpose` hiện tại | Đặc tính tải | Đặc tính cần ở model |
|---|---|---|---|---|---|
| 1 | `chat.functions.ts` · `askAccountingStream` | Chat hỏi đáp kế toán với user (streaming) | `chat` | Tương tác trực tiếp, cần phản hồi nhanh | Latency thấp, ngôn ngữ tốt (tiếng Việt) |
| 2 | `invoices.functions.ts` · `extractInvoice` | Trích xuất hoá đơn (vendor, line items, VAT) từ ảnh/PDF | `parse` | Multimodal (ảnh + text), structured output | Vision tốt, JSON ổn định |
| 3 | `ai/parse-document.functions.ts` · `parseDocument` | Trích xuất sao kê ngân hàng từ file (nhiều trang) | `parse` | Multimodal, context dài, structured output | Vision + context window lớn |
| 4 | `journal.functions.ts` · `suggestJournalEntry` | Đề xuất định khoản kế toán từ mô tả nghiệp vụ | `reasoning` | Text only, cần lý luận theo chế độ kế toán VN | Reasoning tốt, kiến thức tiếng Việt |
| 5 | `bank.functions.ts` · `aiMatchTransactions` | Đối khớp giao dịch ngân hàng ↔ bút toán (batch tối đa 50) | `reasoning` | Text only, prompt dài (50 txn × 5 candidate), structured output | Context window vừa, reasoning ổn, **cost-sensitive** vì gọi batch |

→ Hiện code chia thành **3 nhóm: `chat` / `parse` / `reasoning`** và mỗi nhóm có thể chọn model riêng (fallback về `model_default`).

## Đề xuất quay lại UI 3 model (thay vì 1)

Sau khi xem lại thực tế, **việc tách 3 model là hợp lý** vì 3 tác vụ này có yêu cầu rất khác nhau:

- Parse hoá đơn / sao kê **bắt buộc** dùng model có vision (vd `gemini-2.5-pro`, `gpt-4o`). Model text-only sẽ fail.
- Chat realtime nên dùng model **nhanh & rẻ** (`gemini-flash`, `gpt-4o-mini`).
- Reasoning có thể dùng model mạnh hơn (`deepseek-r1`, `gpt-4o`) khi cần chính xác.

Nếu ép 1 model cho cả 3, user sẽ phải chọn model "đắt + có vision + nhanh" — không model nào tối ưu cho cả 3 trục.

## Phương án UI đề xuất

**Quay lại 3 model slot**, nhưng **đơn giản hoá cách trình bày**:

```text
┌─ Model ────────────────────────────────────┐
│  [Tải danh sách] [☐ Chỉ free]              │
│                                             │
│  Mặc định *           [openai/gpt-4o-mini ▾]│  ← bắt buộc, fallback cho tất cả
│                                             │
│  ▸ Tuỳ chỉnh theo tác vụ (3 mục, mặc định ẩn)│
│     ├─ 💬 Chat (realtime)     [(mặc định) ▾]│
│     ├─ 📄 Parse hoá đơn/sao kê[(mặc định) ▾]│ ← nên chọn model có vision
│     └─ 🧠 Reasoning           [(mặc định) ▾]│
└─────────────────────────────────────────────┘
```

- Mặc định chỉ hiện **1 ô "Mặc định"** — user nhập 1 model là chạy được hết.
- Phần "Tuỳ chỉnh theo tác vụ" ở dạng **collapsible**, mở ra khi muốn fine-tune.
- Mỗi tác vụ trong collapsible có **hint nhỏ** ("cần vision", "ưu tiên latency thấp", "cần reasoning") để user biết nên chọn gì.
- Bỏ search bar global ở toolbar — search đã có trong popover của combobox.

## Phạm vi code
- Chỉ sửa `src/routes/_app/superadmin/ai-model.tsx`.
- Không động backend (`ai-gateway.server.ts`, `ai-config.functions.ts`) — schema 3 field `model_chat / model_parse / model_reasoning` đã sẵn.

## Kiểm tra sau khi xong
- Mở trang: chỉ thấy 1 ô "Mặc định".
- Click "Tuỳ chỉnh theo tác vụ" → hiện 3 ô con với hint.
- Để trống 3 ô con, save → backend dùng `model_default` cho mọi purpose (đã verify ở `resolveActiveModel`).
- Chọn riêng `model_parse = google/gemini-2.5-pro` → save → khi gọi `extractInvoice` sẽ dùng model này.
