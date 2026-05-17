import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupplierDetail } from "@/lib/purchases.functions";

export const Route = createFileRoute("/_app/suppliers/$id")({
  component: SupplierDetail,
});

function vnd(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("vi-VN");
}

function SupplierDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getSupplierDetail);
  const { data } = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (!data) return <div className="p-8">Đang tải...</div>;
  const { supplier, invoices, payments, summary } = data;

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link to="/suppliers" className="text-xs text-muted-foreground">← Danh sách NCC</Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{supplier.name}</h1>
        <p className="text-sm text-muted-foreground">
          MST: {supplier.tax_id ?? "—"} · Hạn TT: {supplier.payment_terms_days} ngày
          {supplier.email && ` · ${supplier.email}`}
          {supplier.phone && ` · ${supplier.phone}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Tổng phát sinh HĐ" value={vnd(summary.totalInv)} />
        <Card label="Đã thanh toán" value={vnd(summary.totalPaid)} />
        <Card label="Dư nợ còn lại" value={vnd(summary.balance)} highlight />
      </div>

      <Section title={`Hoá đơn (${invoices.length})`}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2">Số HĐ</th>
              <th className="px-3 py-2 text-right">Tổng</th>
              <th className="px-3 py-2">TT</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{i.issue_date ?? "—"}</td>
                <td className="px-3 py-2">
                  <Link to="/invoices/$id" params={{ id: i.id }} className="text-accent">
                    {i.invoice_no ?? "—"}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right font-mono">{vnd(i.total)}</td>
                <td className="px-3 py-2 text-xs">{i.payment_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Lịch sử thanh toán (${payments.length})`}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Ngày</th>
              <th className="px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2">Phương thức</th>
              <th className="px-3 py-2">Tham chiếu</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{p.pay_date}</td>
                <td className="px-3 py-2 text-right font-mono">{vnd(p.amount)}</td>
                <td className="px-3 py-2 text-xs">{p.method}</td>
                <td className="px-3 py-2 text-xs">{p.reference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${highlight ? "ring-1 ring-accent" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
