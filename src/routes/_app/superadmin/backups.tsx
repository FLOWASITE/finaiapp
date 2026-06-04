import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listAllTenants } from "@/lib/superadmin.functions";
import {
  createTenantBackup, listBackups, signBackupUrl, deleteBackup,
} from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Trash2, RefreshCw, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/backups")({
  component: BackupsPage,
});

function BackupsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBackups);
  const createFn = useServerFn(createTenantBackup);
  const signFn = useServerFn(signBackupUrl);
  const delFn = useServerFn(deleteBackup);
  const tenantsFn = useServerFn(listAllTenants);

  const { data: backups } = useQuery({ queryKey: ["backups"], queryFn: () => listFn() });
  const { data: tenants } = useQuery({ queryKey: ["all-tenants"], queryFn: () => tenantsFn() });
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!selectedTenant) { toast.error("Chọn tenant"); return; }
    setBusy(true);
    try {
      const res = await createFn({ data: { tenant_id: selectedTenant } });
      toast.success(`Đã tạo backup #${(res as any).id.slice(0,8)}`);
      qc.invalidateQueries({ queryKey: ["backups"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const download = async (id: string) => {
    try {
      const { url } = await signFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Tạo backup tenant</h2>
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="h-3.5 w-3.5" />
          Chỉ xuất dữ liệu (read-only). Khôi phục từ backup chưa hỗ trợ.
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select value={selectedTenant} onValueChange={setSelectedTenant}>
              <SelectTrigger><SelectValue placeholder="Chọn tenant…" /></SelectTrigger>
              <SelectContent>
                {(((tenants as any)?.tenants ?? []) as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.company_name || t.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={run} disabled={busy}>
            {busy ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
            Tạo backup
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Lịch sử backup</h2>
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["backups"] })}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs"><tr>
              <th className="px-2 py-1.5 text-left">Thời gian</th>
              <th className="px-2 py-1.5 text-left">Tenant</th>
              <th className="px-2 py-1.5 text-left">Trạng thái</th>
              <th className="px-2 py-1.5 text-right">Số bảng</th>
              <th className="px-2 py-1.5 w-24"></th>
            </tr></thead>
            <tbody>
              {(backups as any[] ?? []).map((b: any) => (
                <tr key={b.id} className="border-t">
                  <td className="px-2 py-1.5">{new Date(b.created_at).toLocaleString("vi-VN")}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{b.tenant_id?.slice(0,8)}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant={b.status === "done" ? "default" : b.status === "error" ? "destructive" : "secondary"}>{b.status}</Badge>
                    {b.error && <div className="text-[10px] text-destructive mt-0.5">{b.error}</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right">{b.row_counts ? Object.keys(b.row_counts).length : "-"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      {b.status === "done" && b.file_path && (
                        <Button size="icon" variant="ghost" onClick={() => download(b.id)}><Download className="h-3.5 w-3.5" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={async () => {
                        await delFn({ data: { id: b.id } });
                        qc.invalidateQueries({ queryKey: ["backups"] });
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!backups || (backups as any[]).length === 0) && <tr><td colSpan={5} className="px-2 py-6 text-center text-xs text-muted-foreground">Chưa có backup nào</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
