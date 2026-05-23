## Mục tiêu

Trang **Khách hàng** và **Nhà cung cấp** hiện chỉ hiển thị một cột "Dư Nợ/Dư Có" tĩnh từ số dư đầu kỳ. Cần nâng cấp để giống ảnh tham khảo: hiển thị đầy đủ các cột số liệu theo kỳ (Dư đầu, Phát sinh, Dư cuối) và thêm dải card KPI ở đầu trang.

## Cột bảng mới (theo ảnh)

| STT | Mã đối tác | Tên đối tác | Mã số thuế | Nhóm KH/NCC | Dư nợ đầu kỳ | Dư có đầu kỳ | Phát sinh nợ | Phát sinh có | Dư nợ cuối kỳ | Dư có cuối kỳ | Hành động |

- Mobile: gộp về card (Mã+Tên+MST+Nhóm ở trên, 6 ô số liệu dạng grid 3×2 phía dưới) — tránh table tràn ngang.
- Có bộ lọc kỳ (date range) ở header, mặc định lấy kỳ hiện tại (`period` từ URL hoặc tháng hiện hành) — dùng `DateRangeFilter` đã có.
- Cột "Nhóm" hiển thị tên `party_group` (join từ `group_id`).

## 4–5 Card KPI ở đầu trang

Trang **Khách hàng** (TK 131):
1. Tổng số khách hàng (active / archived)
2. Tổng dư nợ cuối kỳ (phải thu)
3. Tổng dư có cuối kỳ (khách trả trước)
4. Phát sinh nợ trong kỳ (doanh thu ghi nhận công nợ)
5. Phát sinh có trong kỳ (thu tiền / giảm trừ)

Trang **Nhà cung cấp** (TK 331):
1. Tổng số NCC (active / archived)
2. Tổng dư có cuối kỳ (phải trả)
3. Tổng dư nợ cuối kỳ (ứng trước cho NCC)
4. Phát sinh có trong kỳ (mua hàng / chi phí)
5. Phát sinh nợ trong kỳ (thanh toán)

Card dùng style gọn giống các trang vouchers đã refactor (`p-2 sm:p-4`, icon `h-8 w-8 sm:h-10 sm:w-10`, text `text-[10px] sm:text-xs`).

## Kỹ thuật

- **Khách hàng**: dùng lại `getArSummary({ from, to })` (đã có sẵn trong `src/lib/receivables.functions.ts`) — trả `opening_debit/credit`, `debit/credit`, `closing_debit/credit` theo customer. Merge với `listCustomers()` theo `customer_id` (kèm fallback hiển thị KH chưa có phát sinh).
- **NCC**: tạo `getApSummaryByPartner` tương tự (file `src/lib/payables.functions.ts` đã có `buildArSummary`-style logic cho AP — nếu chưa per-partner sẽ bổ sung hàm `buildApSummary` đối xứng với `buildArSummary`). Tránh viết SQL mới phức tạp: tái sử dụng pattern từ `receivables.functions.ts`.
- **Nhóm**: thêm `party_groups(name)` join trong `listCustomers` / `listSuppliers` để có tên nhóm (chỉ 1 join nhẹ, vẫn giữ limit 500).
- **Date range**: thêm state `{from, to}` ở route, lưu vào URL search params để chia sẻ link.
- **Phân trang**: dùng `usePagination` + `TablePagination` đã có (giống các trang vouchers), `pageSize=20`.

## File sẽ chỉnh

- `src/routes/_app/customers/index.tsx` — viết lại header (cards + filter kỳ), bảng cột mới + mobile card, phân trang.
- `src/routes/_app/suppliers/index.tsx` — tương tự.
- `src/lib/customers.functions.ts` — `listCustomers` join thêm `party_groups(name)`.
- `src/lib/purchases.functions.ts` — `listSuppliers` join thêm `party_groups(name)`; bổ sung `getApSummaryByPartner` nếu cần (hoặc dùng lại hàm có sẵn trong `payables.functions.ts`).

## Phạm vi không đụng

- Form thêm/sửa khách hàng & NCC (`PartyForm`) giữ nguyên.
- Trang chi tiết `/suppliers/$id` giữ nguyên.
- Trang Nhóm KH/NCC giữ nguyên.

## Câu hỏi xác nhận

1. **Kỳ mặc định**: lấy theo `PeriodSwitcher` toàn cục (tháng/quý/năm hiện tại) hay luôn mặc định **năm hiện tại** như ảnh (01/01 – 31/12)?
2. **Card KPI**: dùng đúng 5 card như đề xuất trên hay anh muốn đổi/giảm còn 4?
3. Hiển thị KH/NCC **không có phát sinh và không có dư** trong kỳ → ẩn hay vẫn liệt kê?
