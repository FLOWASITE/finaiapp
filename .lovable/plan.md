# Giai đoạn 3 — Cache phía client + đo latency báo cáo

Mục tiêu: giảm số lượt gọi mạng trùng lặp khi mở/đóng các trang báo cáo, và lấy dữ liệu thực tế "báo cáo nào đang chậm" để tối ưu có trọng tâm.

## 1. Chuẩn hoá `staleTime` theo nhóm dữ liệu

Hiện tại global `staleTime = 60s` đã bật trong `src/router.tsx`. Việc bổ sung là set **rõ ràng** theo từng nhóm để các trang báo cáo nặng không refetch khi user chuyển tab qua lại.

Tạo `src/lib/query-presets.ts` — bảng hằng số dùng chung:

| Nhóm | staleTime | gcTime | Áp dụng cho |
|------|-----------|--------|-------------|
| `REALTIME` | 0 | 1 phút | Notification, chat |
| `TRANSACTIONAL` | 30s | 5 phút | Danh sách hoá đơn, phiếu thu/chi, bút toán |
| `REPORT` | 5 phút | 30 phút | Trial balance, GL, aging, dashboard tháng |
| `REFERENCE` | 15 phút | 1 giờ | COA, đơn vị, kho, dimensions |
| `TENANT_STATIC` | 30 phút | 2 giờ | Tenant info, fiscal periods, user roles |

Cập nhật các `useQuery` ở:
- `src/routes/_app/reports/index.tsx`, `ledgers.tsx`, `aging.tsx` → `REPORT`
- `src/routes/_app/dashboard.tsx`, `sales/dashboard.tsx`, `purchases/dashboard.tsx` → `REPORT`
- `src/components/dimension-pickers.tsx`, `customer-combobox.tsx`, các picker khác → `REFERENCE`
- `src/components/tenant-switcher.tsx`, `fiscal-periods.tsx` → `TENANT_STATIC`

Lý do: report 5 phút là đủ tươi cho kế toán (dữ liệu MV refresh mỗi 30 phút từ Giai đoạn 2, nên client cache 5 phút không gây lệch).

## 2. Instrumentation latency cho server functions

Tạo `src/lib/with-latency.ts` — helper bọc `handler` của server function:

```ts
export function withLatency<T extends (...a: any[]) => Promise<any>>(
  name: string, fn: T
): T {
  return (async (...args) => {
    const t0 = performance.now();
    try {
      const result = await fn(...args);
      console.log(JSON.stringify({
        kind: 'serverfn.latency', name,
        ms: Math.round(performance.now() - t0), ok: true,
      }));
      return result;
    } catch (e) {
      console.log(JSON.stringify({
        kind: 'serverfn.latency', name,
        ms: Math.round(performance.now() - t0), ok: false,
        error: e instanceof Error ? e.message : String(e),
      }));
      throw e;
    }
  }) as T;
}
```

Áp dụng cho các handler báo cáo (chỉ những hàm có khả năng chậm):

- `reports.functions.ts`: `getTrialBalance`, `getProfitAndLoss`, `getBalanceSheet`, `getCashFlow`
- `ledgers.functions.ts`: `getGeneralLedger`, `getSubLedger`
- `dashboard-overview.functions.ts`: `dashboardOverview`
- `sales-dashboard.functions.ts`: `salesDashboard`
- `purchases-dashboard.functions.ts`: `purchasesDashboard`
- `receivables.functions.ts`: `getArAging`
- `payables.functions.ts`: `getApAging`

Log dạng JSON 1 dòng → đọc được qua `stack_modern--server-function-logs` với search `serverfn.latency`. Không cần bảng database mới ở vòng này (giữ nhẹ).

## 3. Tuỳ chọn: nút "Debug report timings" (chỉ cho superadmin)

Trang `/superadmin` thêm panel hiển thị 50 log latency gần nhất, parse từ worker logs qua một server function nhỏ `getRecentLatency`. Để sau nếu cần — không bắt buộc cho giai đoạn 3.

## Phạm vi không làm trong giai đoạn này

- Không chuyển report query sang gọi MV/RPC (`get_ar_aging`, …) — dành cho Giai đoạn 4 vì cần refactor logic và đối chiếu kết quả.
- Không tạo bảng lưu metrics — dùng worker logs có sẵn.
- Không đụng vào server functions không liên quan báo cáo.

## Kết quả mong đợi

- Trang report mở lần 2 trong vòng 5 phút: 0 request mạng (cache hit).
- Mọi handler báo cáo có dòng log `{"kind":"serverfn.latency","name":"…","ms":…}` → đủ dữ liệu để biết "báo cáo nào chậm nhất" mà người dùng đã hỏi ở Giai đoạn 0.
- Không thay đổi UI/UX hay logic nghiệp vụ.
