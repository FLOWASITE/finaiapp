
# Lộ trình biến hệ thống thành AI-first

Hệ thống hiện đã có nền tảng tốt: AI chat tại `/chat` dùng Lovable AI Gateway + tool `runQuery` truy vấn 16 bảng. Để trở thành **AI-first** (AI là giao diện chính, không phải tính năng phụ), cần tái cấu trúc theo 5 trụ cột dưới đây.

---

## 1. Định nghĩa "AI-first" cho hệ thống này

Khác biệt cốt lõi:

| AI-as-feature (hiện tại) | AI-first (mục tiêu) |
|---|---|
| Có thêm trang `/chat` để hỏi đáp | AI là **entry point** mặc định sau khi đăng nhập |
| User tự click menu → form → nhập liệu | User mô tả ý định → AI dẫn dắt / tự thực thi |
| AI chỉ **đọc** dữ liệu | AI **đọc + ghi + duyệt + giải thích** (có xác nhận) |
| Mỗi nghiệp vụ 1 form riêng | Form được AI **pre-fill**, user chỉ review |
| Báo cáo = bảng tĩnh | Báo cáo = đối thoại + biểu đồ sinh động |

---

## 2. Năm trụ cột cần xây

### Trụ cột A — Copilot toàn cục (Command Bar)
- Phím tắt `Cmd/Ctrl+K` mở ô chat overlay ở **mọi trang**, không chỉ `/chat`.
- AI biết context trang hiện tại (route, id bản ghi đang xem) → trả lời/hành động đúng ngữ cảnh.
- VD đang ở `/sales/orders/$id` gõ "xuất hoá đơn 50%" → AI gọi luôn `createInvoiceFromSalesOrder`.

### Trụ cột B — Mở rộng kho Tools (từ read-only → write/workflow)
Hiện chỉ có `runQuery`. Bổ sung các tool ghi + workflow với cơ chế **xác nhận trước khi thực thi** (`needsApproval`):

| Nhóm | Tool mới (server fn đã có sẵn, chỉ cần wrap) |
|---|---|
| Bán hàng | createSalesOrder, createInvoiceFromSalesOrder, recordPayment |
| Mua hàng | createPurchaseOrder, receiveGoods, matchInvoiceToPO |
| Kho | createStockTake, transferStock, adjustStock |
| Kế toán | postJournalEntry, reconcileBank, closeFiscalPeriod |
| Tài sản | depreciateMonth, disposeAsset |
| Lương | runPayroll, generatePayslips |
| Báo cáo | generateReport(name, period), exportToExcel/PDF |

Mỗi tool: schema Zod hẹp, mô tả rõ, **trả về preview JSON** trước khi commit.

### Trụ cột C — Ingestion bằng AI (chứng từ → bút toán)
- Upload ảnh/PDF hoá đơn, sao kê ngân hàng, bảng lương → AI (Gemini Vision) **trích xuất có cấu trúc** (`Output.object`) → tạo draft invoice/voucher.
- Đồng bộ e-invoice (đã có `einvoices-sync.functions.ts`) → AI tự đối chiếu & gợi ý hạch toán.
- Ghi âm/giọng nói → Whisper → "Chi 500k tiền taxi" → tạo `cash_voucher` draft.

### Trụ cột D — Insight chủ động (Proactive AI)
Thay vì chờ user hỏi, AI **đẩy thông báo**:
- "Tuần này doanh thu giảm 18% so với tuần trước — xem chi tiết?"
- "5 hoá đơn quá hạn thu trên 30 ngày, tổng 120tr."
- "Tồn kho mặt hàng X dưới mức an toàn."
- "Bút toán bất thường: chi phí marketing tháng này gấp 4 lần TB."

Cách làm: cron job hằng ngày chạy `generateText` với prompt phân tích → ghi `notifications` table → widget hiển thị trên dashboard + email.

### Trụ cột E — Báo cáo hội thoại + biểu đồ động
- Báo cáo (9 trang report đã làm) bổ sung ô "Hỏi AI về báo cáo này".
- AI dùng `Output.object` trả về `{ summary, insights[], chartConfig }` → render bằng Recharts ngay trong chat bubble.
- Cho phép "đào sâu" theo từng dòng: click số → AI giải thích cấu thành.

---

## 3. Thay đổi kiến trúc cụ thể

```text
src/
├── lib/
│   ├── ai/
│   │   ├── tools/              ← NEW: tách mỗi tool 1 file
│   │   │   ├── sales.tools.ts
│   │   │   ├── purchase.tools.ts
│   │   │   ├── inventory.tools.ts
│   │   │   ├── accounting.tools.ts
│   │   │   ├── reports.tools.ts
│   │   │   └── index.ts        ← export registry
│   │   ├── ingestion/          ← NEW: trích xuất chứng từ
│   │   │   ├── invoice-ocr.ts
│   │   │   └── bank-statement.ts
│   │   ├── proactive/          ← NEW: cron phân tích
│   │   │   └── daily-insights.ts
│   │   └── system-prompt.ts    ← prompt chính + persona kế toán
│   └── chat.functions.ts       ← refactor: nạp registry, hỗ trợ streaming
├── components/
│   ├── ai/
│   │   ├── CommandBar.tsx      ← NEW: Cmd+K overlay toàn cục
│   │   ├── ChatPanel.tsx       ← NEW: side panel có thể mở mọi trang
│   │   ├── ToolCallCard.tsx    ← NEW: render preview + nút Approve/Reject
│   │   ├── InsightWidget.tsx   ← NEW: dashboard widget
│   │   └── DocumentDropzone.tsx← NEW: drag-drop ảnh/PDF → AI ingest
└── routes/_app.tsx             ← thêm CommandBar + ChatPanel vào layout
```

Thay `generateText` (hiện tại) bằng `streamText` + `useChat` để có streaming tokens, và đổi UI sang AI SDK UI render `message.parts` (text/tool-call/tool-result).

---

## 4. Lộ trình triển khai (theo giai đoạn)

**Phase 1 — Foundation (1-2 tuần)**
1. Tách `chat.functions.ts` thành tool registry.
2. Chuyển từ `generateText` → `streamText` + `useChat`, render `parts`.
3. Thêm CommandBar (Cmd+K) gọi tới cùng endpoint chat.

**Phase 2 — Write tools với approval (2-3 tuần)**
4. Wrap 10 server fn nghiệp vụ phổ biến nhất thành tool, dùng `needsApproval`.
5. Component `ToolCallCard` hiển thị preview JSON đẹp + 2 nút Approve/Reject.
6. Audit log mọi tool call vào bảng `ai_actions`.

**Phase 3 — Ingestion (2 tuần)**
7. Upload hoá đơn ảnh → OCR (Gemini Vision) → draft invoice.
8. Upload sao kê ngân hàng CSV/PDF → match `bank_transactions`.

**Phase 4 — Proactive (1-2 tuần)**
9. Cron daily insights, ghi `notifications`.
10. Dashboard widget "AI Insights" + email digest.

**Phase 5 — Conversational reports (1 tuần)**
11. Mỗi trang báo cáo có "Hỏi AI" → trả về summary + chartConfig structured.

---

## 5. Bảng dữ liệu cần thêm

```sql
ai_conversations(id, user_id, title, created_at)
ai_messages(id, conversation_id, role, parts jsonb, created_at)
ai_actions(id, user_id, tool_name, input jsonb, output jsonb, status, approved_by, created_at)
ai_insights(id, user_id, severity, title, body, related_route, dismissed_at, created_at)
ai_uploads(id, user_id, file_path, kind, extracted jsonb, linked_entity_type, linked_entity_id)
```

Đều bật RLS scope theo `user_id` (đồng bộ pattern hiện có).

---

## 6. Vấn đề cần quyết định (cần user xác nhận)

1. **Phạm vi quyền của AI**: chỉ đọc + đề xuất, hay được phép tự ghi (có approval), hay tự ghi luôn cho tác vụ thấp rủi ro (vd: tạo draft)?
2. **Persona AI**: "Kế toán trưởng AI" nghiêm túc, hay trợ lý thân thiện?
3. **Ưu tiên ngành**: tập trung nghiệp vụ nào trước — bán hàng, mua hàng, hay kế toán/báo cáo?
4. **Multi-tenant**: AI có cần phân biệt vai trò (admin/kế toán/sales) khi quyết định tool nào được gọi?
5. **Có muốn voice input + mobile-first không** (ảnh hưởng UI CommandBar)?

Sau khi user trả lời 5 câu trên, mình sẽ chốt scope Phase 1 và bắt đầu code.
