## Mục tiêu

Gộp 4 phân hệ rời rạc — **Tài liệu** (`/documents`), **Hoá đơn điện tử** (`/einvoices`), **Hoá đơn bán** (`/invoices` — thực ra là *mua vào*)— thành **một trung tâm thống nhất** dưới `/documents`, có tab và filter rõ ràng. Người dùng không còn phải nhớ "vào trang nào" cho từng loại chứng từ.

> **Quan trọng**: KHÔNG gộp 4 bảng DB. `invoices`, `sales_invoices`, `einvoices` có schema, RLS, trigger kế toán riêng — gộp bảng sẽ phá vỡ kế toán. **Chỉ gộp UI + bảng `documents` đóng vai trò index/registry**.

## Kiến trúc đề xuất

```text
/documents                 ← Trung tâm chứng từ (route gốc mới)
  ?tab=all                 ← Mặc định: mọi loại
  ?tab=purchase            ← Hoá đơn mua vào (invoices)
  ?tab=sales               ← Hoá đơn bán ra (sales_invoices)
  ?tab=einvoice-in         ← HĐĐT đầu vào (einvoices direction=in)
  ?tab=einvoice-out        ← HĐĐT đầu ra (einvoices direction=out)
  ?tab=files               ← Tài liệu thuần (documents không link entity)
```

Mỗi tab dùng **cùng một khung bảng** (search, filter, drawer xem trước, OCR, link entity), chỉ khác cột hiển thị + server fn nguồn dữ liệu.

## Mô hình dữ liệu — giữ nguyên, mở rộng index

- `documents` đã có `ai_upload_id`, `einvoice_id`, `doc_kind`, `source` → là **registry trung tâm**.
- Thêm 2 cột nullable vào `documents`: `invoice_id uuid`, `sales_invoice_id uuid` (FK mềm) để bridge ngược lại 2 bảng còn lại. Index theo từng cột.
- Backfill: với mỗi row trong `invoices`/`sales_invoices` có `file_path`, tạo/cập nhật 1 row `documents` tương ứng (idempotent qua checksum hoặc UNIQUE `(tenant_id, kind, ref_id)`).
- Sau bridge: `documents` chứa đủ mọi chứng từ → tab "Tất cả" chỉ cần đọc 1 bảng.

## Các tab và logic dữ liệu

### Tab "Tất cả" (mặc định)

- Đọc `documents` + join nhẹ tới bảng gốc theo `doc_kind`.
- Cột: ngày, loại (icon), số HĐ, đối tác, tổng tiền, trạng thái, nguồn, OCR.
- Click row → mở drawer thống nhất.

### Tab "Mua vào" — dùng `listPurchaseInvoices` (đã có ở `purchases.functions.ts`)

- Cột giữ như trang `/invoices` hiện tại: số HĐ, NCC, ngày, tổng, payment_status, status.
- Thêm action "Tải lên + OCR" → tạo `documents(doc_kind=purchase_invoice)` rồi auto-parse → tạo `invoices` row + link.

### Tab "Bán ra" — dùng `listSalesInvoices`

- Cột: series/số, khách hàng, ngày, tổng, payment_status.
- Action "Tạo HĐ bán" → mở dialog tạo `sales_invoices` (giữ form hiện tại).

### Tab "HĐĐT đầu vào / đầu ra" — dùng `listEinvoices({direction})`

- Cột: mẫu/ký hiệu/số, bên đối tác, ngày, MCCT, tct_status.
- Action: "Đồng bộ TCT", "Import XML", "Tra cứu" (giữ nguyên các dialog hiện có).

### Tab "Tài liệu thuần"

- Filter `documents` chưa link entity nào (`document_links` rỗng).
- Đúng UI hiện tại của `/documents`.

## Drawer thống nhất

Một drawer dùng chung, các block hiện theo `doc_kind`:

1. **File gốc** — preview PDF/img/XML (đã có).
2. **Thông tin chứng từ** — render theo loại (purchase / sales / einvoice / generic).
3. **OCR** — block hiện tại (parser, pages, parse lại).
4. **Kế toán** — nếu có `journal_entry_id` → link sang `/journal`.
5. **Liên kết** — list `document_links` + nút mở entity.
6. **Lịch sử trạng thái** — `getStatusHistory`.

## Điều hướng & redirect

- Giữ các route cũ (`/invoices`, `/sales`, `/einvoices`) **redirect** sang `/documents?tab=...` để không vỡ bookmark.
- `/einvoices/$id`, `/invoices/$id`, `/sales/$id` giữ nguyên cho deep-link chi tiết (drawer chỉ là preview nhanh).
- Sidebar: gộp mục **"Chứng từ"** với 1 link `/documents` + sub-link nhanh tới từng tab.

## Cấu trúc file thay đổi

### Thêm mới

- `src/routes/_app/documents/index.tsx` — viết lại thành shell có Tabs.
- `src/components/documents/tabs/all-tab.tsx`
- `src/components/documents/tabs/purchase-tab.tsx`
- `src/components/documents/tabs/sales-tab.tsx`
- `src/components/documents/tabs/einvoice-tab.tsx` (dùng chung in/out qua prop)
- `src/components/documents/tabs/files-tab.tsx` (UI hiện tại)
- `src/components/documents/unified-drawer.tsx`
- `src/components/documents/upload-button.tsx` (đã có inline → tách ra)

### Sửa

- `src/lib/documents.functions.ts` — thêm `listAllDocuments` join 4 nguồn (hoặc đọc thuần từ `documents` sau khi bridge).
- `src/components/app-sidebar.tsx` — gộp menu.
- `src/routes/_app/invoices/index.tsx`, `sales/index.tsx`, `einvoices/index.tsx` — đổi thành redirect.

### Migration

- Thêm `invoice_id`, `sales_invoice_id` vào `documents` + index.
- Backfill script (1 lần) từ `invoices.file_path`, `sales_invoices` (nếu có file), `einvoices.xml_path/pdf_path`.

## Phạm vi KHÔNG đụng

- Logic kế toán (`journal_entries`, triggers, RLS).
- Form tạo/sửa HĐ bán, HĐ mua, sync TCT — tái sử dụng nguyên xi.
- Bảng `invoices`, `sales_invoices`, `einvoices` schema gốc.

## Câu hỏi cần xác nhận

1. **Đổi tên route**: giữ `/documents` làm gốc, hay đổi sang `/invoices` (vì trọng tâm là hoá đơn)? Mình đề xuất `/documents` (rộng hơn, chứa cả phi-hoá-đơn).
2. **Tab "Bán ra"** có gộp luôn **Phiếu bán hàng** (`sales` — chứng từ nội bộ, khác `sales_invoices`)? Hiện trên sidebar đang tách 2. Mình đề xuất **không gộp** — `sales` là chứng từ giao hàng, không phải tài liệu/hoá đơn.
3. **Mức gộp menu sidebar**: ẩn hẳn `/invoices`, `/sales`, `/einvoices` chỉ còn `/documents`; hay vẫn để như shortcut cho người quen?
4. **Backfill**: có cho phép tạo `documents` row cho hoá đơn cũ **không có file** (metadata-only, `storage_path=NULL`)? Schema hiện đang NOT NULL — cần migration nới lỏng nếu có.

Xin trả lời 4 câu trên rồi mình triển khai theo từng phase (Phase 1: migration + backfill; Phase 2: UI tabs; Phase 3: redirect + sidebar).