import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { salesByCustomer } from "@/lib/sales-reports.functions";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportTable, type Col } from "@/components/reports/report-table";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/sales-dashboard/reports/by-customer")({
  component: Page,
});

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const todayStr = () => new Date().toISOString().slice(0, 10);

type Row = Awaited<ReturnType<typeof salesByCustomer>>["rows"][number];

function Page() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const fn = useServerFn(salesByCustomer);
  const q = useQuery({
    queryKey: ["sales-by-customer", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  const columns: Col<Row>[] = useMemo(
    () => [
      { key: "customer_code", header: "Mã KH", accessor: (r) => r.customer_code },
      { key: "customer_name", header: "Khách hàng", accessor: (r) => r.customer_name },
      { key: "invoices", header: "Số HĐ", accessor: (r) => r.invoices, numeric: true },
      { key: "pre_vat", header: "Trước VAT", accessor: (r) => r.pre_vat, numeric: true },
      { key: "vat", header: "VAT", accessor: (r) => r.vat, numeric: true },
      { key: "total", header: "Tổng", accessor: (r) => r.total, numeric: true },
      { key: "paid", header: "Đã thu", accessor: (r) => r.paid, numeric: true },
      { key: "remaining", header: "Còn lại", accessor: (r) => r.remaining, numeric: true },
    ],
    [],
  );

  const handleExport = () => {
    if (!q.data) return;
    downloadCsv(
      `ban-hang-theo-khach-hang_${from}_${to}.csv`,
      columns.map((c) => ({ key: c.key, header: c.header, accessor: c.accessor as any })),
      q.data.rows,
    );
  };

  return (
    <ReportShell
      title="Bảng tổng hợp bán hàng theo khách hàng"
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
        totals={q.data?.totals}
        isLoading={q.isLoading}
      />
    </ReportShell>
  );
}
