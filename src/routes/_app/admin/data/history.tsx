import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listDataHistory,
  downloadFinExport,
  deleteFinExport,
} from "@/lib/data-management.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data/history")({ component: HistoryPage });

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString("vi-VN") : "—";
}
function kb(n?: number | null) {
  return n ? `${(n / 1024).toFixed(0)} KB` : "—";
}

function HistoryPage() {
  const fn = useServerFn(listDataHistory);
  const dlFn = useServerFn(downloadFinExport);
  const delFn = useServerFn(deleteFinExport);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["data-history"], queryFn: () => fn() });

  const dlMut = useMutation({
    mutationFn: (id: string) => dlFn({ data: { id } }),
    onSuccess: (r) => window.open(r.url, "_blank"),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      qc.invalidateQueries({ queryKey: ["data-history"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return <div className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</div>;
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold mb-2">Bản xuất Fin ({data.backups.length})</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Năm</th>
                <th className="text-left p-2">Loại</th>
                <th className="text-left p-2">Thời gian</th>
                <th className="text-right p-2">Kích thước</th>
                <th className="text-left p-2">Trạng thái</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b: any) => (
                <tr key={b.id} className="border-t">
                  <td className="p-2 tabular-nums">{b.fiscal_year ?? "—"}</td>
                  <td className="p-2"><Badge variant="outline">{b.kind}</Badge></td>
                  <td className="p-2">{fmt(b.created_at)}</td>
                  <td className="p-2 text-right tabular-nums">{kb(b.file_size_bytes)}</td>
                  <td className="p-2">{b.status}</td>
                  <td className="p-2 text-right space-x-1">
                    {b.file_path && (
                      <Button size="sm" variant="ghost" onClick={() => dlMut.mutate(b.id)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Xoá bản xuất này?")) delMut.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {data.backups.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Chưa có bản xuất</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Lượt nhập Fin ({data.imports.length})</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Thời gian</th>
                <th className="text-left p-2">Trạng thái</th>
                <th className="text-left p-2">Năm</th>
                <th className="text-left p-2">Chế độ</th>
                <th className="text-right p-2">Đã nhập</th>
                <th className="text-right p-2">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {data.imports.map((it: any) => {
                const meta = Array.isArray(it.classification) ? it.classification[0] : {};
                const dec = it.decisions ?? {};
                const insTotal = Object.values(dec.inserted ?? {}).reduce<number>((s: number, n: any) => s + (Number(n) || 0), 0);
                const errCount = (dec.errors ?? []).length;
                return (
                  <tr key={it.id} className="border-t">
                    <td className="p-2">{fmt(it.created_at)}</td>
                    <td className="p-2"><Badge variant={it.status === "done" ? "secondary" : "outline"}>{it.status}</Badge></td>
                    <td className="p-2 tabular-nums">{meta?.fiscal_year ?? "—"}</td>
                    <td className="p-2">{meta?.mode ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{insTotal}</td>
                    <td className="p-2 text-right tabular-nums">{errCount}</td>
                  </tr>
                );
              })}
              {data.imports.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Chưa có lượt nhập</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Kết chuyển số dư ({data.carry.length})</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Thời gian</th>
                <th className="text-left p-2">Người thực hiện</th>
                <th className="text-left p-2">Từ năm → đến năm</th>
                <th className="text-right p-2">Số dòng</th>
              </tr>
            </thead>
            <tbody>
              {data.carry.map((c: any) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{fmt(c.created_at)}</td>
                  <td className="p-2">{c.actor_email ?? "—"}</td>
                  <td className="p-2 tabular-nums">{c.after?.from} → {c.after?.to}</td>
                  <td className="p-2 text-right tabular-nums">{c.after?.rows ?? 0}</td>
                </tr>
              ))}
              {data.carry.length === 0 && (
                <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Chưa có kết chuyển</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
