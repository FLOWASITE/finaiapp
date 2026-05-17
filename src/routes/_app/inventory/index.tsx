import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Package, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { listProducts, upsertProduct, recordMovement, getStockReport } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory/")({
  component: InventoryPage,
});

function InventoryPage() {
  const list = useServerFn(listProducts);
  const report = useServerFn(getStockReport);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list({}) });
  const { data: stock } = useQuery({ queryKey: ["stock-report"], queryFn: () => report({}) });

  const totalValue = (stock ?? []).reduce((s, r) => s + r.value, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý kho</h1>
          <p className="text-sm text-muted-foreground">Danh mục hàng hóa & Nhập–Xuất–Tồn</p>
        </div>
        <div className="flex gap-2">
          <ProductDialog />
          <MovementDialog products={products ?? []} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3 flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span className="font-semibold">Bảng tổng hợp Nhập–Xuất–Tồn</span>
          <span className="ml-auto text-sm text-muted-foreground">
            Tổng giá trị tồn: <span className="font-mono font-semibold text-foreground">{totalValue.toLocaleString("vi-VN")} đ</span>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">ĐVT</th>
              <th className="px-4 py-2 text-right">Tồn</th>
              <th className="px-4 py-2 text-right">Đơn giá BQ</th>
              <th className="px-4 py-2 text-right">Giá trị</th>
            </tr>
          </thead>
          <tbody>
            {(stock ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{p.code}</td>
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.unit}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(p.on_hand).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(p.unit_cost).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right font-mono">{p.value.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
            {(stock ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Chưa có mặt hàng nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductDialog() {
  const upsert = useServerFn(upsertProduct);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", unit: "cái",
    unit_cost: 0, unit_price: 0,
    stock_account: "156", revenue_account: "511", cogs_account: "632", vat_rate: 10,
  });
  const m = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => {
      toast.success("Đã lưu mặt hàng");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      setOpen(false);
      setForm({ code: "", name: "", unit: "cái", unit_cost: 0, unit_price: 0, stock_account: "156", revenue_account: "511", cogs_account: "632", vat_rate: 10 });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Plus className="mr-2 h-4 w-4" />Thêm mặt hàng</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Thêm mặt hàng</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Mã</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><Label>ĐVT</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div className="col-span-2"><Label>Tên</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Giá vốn ban đầu</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} /></div>
          <div><Label>Giá bán</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></div>
          <div><Label>TK kho</Label><Input value={form.stock_account} onChange={(e) => setForm({ ...form, stock_account: e.target.value })} /></div>
          <div><Label>TK doanh thu</Label><Input value={form.revenue_account} onChange={(e) => setForm({ ...form, revenue_account: e.target.value })} /></div>
          <div><Label>TK giá vốn</Label><Input value={form.cogs_account} onChange={(e) => setForm({ ...form, cogs_account: e.target.value })} /></div>
          <div><Label>VAT %</Label><Input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} /></div>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Lưu</Button>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ products }: { products: Array<{ id: string; code: string; name: string; unit_cost: number }> }) {
  const move = useServerFn(recordMovement);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: "", movement_type: "in" as "in" | "out", qty: 1, unit_cost: 0,
    movement_date: new Date().toISOString().slice(0, 10), note: "",
  });
  const m = useMutation({
    mutationFn: () => move({ data: form }),
    onSuccess: () => {
      toast.success("Đã ghi nhận");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><ArrowDownToLine className="mr-2 h-4 w-4" />Nhập / Xuất kho</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Phiếu nhập / xuất kho</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Loại</Label>
            <Select value={form.movement_type} onValueChange={(v: "in" | "out") => setForm({ ...form, movement_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Nhập kho</SelectItem>
                <SelectItem value="out">Xuất kho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mặt hàng</Label>
            <Select value={form.product_id} onValueChange={(v) => {
              const p = products.find((x) => x.id === v);
              setForm({ ...form, product_id: v, unit_cost: p?.unit_cost ?? 0 });
            }}>
              <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
              <SelectContent>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Số lượng</Label><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></div>
            <div><Label>Đơn giá</Label><Input type="number" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} disabled={form.movement_type === "out"} /></div>
          </div>
          <div><Label>Ngày</Label><Input type="date" value={form.movement_date} onChange={(e) => setForm({ ...form, movement_date: e.target.value })} /></div>
          <div><Label>Ghi chú</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <Button className="w-full" onClick={() => m.mutate()} disabled={!form.product_id || m.isPending}>
            {form.movement_type === "in" ? <ArrowDownToLine className="mr-2 h-4 w-4" /> : <ArrowUpFromLine className="mr-2 h-4 w-4" />}
            Ghi nhận
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
