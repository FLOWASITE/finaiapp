import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMovements, getMovement } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowDownToLine, ArrowUpFromLine, Eye, Warehouse } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

interface Props {
  type: "in" | "out";
}

export function VoucherListPage({ type }: Props) {
  const list = useServerFn(listMovements);
  const whs = useServerFn(listWarehouses);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState<"all" | "posted" | "unposted">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: warehouses } = useQuery({ queryKey: ["warehouses"], queryFn: () => whs() });
  const { data: rows, isLoading } = useQuery({
    queryKey: ["movements-list", type, from, to, warehouseId, status],
    queryFn: () => list({ data: { type, from, to, warehouse_id: warehouseId, status } }),
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows ?? [];
    return (rows ?? []).filter((r: any) =>
      [r.note, r.products?.code, r.products?.name, r.warehouses?.name]
        .some((v) => v?.toLowerCase().includes(s))
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const arr = filtered as any[];
    return {
      count: arr.length,
      qty: arr.reduce((s, r) => s + Number(r.qty || 0), 0),
      value: arr.reduce((s, r) => s + Number(r.qty || 0) * Number(r.unit_cost || 0), 0),
    };
  }, [filtered]);

  const title = type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho";
  const Icon = type === "in" ? ArrowDownToLine : ArrowUpFromLine;
  const accent = type === "in" ? "text-emerald-600" : "text-orange-600";

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Icon className={`h-6 w-6 ${accent}`} /> {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Lọc theo ngày, kho, trạng thái ghi sổ. Tạo phiếu mới tại{" "}
            <Link to="/inventory" className="text-primary hover:underline">Tồn kho</Link>.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kho</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả kho</SelectItem>
                <SelectItem value="none">(Chưa gán kho)</SelectItem>
                {(warehouses?.warehouses ?? warehouses ?? []).map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="posted">Đã ghi sổ</SelectItem>
                <SelectItem value="unposted">Chưa ghi sổ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Tìm số phiếu / mã / tên hàng</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PN202605/00001, SP001..." />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Số phiếu" value={String(totals.count)} />
        <Kpi label="Tổng số lượng" value={fmt(totals.qty)} />
        <Kpi label="Tổng giá trị" value={fmt(totals.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Ngày</th>
                  <th className="p-3">Số phiếu</th>
                  <th className="p-3">Mặt hàng</th>
                  <th className="p-3">Kho</th>
                  <th className="p-3 text-right">SL</th>
                  <th className="p-3 text-right">Đơn giá</th>
                  <th className="p-3 text-right">Thành tiền</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Đang tải…</td></tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Không có phiếu phù hợp</td></tr>
                )}
                {filtered.map((r: any) => {
                  const voucherNo = (r.note ?? "").split(" — ")[0] || "—";
                  const value = Number(r.qty || 0) * Number(r.unit_cost || 0);
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{r.movement_date}</td>
                      <td className="p-3 font-mono text-xs">{voucherNo}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.products?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.products?.code}</div>
                      </td>
                      <td className="p-3">
                        {r.warehouses ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Warehouse className="h-3 w-3" /> {r.warehouses.name}
                          </span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-right">{fmt(r.qty)} {r.products?.unit}</td>
                      <td className="p-3 text-right">{fmt(r.unit_cost)}</td>
                      <td className="p-3 text-right font-medium">{fmt(value)}</td>
                      <td className="p-3">
                        {r.ref_id
                          ? <Badge variant="secondary">Đã ghi sổ</Badge>
                          : <Badge variant="outline">Chưa ghi sổ</Badge>}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <VoucherDetailDialog id={openId} onClose={() => setOpenId(null)} type={type} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function VoucherDetailDialog({ id, onClose, type }: { id: string | null; onClose: () => void; type: "in" | "out" }) {
  const get = useServerFn(getMovement);
  const { data, isLoading } = useQuery({
    queryKey: ["movement", id],
    queryFn: () => get({ data: { id: id! } }),
    enabled: !!id,
  });

  const mv = data?.movement as any;
  const voucherNo = (mv?.note ?? "").split(" — ")[0] || "—";
  const noteRest = (mv?.note ?? "").split(" — ").slice(1).join(" — ");

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Chi tiết {type === "in" ? "phiếu nhập" : "phiếu xuất"} kho
          </DialogTitle>
        </DialogHeader>
        {isLoading || !mv ? (
          <div className="py-8 text-center text-muted-foreground">Đang tải…</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Số phiếu" value={voucherNo} mono />
              <Field label="Ngày" value={mv.movement_date} />
              <Field label="Mặt hàng" value={`${mv.products?.code ?? ""} — ${mv.products?.name ?? ""}`} />
              <Field label="Kho" value={mv.warehouses ? `${mv.warehouses.code} — ${mv.warehouses.name}` : "—"} />
              <Field label="Số lượng" value={`${fmt(mv.qty)} ${mv.products?.unit ?? ""}`} />
              <Field label="Đơn giá" value={fmt(mv.unit_cost)} />
              <Field label="Thành tiền" value={fmt(Number(mv.qty) * Number(mv.unit_cost))} />
              <Field label="Trạng thái" value={mv.ref_id ? "Đã ghi sổ" : "Chưa ghi sổ"} />
            </div>
            {noteRest && <Field label="Diễn giải" value={noteRest} />}

            {data?.journal_entry && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Bút toán</div>
                <div className="rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="p-2">TK</th>
                        <th className="p-2 text-right">Nợ</th>
                        <th className="p-2 text-right">Có</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.journal_lines.map((l: any) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-2 font-mono">{l.account_code}</td>
                          <td className="p-2 text-right">{Number(l.debit) ? fmt(l.debit) : ""}</td>
                          <td className="p-2 text-right">{Number(l.credit) ? fmt(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono" : ""}>{value}</div>
    </div>
  );
}
