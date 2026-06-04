import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useState, useMemo } from "react";
import { listAllTenants } from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/superadmin/")({
  component: TenantsPage,
});

function TenantsPage() {
  const list = useServerFn(listAllTenants);
  const { data, isLoading } = useQuery({ queryKey: ["superadmin-tenants"], queryFn: () => list(),
 ...QUERY_PRESETS.TENANT_STATIC,
});
  const [q, setQ] = useState("");

  const tenants = useMemo(() => {
    const all = data?.tenants ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (t: any) =>
        (t.email ?? "").toLowerCase().includes(s) ||
        (t.company_name ?? "").toLowerCase().includes(s) ||
        (t.tax_id ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  return (
    <div className="space-y-4">
      <Input placeholder="Tìm theo email / công ty / MST…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="text-left">Công ty</th>
              <th className="text-left">MST</th>
              <th className="text-left">Roles</th>
              <th className="text-right pr-2">Mua</th>
              <th className="text-right pr-2">Bán</th>
              <th className="text-right pr-2">Bút toán</th>
              <th className="text-left pl-3">Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !tenants.length && (
              <tr><td colSpan={8} className="px-3 py-4 text-muted-foreground">Không có tenant.</td></tr>
            )}
            {tenants.map((t: any) => (
              <tr key={t.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link to="/superadmin/tenant/$id" params={{ id: t.id }} className="text-primary hover:underline">
                    {t.email ?? t.id.slice(0, 8)}
                  </Link>
                </td>
                <td>{t.company_name ?? "—"}</td>
                <td className="text-xs">{t.tax_id ?? "—"}</td>
                <td className="space-x-1">
                  {t.roles.map((r: string) => (
                    <Badge key={r} variant={r === "superadmin" ? "destructive" : "outline"}>{r}</Badge>
                  ))}
                </td>
                <td className="text-right pr-2">{t.counts.invoices}</td>
                <td className="text-right pr-2">{t.counts.sales}</td>
                <td className="text-right pr-2">{t.counts.journal_entries}</td>
                <td className="text-xs text-muted-foreground pl-3">
                  {t.created_at ? new Date(t.created_at).toLocaleDateString("vi-VN") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
