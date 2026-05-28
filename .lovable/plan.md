## Hoàn tất Phân hệ Quản lý dữ liệu

Tiếp tục từ phần đã làm (migration + Export tab). Còn 3 trang con + sidebar.

### 1. Trang Import (`src/routes/_app/admin/data/import.tsx`)
- Chọn năm tài chính đích + upload tệp `.fin.json`
- Đọc file → base64 → gọi `previewFinImport` → hiển thị: tenant nguồn, năm nguồn, danh sách bảng + row_counts
- Chọn chế độ: **Gộp (merge)** mặc định / **Thay thế cả năm (replace_year)** — checkbox xác nhận, chỉ owner
- Cảnh báo nếu năm nguồn ≠ năm đích
- Nút "Nhập dữ liệu" → `commitFinImport` → toast kết quả `inserted` + `errors`

### 2. Trang Kết chuyển số dư (`src/routes/_app/admin/data/carry-forward.tsx`)
- Select năm nguồn + năm đích (từ `listFiscalYearsForTenant`)
- Nút "Xem trước" → `previewCarryForward` → bảng (account_code, debit, credit), badge số kỳ chưa khoá
- Checkbox "Vẫn tiếp tục dù năm nguồn chưa khoá hết" (force)
- Nút "Chạy kết chuyển" → `runCarryForward` → toast số dòng

### 3. Trang Lịch sử (`src/routes/_app/admin/data/history.tsx`)
- Gọi `listDataHistory` → 3 section tabs: Bản xuất Fin / Lượt nhập / Kết chuyển
- Mỗi dòng xuất: năm, thời gian, người tạo, kích thước, status + nút Tải (`downloadFinExport`) / Xoá (`deleteFinExport`, chỉ owner)
- Dòng nhập: kind, status, decisions JSON (số inserted/errors), thời gian
- Dòng kết chuyển: from→to year, số rows, thời gian

### 4. Sidebar + redirect
- Thêm mục "Quản lý dữ liệu" (icon `Database`) trong nhóm Admin của `src/components/app-sidebar.tsx` → `/admin/data`
- Route `/admin/backup` cũ: thêm `beforeLoad` redirect → `/admin/data/export` (giữ tương thích)

### Kỹ thuật
- 3 file mới đều dùng `useServerFn` + `useQuery`/`useMutation` từ TanStack Query
- Upload file qua `FileReader.readAsArrayBuffer` → `btoa` (chunk-safe) để gửi `file_b64`
- Sử dụng components có sẵn: `Card`, `Button`, `Select`, `Input`, `Table`, `Badge`, `Checkbox`, `toast` (sonner)

### Ngoài phạm vi (đã chốt loop trước)
- Khôi phục (restore) từ bản backup
- Import định dạng MISA/Fast/Bravo
- Xuất Excel
