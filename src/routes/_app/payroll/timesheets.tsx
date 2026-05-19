import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  listTimesheets, upsertTimesheet, bulkInitTimesheets,
} from "@/lib/payroll-phaseb.functions";
import { importTimesheetsBulk } from "@/lib/payroll-reports.functions";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/timesheets")({ component: Page });

function Page() {
  const [period, setPeriod] = React.useState(new Date().toISOString().slice(0, 7));
  const [standardDays, setStandardDays] = React.useState("22");
  const list = useServerFn(listTimesheets);
  const upsert = useServerFn(upsertTimesheet);
  const bulk = useServerFn(bulkInitTimesheets);
  const importBulk = useServerFn(importTimesheetsBulk);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["timesheets", period],
    queryFn: () => list({ data: { period_month: period } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const mUpsert = useMutation({
    mutationFn: (v: any) => upsert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timesheets", period] }),
    onError: (e: any) => toast.error(e.message),
  });
  const mBulk = useMutation({
    mutationFn: () => bulk({ data: { period_month: period, standard_days: Number(standardDays) } }),
    onSuccess: (r: any) => {
      toast.success(`Đã khởi tạo ${r.inserted} dòng chấm công`);
      qc.invalidateQueries({ queryKey: ["timesheets", period] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mImport = useMutation({
    mutationFn: (rows: any[]) => importBulk({ data: { period_month: period, rows } }),
    onSuccess: (r: any) => {
      toast.success(`Nhập ${r.updated} dòng${r.skipped ? `, bỏ qua ${r.skipped}` : ""}`);
      if (r.errors?.length) r.errors.forEach((e: string) => toast.warning(e));
      qc.invalidateQueries({ queryKey: ["timesheets", period] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: 0 });
      const rows = raw.map((r) => ({
        employee_code: String(r.employee_code ?? r["Mã NV"] ?? r["Ma NV"] ?? r.code ?? "").trim(),
        standard_days: Number(r.standard_days ?? r["Công chuẩn"] ?? 0) || undefined,
        actual_days: Number(r.actual_days ?? r["Công thực tế"] ?? 0) || undefined,
        paid_leave_days: Number(r.paid_leave_days ?? r["Nghỉ phép"] ?? 0) || 0,
        unpaid_leave_days: Number(r.unpaid_leave_days ?? r["Nghỉ không lương"] ?? 0) || 0,
        ot_150_hours: Number(r.ot_150_hours ?? r["OT 150"] ?? 0) || 0,
        ot_200_hours: Number(r.ot_200_hours ?? r["OT 200"] ?? 0) || 0,
        ot_300_hours: Number(r.ot_300_hours ?? r["OT 300"] ?? 0) || 0,
        night_hours: Number(r.night_hours ?? r["Đêm"] ?? 0) || 0,
      })).filter((r) => r.employee_code);
      if (!rows.length) { toast.error("File trống hoặc thiếu cột employee_code"); return; }
      mImport.mutate(rows);
    } catch (err: any) {
      toast.error("Lỗi đọc file: " + err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      employee_code: "NV001", standard_days: 22, actual_days: 22,
      paid_leave_days: 0, unpaid_leave_days: 0,
      ot_150_hours: 0, ot_200_hours: 0, ot_300_hours: 0, night_hours: 0,
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Timesheet");
    XLSX.writeFile(wb, `ChamCong_Mau_${period}.xlsx`);
  };


  const update = (employee_id: string, current: any, patch: any) => {
    const base = current ?? {
      employee_id, period_month: period,
      standard_days: Number(standardDays), actual_days: Number(standardDays),
      paid_leave_days: 0, unpaid_leave_days: 0,
      ot_150_hours: 0, ot_200_hours: 0, ot_300_hours: 0, night_hours: 0,
    };
    mUpsert.mutate({ ...base, ...patch });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/payroll" className="text-sm text-muted-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Quay lại
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Bảng chấm công</h1>
          <p className="text-sm text-muted-foreground">Quản lý công thực tế, nghỉ phép, tăng ca theo kỳ</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Kỳ</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Công chuẩn</Label>
            <Input type="number" value={standardDays} onChange={(e) => setStandardDays(e.target.value)} className="w-24" />
          </div>
          <Button variant="outline" onClick={() => mBulk.mutate()} disabled={mBulk.isPending}>
            Khởi tạo
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Họ tên</TableHead>
                <TableHead className="w-20 text-right">Chuẩn</TableHead>
                <TableHead className="w-20 text-right">Thực</TableHead>
                <TableHead className="w-20 text-right">P</TableHead>
                <TableHead className="w-20 text-right">KP</TableHead>
                <TableHead className="w-24 text-right">OT 150%</TableHead>
                <TableHead className="w-24 text-right">OT 200%</TableHead>
                <TableHead className="w-24 text-right">OT 300%</TableHead>
                <TableHead className="w-20 text-right">Đêm</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(({ employee: e, timesheet: t }: any) => (
                <Row
                  key={e.id}
                  employee={e}
                  timesheet={t}
                  defaultStd={Number(standardDays)}
                  onSave={(patch: any) => update(e.id, t, patch)}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NumCell({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => { setV(String(value)); }, [value]);
  return (
    <Input
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (n !== value) onCommit(n);
      }}
      className="h-8 text-right"
    />
  );
}

function Row({ employee, timesheet, defaultStd, onSave }: any) {
  const t = timesheet ?? {};
  const cell = (key: string, fallback: number) => (
    <NumCell value={Number(t[key] ?? fallback)} onCommit={(n) => onSave({ [key]: n })} />
  );
  return (
    <TableRow>
      <TableCell className="font-mono">{employee.code}</TableCell>
      <TableCell>{employee.full_name}</TableCell>
      <TableCell>{cell("standard_days", defaultStd)}</TableCell>
      <TableCell>{cell("actual_days", defaultStd)}</TableCell>
      <TableCell>{cell("paid_leave_days", 0)}</TableCell>
      <TableCell>{cell("unpaid_leave_days", 0)}</TableCell>
      <TableCell>{cell("ot_150_hours", 0)}</TableCell>
      <TableCell>{cell("ot_200_hours", 0)}</TableCell>
      <TableCell>{cell("ot_300_hours", 0)}</TableCell>
      <TableCell>{cell("night_hours", 0)}</TableCell>
    </TableRow>
  );
}
