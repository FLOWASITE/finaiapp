import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listFaCategories, upsertFaCategory, deleteFaCategory, seedFaCategories } from "@/lib/fa-categories.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Sparkles, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/assets/categories")({
  component: Categories,
});

const empty = {
  code: "", name: "", parent_id: null as string | null,
  default_useful_life_years_min: null as number | null,
  default_useful_life_years_max: null as number | null,
  default_useful_life_months: 60,
  default_method: "straight_line" as const,
  default_asset_account: "211",
  default_accumulated_account: "214",
  default_expense_account: "6422",
  asset_kind: "tangible" as "tangible" | "intangible",
  notes: null as string | null,
  is_active: true,
};

function Categories() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFaCategories);
  const upsertFn = useServerFn(upsertFaCategory);
  const deleteFn = useServerFn(deleteFaCategory);
  const seedFn = useServerFn(seedFaCategories);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const q = useQuery({ queryKey: ["fa_categories"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => { toast.success("Đã lưu danh mục"); setOpen(false); setForm(empty); qc.invalidateQueries({ queryKey: ["fa_categories"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["fa_categories"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const seed = useMutation({
    mutationFn: () => seedFn(),
    onSuccess: (r) => { toast.success(`Đã thêm ${r.inserted} danh mục mẫu`); qc.invalidateQueries({ queryKey: ["fa_categories"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-8 space-y-6">
      <div className="rounded-2xl border bg-gradient-to-br from-indigo-600 to-sky-500 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/assets" className="inline-flex items-center gap-1 text-xs/none opacity-80 hover:opacity-100"><ArrowLeft className="h-3 w-3" /> Quay lại TSCĐ</Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Danh mục Tài sản cố định</h1>
            <p className="mt-1 text-sm opacity-90">Khung khấu hao theo TT45/2013/TT-BTC</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => seed.mutate()} disabled={seed.isPending}>
              <Sparkles className="mr-2 h-4 w-4" /> Tạo danh mục mẫu
            </Button>
            <Button variant="secondary" onClick={() => { setForm(empty); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Thêm danh mục
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Mã</th><th>Tên danh mục</th><th>Loại</th>
              <th>Khung (năm)</th><th>Mặc định (tháng)</th>
              <th>TK 211 / 214 / CP</th><th className="text-right pr-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((c: any) => (
              <tr key={c.id} className="border-b">
                <td className="p-3 font-mono">{c.code}</td>
                <td>{c.name}</td>
                <td>
                  <Badge variant={c.asset_kind === "intangible" ? "secondary" : "outline"}>
                    {c.asset_kind === "intangible" ? "Vô hình" : "Hữu hình"}
                  </Badge>
                </td>
                <td className="text-xs text-muted-foreground">
                  {c.default_useful_life_years_min}–{c.default_useful_life_years_max}
                </td>
                <td className="font-mono">{c.default_useful_life_months}</td>
                <td className="font-mono text-xs">{c.default_asset_account} / {c.default_accumulated_account} / {c.default_expense_account}</td>
                <td className="text-right pr-3">
                  <Button size="sm" variant="ghost" onClick={() => { setForm(c); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Xoá "${c.name}"?`) && del.mutate(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </td>
              </tr>
            ))}
            {(q.data ?? []).length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Layers className="h-6 w-6 text-muted-foreground" /></div>
                <p className="mt-3 text-sm text-muted-foreground">Chưa có danh mục. Bấm "Tạo danh mục mẫu" để khởi tạo theo TT45/2013.</p>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? "Sửa" : "Thêm"} danh mục TSCĐ</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Mã *</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Loại</label>
              <Select value={form.asset_kind} onValueChange={(v) => setForm({ ...form, asset_kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tangible">Hữu hình</SelectItem>
                  <SelectItem value="intangible">Vô hình</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tên *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Năm tối thiểu</label>
              <Input type="number" value={form.default_useful_life_years_min ?? ""} onChange={(e) => setForm({ ...form, default_useful_life_years_min: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Năm tối đa</label>
              <Input type="number" value={form.default_useful_life_years_max ?? ""} onChange={(e) => setForm({ ...form, default_useful_life_years_max: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Mặc định (tháng) *</label>
              <Input type="number" value={form.default_useful_life_months ?? 60} onChange={(e) => setForm({ ...form, default_useful_life_months: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Phương pháp</label>
              <Select value={form.default_method} onValueChange={(v) => setForm({ ...form, default_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">Đường thẳng</SelectItem>
                  <SelectItem value="declining_balance">Số dư giảm dần</SelectItem>
                  <SelectItem value="units_of_production">Theo sản lượng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TK Tài sản (211)</label>
              <Input value={form.default_asset_account} onChange={(e) => setForm({ ...form, default_asset_account: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TK Hao mòn (214)</label>
              <Input value={form.default_accumulated_account} onChange={(e) => setForm({ ...form, default_accumulated_account: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TK Chi phí</label>
              <Input value={form.default_expense_account} onChange={(e) => setForm({ ...form, default_expense_account: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
