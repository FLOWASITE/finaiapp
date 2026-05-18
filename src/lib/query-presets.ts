/**
 * Cấu hình staleTime / gcTime chuẩn cho React Query, dùng chung toàn app.
 * Mục tiêu: tránh refetch lặp lại trên cùng dữ liệu khi user chuyển trang qua lại.
 *
 * Dùng:
 *   useQuery({ queryKey, queryFn, ...QUERY_PRESETS.REPORT })
 */
export const QUERY_PRESETS = {
  /** Dữ liệu thay đổi liên tục (chat, notification): luôn refetch */
  REALTIME: {
    staleTime: 0,
    gcTime: 60_000,
  },
  /** Danh sách giao dịch (hóa đơn, phiếu thu/chi, bút toán) */
  TRANSACTIONAL: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  },
  /** Báo cáo kế toán nặng (trial balance, GL, aging, dashboard) */
  REPORT: {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  },
  /** Dữ liệu tham chiếu ít đổi (COA, đơn vị, kho, dimensions) */
  REFERENCE: {
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
  },
  /** Cấu hình tenant gần như tĩnh trong phiên (tenant info, fiscal periods, roles) */
  TENANT_STATIC: {
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
  },
};
