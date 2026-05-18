import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { listProducts, upsertProduct, listCategories } from "@/lib/inventory.functions";
import { listUnits } from "@/lib/units.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NumberInput } from "@/components/ui/number-input";
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { toast } from "sonner";
import { Plus, Layers, Warehouse, Loader2, Info, Package, Wrench, Boxes } from "lucide-react";

type ItemType = "goods" | "service" | "combo";
const ITEM_TYPE_LABEL: Record<ItemType, string> = { goods: "Hàng hóa", service: "Dịch vụ", combo: "Combo" };
const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  goods: "bg-blue-50 text-blue-700 border-blue-200",
  service: "bg-emerald-50 text-emerald-700 border-emerald-200",
  combo: "bg-violet-50 text-violet-700 border-violet-200",
};
const CODE_PREFIX: Record<ItemType, string> = { goods: "HH", service: "DV", combo: "CB" };
const UNIT_SUGGESTIONS = ["cái", "hộp", "thùng", "kg", "lít", "mét", "bộ", "chiếc", "giờ", "lần", "gói"];

export const Route = createFileRoute("/_app/items/")({ component: ItemsListPage });

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

function ItemsListPage() {
  const list = useServerFn(listProducts);
  const cats = useServerFn(listCategories);
  const unitsFn = useServerFn(listUnits);
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => list(),
 ...QUERY_PRESETS.REFERENCE,
});
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => cats(),
 ...QUERY_PRESETS.REFERENCE,
});
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => unitsFn(),
 ...QUERY_PRESETS.REFERENCE,
});

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
        <ProductDialog categories={categories ?? []} existingCodes={(products ?? []).map((p: any) => p.code)} units={(units as any[]) ?? []} />
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

// ---------------- Dialog ----------------

const emptyForm = () => ({
  code: "",
  name: "",
  item_type: "goods" as ItemType,
  unit: "cái",
  barcode: "",
  unit_cost: 0,
  unit_price: 0,
  min_stock: 0,
  max_stock: 0,
  stock_account: "156",
  revenue_account: "511",
  cogs_account: "632",
  vat_rate: 10,
  category_id: null as string | null,
  is_active: true,
  notes: "",
});

function ProductDialog({ categories, existingCodes, units }: { categories: any[]; existingCodes: string[]; units: any[] }) {
  const upsert = useServerFn(upsertProduct);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState(emptyForm);
  const codeRef = useRef<HTMLInputElement>(null);

  const isService = form.item_type === "service";
  const hasStock = form.item_type !== "service";

  const codeDuplicate = useMemo(
    () => form.code.trim().length > 0 && existingCodes.includes(form.code.trim()),
    [form.code, existingCodes]
  );

  const reset = () => {
    setForm(emptyForm());
    setTab("general");
  };

  const m = useMutation({
    mutationFn: (keepOpen: boolean) =>
      upsert({ data: form as any }).then(() => keepOpen),
    onSuccess: (keepOpen) => {
      toast.success("Đã lưu mặt hàng");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      if (keepOpen) {
        reset();
        setTimeout(() => codeRef.current?.focus(), 50);
      } else {
        setOpen(false);
        reset();
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canSave) m.mutate(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  const canSave =
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    !codeDuplicate &&
    !m.isPending;

  const setType = (t: ItemType) => {
    setForm((f) => ({
      ...f,
      item_type: t,
      unit: t === "service" ? "lần" : f.unit === "lần" || f.unit === "giờ" ? "cái" : f.unit,
      ...(t === "service" ? { unit_cost: 0, min_stock: 0, max_stock: 0 } : {}),
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="add"><Plus className="mr-2 h-4 w-4" />Thêm mặt hàng</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-lg">Thêm hàng hoá / dịch vụ</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4">
          {/* Segmented type selector */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg mb-4">
            {(["goods", "service", "combo"] as ItemType[]).map((t) => {
              const Icon = t === "goods" ? Package : t === "service" ? Wrench : Boxes;
              const active = form.item_type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    active
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {ITEM_TYPE_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="px-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="general">Thông tin chung</TabsTrigger>
            <TabsTrigger value="pricing">Giá & Thuế</TabsTrigger>
            <TabsTrigger value="accounting">{hasStock ? "Kho & Kế toán" : "Kế toán"}</TabsTrigger>
          </TabsList>

          {/* TAB 1 — General */}
          <TabsContent value="general" className="space-y-3 pt-4 min-h-[280px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã *" hint={codeDuplicate ? "Mã đã tồn tại" : undefined} error={codeDuplicate}>
                <AutoCodeInput
                  inputRef={codeRef}
                  value={form.code}
                  onChange={(v: string) => setForm((f) => ({ ...f, code: v }))}
                  entity={
                    form.item_type === "goods"
                      ? "product_goods"
                      : form.item_type === "service"
                      ? "product_service"
                      : "product_combo"
                  }
                  placeholder={`${CODE_PREFIX[form.item_type]}0001`}
                  error={codeDuplicate}
                  autoFillOnMount
                />
              </Field>
              <Field label="Tên *">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="ĐVT mặc định *">
                <UnitPicker
                  value={form.unit}
                  onChange={(v) => setForm({ ...form, unit: v })}
                  units={units}
                  isService={isService}
                />
              </Field>
              <Field label="Nhóm">
                <Select value={form.category_id ?? ""} onValueChange={(v) => setForm({ ...form, category_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {hasStock && (
                <Field label="Mã vạch" full>
                  <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Quét hoặc nhập mã vạch" />
                </Field>
              )}
              <Field label="Ghi chú" full>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Thông tin bổ sung..."
                />
              </Field>
            </div>
          </TabsContent>

          {/* TAB 2 — Pricing */}
          <TabsContent value="pricing" className="space-y-3 pt-4 min-h-[280px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giá bán (VND)">
                <NumberInput value={form.unit_price} onChange={(v) => setForm({ ...form, unit_price: v })} />
              </Field>
              {hasStock && (
                <Field label="Giá vốn (VND)">
                  <NumberInput value={form.unit_cost} onChange={(v) => setForm({ ...form, unit_cost: v })} />
                </Field>
              )}
              <Field label="Thuế suất GTGT">
                <Select
                  value={String(form.vat_rate)}
                  onValueChange={(v) => setForm({ ...form, vat_rate: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% / KCT</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="8">8%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                <div>
                  <div className="text-sm font-medium">Đang kinh doanh</div>
                  <div className="text-xs text-muted-foreground">Mặt hàng hiển thị trong bán hàng / mua hàng</div>
                </div>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
          </TabsContent>

          {/* TAB 3 — Inventory & Accounting */}
          <TabsContent value="accounting" className="space-y-4 pt-4 min-h-[280px]">
            {isService ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <Layers className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <div className="font-medium text-emerald-900">Dịch vụ không quản lý tồn kho</div>
                  <div className="text-emerald-700 text-xs mt-0.5">
                    Dịch vụ không có nhập/xuất kho, chỉ ghi nhận doanh thu khi xuất hoá đơn.
                  </div>
                </div>
              </div>
            ) : (
              <Section title="Định mức tồn kho">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tồn tối thiểu">
                    <NumberInput value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} />
                  </Field>
                  <Field label="Tồn tối đa">
                    <NumberInput value={form.max_stock} onChange={(v) => setForm({ ...form, max_stock: v })} />
                  </Field>
                </div>
              </Section>
            )}

            <Section title="Tài khoản kế toán">
              <div className="grid grid-cols-2 gap-3">
                <Field label="TK doanh thu" hint="TT133/TT200: 511x">
                  <Input value={form.revenue_account} onChange={(e) => setForm({ ...form, revenue_account: e.target.value })} placeholder="511" />
                </Field>
                {hasStock && (
                  <>
                    <Field label="TK kho" hint="156 - Hàng hoá / 155 - Thành phẩm">
                      <Input value={form.stock_account} onChange={(e) => setForm({ ...form, stock_account: e.target.value })} placeholder="156" />
                    </Field>
                    <Field label="TK giá vốn" hint="632 - Giá vốn hàng bán">
                      <Input value={form.cogs_account} onChange={(e) => setForm({ ...form, cogs_account: e.target.value })} placeholder="632" />
                    </Field>
                  </>
                )}
              </div>
            </Section>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t mt-4 flex-row sm:justify-between gap-2">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            <kbd className="px-1 py-0.5 rounded bg-muted text-[10px]">Ctrl+S</kbd> để lưu
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button variant="secondary" onClick={() => m.mutate(true)} disabled={!canSave}>
              Lưu & thêm mới
            </Button>
            <Button onClick={() => m.mutate(false)} disabled={!canSave}>
              {m.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang lưu…</> : "Lưu"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  full,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  hint?: string;
  error?: boolean;
}) {
  return (
    <TooltipProvider>
      <div className={`space-y-1 ${full ? "col-span-2" : ""}`}>
        <Label className="text-xs flex items-center gap-1">
          {label}
          {hint && !error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          )}
        </Label>
        {children}
        {hint && error && <div className="text-[11px] text-destructive">{hint}</div>}
      </div>
    </TooltipProvider>
  );
}

function UnitPicker({
  value,
  onChange,
  units,
  isService,
}: {
  value: string;
  onChange: (v: string) => void;
  units: any[];
  isService: boolean;
}) {
  const active = (units ?? []).filter((u: any) => u.is_active);
  const merged = useMemo(() => {
    const map = new Map<string, { code: string; name: string; usage?: number }>();
    for (const u of active) map.set(u.code.toLowerCase(), { code: u.code, name: u.name, usage: u.usage ?? 0 });
    for (const s of UNIT_SUGGESTIONS) if (!map.has(s.toLowerCase())) map.set(s.toLowerCase(), { code: s, name: s });
    if (value && !map.has(value.toLowerCase())) map.set(value.toLowerCase(), { code: value, name: value });
    return Array.from(map.values()).sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0) || a.code.localeCompare(b.code));
  }, [active, value]);
  const [custom, setCustom] = useState(false);
  const inCatalog = useMemo(
    () => merged.some((m) => m.code.toLowerCase() === value.toLowerCase()),
    [merged, value]
  );

  if (custom) {
    return (
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isService ? "lần / giờ" : "cái"}
          autoFocus
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setCustom(false)}>Chọn</Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Select value={inCatalog ? value : ""} onValueChange={onChange}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Chọn đơn vị..." /></SelectTrigger>
        <SelectContent>
          {merged.map((u) => (
            <SelectItem key={u.code} value={u.code}>
              <span className="font-mono">{u.code}</span>
              {u.name !== u.code && <span className="text-muted-foreground"> · {u.name}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" onClick={() => setCustom(true)} title="Nhập thủ công">+</Button>
    </div>
  );
}
