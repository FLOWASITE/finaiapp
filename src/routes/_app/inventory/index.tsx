import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listProducts,
  upsertProduct,
  recordMovement,
  getStockReport,
  inventoryDashboard,
  listCategories,
} from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Package, ArrowDownToLine, ArrowUpFromLine,
  Boxes, AlertTriangle, Activity, Wrench, Layers,
} from "lucide-react";

type ItemType = "goods" | "service" | "combo";
const ITEM_TYPE_LABEL: Record<ItemType, string> = { goods: "Hàng hóa", service: "Dịch vụ", combo: "Combo" };
const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  goods: "bg-blue-50 text-blue-700 border-blue-200",
  service: "bg-emerald-50 text-emerald-700 border-emerald-200",
  combo: "bg-violet-50 text-violet-700 border-violet-200",
};

export const Route = createFileRoute("/_app/inventory/")({ component: InventoryPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function InventoryPage() {
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
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [lowOnly, setLowOnly] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (stock ?? []).filter((p: any) => {
      if (s && ![p.code, p.name].some((v) => v?.toLowerCase().includes(s))) return false;
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (typeFilter !== "all" && p.item_type !== typeFilter) return false;
      if (lowOnly && !p.low_stock) return false;
      return true;
    });
  }, [stock, search, categoryId, typeFilter, lowOnly]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý kho</h1>
          <p className="text-sm text-muted-foreground">Tồn kho, giá trị và cảnh báo</p>
        </div>
        <div className="flex gap-2">
          <ProductDialog categories={categories ?? []} />
          <MovementDialog products={products ?? []} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-5">
        <Kpi label="Tổng giá trị tồn" value={fmt(dashboard?.total_value ?? 0)} icon={<Boxes className="h-4 w-4" />} tone="primary" />
        <Kpi label="Hàng hóa" value={String(dashboard?.goods_count ?? 0)} icon={<Package className="h-4 w-4" />} />
        <Kpi label="Dịch vụ" value={String(dashboard?.service_count ?? 0)} icon={<Wrench className="h-4 w-4" />} />
        <Kpi
          label="Sắp hết"
          value={String(dashboard?.low_stock_count ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={dashboard?.low_stock_count ? "danger" : undefined}
        />
        <Kpi
          label="Phát sinh 30 ngày"
          value={String(dashboard?.movements_30d ?? 0)}
          sub={`Nhập ${fmt(dashboard?.in_value_30d ?? 0)} · Xuất ${fmt(dashboard?.out_value_30d ?? 0)}`}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input placeholder="Mã hoặc tên..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="goods">Hàng hóa</SelectItem>
                <SelectItem value="service">Dịch vụ</SelectItem>
                <SelectItem value="combo">Combo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Danh mục</Label>
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

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Loại</th>
              <th className="px-4 py-2 text-left">Danh mục</th>
              <th className="px-4 py-2 text-left">ĐVT</th>
              <th className="px-4 py-2 text-right">Tồn</th>
              <th className="px-4 py-2 text-right">Tối thiểu</th>
              <th className="px-4 py-2 text-right">Đơn giá BQ</th>
              <th className="px-4 py-2 text-right">Giá trị</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const t = (p.item_type ?? "goods") as ItemType;
              const isService = t === "service";
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono">
                    <Link to="/inventory/$id" params={{ id: p.id }} className="text-primary hover:underline">{p.code}</Link>
                  </td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`${ITEM_TYPE_BADGE[t]} text-[10px]`}>{ITEM_TYPE_LABEL[t]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.product_categories?.name ?? "—"}</td>
                  <td className="px-4 py-2">{p.unit}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {isService ? <span className="text-muted-foreground">—</span> : (
                      <>
                        <span className={p.low_stock ? "text-rose-600 font-semibold" : ""}>{fmt(p.on_hand)}</span>
                        {p.low_stock && <Badge variant="outline" className="ml-2 bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Sắp hết</Badge>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">{isService ? "—" : fmt(p.min_stock)}</td>
                  <td className="px-4 py-2 text-right font-mono">{isService ? "—" : fmt(p.unit_cost)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{isService ? "—" : fmt(p.value)}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/inventory/$id" params={{ id: p.id }}>{isService ? "Chi tiết" : "Thẻ kho"}</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Không có mặt hàng</td></tr>
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

function ProductDialog({ categories }: { categories: any[] }) {
  const upsert = useServerFn(upsertProduct);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const empty = {
    code: "", name: "", unit: "cái", barcode: "",
    unit_cost: 0, unit_price: 0, min_stock: 0, max_stock: 0,
    stock_account: "156", revenue_account: "511", cogs_account: "632",
    vat_rate: 10, category_id: null as string | null, is_active: true, notes: "",
  };
  const [form, setForm] = useState(empty);
  const m = useMutation({
    mutationFn: () => upsert({ data: form as any }),
    onSuccess: () => {
      toast.success("Đã lưu mặt hàng");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      setOpen(false); setForm(empty);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="mr-2 h-4 w-4" />Mặt hàng</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Thêm mặt hàng</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã *"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="Mã vạch"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
          <Field label="Tên *" full><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="ĐVT"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          <Field label="Danh mục">
            <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Giá vốn"><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></Field>
          <Field label="Giá bán"><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></Field>
          <Field label="Tồn tối thiểu"><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })} /></Field>
          <Field label="Tồn tối đa"><Input type="number" value={form.max_stock} onChange={(e) => setForm({ ...form, max_stock: Number(e.target.value) })} /></Field>
          <Field label="VAT %"><Input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} /></Field>
          <Field label="TK kho"><Input value={form.stock_account} onChange={(e) => setForm({ ...form, stock_account: e.target.value })} /></Field>
          <Field label="TK doanh thu"><Input value={form.revenue_account} onChange={(e) => setForm({ ...form, revenue_account: e.target.value })} /></Field>
          <Field label="TK giá vốn"><Input value={form.cogs_account} onChange={(e) => setForm({ ...form, cogs_account: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.code || !form.name || m.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ products }: { products: any[] }) {
  const rec = useServerFn(recordMovement);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: "",
    movement_type: "in" as "in" | "out",
    qty: 0,
    unit_cost: 0,
    movement_date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const m = useMutation({
    mutationFn: () => rec({ data: form }),
    onSuccess: () => {
      toast.success("Đã ghi nhận");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          {form.movement_type === "in" ? <ArrowDownToLine className="mr-2 h-4 w-4" /> : <ArrowUpFromLine className="mr-2 h-4 w-4" />}
          Nhập / Xuất kho
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Phiếu nhập / xuất</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Loại">
            <Select value={form.movement_type} onValueChange={(v) => setForm({ ...form, movement_type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Nhập kho</SelectItem>
                <SelectItem value="out">Xuất kho</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mặt hàng">
            <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
              <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} · {p.name} (tồn {fmt(p.on_hand)})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số lượng"><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></Field>
            <Field label="Đơn giá"><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Ngày"><Input type="date" value={form.movement_date} onChange={(e) => setForm({ ...form, movement_date: e.target.value })} /></Field>
          <Field label="Ghi chú"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.product_id || form.qty <= 0 || m.isPending}>Ghi nhận</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
