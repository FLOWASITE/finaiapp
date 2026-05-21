## Vấn đề
File picker trong chat chỉ hiện PDF/ảnh, không cho chọn `.xml` (hoá đơn điện tử VN).

## Nguyên nhân
`src/components/chat/composer.tsx`:
- `<input accept="application/pdf,image/*">` → dialog hệ điều hành lọc mất file XML
- `validateFiles()` reject mọi file không phải `image/*` hoặc `application/pdf`

## Thay đổi (1 file)

`src/components/chat/composer.tsx`:

1. Đổi `accept` của `<input type="file">` thành:
   `"application/pdf,image/*,application/xml,text/xml,.xml"`

2. Trong `validateFiles()`, thêm nhánh chấp nhận XML:
   ```ts
   const isXml = (f: File) =>
     f.type === "application/xml" ||
     f.type === "text/xml" ||
     f.name.toLowerCase().endsWith(".xml");
   ...
   if (!f.type.startsWith("image/") && f.type !== "application/pdf" && !isXml(f)) {
     toast.error(`${f.name}: chỉ PDF/ảnh/XML`);
     return false;
   }
   ```

Giữ nguyên giới hạn 12MB. Chip preview hiện sẵn fallback icon `FileText` cho non-image → XML hiển thị đúng "XML · <size>", không cần sửa thêm.

## Ngoài phạm vi
- Parse nội dung XML hoá đơn → task riêng (`parseDocument` hiện không xử lý XML).
- Server `AttachmentSchema` không whitelist mime, XML đi qua được, không cần sửa.