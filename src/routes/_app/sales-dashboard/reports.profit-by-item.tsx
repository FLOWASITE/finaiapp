import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { salesProfitByItem } from "@/lib/sales-reports.functions";
import { ReportShell, fmtVN } from "@/components/reports/report-shell";
import { ReportTable, type Col } from "@/components/reports/report-table";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/sales-dashboard/reports/profit-by-item")({
  component: Page,
});

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

type Row = Awaited<ReturnType<typeof salesProfitByItem>>["rows"][number];

function Page() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const fn = useServerFn(salesProfitByItem);
  const q = useQuery({
    queryKey: ["sales-profit-by-item", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  const columns: Col<Row>[] = useMemo(
    () => [
      { key: "product_code", header: "Mã hàng", accessor: (r) => r.product_code },
      { key: "product_name", header: "Tên hàng", accessor: (r) => r.product_name },
      { key: "unit", header: "ĐVT", accessor: (r) => r.unit, align: "center" },
      { key: "qty", header: "SL bán", accessor: (r) => r.qty, numeric: true },
      { key: "revenue", header: "Doanh thu", accessor: (r) => r.revenue, numeric: true },
      { key: "cost", header: "Giá vốn", accessor: (r) => r.cost, numeric: true },
      { key: "profit", header: "Lãi/Lỗ", accessor: (r) => r.profit, numeric: true },
      {
        key: "margin_pct",
        header: "Tỷ suất %",
        accessor: (r) => r.margin_pct.toFixed(2) + "%",
        align: "right",
      },
    ],
    [],
  );

  const handleExport = () => {
    if (!q.data) return;
    downloadCsv(
      `lai-lo-theo-mat-hang_${from}_${to}.csv`,
      columns.map((c) => ({ key: c.key, header: c.header, accessor: c.accessor as any })),
      q.data.rows,
    );
  };

  return (
    <ReportShell
      title="Bảng tổng hợp lãi/lỗ theo từng mặt hàng"
      subtitle="Giá vốn = đơn giá vốn × số lượng (theo cấu hình sản phẩm hiện tại)"
      from={from}
      to={to}
      onRangeChange={(r) => { setFrom(r.from); setTo(r.to); }}
      onRefresh={() => q.refetch()}
      onExport={handleExport}
      isLoading={q.isFetching}
    >
      <ReportTable<Row>
        columns={columns}
        rows={q.data?.rows ?? []}
        totals={
          q.data?.totals
            ? {
                ...q.data.totals,
                margin_pct:
                  q.data.totals.revenue > 0
                    ? (((q.data.totals.profit) / q.data.totals.revenue) * 100).toFixed(2) + "%"
                    : "—",
              }
            : undefined
        }
        isLoading={q.isLoading}
      />
    </ReportShell>
  );
}
