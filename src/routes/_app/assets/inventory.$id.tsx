import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ScanBarcode, Trash2, ListChecks, AlertTriangle, MapPin, CheckCircle2, X, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getInventoryCount, scanInventoryCode, seedInventoryLines, updateCountLine, deleteCountLine, postInventoryCount,
} from "@/lib/fa-inventory.functions";

export const Route = createFileRoute("/_app/assets/inventory/$id")({ component: InventoryDetailPage });

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Chưa kiểm", color: "bg-muted text-foreground", icon: ListChecks },
  matched: { label: "Khớp", color: "bg-emerald-500/10 text-emerald-600", icon: CheckCircle2 },
  missing: { label: "Thiếu", color: "bg-rose-500/10 text-rose-600", icon: AlertTriangle },
  extra: { label: "Thừa (lạ)", color: "bg-amber-500/10 text-amber-600", icon: AlertTriangle },
  wrong_location: { label: "Sai vị trí", color: "bg-blue-500/10 text-blue-600", icon: MapPin },
  damaged: { label: "Hư hỏng", color: "bg-rose-500/10 text-rose-600", icon: AlertTriangle },
};

function InventoryDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getInventoryCount);
  const scanFn = useServerFn(scanInventoryCode);
  const seedFn = useServerFn(seedInventoryLines);
  const updateFn = useServerFn(updateCountLine);
  const deleteFn = useServerFn(deleteCountLine);
  const postFn = useServerFn(postInventoryCount);

  const data = useQuery({ queryKey: ["fa_inv_count", id], queryFn: () => getFn({ data: { id } }) });
  const [code, setCode] = useState("");
  const [foundLoc, setFoundLoc] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refetch = () => qc.invalidateQueries({ queryKey: ["fa_inv_count", id] });

  const seed = useMutation({
    mutationFn: () => seedFn({ data: { count_id: id } }),
    onSuccess: (r: any) => { toast.success(`Đã nạp ${r.added} tài sản dự kiến`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const scan = useMutation({
    mutationFn: (c: string) => scanFn({ data: { count_id: id, code: c, found_location: foundLoc || null } }),
    onSuccess: (r: any) => {
      const meta = STATUS_META[r.kind] ?? { label: r.kind };
      toast.success(`Quét: ${meta.label}`);
      setCode(""); refetch(); inputRef.current?.focus();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const post = useMutation({
    mutationFn: () => postFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã chốt phiên kiểm kê"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const lines = data.data?.lines ?? [];
    const by = (s: string) => lines.filter((l: any) => l.status === s).length;
    return { total: lines.length, pending: by("pending"), matched: by("matched"), missing: by("missing"), extra: by("extra"), wrong: by("wrong_location") };
  }, [data.data]);

  if (data.isLoading) return <div className="container py-8">Đang tải…</div>;
  const header = data.data?.header;
  const isPosted = header?.status === "posted";

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assets/inventory"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ScanBarcode className="h-6 w-6 text-cyan-500" />{header?.code}</h1>
            <p className="text-sm text-muted-foreground">{header?.count_date} · {header?.location || "Toàn doanh nghiệp"} · <Badge variant="outline">{header?.status}</Badge></p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/assets/inventory/$id/print" params={{ id }}><ListChecks className="h-4 w-4 mr-2" />In biên bản (05-TSCĐ)</Link></Button>
          {!isPosted && <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}><Layers className="h-4 w-4 mr-2" />Nạp DS dự kiến</Button>}
          {!isPosted && <Button onClick={() => post.mutate()} disabled={post.isPending}><CheckCircle2 className="h-4 w-4 mr-2" />Chốt phiên</Button>}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {[
          { k: "total", label: "Tổng dòng", v: stats.total, c: "text-foreground" },
          { k: "matched", label: "Khớp", v: stats.matched, c: "text-emerald-600" },
          { k: "missing", label: "Thiếu", v: stats.missing, c: "text-rose-600" },
          { k: "extra", label: "Thừa", v: stats.extra, c: "text-amber-600" },
          { k: "wrong", label: "Sai vị trí", v: stats.wrong, c: "text-blue-600" },
        ].map(s => (
          <Card key={s.k}><CardContent className="py-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={`text-2xl font-bold ${s.c}`}>{s.v}</div></CardContent></Card>
        ))}
      </div>

      {!isPosted && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Quét barcode hoặc mã tài sản</Label>
                <Input
                  ref={inputRef}
                  autoFocus
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && code.trim()) scan.mutate(code.trim()); }}
                  placeholder="Quét hoặc nhập mã rồi Enter…"
                />
              </div>
              <div className="w-64">
                <Label>Vị trí thực tế (tuỳ chọn)</Label>
                <Input value={foundLoc} onChange={e => setFoundLoc(e.target.value)} placeholder="Phòng kế toán…" />
              </div>
              <Button onClick={() => code.trim() && scan.mutate(code.trim())} disabled={scan.isPending}>Quét</Button>
            </div>
            <p className="text-xs text-muted-foreground">Mẹo: dùng đầu đọc barcode — phần lớn thiết bị tự gửi Enter sau khi quét.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã / Quét</TableHead>
                <TableHead>Tên tài sản</TableHead>
                <TableHead>Vị trí dự kiến</TableHead>
                <TableHead>Vị trí thực tế</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ghi chú</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data.data?.lines ?? []).map((l: any) => {
                const meta = STATUS_META[l.status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <TableRow key={l.id}>
                    <TableCell><code className="text-xs">{l.asset?.code || l.scanned_code || "—"}</code></TableCell>
                    <TableCell>{l.asset?.name || <span className="text-muted-foreground italic">Không khớp tài sản</span>}</TableCell>
                    <TableCell className="text-sm">{l.expected_location || "—"}</TableCell>
                    <TableCell className="text-sm">{l.found_location || "—"}</TableCell>
                    <TableCell><Badge className={meta.color}><Icon className="h-3 w-3 mr-1" />{meta.label}</Badge></TableCell>
                    <TableCell>
                      {!isPosted ? (
                        <Input
                          defaultValue={l.notes ?? ""}
                          onBlur={e => { if (e.target.value !== (l.notes ?? "")) updateFn({ data: { id: l.id, notes: e.target.value } }).then(refetch); }}
                          className="h-8"
                        />
                      ) : l.notes}
                    </TableCell>
                    <TableCell>
                      {!isPosted && (
                        <Button variant="ghost" size="icon" onClick={() => deleteFn({ data: { id: l.id } }).then(() => { toast.success("Đã xoá"); refetch(); })}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(data.data?.lines ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Chưa có dòng. Nhấn "Nạp DS dự kiến" để khởi tạo, hoặc quét trực tiếp.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
