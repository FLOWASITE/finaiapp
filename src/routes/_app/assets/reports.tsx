import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileBarChart, Download, Calendar, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportS21, reportS22, reportFundingMovement, reportByDimension } from "@/lib/fa-reports.functions";

export const Route = createFileRoute("/_app/assets/reports")({ component: ReportsPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

function toCSV(headers: string[], rows: any[][]) {
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
}

function downloadCSV(name: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const s21Fn = useServerFn(reportS21);
  const s22Fn = useServerFn(reportS22);
  const fundFn = useServerFn(reportFundingMovement);
  const dimFn = useServerFn(reportByDimension);

  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  const startOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(startOfYear);
  const [to, setTo] = useState(today);
  const [dim, setDim] = useState<"department" | "project" | "branch">("department");

  const s21 = useQuery({ queryKey: ["rep_s21", year], queryFn: () => s21Fn({ data: { year } }) });
  const s22 = useQuery({ queryKey: ["rep_s22", period], queryFn: () => s22Fn({ data: { period } }) });
  const fund = useQuery({ queryKey: ["rep_funding", from, to], queryFn: () => fundFn({ data: { from, to } }) });
  const dimRep = useQuery({ queryKey: ["rep_dim", dim], queryFn: () => dimFn({ data: { dimension: dim } }) });

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><FileBarChart className="h-7 w-7 text-indigo-500" />Báo cáo TSCĐ</h1>
          <p className="text-sm text-muted-foreground">S21-DN · S22-DN · Tổng hợp tăng/giảm theo nguồn vốn · Thẻ TSCĐ.</p>
        </div>
      </div>

      <Tabs defaultValue="s21">
        <TabsList>
          <TabsTrigger value="s21">S21-DN — Sổ TSCĐ</TabsTrigger>
          <TabsTrigger value="s22">S22-DN — Phân bổ KH</TabsTrigger>
          <TabsTrigger value="funding">Tăng/giảm theo nguồn vốn</TabsTrigger>
          <TabsTrigger value="card">Thẻ TSCĐ</TabsTrigger>
        </TabsList>

        <TabsContent value="s21" className="space-y-4">
          <Card><CardContent className="py-3 flex items-end gap-3">
            <div><Label>Năm</Label><Input type="number" className="w-28" value={year} onChange={e => setYear(Number(e.target.value))} /></div>
            <Badge variant="outline">Sổ: {s21.data?.book?.name ?? "—"}</Badge>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => {
              if (!s21.data) return;
              const csv = toCSV(
                ["Mã", "Tên", "Phân loại", "Ngày SD", "Nguyên giá", "Tỉ lệ KH năm (%)", "KH năm", "KH luỹ kế", "GT còn lại", "Bộ phận"],
                s21.data.rows.map(r => [r.code, r.name, r.category ?? "", r.in_service_date ?? "", r.cost, r.rate_year, r.depreciation_year, r.accumulated, r.nbv, r.department ?? ""])
              );
              downloadCSV(`S21-DN_${year}.csv`, csv);
            }}><Download className="h-4 w-4 mr-2" />Xuất CSV</Button>
          </CardContent></Card>
          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mã</TableHead><TableHead>Tên</TableHead><TableHead>Phân loại</TableHead>
                <TableHead>Ngày SD</TableHead>
                <TableHead className="text-right">Nguyên giá</TableHead>
                <TableHead className="text-right">Tỉ lệ (%)</TableHead>
                <TableHead className="text-right">KH năm</TableHead>
                <TableHead className="text-right">Luỹ kế</TableHead>
                <TableHead className="text-right">GT còn lại</TableHead>
                <TableHead>Bộ phận</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(s21.data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-sm">{r.category ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.in_service_date ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmt(r.cost)}</TableCell>
                    <TableCell className="text-right">{r.rate_year}</TableCell>
                    <TableCell className="text-right">{fmt(r.depreciation_year)}</TableCell>
                    <TableCell className="text-right">{fmt(r.accumulated)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.nbv)}</TableCell>
                    <TableCell className="text-sm">{r.department ?? "—"}</TableCell>
                    <TableCell><Link to="/assets/$id/card" params={{ id: r.id }}><Button variant="ghost" size="sm">Thẻ</Button></Link></TableCell>
                  </TableRow>
                ))}
                {s21.data && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={4}>Tổng cộng</TableCell>
                    <TableCell className="text-right">{fmt(s21.data.totals.cost)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right">{fmt(s21.data.totals.depreciation_year)}</TableCell>
                    <TableCell className="text-right">{fmt(s21.data.totals.accumulated)}</TableCell>
                    <TableCell className="text-right">{fmt(s21.data.totals.nbv)}</TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="s22" className="space-y-4">
          <Card><CardContent className="py-3 flex items-end gap-3">
            <div><Label>Kỳ (YYYY-MM)</Label><Input className="w-32" value={period} onChange={e => setPeriod(e.target.value)} /></div>
            <Badge variant="outline">Sổ: {s22.data?.book?.name ?? "—"}</Badge>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => {
              if (!s22.data) return;
              const csv = toCSV(["Mã", "Tài sản", "Bộ phận", "TK chi phí", "Số khấu hao"],
                s22.data.rows.map(r => [r.code, r.name, r.department ?? "", r.expense_account, r.amount]));
              downloadCSV(`S22-DN_${period}.csv`, csv);
            }}><Download className="h-4 w-4 mr-2" />Xuất CSV</Button>
          </CardContent></Card>

          <div className="grid grid-cols-2 gap-4">
            <Card><CardContent className="py-3">
              <h3 className="font-semibold mb-2">Theo tài khoản chi phí</h3>
              <Table><TableBody>
                {(s22.data?.byAccount ?? []).map((r: any) => (
                  <TableRow key={r.account}><TableCell><code>{r.account}</code></TableCell><TableCell className="text-right">{fmt(r.amount)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <h3 className="font-semibold mb-2">Theo bộ phận</h3>
              <Table><TableBody>
                {(s22.data?.byDept ?? []).map((r: any) => (
                  <TableRow key={r.department}><TableCell>{r.department}</TableCell><TableCell className="text-right">{fmt(r.amount)}</TableCell></TableRow>
                ))}
              </TableBody></Table>
            </CardContent></Card>
          </div>

          <Card><CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Mã</TableHead><TableHead>Tài sản</TableHead><TableHead>Bộ phận</TableHead>
                <TableHead>TK chi phí</TableHead><TableHead className="text-right">KH tháng</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(s22.data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.asset_id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-sm">{r.department ?? "—"}</TableCell>
                    <TableCell><code>{r.expense_account}</code></TableCell>
                    <TableCell className="text-right">{fmt(r.amount)}</TableCell>
                  </TableRow>
                ))}
                {s22.data && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={4}>Tổng KH kỳ {period}</TableCell>
                    <TableCell className="text-right">{fmt(s22.data.totals.current)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="funding" className="space-y-4">
          <Card><CardContent className="py-3 flex items-end gap-3">
            <div><Label>Từ ngày</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><Label>Đến ngày</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            <div className="flex-1" />
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Tăng / Giảm trong kỳ</div>
              <div className="text-lg font-bold">
                <span className="text-emerald-600">+{fmt(fund.data?.totals.incoming ?? 0)}</span>
                {" / "}
                <span className="text-rose-600">−{fmt(fund.data?.totals.decrease ?? 0)}</span>
              </div>
            </div>
          </CardContent></Card>

          <div className="grid grid-cols-2 gap-4">
            <Card><CardContent className="py-3">
              <h3 className="font-semibold mb-2 text-emerald-700">Tăng theo nguồn vốn</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Nguồn</TableHead><TableHead className="text-right">SL</TableHead><TableHead className="text-right">Nguyên giá</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(fund.data?.incomingBySource ?? []).map((r: any) => (
                    <TableRow key={r.source}><TableCell>{r.source}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right">{fmt(r.amount)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
            <Card><CardContent className="py-3">
              <h3 className="font-semibold mb-2 text-rose-700">Giảm theo nguồn vốn</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Nguồn</TableHead><TableHead className="text-right">SL</TableHead><TableHead className="text-right">Nguyên giá</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(fund.data?.decreaseBySource ?? []).map((r: any) => (
                    <TableRow key={r.source}><TableCell>{r.source}</TableCell><TableCell className="text-right">{r.count}</TableCell><TableCell className="text-right">{fmt(r.amount)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="card">
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Mở thẻ TSCĐ từng tài sản qua nút <strong>Thẻ</strong> ở tab S21-DN, hoặc từ danh sách tài sản.
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
