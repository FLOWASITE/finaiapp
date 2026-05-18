import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { reportPit05KK, reportPit05QTT, reportBhxhC70a } from "@/lib/payroll-reports.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/payroll/reports")({ component: ReportsPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Báo cáo Thuế &amp; BHXH</h1>
          <p className="text-sm text-muted-foreground">05/KK-TNCN · 05/QTT-TNCN · C70a-HD (D02-LT)</p>
        </div>
        <Link to="/payroll" className="text-primary text-sm underline">← Tiền lương</Link>
      </div>
      <Tabs defaultValue="kk">
        <TabsList>
          <TabsTrigger value="kk">05/KK-TNCN (Quý)</TabsTrigger>
          <TabsTrigger value="qtt">05/QTT-TNCN (Năm)</TabsTrigger>
          <TabsTrigger value="c70a">C70a-HD / D02-LT</TabsTrigger>
        </TabsList>
        <TabsContent value="kk"><PitQuarterTab /></TabsContent>
        <TabsContent value="qtt"><PitAnnualTab /></TabsContent>
        <TabsContent value="c70a"><BhxhMonthTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function PitQuarterTab() {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [quarter, setQuarter] = React.useState(Math.floor(now.getMonth() / 3) + 1);
  const fn = useServerFn(reportPit05KK);
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-05kk", year, quarter],
    queryFn: () => fn({ data: { year, quarter } }),
  });

  const exportCsv = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["Tờ khai 05/KK-TNCN", `Quý ${quarter}/${year}`],
      [],
      ["Chỉ tiêu", "Số người", "Tổng thu nhập", "Thuế TNCN khấu trừ"],
      ["[21] Cư trú HĐ ≥ 3 tháng", data.resident.count, data.resident.income, data.resident.pit],
      ["[27] Không cư trú", data.non_resident.count, data.non_resident.income, data.non_resident.pit],
      ["Tổng cộng", data.employees_count, data.resident.income + data.non_resident.income, data.total_pit],
    ];
    downloadCsv(`05-KK-TNCN_${year}_Q${quarter}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-end justify-between gap-4">
        <div className="flex gap-3">
          <div><Label>Năm</Label><Input type="number" className="w-28" value={year} onChange={e => setYear(Number(e.target.value))} /></div>
          <div>
            <Label>Quý</Label>
            <Select value={String(quarter)} onValueChange={v => setQuarter(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[1,2,3,4].map(q => <SelectItem key={q} value={String(q)}>Quý {q}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!data}>Xuất CSV</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : data && (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Chỉ tiêu</TableHead>
              <TableHead className="text-right">Số người</TableHead>
              <TableHead className="text-right">Tổng thu nhập</TableHead>
              <TableHead className="text-right">TNCN khấu trừ</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>[21] Cá nhân cư trú (HĐ ≥ 3 tháng)</TableCell>
                <TableCell className="text-right">{data.resident.count}</TableCell>
                <TableCell className="text-right">{fmt(data.resident.income)}</TableCell>
                <TableCell className="text-right">{fmt(data.resident.pit)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>[27] Cá nhân không cư trú</TableCell>
                <TableCell className="text-right">{fmt(data.non_resident.count)}</TableCell>
                <TableCell className="text-right">{fmt(data.non_resident.income)}</TableCell>
                <TableCell className="text-right">{fmt(data.non_resident.pit)}</TableCell>
              </TableRow>
              <TableRow className="font-semibold bg-muted/30">
                <TableCell>Tổng cộng</TableCell>
                <TableCell className="text-right">{data.employees_count}</TableCell>
                <TableCell className="text-right">{fmt(data.resident.income + data.non_resident.income)}</TableCell>
                <TableCell className="text-right">{fmt(data.total_pit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PitAnnualTab() {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const fn = useServerFn(reportPit05QTT);
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-05qtt", year],
    queryFn: () => fn({ data: { year } }),
  });

  const exportCsv = () => {
    if (!data) return;
    const head = ["STT", "Mã NV", "Họ tên", "MST", "CCCD", "Số người PT", "Số tháng tính",
      "Tổng TN chịu thuế", "BH khấu trừ", "TN tính thuế năm", "TNCN đã khấu trừ", "TNCN phải nộp", "Còn nộp/(Hoàn)"];
    const rows: (string | number)[][] = [["Quyết toán 05/QTT-TNCN", `Năm ${year}`], [], head];
    data.rows.forEach((r: any, i: number) => rows.push([
      i + 1, r.code, r.full_name, r.tax_id ?? "", r.citizen_id ?? "", r.dependents, r.months,
      r.gross, r.insurance_emp, r.annual_taxable, r.pit_withheld, r.pit_payable, -r.refund_or_payable,
    ]));
    rows.push(["", "", "TỔNG", "", "", "", "", data.totals.gross, data.totals.insurance_emp,
      data.totals.taxable, data.totals.pit_withheld, data.totals.pit_payable, -data.totals.refund]);
    downloadCsv(`05-QTT-TNCN_${year}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-end justify-between">
        <div><Label>Năm quyết toán</Label><Input type="number" className="w-28" value={year} onChange={e => setYear(Number(e.target.value))} /></div>
        <Button variant="outline" onClick={exportCsv} disabled={!data}>Xuất CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : data && (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Mã</TableHead><TableHead>Họ tên</TableHead><TableHead>MST</TableHead>
              <TableHead className="text-center">PT</TableHead><TableHead className="text-center">Tháng</TableHead>
              <TableHead className="text-right">Tổng TN</TableHead>
              <TableHead className="text-right">BH NV</TableHead>
              <TableHead className="text-right">TN tính thuế</TableHead>
              <TableHead className="text-right">Đã khấu trừ</TableHead>
              <TableHead className="text-right">Phải nộp</TableHead>
              <TableHead className="text-right">Hoàn/(Nộp)</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r: any) => (
                <TableRow key={r.employee_id}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.tax_id ?? "—"}</TableCell>
                  <TableCell className="text-center">{r.dependents}</TableCell>
                  <TableCell className="text-center">{r.months}</TableCell>
                  <TableCell className="text-right">{fmt(r.gross)}</TableCell>
                  <TableCell className="text-right">{fmt(r.insurance_emp)}</TableCell>
                  <TableCell className="text-right">{fmt(r.annual_taxable)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pit_withheld)}</TableCell>
                  <TableCell className="text-right">{fmt(r.pit_payable)}</TableCell>
                  <TableCell className={`text-right ${r.refund_or_payable > 0 ? "text-emerald-600" : r.refund_or_payable < 0 ? "text-destructive" : ""}`}>
                    {fmt(r.refund_or_payable)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/30">
                <TableCell colSpan={5}>TỔNG</TableCell>
                <TableCell className="text-right">{fmt(data.totals.gross)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.insurance_emp)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.taxable)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.pit_withheld)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.pit_payable)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.refund)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BhxhMonthTab() {
  const [month, setMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const fn = useServerFn(reportBhxhC70a);
  const { data, isLoading } = useQuery({
    queryKey: ["rpt-c70a", month],
    queryFn: () => fn({ data: { month } }),
  });

  const exportCsv = () => {
    if (!data) return;
    const head = ["STT", "Mã NV", "Họ tên", "CCCD", "Số sổ BHXH", "Chức vụ", "Lương đóng BH",
      "BHXH NV (8%)", "BHYT NV (1.5%)", "BHTN NV (1%)", "Cộng NV",
      "BHXH DN (17.5%)", "BHYT DN (3%)", "BHTN DN (1%)", "Cộng DN"];
    const rows: (string | number)[][] = [["C70a-HD / D02-LT", `Tháng ${month}`], [], head];
    data.rows.forEach((r: any, i: number) => rows.push([
      i + 1, r.code, r.full_name, r.citizen_id ?? "", r.social_insurance_no ?? "",
      r.position ?? "", r.insurance_salary,
      r.bhxh_emp, r.bhyt_emp, r.bhtn_emp, r.total_emp,
      r.bhxh_co, r.bhyt_co, r.bhtn_co, r.total_co,
    ]));
    rows.push(["", "", `TỔNG (${data.totals.headcount} LĐ)`, "", "", "", data.totals.insurance_salary,
      data.totals.bhxh_emp, data.totals.bhyt_emp, data.totals.bhtn_emp, data.totals.total_emp,
      data.totals.bhxh_co, data.totals.bhyt_co, data.totals.bhtn_co, data.totals.total_co]);
    downloadCsv(`C70a-HD_${month}.csv`, rows);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-end justify-between">
        <div><Label>Tháng</Label><Input type="month" className="w-44" value={month} onChange={e => setMonth(e.target.value)} /></div>
        <Button variant="outline" onClick={exportCsv} disabled={!data || data.rows.length === 0}>Xuất CSV</Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isLoading ? <p className="text-sm text-muted-foreground">Đang tải…</p> :
          !data || data.rows.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu lương cho tháng này.</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Mã</TableHead><TableHead>Họ tên</TableHead><TableHead>Số sổ BHXH</TableHead>
              <TableHead className="text-right">Lương BH</TableHead>
              <TableHead className="text-right">BHXH NV</TableHead>
              <TableHead className="text-right">BHYT NV</TableHead>
              <TableHead className="text-right">BHTN NV</TableHead>
              <TableHead className="text-right">Cộng NV</TableHead>
              <TableHead className="text-right">Cộng DN</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.social_insurance_no ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(r.insurance_salary)}</TableCell>
                  <TableCell className="text-right">{fmt(r.bhxh_emp)}</TableCell>
                  <TableCell className="text-right">{fmt(r.bhyt_emp)}</TableCell>
                  <TableCell className="text-right">{fmt(r.bhtn_emp)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(r.total_emp)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(r.total_co)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold bg-muted/30">
                <TableCell colSpan={3}>TỔNG ({data.totals.headcount} LĐ)</TableCell>
                <TableCell className="text-right">{fmt(data.totals.insurance_salary)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.bhxh_emp)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.bhyt_emp)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.bhtn_emp)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.total_emp)}</TableCell>
                <TableCell className="text-right">{fmt(data.totals.total_co)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
