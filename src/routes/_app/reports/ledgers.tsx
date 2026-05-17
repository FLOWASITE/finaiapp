import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getJournal, getGeneralLedger, getAccountLedger, getTrialBalance,
} from "@/lib/ledgers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, AlertTriangle, ExternalLink } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";

export const Route = createFileRoute("/_app/reports/ledgers")({
  component: LedgersPage,
});

const fmt = (n: number) => {
  if (!n) return "-";
  return Math.round(n).toLocaleString("vi-VN");
};

function LedgersPage() {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(today);
  const [account, setAccount] = useState("111");

  const jFn = useServerFn(getJournal);
  const glFn = useServerFn(getGeneralLedger);
  const alFn = useServerFn(getAccountLedger);
  const tbFn = useServerFn(getTrialBalance);

  const j = useQuery({ queryKey: ["journal", from, to], queryFn: () => jFn({ data: { from, to } }) });
  const gl = useQuery({ queryKey: ["gl", from, to], queryFn: () => glFn({ data: { from, to } }) });
  const al = useQuery({ queryKey: ["al", account, from, to], queryFn: () => alFn({ data: { account, from, to } }) });
  const tb = useQuery({ queryKey: ["tb", from, to], queryFn: () => tbFn({ data: { from, to } }) });

  return (
    <div className="p-8 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sổ sách kế toán</h1>
          <p className="text-sm text-muted-foreground">Nhật ký chung, Sổ cái, Sổ chi tiết, Bảng cân đối số phát sinh</p>
        </div>
        <div className="flex gap-2">
          <Link to="/reports"><Button variant="outline" size="sm">← BCTC</Button></Link>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />In</Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 print:hidden">
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
        <Button size="sm" onClick={() => { j.refetch(); gl.refetch(); al.refetch(); tb.refetch(); }}>Cập nhật</Button>
      </div>

      <Tabs defaultValue="journal" className="mt-6">
        <TabsList className="print:hidden">
          <TabsTrigger value="journal">Nhật ký chung</TabsTrigger>
          <TabsTrigger value="gl">Sổ cái</TabsTrigger>
          <TabsTrigger value="al">Sổ chi tiết TK</TabsTrigger>
          <TabsTrigger value="tb">Cân đối số phát sinh</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <Card title="Sổ Nhật ký chung" subtitle={`Kỳ từ ${from} đến ${to}`}>
            {!j.data ? <Loading /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left w-24">Ngày</th>
                    <th className="text-left">Diễn giải</th>
                    <th className="w-20 text-center">TK Nợ</th>
                    <th className="w-20 text-center">TK Có</th>
                    <th className="w-32 text-right">Nợ</th>
                    <th className="w-32 text-right">Có</th>
                    <th className="w-8 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {j.data.entries.map((e) => (
                    <>
                      <tr key={e.id + "-h"} className="bg-muted/30 border-t-2 border-border">
                        <td className="py-1.5 font-mono text-xs">{e.entry_date}</td>
                        <td className="font-medium" colSpan={5}>{e.description ?? ""}</td>
                        <td className="print:hidden">
                          <Link to="/journal/$entryId" params={{ entryId: e.id }} className="text-primary"><ExternalLink className="h-3 w-3" /></Link>
                        </td>
                      </tr>
                      {e.lines.map((l: { account_code: string; debit: number; credit: number }, i: number) => (
                        <tr key={e.id + "-" + i} className="border-b border-border/40">
                          <td></td>
                          <td className="pl-4 text-muted-foreground text-xs">— {l.account_code}</td>
                          <td className="text-center font-mono text-xs">{l.debit > 0 ? l.account_code : ""}</td>
                          <td className="text-center font-mono text-xs">{l.credit > 0 ? l.account_code : ""}</td>
                          <td className="text-right font-mono tabular-nums">{fmt(l.debit)}</td>
                          <td className="text-right font-mono tabular-nums">{fmt(l.credit)}</td>
                          <td></td>
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={4} className="py-2">Tổng cộng</td>
                    <td className="text-right font-mono">{fmt(j.data.totalDebit)}</td>
                    <td className="text-right font-mono">{fmt(j.data.totalCredit)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="gl">
          <Card title="Sổ cái — tổng hợp theo tài khoản" subtitle={`Kỳ từ ${from} đến ${to}`}>
            {!gl.data ? <Loading /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left w-20">Mã TK</th>
                    <th className="text-left">Tên tài khoản</th>
                    <th className="w-32 text-right">Dư đầu kỳ</th>
                    <th className="w-32 text-right">PS Nợ</th>
                    <th className="w-32 text-right">PS Có</th>
                    <th className="w-32 text-right">Dư cuối kỳ</th>
                  </tr>
                </thead>
                <tbody>
                  {gl.data.accounts.map((a) => (
                    <tr key={a.code} className="border-b border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setAccount(a.code)}>
                      <td className="py-1.5 font-mono text-xs">{a.code}</td>
                      <td>{a.name}</td>
                      <td className="text-right font-mono tabular-nums">{fmt(a.opening)}</td>
                      <td className="text-right font-mono tabular-nums">{fmt(a.debit)}</td>
                      <td className="text-right font-mono tabular-nums">{fmt(a.credit)}</td>
                      <td className="text-right font-mono tabular-nums font-semibold">{fmt(a.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Click vào dòng để xem Sổ chi tiết TK</p>
          </Card>
        </TabsContent>

        <TabsContent value="al">
          <Card title={`Sổ chi tiết tài khoản ${account}`} subtitle={`Kỳ từ ${from} đến ${to}`}>
            <div className="mb-3 flex items-end gap-2 print:hidden">
              <div>
                <Label className="text-xs">Mã TK</Label>
                <Input value={account} onChange={(e) => setAccount(e.target.value)} className="h-9 w-32 font-mono" />
              </div>
            </div>
            {!al.data ? <Loading /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="py-2 text-left w-24">Ngày</th>
                    <th className="text-left">Diễn giải</th>
                    <th className="w-32 text-right">PS Nợ</th>
                    <th className="w-32 text-right">PS Có</th>
                    <th className="w-32 text-right">Số dư</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-muted/30 italic">
                    <td colSpan={4} className="py-1.5 pl-2">Số dư đầu kỳ</td>
                    <td className="text-right font-mono">{fmt(al.data.opening)}</td>
                  </tr>
                  {al.data.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-1 font-mono text-xs">{l.entry_date}</td>
                      <td>
                        <Link to="/journal/$entryId" params={{ entryId: l.entry_id }} className="hover:underline">
                          {l.description ?? ""}
                        </Link>
                      </td>
                      <td className="text-right font-mono tabular-nums">{fmt(l.debit)}</td>
                      <td className="text-right font-mono tabular-nums">{fmt(l.credit)}</td>
                      <td className="text-right font-mono tabular-nums">{fmt(l.running)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50 font-semibold">
                    <td colSpan={2} className="py-2">Cộng phát sinh</td>
                    <td className="text-right font-mono">{fmt(al.data.totalDebit)}</td>
                    <td className="text-right font-mono">{fmt(al.data.totalCredit)}</td>
                    <td className="text-right font-mono">{fmt(al.data.closing)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="tb">
          <Card title="Bảng cân đối số phát sinh" subtitle={`Kỳ từ ${from} đến ${to}`}>
            {!tb.data ? <Loading /> : (
              <>
                {!tb.data.balanced && (
                  <div className="mb-3 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4" /> Tổng PS Nợ ≠ Tổng PS Có — kiểm tra số liệu
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th rowSpan={2} className="py-2 text-left">Mã TK</th>
                      <th rowSpan={2} className="text-left">Tên tài khoản</th>
                      <th colSpan={2} className="text-center border-l border-border">Số dư đầu kỳ</th>
                      <th colSpan={2} className="text-center border-l border-border">Phát sinh trong kỳ</th>
                      <th colSpan={2} className="text-center border-l border-border">Số dư cuối kỳ</th>
                    </tr>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
                      <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
                      <th className="text-right border-l border-border">Nợ</th><th className="text-right">Có</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb.data.rows.map((r) => (
                      <tr key={r.code} className="border-b border-border/40">
                        <td className="py-1 font-mono">{r.code}</td>
                        <td>{r.name}</td>
                        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.openingDebit)}</td>
                        <td className="text-right font-mono tabular-nums">{fmt(r.openingCredit)}</td>
                        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.debit)}</td>
                        <td className="text-right font-mono tabular-nums">{fmt(r.credit)}</td>
                        <td className="text-right font-mono tabular-nums border-l border-border">{fmt(r.closingDebit)}</td>
                        <td className="text-right font-mono tabular-nums">{fmt(r.closingCredit)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50 font-semibold border-t-2 border-border">
                      <td colSpan={2} className="py-2">Tổng cộng</td>
                      <td className="text-right font-mono border-l border-border">{fmt(tb.data.totals.openingDebit)}</td>
                      <td className="text-right font-mono">{fmt(tb.data.totals.openingCredit)}</td>
                      <td className="text-right font-mono border-l border-border">{fmt(tb.data.totals.debit)}</td>
                      <td className="text-right font-mono">{fmt(tb.data.totals.credit)}</td>
                      <td className="text-right font-mono border-l border-border">{fmt(tb.data.totals.closingDebit)}</td>
                      <td className="text-right font-mono">{fmt(tb.data.totals.closingCredit)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-6">
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Loading() {
  return <p className="py-8 text-center text-sm text-muted-foreground">Đang tải...</p>;
}
