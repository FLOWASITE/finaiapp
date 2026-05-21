## Kế hoạch sửa lỗi mất file attach

### Vấn đề chính
Luồng hiện tại vẫn phụ thuộc vào `sessionStorage` để giữ payload base64. Với file PDF/ảnh, payload base64 dễ vượt quota hoặc không ghi được, nhưng code đang `catch {}` im lặng. Kết quả là DB chỉ lưu metadata file, còn thread không lấy được payload thật nên hiện lỗi “Mất nội dung file đính kèm…”.

### Cách sửa
1. **Bỏ phụ thuộc sessionStorage cho payload file trong luồng ChatDock → thread**
   - Tạo một handoff store in-memory dùng `window` để giữ payload gốc trong cùng phiên SPA.
   - ChatDock sẽ đặt payload vào store này trước khi navigate.
   - Thread sẽ đọc trực tiếp từ store bằng `handoffId`, không cần serialize base64 vào `sessionStorage`.

2. **Giữ sessionStorage chỉ làm fallback nhẹ**
   - Chỉ dùng `sessionStorage` khi ghi thành công và payload đủ nhỏ.
   - Nếu ghi fail vì quota, không nuốt lỗi âm thầm; vẫn giữ bằng memory store.
   - Không xoá handoff trước khi thread thật sự lấy được payload và gọi `runAssistant`.

3. **Sửa cả 2 đường gửi file**
   - ChatDock tạo thread mới với file attach: dùng handoff store.
   - ChatDock gửi file vào thread đang mở: dùng event detail chứa `handoffId`, thread đọc payload từ store thay vì chỉ dựa vào `__attach:<threadId>`.
   - Composer trong chính thread vẫn truyền payload trực tiếp vào `sendUserMessage`, không bị đổi.

4. **Chặn gọi AI với attachment metadata rỗng**
   - Nếu metadata có file nhưng payload thật không có, vẫn báo lỗi rõ ràng.
   - Nhưng sau sửa này lỗi chỉ còn xảy ra khi user reload trang hoặc rời phiên SPA trước khi thread kịp nhận file.

5. **Dọn code và xác minh**
   - Tách helper handoff nhỏ, dùng chung giữa ChatDock và thread.
   - Kiểm tra lại console không còn lỗi liên quan abort/provider.
   - Kiểm tra luồng: attach 1 file từ `/inbox` → chuyển `/chat/:threadId` → parse stream OCR/extract/match/check chạy ngay và AI nhận đủ file.