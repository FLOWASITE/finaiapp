import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAuditLogs, getAuditFacets } from "@/lib/admin.functions";
import { diffJsonb, formatDiffValue } from "@/lib/audit-diff";
import { RecordAuditHistory } from "@/components/record-audit-history";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/admin/audit")({ component: AuditPage });

type Filter = {
  action?: string;
  table_name?: string;
  from?: string;
  to?: string;
  search?: string;
  record_id?: string;
};

const PAGE_SIZE = 50;
const ANY = "__any__";

function AuditPage() {
  const fn = useServerFn(listAuditLogs);
  const facetsFn = useServerFn(getAuditFacets);
  const [filter, setFilter] = useState<Filter>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any>(null);
  const [historyFor, setHistoryFor] = useState<{ table: string; id: string } | null>(null);

  const { data: facets } = useQuery({
    queryKey: ["audit-facets"],
    queryFn: () => facetsFn({}),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit", filter, page],
    queryFn: () => fn({ data: { ...filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
  });

  const reset = () => {
    setFilter({});
    setPage(0);
  };

  const exportCsv = () => {
    const rows = data?.rows ?? [];
    const header = ["created_at", "actor_email", "action", "table_name", "record_id", "changed_fields"];
    const csv = [
      header.join(","),
      ...rows.map((r: any) => {
        const changed = r.action === "update" ? diffJsonb(r.before, r.after).map((d) => d.key).join("|") : "";
        const vals = { ...r, changed_fields: changed };
        return header.map((h) => JSON.stringify(vals[h] ?? "")).join(",");
      }),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${Date.now()}.csv`;
    a.click();
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filter.table_name ?? ANY}
            onValueChange={(v) => { setFilter({ ...filter, table_name: v === ANY ? undefined : v }); setPage(0); }}
          >
            <SelectTrigger className="w-56"><SelectValue placeholder="Bảng" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tất cả bảng</SelectItem>
              {(facets?.tables ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select
            value={filter.action ?? ANY}
            onValueChange={(v) => { setFilter({ ...filter, action: v === ANY ? undefined : v }); setPage(0); }}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="Hành động" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Tất cả hành động</SelectItem>
              {(facets?.actions ?? []).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="w-40"
            value={filter.from?.slice(0, 10) ?? ""}
            onChange={(e) => { setFilter({ ...filter, from: e.target.value || undefined }); setPage(0); }}
          />
          <Input
            type="date"
            className="w-40"
            value={filter.to?.slice(0, 10) ?? ""}
            onChange={(e) => { setFilter({ ...filter, to: e.target.value ? e.target.value + "T23:59:59" : undefined }); setPage(0); }}
          />
          <Input
            placeholder="Tìm email người dùng"
            className="w-56"
            value={filter.search ?? ""}
            onChange={(e) => { setFilter({ ...filter, search: e.target.value || undefined }); setPage(0); }}
          />
          <Input
            placeholder="Record ID (UUID)"
            className="w-72 font-mono text-xs"
            value={filter.record_id ?? ""}
            onChange={(e) => { setFilter({ ...filter, record_id: e.target.value || undefined }); setPage(0); }}
          />
          <Button size="sm" onClick={() => refetch()}>Lọc</Button>
          <Button size="sm" variant="ghost" onClick={reset}>Xoá lọc</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>Xuất CSV</Button>
          <div className="ml-auto text-xs text-muted-foreground">{total.toLocaleString("vi-VN")} bản ghi</div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="text-left">Người dùng</th>
              <th className="text-left">Hành động</th>
              <th className="text-left">Bảng</th>
              <th className="text-left">Bản ghi</th>
              <th className="text-left">Thay đổi</th>
              <th className="w-32"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && (data?.rows ?? []).length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Không có dữ liệu.</td></tr>
            )}
            {data?.rows.map((r: any) => {
              const changes = r.action === "update" ? diffJsonb(r.before, r.after).length : 0;
              return (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("vi-VN")}</td>
                  <td className="text-xs">{r.actor_email ?? "—"}</td>
                  <td>
                    <Badge variant={r.action === "delete" ? "destructive" : r.action === "update" ? "default" : "secondary"}>
                      {r.action}
                    </Badge>
                  </td>
                  <td className="font-mono text-xs">{r.table_name}</td>
                  <td>
                    {r.record_id ? (
                      <button
                        className="font-mono text-xs underline-offset-2 hover:underline"
                        onClick={() => setHistoryFor({ table: r.table_name, id: r.record_id })}
                      >
                        {r.record_id.slice(0, 8)}…
                      </button>
                    ) : "—"}
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {r.action === "update" ? `${changes} field` : "—"}
                  </td>
                  <td className="pr-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>Chi tiết</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</Button>
        <span className="text-xs text-muted-foreground">Trang {page + 1} / {totalPages}</span>
        <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Sau →</Button>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Chi tiết kiểm toán · <span className="font-mono text-sm">{selected?.table_name}</span>
            </DialogTitle>
          </DialogHeader>
          {selected && <AuditDetail row={selected} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Lịch sử bản ghi · <span className="font-mono text-sm">{historyFor?.table}</span>
            </DialogTitle>
          </DialogHeader>
          {historyFor && <RecordAuditHistory tableName={historyFor.table} recordId={historyFor.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditDetail({ row }: { row: any }) {
  const diff = diffJsonb(row.before, row.after);
  return (
    <Tabs defaultValue="diff">
      <TabsList>
        <TabsTrigger value="diff">Diff ({diff.length})</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="diff">
        {diff.length === 0 ? (
          <div className="text-sm text-muted-foreground">Không có khác biệt.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-1/4 text-left">Trường</th>
                <th className="w-1/3 text-left">Trước</th>
                <th className="w-1/3 text-left">Sau</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((d) => (
                <tr key={d.key} className="border-t border-border/40 align-top">
                  <td className="py-1 pr-2 font-mono">
                    <Badge variant="outline" className="mr-1">{d.kind}</Badge>{d.key}
                  </td>
                  <td className="py-1 pr-2 break-all text-destructive">{formatDiffValue(d.before)}</td>
                  <td className="py-1 break-all text-emerald-600 dark:text-emerald-400">{formatDiffValue(d.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TabsContent>
      <TabsContent value="json">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Trước</div>
            <pre className="max-h-96 overflow-auto rounded bg-muted/30 p-2 text-[11px]">{JSON.stringify(row.before, null, 2)}</pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Sau</div>
            <pre className="max-h-96 overflow-auto rounded bg-muted/30 p-2 text-[11px]">{JSON.stringify(row.after, null, 2)}</pre>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
