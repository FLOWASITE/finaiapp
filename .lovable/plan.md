## Kết quả research thị trường

Khảo sát MISA AMIS, MISA SME 2026, FAST Accounting, AccNet ERP, 1C:Finance, Viindoo. Tất cả phần mềm kế toán Việt đang dẫn đầu đều có chung **9 phân hệ chuẩn** ngoài bộ nhập liệu + sổ kế toán + BCTC:

| Phân hệ | AccuVN hiện tại | Đối thủ |
|---|---|---|
| Hóa đơn đầu vào + OCR + định khoản AI | ✅ Có | Có |
| Sổ nhật ký + Sổ cái | ⚠️ Mới sổ nhật ký | Có đủ |
| BCTC B01/B02/B03 | ✅ Có | Có |
| Đối soát ngân hàng | ✅ Có | Có |
| Khấu hao TSCĐ | ✅ Có | Có |
| Trợ lý AI hỏi-đáp dữ liệu | ✅ Có (USP) | Không có |
| **Mua hàng / Bán hàng (đơn hàng → hóa đơn)** | ❌ | ✅ |
| **Quản lý kho (Nhập–Xuất–Tồn, giá xuất kho)** | ❌ | ✅ |
| **Công nợ phải thu / phải trả + tuổi nợ** | ❌ | ✅ |
| **Quỹ tiền mặt (Phiếu thu / Phiếu chi)** | ❌ | ✅ |
| **Tờ khai thuế GTGT 01/GTGT + bảng kê + XML HTKK** | ❌ | ✅ |
| **Hóa đơn điện tử đầu ra + nộp TCT** | ❌ | ✅ |
| Tiền lương + BHXH | ❌ | ✅ |
| Giá thành sản xuất | ❌ | ✅ (gói cao) |
| Đa tiền tệ + chênh lệch tỷ giá | ❌ | ✅ |
| Kết chuyển cuối kỳ (Nợ 911) | ❌ | ✅ |

## Đề xuất Phase 3 — 5 phân hệ ưu tiên

Chọn theo nguyên tắc: bịt khoảng cách lớn nhất với MISA, tận dụng dữ liệu sẵn có (invoices, journal, bank), giữ vai trò AI làm USP. Bỏ qua tiền lương / giá thành / đa tiền tệ — để Phase 4.

### 1. Quản lý kho — Nhập–Xuất–Tồn
- Bảng `products` (mã, tên, ĐVT, TK kho 156/152, TK doanh thu 511, TK giá vốn 632)
- Bảng `stock_movements` (in/out, qty, unit_cost, ref đến invoice/sales_order)
- Tính giá xuất kho **bình quân gia quyền cuối kỳ** (chuẩn TT133, đơn giản nhất)
- Báo cáo: Sổ chi tiết vật tư, Bảng tổng hợp Nhập–Xuất–Tồn
- AI bonus: gợi ý map line hóa đơn → mã hàng có sẵn

### 2. Phiếu thu / Phiếu chi + Sổ quỹ tiền mặt
- Bảng `cash_vouchers` (loại receipt/payment, TK đối ứng, người nộp/nhận, lý do)
- Tự sinh bút toán: Nợ 111/Có X (thu) hoặc Nợ X/Có 111 (chi)
- In phiếu thu/chi theo mẫu TT133 (PDF A5)
- Sổ quỹ tiền mặt — số dư đầu/cuối, đối chiếu thủ quỹ

### 3. Công nợ phải thu / phải trả
- View tự suy ra từ `journal_lines` lọc TK 131 (phải thu) và 331 (phải trả) group theo supplier/customer
- Báo cáo tuổi nợ (aging): 0–30, 31–60, 61–90, >90 ngày
- Trang chi tiết công nợ 1 đối tượng: sổ chi tiết phát sinh + số dư
- Cảnh báo AI: top 5 khoản nợ quá hạn cần đòi

### 4. Tờ khai thuế GTGT 01/GTGT + Bảng kê
- Tổng hợp từ `invoices` (đầu vào) + hóa đơn đầu ra (sẽ thêm ở mục 5)
- Bảng kê hóa đơn mua vào / bán ra theo định dạng HTKK
- Tính số thuế GTGT phải nộp = Đầu ra − Đầu vào được khấu trừ
- Export XML đúng schema HTKK của TCT để nộp qua thuedientu.gdt.gov.vn

### 5. Hóa đơn điện tử đầu ra (mock + chuẩn bị TCT)
- Bảng `sales_invoices` (số hóa đơn, ký hiệu, khách hàng, lines, VAT)
- UI tạo / in mẫu HĐĐT theo TT78/2021
- Server function `issueEInvoice` — đầu Phase 3 trả mock số hóa đơn + QR; để hook sẵn cho T-VAN (Viettel/VNPT/Misa Meinvoice) ở Phase 4
- Tự sinh bút toán bán hàng: Nợ 131/Có 511, Có 33311

## Kiến trúc kỹ thuật

```text
src/lib/
  inventory.functions.ts     (CRUD products, post stock movements, calcCogs)
  cash.functions.ts          (vouchers + auto journal)
  receivables.functions.ts   (AR/AP aging queries)
  tax.functions.ts           (build VAT return + XML export)
  sales.functions.ts         (sales invoice + e-invoice issue)

src/routes/_app/
  inventory/index.tsx        (products list + stock report)
  cash/index.tsx             (vouchers + cash book)
  receivables/index.tsx      (AR/AP tabs + aging)
  tax/index.tsx              (01/GTGT preview + export)
  sales/index.tsx            (sales invoices list)
  sales/$id.tsx              (detail + issue button)
```

- Migrations Supabase cho 5 bảng mới + RLS theo `user_id` (giữ pattern hiện tại)
- Mở rộng nav sidebar 5 mục mới — gom thành nhóm: "Mua–Bán", "Kho", "Quỹ", "Công nợ", "Thuế"
- Tái sử dụng `chart_of_accounts` đã seed TT133 — không sửa schema cũ
- Module Trợ lý AI mở rộng tool `runQuery` để truy vấn 5 bảng mới

## Thứ tự thực hiện

1. Migrations + RLS (5 bảng)
2. Quản lý kho (nền tảng cho bán hàng + giá vốn)
3. Phiếu thu / Phiếu chi
4. Công nợ — chỉ là báo cáo, không cần bảng mới
5. Hóa đơn bán ra + mock e-invoice
6. Tờ khai 01/GTGT + bảng kê + XML
7. Cập nhật sidebar + AI chatbot tool schema

## Ngoài phạm vi Phase 3 (để Phase 4)
- Tiền lương + BHXH (nghiệp vụ phức tạp, cần bảng nhân sự riêng)
- Giá thành sản xuất (chỉ doanh nghiệp SX)
- Đa tiền tệ + tỷ giá
- Tích hợp T-VAN thật cho HĐĐT + nộp tờ khai
- Multi-company / phân quyền nhiều user
