import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listJobRuns, runSystemJob } from "@/lib/superadmin-extra.functions";
import { listAllTenants } from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/jobs")({
  component: JobsPage,
});

const JOBS = [
  { key: "rebuild_monthly_summary", label: "Tái dựng tổng hợp tháng" },
  { key: "rebuild_account_period_balances", label: "Tái dựng số dư tài khoản theo kỳ" },
  { key: "refresh_report_mvs", label: "Làm mới materialized views" },
  { key: "collect_tenant_usage", label: "Thu thập usage theo tenant" },
];

function JobsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listJobRuns);
  const runFn = useServerFn(runSystemJob);
  const tenantsFn = useServerFn(listAllTenants);

  const { data: runs } = useQuery({ queryKey: ["job-runs"], queryFn: () => listFn(), refetchInterval: 5000 });
  const { data: tenants } = useQuery({ queryKey: ["all-tenants"], queryFn: () => tenantsFn() });

  const [tenantId, setTenantId] = useState<string>("__all__");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (job: string) => {
    setBusy(job);
    try {
      await runFn({ data: { job: job as any, tenant_id: tenantId === "__all__" ? null : tenantId } });
      toast.success("Đã chạy job");
      qc.invalidateQueries({ queryKey: ["job-runs"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Chạy tác vụ thủ công</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Phạm vi:</span>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toàn hệ thống</SelectItem>
              {(tenants?.tenants ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.company_name || t.email || t.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {JOBS.map((j) => (
            <div key={j.key} className="flex items-center justify-between rounded-md border p-2.5">
              <div className="text-sm">{j.label}</div>
              <Button size="sm" disabled={busy === j.key} onClick={() => run(j.key)}>
                {busy === j.key ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                Chạy
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Lịch sử chạy</h2>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs"><tr>
              <th className="px-2 py-1.5 text-left">Thời gian</th>
              <th className="px-2 py-1.5 text-left">Job</th>
              <th className="px-2 py-1.5 text-left">Trạng thái</th>
              <th className="px-2 py-1.5 text-left">Tham số</th>
              <th className="px-2 py-1.5 text-left">Ghi chú</th>
            </tr></thead>
            <tbody>
              {(runs as any[] ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{r.job}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={r.status === "done" ? "default" : r.status === "error" ? "destructive" : "secondary"}>{r.status}</Badge>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{JSON.stringify(r.params)}</td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">
                    {r.error || (r.output ? JSON.stringify(r.output).slice(0, 80) : "")}
                  </td>
                </tr>
              ))}
              {(!runs || (runs as any[]).length === 0) && <tr><td colSpan={5} className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có lần chạy nào</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
