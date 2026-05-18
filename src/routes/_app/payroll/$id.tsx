import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { getPayrollRun, postPayrollRun } from "@/lib/payroll.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payroll/$id")({ component: RunDetail });

const fmt = (n: number) => Number(n).toLocaleString("vi-VN");

function RunDetail() {
  const { id } = Route.useParams();
  const get = useServerFn(getPayrollRun);
  const post = useServerFn(postPayrollRun);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["payroll", id], queryFn: () => get({ data: { id } }),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const mutate = useMutation({
    mutationFn: () => post({ data: { id } }),
    onSuccess: () => { toast.success("Đã ghi sổ kỳ lương"); qc.invalidateQueries({ queryKey: ["payroll", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!data?.run) return <div className="p-6">Đang tải…</div>;
  const r = data.run;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/payroll" className="text-sm text-muted-foreground">← Quay lại</Link>
          <h1 className="text-2xl font-semibold mt-1">Kỳ lương {r.period_month}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge>
          {r.status === "draft" && (
            <Button onClick={() => mutate.mutate()} disabled={mutate.isPending}>Ghi sổ</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Tổng gross</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_gross)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">BH NV đóng</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_insurance_emp)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">TNCN</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(r.total_pit)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Thực nhận</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold text-primary">{fmt(r.total_net)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Chi tiết</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Mã</TableHead><TableHead>Họ tên</TableHead>
              <TableHead className="text-right">Lương CB</TableHead>
              <TableHead className="text-right">Phụ cấp</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">BH</TableHead>
              <TableHead className="text-right">TNCN</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.lines.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono">{l.employees?.code}</TableCell>
                  <TableCell>{l.employees?.full_name}</TableCell>
                  <TableCell className="text-right">{fmt(l.base_salary)}</TableCell>
                  <TableCell className="text-right">{fmt(l.allowance)}</TableCell>
                  <TableCell className="text-right">{fmt(l.gross)}</TableCell>
                  <TableCell className="text-right">{fmt(Number(l.bhxh_emp) + Number(l.bhyt_emp) + Number(l.bhtn_emp))}</TableCell>
                  <TableCell className="text-right">{fmt(l.pit)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(l.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
