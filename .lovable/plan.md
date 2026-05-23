## Mục tiêu
Toast cho các sự kiện "quan trọng" do AI/đồng bộ thực hiện sẽ hiển thị icon Fin mascot thay vì icon mặc định (✓) của sonner, để nhấn mạnh đây là việc AI Agent vừa hoàn thành.

## Phạm vi (chỉ các toast "quan trọng")
1. MBBank sync xong → `src/components/mbbank-connect-dialog.tsx:117` ("Đồng bộ hoàn tất")
2. AI parse lại chứng từ xong → `src/routes/_app/documents/index.tsx:880` ("Đã parse lại …")
3. AI gợi ý hạch toán xong → `src/routes/_app/invoices/$id.tsx:66` ("AI đã gợi ý 3 phương án")
4. AI dò cặp chuyển khoản xong → `src/routes/_app/bank.reconcile.tsx:174` ("Phát hiện … cặp chuyển khoản")

Các toast nhỏ khác (Đã lưu, Đã xoá, lỗi…) giữ nguyên — không lạm dụng Fin.

## Cách làm
1. **Tạo helper `src/lib/fin-toast.tsx`** bọc `sonner` `toast()`:
   ```ts
   import { toast } from "sonner";
   import { FinMascot } from "@/components/fin-mascot";
   export const finToast = {
     success: (msg, opts) => toast.success(msg, { icon: <FinMascot size="xs" mood="happy" />, duration: 4000, ...opts }),
     info:    (msg, opts) => toast(msg,         { icon: <FinMascot size="xs" mood="idle"  />, ...opts }),
   };
   ```
   Dùng `icon` prop của sonner để override icon mặc định (giữ nguyên màu nền success/info).

2. **Thay thế tại 4 vị trí trên**: `toast.success(...)` → `finToast.success(...)`. Giữ nguyên text.

3. Không động đến các toast `error` / toast UI thông thường.

## Kiểm tra
- Mở `/bank/reconcile`, `/invoices/$id`, `/documents` — verify icon Fin xuất hiện trong toast (chụp screenshot khi trigger).
- Build pass.