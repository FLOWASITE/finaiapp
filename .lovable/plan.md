# Lộ trình AI-first cho hệ thống kế toán

Dựa trên lựa chọn của bạn:
- **Phạm vi**: AI tự ghi có xác nhận (mọi mutation đi qua bước duyệt)
- **Tone**: Cân bằng (chuyên nghiệp + dễ hiểu)
- **Module**: Bán hàng + Mua hàng + Kế toán/Báo cáo + Kho + **Tiền gửi ngân hàng**
- **Input**: Mobile-first + Upload PDF/ảnh + Voice

Phase 1 (chat) + Phase 2 (write tools với approval) + Phase 3.1 (upload PDF/ảnh) + Phase 3.2 (voice Web Speech) + Phase 4.1 (mobile-first AskAiSheet, quick chips) + Phase 4.2 (proactive insights — bảng `ai_insights`, cron `ai-daily-digest` 7h sáng, `InsightWidget` trên dashboard) đã hoàn tất.

Còn lại: Phase 3.1 nhánh sao kê ngân hàng + phiếu thu/chi viết tay, Phase 4.3 Conversational Reports (output structured + Recharts trong chat).

---

## Phase 2 — Write Tools với Approval Workflow

**Mục tiêu**: AI có thể đề xuất hành động ghi dữ liệu; user xem preview JSON + Diff rồi bấm "Xác nhận" mới chạy.

### 2.1 Cấu trúc tool

`src/lib/ai/tools/` chia theo module:
- `sales.tool.ts` — `createSalesOrder`, `createInvoiceFromSO`, `recordCustomerPayment`
- `purchase.tool.ts` — `createPurchaseOrder`, `createPurchaseInvoice`, `recordVendorPayment`
- `inventory.tool.ts` — `createGoodsReceipt`, `createGoodsIssue`, `adjustStock`
- `accounting.tool.ts` — `createJournalEntry`, `closeMonth`
- `bank.tool.ts` — `createBankTransaction`, `matchBankTransaction`, `transferBetweenAccounts`
- `reports.tool.ts` — `runReport` (P&L, BS, AR/AP aging, cash flow)

Mỗi tool có `needsApproval: true`, schema Zod, và `dryRun` trả về preview (số tiền, số chứng từ dự kiến, ảnh hưởng tồn kho/công nợ).

### 2.2 UI duyệt

- `ToolCallCard.tsx`: hiển thị tool name + icon module + summary + accordion JSON.
- 3 trạng thái: `pending-approval` (nút Duyệt/Huỷ), `executing` (spinner), `done` (link tới chứng từ vừa tạo).
- Lưu vào bảng `ai_actions` để audit (ai duyệt, lúc nào, payload gì).

### 2.3 Bảng mới

`ai_conversations`, `ai_messages`, `ai_actions` với RLS theo `user_id`.

---

## Phase 3 — Ingestion đa kênh (Upload + Voice)

### 3.1 Upload PDF/ảnh

- `DocumentDropzone` trong AskAiSheet + dropzone toàn cục (drag vào bất kỳ trang nào).
- Server fn `parseDocument`: gọi Gemini Vision (`google/gemini-2.5-pro`) với prompt theo loại:
  - **Hoá đơn mua**: trả `{ vendor, invoice_no, date, lines[], vat, total }` → tự fill form Purchase Invoice (chờ duyệt).
  - **Sao kê ngân hàng**: trả mảng giao dịch → preview bảng → user chọn dòng nào import vào `bank_transactions`.
  - **Phiếu thu/chi viết tay**: OCR rồi tạo draft cash voucher.
- Bảng `ai_uploads` lưu file gốc + kết quả parse.

### 3.2 Voice

- Web Speech API (miễn phí, có sẵn trên Chrome/Safari mobile) làm mặc định.
- Nút mic trong AskAiSheet → record → transcript → đẩy vào chat như text thường.
- Tuỳ chọn nâng cấp Whisper sau nếu cần độ chính xác cao.

---

## Phase 4 — Mobile-first & Proactive AI

### 4.1 Mobile-first UI

- AskAiSheet chuyển thành **bottom sheet full-screen** trên mobile (`< md`).
- Floating Action Button luôn nổi góc phải dưới cùng (đè lên nội dung trang).
- Quick actions chips phía trên ô input: "Tạo hoá đơn", "Xem công nợ", "Báo cáo tháng".
- Layout chat tối ưu cho ngón tay: input lớn, nút mic + nút gửi to, mic giữ-để-nói.

### 4.2 Proactive Insights

- pg_cron job hằng ngày 7h sáng → server route `/api/public/ai-daily-digest`:
  - Phát hiện: hoá đơn quá hạn, tồn kho âm, chênh lệch tiền mặt vs sổ, giao dịch ngân hàng chưa đối chiếu.
  - Ghi vào bảng `ai_insights` + push lên dashboard widget.
- Trang chủ thêm `InsightWidget` (3 insight quan trọng nhất + nút "Hỏi AI thêm").

### 4.3 Conversational Reports

- Mỗi trang báo cáo thêm nút "Hỏi AI" → output có structured schema `{ summary, insights[], chartConfig }` → render Recharts inline trong chat.

---

## Chi tiết kỹ thuật

**Cấu trúc file**:
```text
src/lib/ai/
├── tools/
│   ├── index.ts           # gom tất cả tool, lọc theo route hiện tại
│   ├── sales.tool.ts
│   ├── purchase.tool.ts
│   ├── inventory.tool.ts
│   ├── accounting.tool.ts
│   ├── bank.tool.ts
│   └── reports.tool.ts
├── ingestion/
│   ├── parseInvoice.ts
│   ├── parseBankStatement.ts
│   └── parseCashVoucher.ts
├── proactive/
│   └── dailyDigest.ts
└── system-prompt.ts       # cập nhật tone "cân bằng"
src/components/ai/
├── AskAiSheet.tsx         # cải tiến mobile-first
├── ToolCallCard.tsx
├── DocumentDropzone.tsx
├── VoiceInput.tsx
└── InsightWidget.tsx
```

**Approval flow**:
```text
User prompt → streamText với tools → tool call (needsApproval) →
ToolCallCard hiện preview → User bấm Duyệt →
useChat.addToolResult(toolCallId, { approved: true, ...result })
→ server thực thi server fn → trả kết quả → AI tiếp tục giải thích
```

**Bảng DB Phase 2**:
- `ai_conversations(id, user_id, title, created_at)`
- `ai_messages(id, conversation_id, role, parts jsonb, created_at)`
- `ai_actions(id, message_id, user_id, tool_name, input jsonb, output jsonb, status, approved_at)`
- `ai_uploads(id, user_id, file_url, kind, parsed jsonb, created_at)`
- `ai_insights(id, user_id, severity, category, title, body, action_url, dismissed_at, created_at)`

Tất cả RLS theo `auth.uid() = user_id`.

---

## Thứ tự triển khai đề xuất

1. **Phase 2.1** — Bảng DB + approval UI + 2 tool đầu tiên: `createInvoiceFromSO`, `recordCustomerPayment` (vì Bán hàng đã sẵn sàng từ tuần trước).
2. **Phase 2.2** — Mở rộng sang Mua hàng + Ngân hàng.
3. **Phase 3** — Upload hoá đơn mua (impact cao, dễ thấy giá trị) trước; sao kê ngân hàng sau.
4. **Phase 4.1** — Mobile-first refactor (chạy song song lúc nào cũng được).
5. **Phase 3.2 + 4.2** — Voice + Proactive insights.

Mỗi bước đều ship được độc lập và dùng được ngay. Bắt đầu từ Phase 2.1?
