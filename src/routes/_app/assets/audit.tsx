import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listAuditLogs } from "@/lib/admin.functions";
import { diffJsonb, formatDiffValue } from "@/lib/audit-diff";

const FA_TABLES = [
  { v: "fixed_assets", l: "Tài sản cố định" },
  { v: "fa_categories", l: "Nhóm TSCĐ" },
  { v: "fa_depreciation_books", l: "Sổ khấu hao" },
  { v: "fa_asset_books", l: "Khai báo theo sổ" },
  { v: "depreciation_entries", l: "Bút toán khấu hao" },
  { v: "fa_disposals", l: "Thanh lý" },
  { v: "fa_events", l: "Biến động" },
  { v: "fa_reclassifications", l: "Phân loại lại" },
  { v: "fa_inventory_counts", l: "Kiểm kê" },
  { v: "fa_inventory_count_lines", l: "Chi tiết kiểm kê" },
];

export const Route = createFileRoute("/_app/assets/audit")({ component: FaAuditPage });

function FaAuditPage() {
  const fn = useServerFn(listAuditLogs);
  const [table, setTable] = useState<string>("");
  const [selected, setSelected] = useState<any>(null);

  const filterTable = table || undefined;
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["fa-audit", filterTable],
    queryFn: () => fn({ data: { table_name: filterTable, limit: 200, offset: 0 } }),
  });

  // If "all FA" — client filter to FA_TABLES set (server has no IN filter)
  const allFaTables = new Set(FA_TABLES.map(t => t.v));
  const rows = (data?.rows ?? []).filter((r: any) =>
    table ? r.table_name === table : allFaTables.has(r.table_name)
  );

  const actionBadge = (a: string) => {
    const map: Record<string, string> = { INSERT: "default", UPDATE: "secondary", DELETE: "destructive" };
    return <Badge variant={(map[a] as any) ?? "outline"} className="text-xs">{a}</Badge>;
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets"><ArrowLeft className="h-4 w-4 mr-1" />Tài sản</Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Phase F — Kiểm soát TSCĐ
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Nhật ký truy vết TSCĐ</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toàn bộ thay đổi trên tài sản, sổ khấu hao, biến động, thanh lý, kiểm kê đều được ghi lại.
          Thao tác ghi sổ tại các kỳ đã <em>khoá</em>/<em>khoá mềm</em> sẽ bị từ chối.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[260px]">
            <div className="text-xs text-muted-foreground mb-1">Bảng</div>
            <Select value={table || "__all"} onValueChange={(v) => setTable(v === "__all" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tất cả bảng TSCĐ</SelectItem>
                {FA_TABLES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Làm mới
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            Hiển thị {rows.length} bản ghi gần nhất
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Bảng</TableHead>
                <TableHead>Hành động</TableHead>
                <TableHead>Người thực hiện</TableHead>
                <TableHead>Bản ghi</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Đang tải…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Chưa có nhật ký.</TableCell></TableRow>
              )}
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{new Date(r.created_at).toLocaleString("vi-VN")}</TableCell>
                  <TableCell className="font-mono text-xs">{FA_TABLES.find(t=>t.v===r.table_name)?.l ?? r.table_name}</TableCell>
                  <TableCell>{actionBadge(r.action)}</TableCell>
                  <TableCell className="text-xs">{r.actor_email ?? "—"}</TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>Chi tiết</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selected && `${selected.action} · ${FA_TABLES.find(t=>t.v===selected.table_name)?.l ?? selected.table_name}`}
            </DialogTitle>
          </DialogHeader>
          {selected && <AuditDiff before={selected.before} after={selected.after} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditDiff({ before, after }: { before: any; after: any }) {
  const diffs = diffJsonb(before, after);
  if (diffs.length === 0) return <div className="text-sm text-muted-foreground">Không có thay đổi đáng kể.</div>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trường</TableHead>
            <TableHead>Trước</TableHead>
            <TableHead>Sau</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {diffs.map(d => (
            <TableRow key={d.key}>
              <TableCell className="font-mono text-xs">{d.key}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDiffValue(d.before)}</TableCell>
              <TableCell className="text-xs">{formatDiffValue(d.after)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
