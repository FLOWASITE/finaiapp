import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getTenantDetail, setSuperadminRole } from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShieldAlert, ShieldOff } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin/tenant/$id")({
  beforeLoad: requireSuperadminGuard,
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getTenantDetail);
  const setSa = useServerFn(setSuperadminRole);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-tenant", id],
    queryFn: () => get({ data: { tenant_id: id } }),
  });

  const isSa = (data?.roles ?? []).some((r: any) => r.role === "superadmin");

  const toggleSa = async () => {
    try {
      await setSa({ data: { user_id: id, enable: !isSa } });
      toast.success(isSa ? "Đã thu hồi Super-admin" : "Đã cấp Super-admin");
      qc.invalidateQueries({ queryKey: ["superadmin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["superadmin-tenants"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Đang tải…</p>;
  if (!data?.profile) return <p className="text-sm">Không tìm thấy tenant.</p>;

  const p = data.profile;

  return (
    <div className="space-y-4">
      <Link to="/superadmin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Danh sách tenants
      </Link>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{p.company_name ?? p.email}</h2>
            <p className="text-xs text-muted-foreground">{p.email} · MST: {p.tax_id ?? "—"}</p>
          </div>
          <Button variant={isSa ? "outline" : "default"} size="sm" onClick={toggleSa}>
            {isSa ? <><ShieldOff className="mr-1.5 h-4 w-4" />Thu hồi Super-admin</>
                  : <><ShieldAlert className="mr-1.5 h-4 w-4" />Cấp Super-admin</>}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.roles.map((r: any) => (
            <Badge key={r.id} variant={r.role === "superadmin" ? "destructive" : "outline"}>{r.role}</Badge>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Khóa kỳ kế toán</h3>
          {!data.locks.length && <p className="text-sm text-muted-foreground">Chưa khóa kỳ nào.</p>}
          <ul className="space-y-1 text-sm">
            {data.locks.map((l: any) => (
              <li key={l.id} className="flex justify-between border-b border-border/40 py-1">
                <span>{l.period_no}/{l.year}</span>
                <span className="text-xs text-muted-foreground">{l.closed_at ? new Date(l.closed_at).toLocaleDateString("vi-VN") : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">50 nhật ký gần nhất</h3>
          {!data.recent_audit.length && <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>}
          <ul className="space-y-1 text-xs max-h-96 overflow-auto">
            {data.recent_audit.map((a: any) => (
              <li key={a.id} className="border-b border-border/40 py-1">
                <span className="font-mono">{a.action}</span> · {a.table_name}
                <span className="ml-2 text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("vi-VN")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
