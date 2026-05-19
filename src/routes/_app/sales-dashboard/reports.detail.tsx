import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { salesDetail } from "@/lib/sales-reports.functions";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportTable, type Col } from "@/components/reports/report-table";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/sales-dashboard/reports/detail")({
  component: Page,
});

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

type Row = Awaited<ReturnType<typeof salesDetail>>["rows"][number];

function Page() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayStr());
  const fn = useServerFn(salesDetail);
  const q = useQuery({
    queryKey: ["sales-detail", from, to],
    queryFn: () => fn({ data: { from, to } }),
  });

  const columns: Col<Row>[] = useMemo(
    () => [
      { key: "issue_date", header: "Ngày", accessor: (r) => r.issue_date },
      { key: "invoice_no", header: "Số HĐ", accessor: (r) => r.invoice_no },
      { key: "customer_name", header: "Khách hàng", accessor: (r) => r.customer_name },
      { key: "product_code", header: "Mã hàng", accessor: (r) => r.product_code },
      { key: "product_name", header: "Tên hàng", accessor: (r) => r.product_name },
      { key: "unit", header: "ĐVT", accessor: (r) => r.unit, align: "center" },
      { key: "qty", header: "SL", accessor: (r) => r.qty, numeric: true },
      { key: "unit_price", header: "Đơn giá", accessor: (r) => r.unit_price, numeric: true },
      { key: "discount", header: "CK", accessor: (r) => r.discount, numeric: true },
      { key: "pre_vat", header: "Trước VAT", accessor: (r) => r.pre_vat, numeric: true },
      { key: "vat", header: "VAT", accessor: (r) => r.vat, numeric: true },
      { key: "total", header: "Tổng", accessor: (r) => r.total, numeric: true },
    ],
    [],
  );

  const handleExport = () => {
    if (!q.data) return;
    downloadCsv(
      `so-chi-tiet-ban-hang_${from}_${to}.csv`,
      columns.map((c) => ({ key: c.key, header: c.header, accessor: c.accessor as any })),
      q.data.rows,
    );
  };

  return (
    <ReportShell
      title="Sổ chi tiết bán hàng"
      subtitle={`Kỳ ${from} → ${to}`}
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
