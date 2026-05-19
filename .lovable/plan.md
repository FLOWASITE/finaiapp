# Mục tiêu

Khi người dùng đính kèm hoá đơn / chứng từ vào ChatDock hoặc Composer trong `/chat/$threadId`, **toàn bộ quá trình diễn ra ngay trong phòng hội thoại**: hiển thị "đã nhận file", tiến trình OCR/parse, dữ liệu trích xuất, và đề xuất bút toán hạch toán — thay vì điều hướng sang `/import/preview` như hiện tại.

# Hành vi mong muốn

1. Người dùng bấm Paperclip → chọn 1+ file (PDF/ảnh hoá đơn, sao kê, phiếu thu).
2. ChatDock **tự tạo thread mới** (nếu chưa ở /chat) hoặc dùng thread hiện tại, rồi điều hướng vào phòng chat.
3. Trong phòng chat xuất hiện ngay:
   - **Tin user**: card đính kèm (tên file, kích thước, icon loại tài liệu).
   - **Tin assistant streaming** với các bước tool-call hiển thị tuần tự:
     - `parseDocument` → "Đang đọc hoá đơn…" → kết quả (nhà cung cấp, ngày, MST, tổng tiền, dòng hàng).
     - AI tự gọi `proposeAction` (createInvoiceFromSO / recordPurchaseInvoice / recordBankTransaction tuỳ loại) → hiện card "Đề xuất hạch toán" với Nợ/Có, số tiền, tài khoản, kèm nút **Duyệt / Sửa / Huỷ**.
4. Người dùng bấm **Duyệt** → action chạy → assistant chốt "Đã ghi sổ phiếu PN-0001, bút toán 156/331…".

# Phạm vi thay đổi

## 1. Composer / ChatDock (frontend)
- Bỏ logic `sessionStorage` + `navigate('/import/preview')` khi upload file.
- Khi attach file ở ChatDock: tạo thread mới → navigate `/chat/$threadId?autostart=1` kèm payload file đã đọc base64 (lưu tạm `sessionStorage.__pendingAttachments`).
- Khi attach file ở Composer trong thread: gọi `appendMessage` với `metadata.attachments = [{name, mime, size, base64}]` rồi kích `runAssistant`.

## 2. MessageList — render attachment card
- Thêm nhánh render khi `message.metadata.attachments` có giá trị: hiện card file (icon theo mime, tên, size, badge "Đang xử lý / Đã đọc").

## 3. Server fn `askAccountingStream`
- Nhận thêm `attachments` trong input.
- Khi có attachments: tự động chèn lời gọi tool `parseDocument` ngay đầu stream (yield tool-call/tool-result tương ứng) trước khi đẩy vào LLM.
- Mở rộng system prompt: "Nếu user gửi file → gọi parseDocument, tóm tắt, rồi gọi proposeAction phù hợp loại chứng từ (purchase_invoice → recordPurchaseInvoice, bank_statement → recordBankTransactions, cash_voucher → recordCashVoucher)."

## 4. Tool-calls UI
- Card `parseDocument`: hiển thị bảng dòng hàng + tổng tiền (đẹp hơn JSON raw).
- Card `proposeAction`: đã có PendingActions — chỉ cần đảm bảo nó render inline trong tin assistant (chứ không chỉ list ở header).

## 5. Action handlers (`src/lib/ai/action-handlers.server.ts`)
- Thêm 2 handler còn thiếu cho luồng parse → booking:
  - `recordPurchaseInvoice` (hoá đơn mua → Nợ 156/152/642… / Có 331).
  - `recordBankTransaction` (sao kê → Nợ/Có 112).
- Mỗi handler: `schema` (Zod), `preview` (sinh dòng tóm tắt cho card), `execute` (insert vào bảng tương ứng).

# Bố cục kỹ thuật

```text
ChatDock attach ──► createThread + appendMessage(user, metadata.attachments)
                 ──► navigate /chat/$id?autostart=1

ThreadPage autostart ──► runAssistant(messages)
                      ──► askAccountingStream({ attachments })
                            │
                            ├─ yield tool-call  parseDocument
                            ├─ yield tool-result {vendor, lines, totals}
                            ├─ LLM tokens (tóm tắt)
                            ├─ yield tool-call  proposeAction
                            └─ yield tool-result {action_id, summary}

MessageList ──► AttachmentCard + ToolCalls(parseDocument) + ToolCalls(proposeAction → ApproveButton)
```

# Ngoài phạm vi (không làm lần này)

- Không đổi UI route `/import/preview` và `/bank/import-statement` — vẫn dùng được khi user muốn import hàng loạt không qua chat.
- Không lưu file vào Storage; base64 chỉ truyền 1 lần qua server fn rồi parse, không persist.
- Không thay đổi schema DB ngoài việc (nếu thiếu) bổ sung tool_name cho `recordPurchaseInvoice` / `recordBankTransaction` trong enum kiểm tra ở `propose-action.tool.ts`.

# Câu hỏi cần xác nhận

1. **Giới hạn file**: giữ ≤ 12MB và ≤ 5 file/lượt như hiện tại?
2. **Tự động duyệt**: mặc định **luôn cần user bấm Duyệt** (an toàn) — bạn có muốn thêm tuỳ chọn "auto-approve nếu khớp 100%"?
3. **Loại chứng từ ưu tiên**: lần này tập trung **hoá đơn mua (purchase invoice)** trước, hay làm cả 3 loại (mua / sao kê / phiếu thu chi) cùng lúc?
