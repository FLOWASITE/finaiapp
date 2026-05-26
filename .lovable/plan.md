## Mục tiêu
Khi người dùng dùng nút **"Chọn thư mục"** (hoặc kéo-thả nguyên folder), chỉ nhận file `.xml` — bỏ qua mọi loại file khác (pdf, ảnh, xlsx, docx…). Nút **"Chọn file"** và kéo-thả file lẻ vẫn nhận đầy đủ định dạng như hiện tại.

## Lý do
Use case duy nhất của import theo folder là gom số lượng lớn hóa đơn điện tử XML từ một thư mục lưu trữ. Cho phép loại khác dễ kéo nhầm rác (PDF mẫu, ảnh chụp màn hình…) vào lô upload.

## Thay đổi (`src/routes/_app/documents/index.tsx`, component `UploadDialog`)

1. **Tách hàm lọc theo "nguồn":**
   - `filterAccepted(files, source: 'file' | 'folder')`:
     - `source === 'folder'` → chỉ giữ file có đuôi `.xml` (case-insensitive), vẫn bỏ file ẩn.
     - `source === 'file'` → giữ nguyên danh sách extension hiện tại.
   - Trả `{ accepted, skipped }` như cũ để toast cảnh báo.

2. **Drop zone (`onDrop`):**
   - Sau khi `collectFilesFromDataTransfer(dt)` chạy xong, phân biệt:
     - Nếu DataTransfer có ít nhất một entry là directory → coi là `folder` → lọc `xml only`.
     - Ngược lại (toàn file lẻ) → `file`.
   - Cập nhật toast skip để rõ ràng: ví dụ "Thư mục chỉ nhận file XML — đã bỏ qua N file khác".

3. **Input ẩn:**
   - `inputRef` (Chọn file) giữ nguyên `accept` đầy đủ.
   - `dirInputRef` (Chọn thư mục) đổi `accept=".xml,text/xml,application/xml"` và `onChange` gọi `addFiles(files, 'folder')`.

4. **UX text:**
   - Đổi mô tả vùng kéo-thả: "Kéo-thả file (mọi định dạng hỗ trợ) hoặc kéo-thả/Chọn **thư mục chỉ chứa XML**".
   - Tooltip/subtext dưới nút "Chọn thư mục": "Chỉ nhận file .xml".

5. **Giữ nguyên:** giới hạn 200 file/lần, 20MB/file, luồng `uploadDocument` và đối chiếu MST.

## File chỉnh sửa
- `src/routes/_app/documents/index.tsx`
