import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUnits, upsertUnit, deleteUnit, seedCommonUnits } from "@/lib/units.functions";
import { COMMON_UNITS, findCommonUnit, suggestCommonUnits } from "@/lib/common-units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Ruler, Sparkles, Search, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { normalizeUnit } from "@/lib/common-units";

function SeedButton() {
  const seed = useServerFn(seedCommonUnits);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => seed(),
    onSuccess: (r: any) => {
      toast.success(r?.inserted > 0 ? `Đã thêm ${r.inserted} đơn vị thông dụng` : "Tất cả đơn vị thông dụng đã có sẵn");
      qc.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      <Sparkles className="mr-2 h-4 w-4" /> Thêm ĐV thông dụng
    </Button>
  );
}

export const Route = createFileRoute("/_app/items/units")({ component: UnitsPage });

function UnitsPage() {
  const list = useServerFn(listUnits);
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "hidden">("all");
  const [usage, setUsage] = useState<"all" | "in_use" | "unused">("all");
  const [sort, setSort] = useState<"code" | "usage" | "name">("code");

  const filtered = useMemo(() => {
    const s = normalizeUnit(search);
    const rows = ((units as any[]) ?? []).filter((u) => {
      if (s && !normalizeUnit(u.code).includes(s) && !normalizeUnit(u.name).includes(s)) return false;
      if (status === "active" && !u.is_active) return false;
      if (status === "hidden" && u.is_active) return false;
      if (usage === "in_use" && (u.usage ?? 0) === 0) return false;
      if (usage === "unused" && (u.usage ?? 0) > 0) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "usage") return (b.usage ?? 0) - (a.usage ?? 0) || a.code.localeCompare(b.code);
      if (sort === "name") return a.name.localeCompare(b.name, "vi");
      return a.code.localeCompare(b.code, "vi");
    });
    return rows;
  }, [units, search, status, usage, sort]);

  const total = ((units as any[]) ?? []).length;
  const hasFilter = !!search || status !== "all" || usage !== "all";

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Ruler className="h-6 w-6" /> Đơn vị tính</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh mục đơn vị tính dùng cho hàng hoá &amp; dịch vụ.</p>
        </div>
        <div className="flex gap-2">
          <SeedButton />
          <UnitDialog />
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label className="text-xs">Tìm kiếm</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Mã hoặc tên đơn vị (vd: kg, hop, met)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Xoá tìm kiếm"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Hoạt động</SelectItem>
                <SelectItem value="hidden">Đã ẩn</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sử dụng</Label>
            <Select value={usage} onValueChange={(v) => setUsage(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="in_use">Đang dùng (&gt; 0)</SelectItem>
                <SelectItem value="unused">Chưa dùng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sắp xếp</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="code">Theo mã (A→Z)</SelectItem>
                <SelectItem value="name">Theo tên (A→Z)</SelectItem>
                <SelectItem value="usage">Hay dùng nhất</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setStatus("all"); setUsage("all"); }}
            >
              Xoá lọc
            </Button>
          )}
          <div className="text-xs text-muted-foreground ml-auto pb-2">
            {filtered.length} / {total} đơn vị
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên</th>
              <th className="px-4 py-2 text-left">Ghi chú</th>
              <th className="px-4 py-2 text-right">Đang dùng</th>
              <th className="px-4 py-2">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => (
              <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{u.code}</td>
                <td className="px-4 py-2">{u.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.note || "—"}</td>
                <td className="px-4 py-2 text-right font-mono">{u.usage}</td>
                <td className="px-4 py-2 text-center">
                  {u.is_active ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Hoạt động</Badge> : <Badge variant="outline">Ẩn</Badge>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <UnitDialog unit={u} />
                  <DeleteButton id={u.id} name={u.name} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Chưa có đơn vị tính nào</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitDialog({ unit }: { unit?: any }) {
  const up = useServerFn(upsertUnit);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    code: unit?.code ?? "",
    name: unit?.name ?? "",
    note: unit?.note ?? "",
    is_active: unit?.is_active ?? true,
  }));
  const [nameTouched, setNameTouched] = useState(!!unit);

  const suggestions = useMemo(() => suggestCommonUnits(form.code, 8), [form.code]);

  const onCodeChange = (val: string) => {
    setForm((f) => {
      const next = { ...f, code: val };
      // Auto-fill name from catalog if user hasn't manually edited the name
      if (!nameTouched) {
        const match = findCommonUnit(val);
        if (match) next.name = match.name;
        else if (!f.name) next.name = val;
      }
      return next;
    });
  };

  const applySuggestion = (s: { code: string; name: string; note?: string }) => {
    setForm((f) => ({ ...f, code: s.code, name: s.name, note: s.note ?? f.note }));
    setNameTouched(false);
  };

  const m = useMutation({
    mutationFn: () => up({ data: { id: unit?.id, ...form } as any }),
    onSuccess: () => {
      toast.success(unit ? "Đã cập nhật" : "Đã thêm đơn vị");
      qc.invalidateQueries({ queryKey: ["units"] });
      setOpen(false);
      if (!unit) { setForm({ code: "", name: "", note: "", is_active: true }); setNameTouched(false); }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const datalistId = `common-units-${unit?.id ?? "new"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {unit ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="mr-2 h-4 w-4" />Thêm đơn vị</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{unit ? "Sửa đơn vị tính" : "Thêm đơn vị tính"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <datalist id={datalistId}>
            {COMMON_UNITS.map((u) => (
              <option key={u.code} value={u.code}>{u.name}</option>
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mã *</Label>
              <Input
                list={datalistId}
                value={form.code}
                onChange={(e) => onCodeChange(e.target.value)}
                placeholder="Chọn hoặc nhập: Cái, Hộp, kg..."
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên *</Label>
              <Input
                value={form.name}
                onChange={(e) => { setNameTouched(true); setForm({ ...form, name: e.target.value }); }}
                placeholder="Cái, Hộp, Ki-lô-gam..."
              />
            </div>
          </div>
          {!unit && form.code && !findCommonUnit(form.code) && suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gợi ý đơn vị thông dụng:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted transition"
                  >
                    <span className="font-mono">{s.code}</span>
                    <span className="text-muted-foreground"> · {s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="u-active" />
            <Label htmlFor="u-active" className="text-sm">Hoạt động</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.code.trim() || !form.name.trim() || m.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const del = useServerFn(deleteUnit);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["units"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá đơn vị "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
