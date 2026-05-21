## Kế hoạch sửa dứt điểm lỗi đang trả lời thì reload

### Nguyên nhân đã thấy từ log
Dev server đang lỗi transform ở `src/components/chat/invoice/invoice-extract-card.tsx`:

```text
ERROR: The symbol "isImage" has already been declared
```

Route chat import `MessageList`, `MessageList` import `InvoiceExtractCard`, nên khi assistant stream ra `tool-result` parse hóa đơn, Vite/route module bị lỗi và preview reload/crash. Đây là lý do người dùng thấy đang trả lời thì bị reload, không chỉ là lỗi handoff file.

### Việc sẽ sửa
1. **Sửa lỗi compile trong `InvoiceExtractCard`**
   - Loại khai báo trùng `isImage`.
   - Giữ logic preview PDF/ảnh hiện tại, không làm mất UI xem file gốc.

2. **Gỡ phần optimistic thread cũ còn sót trong chat thread**
   - `ChatDock` hiện đã tạo thread thật trước khi navigate.
   - Route `chat.$threadId` vẫn còn code dành cho `temp-*`, listener `chat:thread-resolved`, promise chờ real id, và reset/abort theo threadId.
   - Xóa nhánh legacy này để không còn bất kỳ đường nào abort stream do swap thread.

3. **Làm autostart idempotent theo thread + handoff**
   - Autostart chỉ chạy một lần cho thread hiện tại.
   - Không reset local messages/abort stream vì thay đổi search param không cần thiết.
   - Nếu attachment handoff không còn, báo lỗi đúng; nếu còn thì parse/stream bình thường.

4. **Giữ stream ổn định khi query refetch/invalidate**
   - Khi đang streaming, ưu tiên `localMsgs` và không để query update làm thay transcript.
   - Chỉ persist assistant sau khi stream hoàn tất hoặc user stop.

5. **Xác minh bằng signal đúng**
   - Kiểm tra dev-server log không còn transform error.
   - Kiểm tra runtime không còn `AbortError` ngoài trường hợp user bấm Stop.
   - Luồng cần đạt: attach file từ ChatDock → mở `/chat/:id` thật → OCR/extract/match/check stream liên tục → không reload giữa câu trả lời.