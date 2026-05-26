# Thêm tính năng kéo-thả nguyên Folder vào Tải tài liệu

## Mục tiêu
Cho phép người dùng kéo nguyên một thư mục (có thể chứa thư mục con) vào vùng "Kéo-thả file vào đây" trong dialog Tải tài liệu, hoặc bấm nút "Chọn thư mục" để duyệt cây thư mục. Hệ thống tự đọc đệ quy tất cả file hợp lệ bên trong và đẩy vào danh sách upload — giữ nguyên các luồng validate (20MB, loại file, đối chiếu tổ chức) hiện có.

## Phạm vi
- Chỉ sửa UI/logic ở `src/routes/_app/documents/index.tsx` (component `UploadDialog`).
- Không đụng tới server function `uploadDocument`, không sửa schema, không sửa logic OCR/đối chiếu MST.

## Thay đổi chi tiết

### 1. Drop zone — chấp nhận folder
Trong handler `onDrop` hiện tại (dòng ~953):
- Nếu `e.dataTransfer.items` có và item nào có `webkitGetAsEntry()` là directory → duyệt đệ quy bằng `FileSystemDirectoryReader.readEntries()` để thu thập tất cả `File` ở mọi cấp.
- Nếu chỉ có file phẳng (browser cũ / kéo nhiều file lẻ) → giữ nguyên `addFiles(e.dataTransfer.files)`.
- Bỏ qua file ẩn (tên bắt đầu bằng `.`) và file không khớp danh sách extension đang `accept` (pdf/ảnh/xml/xlsx/xls/docx/doc/csv/txt) để tránh "rác" như `Thumbs.db`, `.DS_Store`.

Viết một helper cục bộ trong file:
```ts
async function collectFilesFromDataTransfer(dt: DataTransfer): Promise<File[]>
```
- Đọc `dt.items` → với mỗi item gọi `webkitGetAsEntry()`.
- Đệ quy folder bằng vòng lặp gọi `readEntries()` đến khi rỗng (API trả tối đa 100 entry/lần).
- Trả mảng `File` đã lọc theo phần mở rộng cho phép.
- Fallback: nếu không có `items` thì trả `Array.from(dt.files)`.

### 2. Nút "Chọn thư mục"
Thêm input ẩn thứ hai cạnh input hiện tại với thuộc tính `webkitdirectory directory mozdirectory` + `multiple`:
```tsx
<input ref={dirInputRef} type="file" multiple
  // @ts-expect-error webkitdirectory
  webkitdirectory="" directory=""
  className="hidden"
  onChange={(e) => { if (e.target.files?.length) addFiles(filterAccepted(e.target.files)); e.target.value=""; }}
/>
```
Trong khối CTA dưới icon, ngoài chữ "hoặc bấm để chọn" thêm dòng phụ với 2 link/nút nhỏ: **Chọn file** | **Chọn thư mục** (mỗi nút stopPropagation để không trigger click vào drop zone tổng).

### 3. Lọc & cảnh báo
- Hàm `filterAccepted(files)` dùng chung cho cả drop folder và input folder; trả về `{ accepted, skipped }`.
- Nếu có file bị bỏ qua, hiện `toast.info("Đã bỏ qua N file không hỗ trợ")` để người dùng biết.
- Giới hạn tổng số file thêm vào trong một thao tác (ví dụ 200) để tránh treo UI; nếu vượt thì toast cảnh báo và chỉ nhận 200 đầu.

### 4. UX nhỏ
- Cập nhật label mô tả drop zone: "Kéo-thả file hoặc cả thư mục vào đây".
- Khi đang hover folder, giữ nguyên style `border-primary bg-primary/5` (đã có).

## Lưu ý kỹ thuật
- `webkitGetAsEntry` được Chromium/Firefox/Safari hiện đại hỗ trợ. Có fallback an toàn cho trình duyệt không hỗ trợ.
- Tên file sẽ là tên file gốc; không lưu đường dẫn folder vào DB (giữ schema cũ).
- Không thay đổi logic đối chiếu MST/tên tổ chức — mỗi file vẫn đi qua `uploadDocument` và bị reject như bình thường nếu không thuộc tổ chức.

## File chỉnh sửa
- `src/routes/_app/documents/index.tsx`
