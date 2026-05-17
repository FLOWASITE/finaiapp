import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getBalanceSheet, getIncomeStatement, getCashFlow } from "@/lib/reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/reports")({
  component: Reports,
});

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);

  const bsFn = useServerFn(getBalanceSheet);
  const isFn = useServerFn(getIncomeStatement);
  const cfFn = useServerFn(getCashFlow);

  const bs = useQuery({ queryKey: ["bs", to], queryFn: () => bsFn({ data: { asOf: to } }) });
  const is = useQuery({ queryKey: ["is", from, to], queryFn: () => isFn({ data: { from, to } }) });
  const cf = useQuery({ queryKey: ["cf", from, to], queryFn: () => cfFn({ data: { from, to } }) });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Báo cáo tài chính (TT133)</h1>
      <p className="text-sm text-muted-foreground">B01 — Bảng cân đối, B02 — KQKD, B03 — Lưu chuyển tiền tệ</p>

      <div className="mt-4 flex items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Từ ngày</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Đến ngày</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button onClick={() => { bs.refetch(); is.refetch(); cf.refetch(); }}>Cập nhật</Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="B01 — Bảng cân đối kế toán (tới ngày)">
          {bs.data ? (
            <>
              <Section title="Tài sản" rows={bs.data.rows.filter(r => r.group === "assets")} total={bs.data.totals.assets} />
              <Section title="Nợ phải trả" rows={bs.data.rows.filter(r => r.group === "liabilities")} total={bs.data.totals.liabilities} />
              <Section title="Vốn chủ sở hữu" rows={bs.data.rows.filter(r => r.group === "equity")} total={bs.data.totals.equity} />
              <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                Cân đối: TS {fmt(bs.data.totals.assets)} = NPT + VCSH {fmt(bs.data.totals.liabilities + bs.data.totals.equity)}
              </div>
            </>
          ) : <Loading />}
        </Card>

        <Card title="B02 — Kết quả kinh doanh">
          {is.data ? (
            <>
              <Section title="Doanh thu" rows={is.data.revenue} total={is.data.totalRevenue} />
              <Section title="Chi phí" rows={is.data.expense} total={is.data.totalExpense} />
              <div className="mt-3 flex items-center justify-between border-t-2 border-primary pt-2 font-semibold">
                <span>Lợi nhuận</span>
                <span className={is.data.netIncome >= 0 ? "text-accent" : "text-destructive"}>{fmt(is.data.netIncome)}</span>
              </div>
            </>
          ) : <Loading />}
        </Card>

        <Card title="B03 — Lưu chuyển tiền tệ (gián tiếp đơn giản)">
          {cf.data ? (
            <>
              {(["operating", "investing", "financing"] as const).map((k) => (
                <div key={k} className="mb-3">
                  <div className="text-sm font-semibold capitalize">
                    {k === "operating" ? "Hoạt động kinh doanh" : k === "investing" ? "Hoạt động đầu tư" : "Hoạt động tài chính"}
                  </div>
                  <div className="ml-3 text-sm">
                    <div className="flex justify-between"><span>Thu</span><span className="font-mono">{fmt(cf.data.buckets[k].inflow)}</span></div>
                    <div className="flex justify-between"><span>Chi</span><span className="font-mono">{fmt(cf.data.buckets[k].outflow)}</span></div>
                  </div>
                </div>
              ))}
              <div className="mt-3 flex items-center justify-between border-t-2 border-primary pt-2 font-semibold">
                <span>Lưu chuyển tiền thuần</span>
                <span className={cf.data.netCash >= 0 ? "text-accent" : "text-destructive"}>{fmt(cf.data.netCash)}</span>
              </div>
            </>
          ) : <Loading />}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows: Array<{ code: string; name: string; amount: number }>; total: number }) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold">{title}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}><td className="py-1 font-mono text-xs text-muted-foreground">{r.code}</td><td>{r.name}</td><td className="text-right font-mono">{fmt(r.amount)}</td></tr>
          ))}
          <tr className="border-t border-border font-semibold"><td colSpan={2} className="py-1">Cộng</td><td className="text-right font-mono">{fmt(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Loading() { return <div className="text-sm text-muted-foreground">Đang tính...</div>; }
