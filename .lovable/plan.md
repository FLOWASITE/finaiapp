## Tóm tắt
Tái cấu trúc nội dung **Sidebar Mode AI** (workspace `front`) theo mockup: 4 section (XỬ LÝ, THƯ VIỆN, THẤU HIỂU, AI) với badges động đếm từ DB.

## Cấu trúc sidebar mới

```
Chat AI                             ● (dot xanh, label nhỏ ở header)

XỬ LÝ
  Inbox AI                          [count]
  Cần xem lại                       [count]
  Đã hạch toán

THƯ VIỆN
  Trung tâm tài liệu                [count, muted]
  Đối tác

THẤU HIỂU
  Báo cáo
  Dòng tiền
  Thuế                              [N ngày, red]

AI · MỚI
  Trí nhớ AI
  Cảnh báo                          [count, red]
```

## Mapping route

| Mục | Route |
|---|---|
| Inbox AI | `/inbox` |
| Cần xem lại | `/inbox?tab=review` |
| Đã hạch toán | `/inbox?tab=posted` |
| Trung tâm tài liệu | `/documents` |
| Đối tác | `/customers` |
| Báo cáo | `/reports` |
| Dòng tiền | `/cashflow` *(route mới, placeholder)* |
| Thuế | `/tax/gtgt` |
| Trí nhớ AI | `/ai/memory` |
| Cảnh báo | `/alerts` *(route mới, placeholder)* |

## Thay đổi file

### 1. `src/routes/_app/cashflow.tsx` (mới)
Trang placeholder đơn giản với header "Dòng tiền" + thông báo "Sắp ra mắt". Trong `_app/` để dùng layout app + sidebar.

### 2. `src/routes/_app/alerts.tsx` (mới)
Trang placeholder "Cảnh báo" + danh sách rỗng + nút dẫn sang `/inbox_/anomaly`.

### 3. `src/lib/sidebar-counts.functions.ts` (mới)
Server fn `getAiSidebarCounts` với `requireSupabaseAuth` + `withTenant`, trả về:
```ts
{
  inbox: number,         // count chat_threads kind='inbox' chưa đọc (hoặc inbox_items)
  review: number,        // count documents có status='review' của tenant
  documents: number,     // count documents của tenant
  taxDaysLeft: number|null, // số ngày đến hạn khai GTGT gần nhất
  alerts: number,        // count ai_insights chưa xử lý
}
```
Trả null/0 khi bảng chưa có; query song song bằng `Promise.all`. Stale 60s ở client.

### 4. `src/components/app-sidebar.tsx`
- Mở rộng `NavLeaf` thêm `badgeTone?: "new" | "muted" | "danger" | "default"`.
- Viết lại `FRONT_SECTIONS` theo cấu trúc mới ở trên.
- Trong `AppSidebar`: thêm `useQuery(['sidebar', 'ai-counts'])` gọi `getAiSidebarCounts`. Khi `workspace === 'front'`, inject badge từ kết quả vào FRONT_SECTIONS trước khi render.
- Render badge theo tone: `default` (slate pill), `muted` (số nhạt, không nền), `danger` (đỏ), `new` (xanh).
- Section label "AI" hiển thị badge "MỚI" inline bên cạnh.

## Chi tiết kỹ thuật

- Active route detection cho `/inbox?tab=review`: hiện tại `isActive` đã hỗ trợ pin search param (`to: "/inbox?tab=review"`). Reuse logic này, không sửa.
- Tax days: lấy từ bảng `tax_deadlines` hoặc tính cứng (ngày 20 tháng sau cho GTGT). Dùng cách tính cứng để tránh phụ thuộc bảng chưa chắc có.
- Counts dùng `select('id', { count: 'exact', head: true })` để nhẹ.
- Nếu một bảng không tồn tại → catch và trả 0 thay vì throw, để sidebar không vỡ.