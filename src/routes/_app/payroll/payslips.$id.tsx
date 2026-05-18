import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { getPayslipData } from "@/lib/payroll-phased.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/payroll/payslips/$id")({ component: PayslipsPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function PayslipsPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getPayslipData);
  const { data } = useQuery({
    queryKey: ["payslips", id], queryFn: () => get({ data: { run_id: id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  if (!data?.run) return <div className="p-6">Đang tải…</div>;
  const period = String(data.run.period_month).slice(0, 7);
  const detByEmp = new Map<string, any[]>();
  data.details.forEach((d: any) => {
    const arr = detByEmp.get(d.employee_id) ?? [];
    arr.push(d); detByEmp.set(d.employee_id, arr);
  });

  return (
    <div className="bg-muted/30 min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .payslip { page-break-after: always; box-shadow: none !important; border: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="no-print sticky top-0 z-10 bg-background border-b px-6 py-3 flex items-center justify-between">
        <Link to="/payroll/$id" params={{ id }} className="text-sm text-muted-foreground">← Kỳ lương</Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{data.lines.length} phiếu</span>
          <Button onClick={() => window.print()}>In / Lưu PDF</Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {data.lines.map((l: any) => {
          const e = l.employees;
          const rows = detByEmp.get(l.employee_id) ?? [];
          const insEmp = Number(l.bhxh_emp) + Number(l.bhyt_emp) + Number(l.bhtn_emp);
          return (
            <div key={l.id} className="payslip bg-card border rounded-lg p-6 shadow-sm">
              <div className="flex items-start justify-between border-b pb-3 mb-4">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">{data.tenant?.name ?? ""}</div>
                  {data.tenant?.tax_id && <div className="text-xs text-muted-foreground">MST: {data.tenant.tax_id}</div>}
                  {data.tenant?.address && <div className="text-xs text-muted-foreground">{data.tenant.address}</div>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">PHIẾU LƯƠNG</div>
                  <div className="text-sm text-muted-foreground">Kỳ {period}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <div><span className="text-muted-foreground">Mã NV:</span> <span className="font-mono">{e?.code}</span></div>
                <div><span className="text-muted-foreground">Bộ phận:</span> {e?.departments?.name ?? "—"}</div>
                <div><span className="text-muted-foreground">Họ tên:</span> <span className="font-medium">{e?.full_name}</span></div>
                <div><span className="text-muted-foreground">Chức vụ:</span> {e?.position ?? "—"}</div>
                <div><span className="text-muted-foreground">Phụ thuộc:</span> {e?.dependents ?? 0}</div>
                <div><span className="text-muted-foreground">TK ngân hàng:</span> {e?.bank_account ? `${e.bank_account} (${e.bank_name ?? ""})` : "Tiền mặt"}</div>
              </div>

              <table className="w-full text-sm border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 border-r">Khoản mục</th>
                    <th className="text-right p-2">Số tiền (VND)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((r: any) => r.kind !== "deduction").map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 border-r">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{r.component_code}</span>
                        {r.component_name}
                      </td>
                      <td className="p-2 text-right">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="p-2 border-r">Tổng thu nhập</td>
                    <td className="p-2 text-right">{fmt(l.gross)}</td>
                  </tr>
                  {rows.filter((r: any) => r.kind === "deduction").map((r: any) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 border-r text-destructive">(−) {r.component_name}</td>
                      <td className="p-2 text-right text-destructive">−{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="p-2 border-r">(−) BHXH 8% + BHYT 1.5% + BHTN 1%</td>
                    <td className="p-2 text-right text-destructive">−{fmt(insEmp)}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2 border-r">(−) Thuế TNCN</td>
                    <td className="p-2 text-right text-destructive">−{fmt(l.pit)}</td>
                  </tr>
                  {Number(l.advance) > 0 && (
                    <tr className="border-t">
                      <td className="p-2 border-r">(−) Tạm ứng đã nhận</td>
                      <td className="p-2 text-right text-destructive">−{fmt(l.advance)}</td>
                    </tr>
                  )}
                  <tr className="border-t bg-primary/10 font-semibold">
                    <td className="p-2 border-r">THỰC LĨNH</td>
                    <td className="p-2 text-right text-primary">{fmt(l.net)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-6 mt-8 text-sm text-center">
                <div>
                  <div className="font-medium">Người nhận</div>
                  <div className="text-xs text-muted-foreground italic">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                </div>
                <div>
                  <div className="font-medium">Kế toán trưởng</div>
                  <div className="text-xs text-muted-foreground italic">(Ký, ghi rõ họ tên)</div>
                  <div className="h-16"></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
