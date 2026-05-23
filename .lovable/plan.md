## Mục tiêu
Trên Bảng kê chứng từ, khi người dùng cuộn xuống đọc các dòng dữ liệu, dòng tiêu đề (Ngày, Số CT, Loại CT, Diễn giải, TK Nợ, TK Có, Số tiền…) sẽ "dính" lại ở đầu vùng bảng để luôn nhìn thấy được.

## Phạm vi
- Chỉ sửa file `src/routes/_app/reports/voucher-list.tsx`.
- Không đụng tới logic dữ liệu, không đổi cột, không đổi báo cáo khác.

## Cách làm (kỹ thuật)
1. Bọc `<table>` trong một container có chiều cao tối đa và `overflow-y-auto` (ví dụ `max-h-[calc(100vh-340px)]`) để bảng tự cuộn bên trong khung báo cáo.
2. Thêm `sticky top-0 z-10` vào `<thead>` (và đảm bảo `bg-muted` đặc, không trong suốt) để header luôn nằm trên cùng khi scroll.
3. Khi in (`print:`) tắt sticky và bỏ giới hạn chiều cao để báo cáo in ra đầy đủ như cũ.
4. Footer "Tổng trang này" giữ nguyên ở cuối bảng (không sticky) — chỉ header dính.

## Kết quả
- Cuộn trong bảng: header luôn hiển thị.
- Cuộn ngang (nhiều cột): header cũng dính theo chiều dọc.
- In ấn: layout không đổi.
