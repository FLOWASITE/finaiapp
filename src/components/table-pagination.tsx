import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Client-side pagination hook. Returns the sliced rows + state to render
 * <TablePagination /> below.
 */
export function usePagination<T>(rows: T[], initialPageSize = 20, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Reset page when filter/source changes or page becomes out of range
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  return { page, pageSize, pageCount, total, pageRows, setPage, setPageSize };
}

export function TablePagination({
  page,
  pageSize,
  pageCount,
  total,
  setPage,
  setPageSize,
}: {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <div>
        Hiển thị <span className="font-medium text-foreground">{from.toLocaleString("vi-VN")}</span>
        {"–"}
        <span className="font-medium text-foreground">{to.toLocaleString("vi-VN")}</span>
        {" / "}
        <span className="font-medium text-foreground">{total.toLocaleString("vi-VN")}</span> dòng
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="hidden sm:inline">Số dòng/trang</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(1)}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 tabular-nums">
            {page} / {pageCount}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= pageCount} onClick={() => setPage(pageCount)}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
