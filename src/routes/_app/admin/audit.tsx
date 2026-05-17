import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAuditLogs } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/admin/audit")({ component: AuditPage });

function AuditPage() {
  const fn = useServerFn(listAuditLogs);
  const [filter, setFilter] = useState<{ action?: string; table_name?: string; from?: string; to?: string }>({});
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit", filter],
    queryFn: () => fn({ data: { ...filter, limit: 200 } }),
  });
  const [diff, setDiff] = useState<any>(null);

  const exportCsv = () => {
    const rows = data?.rows ?? [];
    const header = ["created_at", "actor_email", "action", "table_name", "record_id"];
    const csv = [header.join(","), ...rows.map((r: any) => header.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-${Date.now()}.csv`; a.click();
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap gap-2">
        <Input placeholder="Hành động (insert/update/delete)" className="w-48" value={filter.action ?? ""} onChange={(e) => setFilter({ ...filter, action: e.target.value || undefined })} />
        <Input placeholder="Bảng" className="w-48" value={filter.table_name ?? ""} onChange={(e) => setFilter({ ...filter, table_name: e.target.value || undefined })} />
        <Input type="date" className="w-40" value={filter.from?.slice(0,10) ?? ""} onChange={(e) => setFilter({ ...filter, from: e.target.value ? e.target.value : undefined })} />
        <Input type="date" className="w-40" value={filter.to?.slice(0,10) ?? ""} onChange={(e) => setFilter({ ...filter, to: e.target.value ? e.target.value + "T23:59:59" : undefined })} />
        <Button size="sm" onClick={() => refetch()}>Lọc</Button>
        <Button size="sm" variant="outline" onClick={exportCsv}>Xuất CSV</Button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2 text-left">Thời gian</th><th className="text-left">Người dùng</th><th className="text-left">Hành động</th><th className="text-left">Bảng</th><th className="text-left">Bản ghi</th><th className="w-20"></th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>}
            {data?.rows.map((r: any) => (
              <tr key={r.id} className="border-t border-border/50">
                <td className="px-3 py-2 text-xs">{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                <td className="text-xs">{r.actor_email ?? "—"}</td>
                <td><Badge variant={r.action === "delete" ? "destructive" : r.action === "update" ? "default" : "secondary"}>{r.action}</Badge></td>
                <td className="font-mono text-xs">{r.table_name}</td>
                <td className="font-mono text-xs">{r.record_id?.slice(0,8) ?? "—"}</td>
                <td><Button size="sm" variant="ghost" onClick={() => setDiff(r)}>Xem</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!diff} onOpenChange={(o) => !o && setDiff(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Chi tiết thay đổi</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Trước</div>
              <pre className="max-h-96 overflow-auto rounded bg-muted/30 p-2 text-[11px]">{JSON.stringify(diff?.before, null, 2)}</pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-muted-foreground">Sau</div>
              <pre className="max-h-96 overflow-auto rounded bg-muted/30 p-2 text-[11px]">{JSON.stringify(diff?.after, null, 2)}</pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
