import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listImpersonationHistory } from "@/lib/superadmin-tenants.functions";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCog, Building2, RefreshCw, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/impersonations")({
  beforeLoad: requireSuperadminGuard,
  component: ImpersonationsPage,
});

function ImpersonationsPage() {
  const listFn = useServerFn(listImpersonationHistory);
  const [actorEmail, setActorEmail] = useState("");
  const [tenantId, setTenantId] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["superadmin-impersonations", actorEmail, tenantId],
    queryFn: () =>
      listFn({
        data: {
          actor_email: actorEmail.trim() || undefined,
          tenant_id: tenantId.trim() || undefined,
          limit: 200,
        },
      }),
    staleTime: 30_000,
  });

  const items = (data as any)?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold">Lịch sử Impersonation</h2>
            <p className="text-xs text-muted-foreground">
              Mọi lần Super-admin đăng nhập với tư cách user khác đều được log ở đây.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Tải lại
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Lọc theo email Super-admin…"
          className="max-w-xs"
          value={actorEmail}
          onChange={(e) => setActorEmail(e.target.value)}
        />
        <Input
          placeholder="Lọc theo tenant ID (UUID)…"
          className="max-w-xs"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        />
        <p className="self-center text-xs text-muted-foreground">{items.length} bản ghi</p>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="text-left">Super-admin</th>
              <th className="text-left">Loại</th>
              <th className="text-left">Tenant</th>
              <th className="text-left">Target</th>
              <th className="text-left">Lý do</th>
              <th className="text-left">Hết hạn</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !items.length && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Chưa có lần impersonate nào.</td></tr>
            )}
            {items.map((r: any) => (
              <tr key={r.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("vi-VN")}
                </td>
                <td className="text-xs">{r.actor_email ?? "—"}</td>
                <td>
                  <Badge variant="outline" className="text-xs">
                    {r.action === "superadmin.impersonate_owner" ? "Owner" : "User"}
                  </Badge>
                </td>
                <td className="text-xs">
                  {r.tenant_id ? (
                    <Link
                      to="/superadmin/tenant/$id"
                      params={{ id: r.tenant_id }}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Building2 className="h-3 w-3" />
                      {r.tenant_name ?? r.tenant_id.slice(0, 8)}
                    </Link>
                  ) : "—"}
                </td>
                <td className="text-xs">
                  {r.target_email ?? r.record_id?.slice(0, 8) ?? "—"}
                </td>
                <td className="text-xs italic max-w-sm truncate" title={r.reason ?? ""}>
                  {r.reason ?? "—"}
                </td>
                <td className="text-xs text-muted-foreground">
                  {r.expires_at ? new Date(r.expires_at).toLocaleString("vi-VN") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
