import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { listProducts, recordMovement, getStockReport, inventoryDashboard, listCategories, previewStockVoucherNo, createStockVoucher } from "@/lib/inventory.functions";
import { listWarehouses } from "@/lib/warehouses.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Package, ArrowDownToLine, ArrowUpFromLine, Boxes, AlertTriangle, Activity, Wrench, ExternalLink, RefreshCw } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

export const Route = createFileRoute("/_app/inventory/")({ component: StockPage });


function StockPage() {
  const list = useServerFn(listProducts);
  const report = useServerFn(getStockReport);
  const dash = useServerFn(inventoryDashboard);
  const cats = useServerFn(listCategories);

  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list() });
  const { data: stock } = useQuery({ queryKey: ["stock-report"], queryFn: () => report() });
  const { data: dashboard } = useQuery({ queryKey: ["inv-dashboard"], queryFn: () => dash() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => cats() });

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (stock ?? []).filter((p: any) => {
      // Tồn kho chỉ hiện hàng hoá (không hiện dịch vụ)
      if ((p.item_type ?? "goods") === "service") return false;
      if (s && ![p.code, p.name].some((v) => v?.toLowerCase().includes(s))) return false;
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (lowOnly && !p.low_stock) return false;
      return true;
    });
  }, [stock, search, categoryId, lowOnly]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tồn kho</h1>
          <p className="text-sm text-muted-foreground">
            Giá trị tồn, cảnh báo sắp hết. Khai báo mặt hàng tại{" "}
            <Link to="/items" className="text-primary hover:underline inline-flex items-center gap-1">
              Hàng hoá & Dịch vụ <ExternalLink className="h-3 w-3" />
            </Link>.
          </p>
        </div>
        <div className="flex gap-2">
          <StockVoucherDialog type="in" products={products ?? []} />
          <StockVoucherDialog type="out" products={products ?? []} />
        </div>

      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Kpi label="Tổng giá trị tồn" value={fmt(dashboard?.total_value ?? 0)} icon={<Boxes className="h-4 w-4" />} tone="primary" />
        <Kpi label="Hàng hóa" value={String(dashboard?.goods_count ?? 0)} icon={<Package className="h-4 w-4" />} />
        <Kpi label="Dịch vụ" value={String(dashboard?.service_count ?? 0)} icon={<Wrench className="h-4 w-4" />} />
        <Kpi label="Sắp hết" value={String(dashboard?.low_stock_count ?? 0)} icon={<AlertTriangle className="h-4 w-4" />} tone={dashboard?.low_stock_count ? "danger" : undefined} />
        <Kpi label="Phát sinh 30 ngày" value={String(dashboard?.movements_30d ?? 0)} sub={`Nhập ${fmt(dashboard?.in_value_30d ?? 0)} · Xuất ${fmt(dashboard?.out_value_30d ?? 0)}`} icon={<Activity className="h-4 w-4" />} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input placeholder="Mã hoặc tên..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhóm</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(categories ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch checked={lowOnly} onCheckedChange={setLowOnly} id="low-only" />
            <Label htmlFor="low-only" className="text-sm">Chỉ hiện sắp hết</Label>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Nhóm</th>
              <th className="px-4 py-2 text-left">ĐVT</th>
              <th className="px-4 py-2 text-right">Tồn</th>
              <th className="px-4 py-2 text-right">Tối thiểu</th>
              <th className="px-4 py-2 text-right">Đơn giá BQ</th>
              <th className="px-4 py-2 text-right">Giá trị</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">
                  <Link to="/inventory/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.code}</Link>
                </td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{p.product_categories?.name ?? "—"}</td>
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2 text-right font-mono">
                  <span className={p.low_stock ? "text-rose-600 font-semibold" : ""}>{fmt(p.on_hand)}</span>
                  {p.low_stock && <Badge variant="outline" className="ml-2 bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Sắp hết</Badge>}
                </td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(p.min_stock)}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(p.unit_cost)}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(p.value)}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/inventory/$id" params={{ id: p.id }}>Thẻ kho</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Không có hàng tồn</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon?: React.ReactNode; tone?: "primary" | "danger" }) {
  const cls = tone === "danger" ? "text-rose-600" : tone === "primary" ? "text-primary" : "";
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${cls}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const COUNTER_ACCOUNTS_IN = [
  { code: "1111", name: "1111 — Tiền mặt VND" },
  { code: "1121", name: "1121 — Tiền gửi ngân hàng VND" },
  { code: "331", name: "331 — Phải trả người bán (mua chịu)" },
  { code: "154", name: "154 — Chi phí SXKD dở dang (nhập thành phẩm)" },
  { code: "711", name: "711 — Thu nhập khác" },
];
const COUNTER_ACCOUNTS_OUT = [
  { code: "632", name: "632 — Giá vốn hàng bán" },
  { code: "621", name: "621 — Chi phí NVL trực tiếp" },
  { code: "627", name: "627 — Chi phí sản xuất chung" },
  { code: "641", name: "641 — Chi phí bán hàng" },
  { code: "642", name: "642 — Chi phí QLDN" },
  { code: "154", name: "154 — Xuất cho sản xuất" },
];

function StockVoucherDialog({ type, products }: { type: "in" | "out"; products: any[] }) {
  const create = useServerFn(createStockVoucher);
  const listWh = useServerFn(listWarehouses);
  const previewNo = useServerFn(previewStockVoucherNo);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses-active"],
    queryFn: () => listWh(),
  });
  const activeWhs = useMemo(
    () => ((warehouses as any[]) ?? []).filter((w) => w.is_active),
    [warehouses],
  );
  const defaultWh = useMemo(
    () => activeWhs.find((w) => w.is_default) ?? activeWhs[0],
    [activeWhs],
  );

  const counterOptions = type === "in" ? COUNTER_ACCOUNTS_IN : COUNTER_ACCOUNTS_OUT;
  const goodsOnly = useMemo(
    () => products.filter((p: any) => (p.item_type ?? "goods") !== "service"),
    [products],
  );
  const productMap = useMemo(
    () => new Map(goodsOnly.map((p: any) => [p.id, p])),
    [goodsOnly],
  );

  type Line = { product_id: string; qty: number; unit_cost: number; note: string };
  const emptyLine = (): Line => ({ product_id: "", qty: 0, unit_cost: 0, note: "" });

  const [form, setForm] = useState({
    voucher_no: "",
    warehouse_id: "",
    movement_date: new Date().toISOString().slice(0, 10),
    counter_account: counterOptions[0].code,
    reason: "",
    lines: [emptyLine()] as Line[],
  });

  useEffect(() => {
    if (!open) return;
    if (!form.warehouse_id && defaultWh) {
      setForm((f) => ({ ...f, warehouse_id: defaultWh.id }));
    }
    if (!form.voucher_no) {
      previewNo({ data: { type, movement_date: form.movement_date } })
        .then((r) => setForm((f) => (f.voucher_no ? f : { ...f, voucher_no: r.code })))
        .catch(() => {});
    }
  }, [open, defaultWh, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (i: number, patch: Partial<Line>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const removeLine = (i: number) =>
    setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));

  const productIdsKey = form.lines.map((l) => l.product_id).join("|");
  useEffect(() => {
    if (type !== "out") return;
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l) => {
        if (!l.product_id) return l;
        const p = productMap.get(l.product_id);
        return p ? { ...l, unit_cost: Number(p.unit_cost ?? 0) } : l;
      }),
    }));
  }, [type, productMap, productIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    let qty = 0, value = 0;
    for (const l of form.lines) {
      qty += Number(l.qty || 0);
      value += Number(l.qty || 0) * Number(l.unit_cost || 0);
    }
    return { qty, value: +value.toFixed(2) };
  }, [form.lines]);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!form.warehouse_id) errs.push("Chọn kho");
    const valid = form.lines.filter((l) => l.product_id && l.qty > 0);
    if (valid.length === 0) errs.push("Thêm ít nhất 1 dòng hợp lệ");
    for (const l of form.lines) {
      if (!l.product_id) continue;
      const p = productMap.get(l.product_id);
      if (!p) continue;
      if (type === "in" && !(l.unit_cost > 0)) errs.push(`Đơn giá nhập cho ${p.code} phải > 0`);
      if (type === "out" && Number(l.qty) > Number(p.on_hand ?? 0)) errs.push(`Vượt tồn ${p.code} (còn ${fmt(p.on_hand)})`);
    }
    return errs;
  }, [form, productMap, type]);
  const canSave = errors.length === 0;

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          voucher_type: type,
          voucher_date: form.movement_date,
          voucher_no: form.voucher_no || undefined,
          warehouse_id: form.warehouse_id || null,
          counter_account: form.counter_account,
          reason: form.reason || undefined,
          lines: form.lines
            .filter((l) => l.product_id && l.qty > 0)
            .map((l) => ({
              product_id: l.product_id,
              qty: Number(l.qty),
              unit_cost: Number(l.unit_cost || 0),
              note: l.note || undefined,
            })),
        } as any,
      }),
    onSuccess: (r: any) => {
      toast.success(`Đã lưu ${type === "in" ? "Phiếu nhập" : "Phiếu xuất"} ${r.voucher_no} (${r.line_count} dòng)`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      qc.invalidateQueries({ queryKey: ["vouchers-list"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      setOpen(false);
      setForm((f) => ({ ...f, voucher_no: "", reason: "", lines: [emptyLine()] }));
    },
    onError: (e: any) => toast.error(e.message),
  });

  const title = type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho";
  const Icon = type === "in" ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={type === "in" ? "default" : "outline"}>
          <Icon className="mr-2 h-4 w-4" />{title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />{title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Số phiếu">
              <div className="flex gap-1">
                <Input value={form.voucher_no}
                  onChange={(e) => setForm({ ...form, voucher_no: e.target.value })}
                  placeholder={type === "in" ? "PN..." : "PX..."} className="font-mono" />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => previewNo({ data: { type, movement_date: form.movement_date } })
                    .then((r) => setForm((f) => ({ ...f, voucher_no: r.code }))).catch(() => {})}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <Field label="Ngày">
              <Input type="date" value={form.movement_date}
                onChange={(e) => setForm({ ...form, movement_date: e.target.value })} />
            </Field>
            <Field label="Kho">
              <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}
                disabled={activeWhs.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={activeWhs.length === 0 ? "Chưa có kho" : "Chọn kho..."} />
                </SelectTrigger>
                <SelectContent>
                  {activeWhs.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.code} · {w.name}{w.is_default ? " ★" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={type === "in" ? "TK đối ứng (Có)" : "TK đối ứng (Nợ)"}>
              <Select value={form.counter_account} onValueChange={(v) => setForm({ ...form, counter_account: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {counterOptions.map((o) => (
                    <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="rounded-md border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
              <span>Chi tiết các dòng ({form.lines.length})</span>
              <Button size="sm" variant="ghost" onClick={addLine}>+ Thêm dòng</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-[40%]">Mặt hàng</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">{type === "in" ? "Đơn giá" : "Giá BQ"}</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((l, i) => {
                    const amount = Number(l.qty || 0) * Number(l.unit_cost || 0);
                    return (
                      <tr key={i} className="border-t align-top">
                        <td className="px-3 py-2">
                          <Select value={l.product_id} onValueChange={(v) => updateLine(i, { product_id: v })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Chọn mặt hàng..." /></SelectTrigger>
                            <SelectContent>
                              {goodsOnly.map((pp: any) => (
                                <SelectItem key={pp.id} value={pp.id}>
                                  {pp.code} · {pp.name} (tồn {fmt(pp.on_hand)} {pp.unit})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input className="mt-1 h-8 text-xs" placeholder="Ghi chú dòng..."
                            value={l.note} onChange={(e) => updateLine(i, { note: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} value={l.qty || ""} className="text-right h-9"
                            onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} value={l.unit_cost || ""} className="text-right h-9"
                            disabled={type === "out"}
                            onChange={(e) => updateLine(i, { unit_cost: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => removeLine(i)}
                            disabled={form.lines.length === 1}>×</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-3 py-2 text-right" colSpan={3}>Tổng cộng</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(totals.value)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <Field label="Lý do / Diễn giải chung">
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>

          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground">Bút toán tự sinh (mỗi dòng 1 cặp Nợ/Có)</div>
            {form.lines.filter((l) => l.product_id && l.qty > 0).map((l, i) => {
              const p = productMap.get(l.product_id);
              const amt = Number(l.qty) * Number(l.unit_cost || 0);
              const stock = p?.stock_account || "156";
              return (
                <div key={i}>
                  {type === "in"
                    ? <>Nợ <span className="font-mono">{stock}</span> / Có <span className="font-mono">{form.counter_account}</span>: <span className="font-mono">{fmt(amt)}</span> — {p?.code}</>
                    : <>Nợ <span className="font-mono">{form.counter_account}</span> / Có <span className="font-mono">{stock}</span>: <span className="font-mono">{fmt(amt)}</span> — {p?.code}</>}
                </div>
              );
            })}
          </div>

          {errors.length > 0 && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">
              {errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!canSave || m.isPending}>
            {m.isPending ? "Đang lưu..." : `Lưu ${title}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
