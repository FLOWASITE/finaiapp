import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listProducts, upsertProduct, listCategories } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Layers, Warehouse } from "lucide-react";

type ItemType = "goods" | "service" | "combo";
const ITEM_TYPE_LABEL: Record<ItemType, string> = { goods: "Hàng hóa", service: "Dịch vụ", combo: "Combo" };
const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  goods: "bg-blue-50 text-blue-700 border-blue-200",
  service: "bg-emerald-50 text-emerald-700 border-emerald-200",
  combo: "bg-violet-50 text-violet-700 border-violet-200",
};

export const Route = createFileRoute("/_app/items/")({ component: ItemsListPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function ItemsListPage() {
  const list = useServerFn(listProducts);
  const cats = useServerFn(listCategories);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => cats() });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [categoryId, setCategoryId] = useState("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products ?? []).filter((p: any) => {
      if (s && ![p.code, p.name].some((v) => v?.toLowerCase().includes(s))) return false;
      if (typeFilter !== "all" && (p.item_type ?? "goods") !== typeFilter) return false;
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      return true;
    });
  }, [products, search, typeFilter, categoryId]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hàng hoá & Dịch vụ</h1>
          <p className="text-sm text-muted-foreground">
            Danh mục mặt hàng dùng chung cho bán hàng, mua hàng, hoá đơn. Để xem tồn kho & nhập/xuất, vào{" "}
            <Link to="/inventory" className="text-primary hover:underline inline-flex items-center gap-1">
              <Warehouse className="h-3 w-3" /> Kho
            </Link>.
          </p>
        </div>
        <ProductDialog categories={categories ?? []} />
      </div>

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
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Loại</th>
              <th className="px-4 py-2 text-left">Nhóm</th>
              <th className="px-4 py-2 text-left">ĐVT</th>
              <th className="px-4 py-2 text-right">Giá bán</th>
              <th className="px-4 py-2 text-right">VAT %</th>
              <th className="px-4 py-2 text-left">TK DT / GV / Kho</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p: any) => {
              const t = (p.item_type ?? "goods") as ItemType;
              return (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono">{p.code}</td>
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`${ITEM_TYPE_BADGE[t]} text-[10px]`}>{ITEM_TYPE_LABEL[t]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{p.product_categories?.name ?? "—"}</td>
                  <td className="px-4 py-2">{p.unit}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(p.unit_price)}</td>
                  <td className="px-4 py-2 text-right font-mono">{p.vat_rate ?? 0}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">
                    {p.revenue_account || "—"} / {p.cogs_account || "—"} / {p.stock_account || "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t !== "service" ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/inventory/$id" params={{ id: p.id }}>Thẻ kho</Link>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Chưa có mặt hàng</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductDialog({ categories }: { categories: any[] }) {
  const upsert = useServerFn(upsertProduct);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const empty = {
    code: "", name: "", item_type: "goods" as ItemType, unit: "cái", barcode: "",
    unit_cost: 0, unit_price: 0, min_stock: 0, max_stock: 0,
    stock_account: "156", revenue_account: "511", cogs_account: "632",
    vat_rate: 10, category_id: null as string | null, is_active: true, notes: "",
  };
  const [form, setForm] = useState(empty);
  const isService = form.item_type === "service";
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
        <Button><Plus className="mr-2 h-4 w-4" />Thêm mặt hàng</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Thêm hàng hoá / dịch vụ</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại *">
            <Select
              value={form.item_type}
              onValueChange={(v) => {
                const t = v as ItemType;
                setForm({
                  ...form,
                  item_type: t,
                  ...(t === "service" ? { unit_cost: 0, min_stock: 0, max_stock: 0, stock_account: "", cogs_account: "" } : {}),
                });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="goods">📦 Hàng hóa</SelectItem>
                <SelectItem value="service">🛎 Dịch vụ</SelectItem>
                <SelectItem value="combo">🧩 Combo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mã vạch"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
          <Field label="Mã *"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="ĐVT"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={isService ? "lần / giờ" : "cái"} /></Field>
          <Field label="Tên *" full><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Nhóm">
            <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="VAT %"><Input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} /></Field>
          <Field label="Giá bán"><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></Field>
          {!isService && (
            <>
              <Field label="Giá vốn"><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></Field>
              <Field label="Tồn tối thiểu"><Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })} /></Field>
              <Field label="Tồn tối đa"><Input type="number" value={form.max_stock} onChange={(e) => setForm({ ...form, max_stock: Number(e.target.value) })} /></Field>
              <Field label="TK kho"><Input value={form.stock_account} onChange={(e) => setForm({ ...form, stock_account: e.target.value })} /></Field>
              <Field label="TK giá vốn"><Input value={form.cogs_account} onChange={(e) => setForm({ ...form, cogs_account: e.target.value })} /></Field>
            </>
          )}
          <Field label="TK doanh thu"><Input value={form.revenue_account} onChange={(e) => setForm({ ...form, revenue_account: e.target.value })} /></Field>
        </div>
        {isService && (
          <p className="text-xs text-muted-foreground -mt-1">
            <Layers className="inline h-3 w-3 mr-1" />
            Dịch vụ không quản lý tồn kho, không nhập/xuất kho.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.code || !form.name || m.isPending}>Lưu</Button>
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
