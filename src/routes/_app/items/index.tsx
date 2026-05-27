import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listProducts,
  upsertProduct,
  listCategories,
  deleteProduct,
  mergeProducts,
  getProductUsage,
} from "@/lib/inventory.functions";
import { listUnits } from "@/lib/units.functions";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NumberInput } from "@/components/ui/number-input";
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { toast } from "sonner";
import {
  Layers,
  Warehouse,
  Loader2,
  Info,
  Package,
  Wrench,
  Boxes,
  MoreHorizontal,
  Eye,
  Pencil,
  Copy as CopyIcon,
  Trash2,
  GitMerge,
  ShoppingCart,
  Tag,
  AlertTriangle,
} from "lucide-react";

type ItemType = "goods" | "service" | "combo";
const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  goods: "Hàng hóa",
  service: "Dịch vụ",
  combo: "Combo",
};
const ITEM_TYPE_BADGE: Record<ItemType, string> = {
  goods: "bg-blue-50 text-blue-700 border-blue-200",
  service: "bg-emerald-50 text-emerald-700 border-emerald-200",
  combo: "bg-violet-50 text-violet-700 border-violet-200",
};
const CODE_PREFIX: Record<ItemType, string> = { goods: "HH", service: "DV", combo: "CB" };
const UNIT_SUGGESTIONS = [
  "cái",
  "hộp",
  "thùng",
  "kg",
  "lít",
  "mét",
  "bộ",
  "chiếc",
  "giờ",
  "lần",
  "gói",
];

export const Route = createFileRoute("/_app/items/")({ component: ItemsListPage });

const fmt = (n: number | null | undefined) => Number(n || 0).toLocaleString("vi-VN");

function ItemsListPage() {
  const list = useServerFn(listProducts);
  const cats = useServerFn(listCategories);
  const unitsFn = useServerFn(listUnits);
  const del = useServerFn(deleteProduct);
  const merge = useServerFn(mergeProducts);
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => list(),
    ...QUERY_PRESETS.REFERENCE,
  });
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => cats(),
    ...QUERY_PRESETS.REFERENCE,
  });
  const { data: units } = useQuery({
    queryKey: ["units"],
    queryFn: () => unitsFn(),
    ...QUERY_PRESETS.REFERENCE,
  });

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ItemType>("all");
  const [categoryId, setCategoryId] = useState("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "sell" | "buy" | "both">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (products ?? []).filter((p: any) => {
      if (s && ![p.code, p.name, p.barcode].some((v) => v?.toLowerCase().includes(s))) return false;
      if (typeFilter !== "all" && (p.item_type ?? "goods") !== typeFilter) return false;
      if (categoryId !== "all" && p.category_id !== categoryId) return false;
      if (usageFilter === "sell" && !p.can_be_sold) return false;
      if (usageFilter === "buy" && !p.can_be_purchased) return false;
      if (usageFilter === "both" && !(p.can_be_sold && p.can_be_purchased)) return false;
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;
      return true;
    });
  }, [products, search, typeFilter, categoryId, usageFilter, statusFilter]);

  // selection for merge
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(filtered.map((p: any) => p.id)) : new Set());

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [duplicating, setDuplicating] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá mặt hàng");
      qc.invalidateQueries({ queryKey: ["products"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mergeMut = useMutation({
    mutationFn: (vars: { target_id: string; source_ids: string[] }) => merge({ data: vars }),
    onSuccess: (res: any) => {
      toast.success(`Đã gộp ${res.merged} mặt hàng (${res.references_moved} tham chiếu)`);
      qc.invalidateQueries({ queryKey: ["products"] });
      setSelected(new Set());
      setMergeOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedCount = selected.size;
  const allChecked = filtered.length > 0 && filtered.every((p: any) => selected.has(p.id));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hàng hóa & Dịch vụ</h1>
          <p className="text-sm text-muted-foreground">
            Khai báo hàng hoá, dịch vụ dùng chung cho bán hàng, mua hàng, hoá đơn. Để xem tồn kho &
            nhập/xuất, vào{" "}
            <Link
              to="/inventory"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              <Warehouse className="h-3 w-3" /> Kho
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount >= 2 && (
            <Button variant="secondary" onClick={() => setMergeOpen(true)}>
              <GitMerge className="mr-2 h-4 w-4" />
              Gộp {selectedCount} mặt hàng
            </Button>
          )}
          <AddNew label="Thêm mặt hàng" onClick={() => setCreateOpen(true)} />
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Tìm kiếm</Label>
            <Input
              placeholder="Mã, tên hoặc mã vạch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Loại</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(categories ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Dùng cho</Label>
            <Select value={usageFilter} onValueChange={(v) => setUsageFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="sell">Có thể bán</SelectItem>
                <SelectItem value="buy">Có thể mua</SelectItem>
                <SelectItem value="both">Cả bán & mua</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label className="text-xs">Trạng thái</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Đang kinh doanh</SelectItem>
                <SelectItem value="inactive">Ngừng</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 w-8">
                  <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} />
                </th>
                <th className="px-3 py-2 text-left">Mã</th>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-left">Loại / Dùng cho</th>
                <th className="px-3 py-2 text-left">Nhóm</th>
                <th className="px-3 py-2 text-left">ĐVT</th>
                <th className="px-3 py-2 text-left">Mã vạch</th>
                <th className="px-3 py-2 text-right">Giá bán</th>
                <th className="px-3 py-2 text-right">Giá vốn</th>
                <th className="px-3 py-2 text-right">Tồn</th>
                <th className="px-3 py-2 text-right">VAT</th>
                <th className="px-3 py-2 text-left">TK DT / CP / Kho</th>
                <th className="px-3 py-2 text-left">Trạng thái</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const t = (p.item_type ?? "goods") as ItemType;
                const isService = t === "service";
                const checked = selected.has(p.id);
                const lowStock =
                  !isService && p.is_active && Number(p.on_hand) < Number(p.min_stock ?? 0);
                return (
                  <tr
                    key={p.id}
                    className={`border-t border-border hover:bg-muted/30 ${checked ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <Checkbox checked={checked} onCheckedChange={() => toggleOne(p.id)} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                    <td className="px-3 py-2 font-medium">
                      <button
                        onClick={() => setViewing(p)}
                        className="text-left hover:text-primary hover:underline"
                      >
                        {p.name}
                      </button>
                      {p.notes ? (
                        <div className="text-[11px] text-muted-foreground line-clamp-1">
                          {p.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className={`${ITEM_TYPE_BADGE[t]} text-[10px]`}>
                          {ITEM_TYPE_LABEL[t]}
                        </Badge>
                        {p.can_be_sold && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            Bán
                          </Badge>
                        )}
                        {p.can_be_purchased && (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                          >
                            <ShoppingCart className="h-2.5 w-2.5 mr-0.5" />
                            Mua
                          </Badge>
                        )}
                        {!p.can_be_sold && !p.can_be_purchased && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.product_categories?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2">{p.unit}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                      {p.barcode || "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(p.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {isService ? "—" : fmt(p.unit_cost)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {isService ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={lowStock ? "text-amber-600 font-semibold" : ""}>
                          {fmt(p.on_hand)}
                          {lowStock && (
                            <AlertTriangle
                              className="inline-block ml-1 h-3 w-3"
                              aria-label="Dưới định mức"
                            />
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{p.vat_rate ?? 0}%</td>
                    <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {p.can_be_sold ? p.revenue_account || "—" : "—"}
                      {" / "}
                      {isService
                        ? p.can_be_purchased
                          ? p.expense_account || "—"
                          : "—"
                        : p.cogs_account || "—"}
                      {" / "}
                      {isService ? "—" : p.stock_account || "—"}
                    </td>
                    <td className="px-3 py-2">
                      {p.is_active ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-green-50 text-green-700 border-green-200"
                        >
                          Đang KD
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-gray-50 text-gray-600 border-gray-200"
                        >
                          Ngừng
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setViewing(p)}>
                            <Eye className="mr-2 h-4 w-4" /> Xem
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditing(p)}>
                            <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDuplicating(p)}>
                            <CopyIcon className="mr-2 h-4 w-4" /> Nhân bản
                          </DropdownMenuItem>
                          {!isService && (
                            <DropdownMenuItem asChild>
                              <Link to="/inventory/$id" params={{ id: p.id }}>
                                <Warehouse className="mr-2 h-4 w-4" /> Thẻ kho
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelected(new Set([p.id]));
                              setMergeOpen(true);
                            }}
                          >
                            <GitMerge className="mr-2 h-4 w-4" /> Gộp với...
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Xoá
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-muted-foreground">
                    Chưa có mặt hàng phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {filtered.length} mặt hàng
              {selectedCount > 0 ? ` · Đã chọn ${selectedCount}` : ""}
            </span>
            {selectedCount > 0 && (
              <button onClick={() => setSelected(new Set())} className="hover:text-foreground">
                Bỏ chọn
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create / Edit / Duplicate */}
      <ProductDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        categories={categories ?? []}
        existingCodes={(products ?? []).map((p: any) => p.code)}
        units={(units as any[]) ?? []}
      />
      {editing && (
        <ProductDialog
          mode="edit"
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
          categories={categories ?? []}
          existingCodes={(products ?? [])
            .filter((p: any) => p.id !== editing.id)
            .map((p: any) => p.code)}
          units={(units as any[]) ?? []}
        />
      )}
      {duplicating && (
        <ProductDialog
          mode="duplicate"
          open={!!duplicating}
          onOpenChange={(o) => !o && setDuplicating(null)}
          initial={duplicating}
          categories={categories ?? []}
          existingCodes={(products ?? []).map((p: any) => p.code)}
          units={(units as any[]) ?? []}
        />
      )}

      {/* View */}
      {viewing && (
        <ViewProductDialog
          product={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá mặt hàng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá <span className="font-mono">{deleting?.code}</span> —{" "}
              <span className="font-medium">{deleting?.name}</span>? Nếu mặt hàng đã được dùng trong
              chứng từ, hệ thống sẽ chặn xoá; hãy dùng chức năng <strong>Gộp</strong> thay thế.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleting) delMut.mutate(deleting.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge */}
      {mergeOpen && (
        <MergeDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          selectedIds={Array.from(selected)}
          products={products ?? []}
          isPending={mergeMut.isPending}
          onConfirm={(target_id, source_ids) => mergeMut.mutate({ target_id, source_ids })}
        />
      )}
    </div>
  );
}

// ---------------- View dialog ----------------

function ViewProductDialog({
  product,
  onClose,
  onEdit,
}: {
  product: any;
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = (product.item_type ?? "goods") as ItemType;
  const isService = t === "service";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-base text-muted-foreground">{product.code}</span>
            <span>{product.name}</span>
            <Badge variant="outline" className={`${ITEM_TYPE_BADGE[t]} text-[10px] ml-1`}>
              {ITEM_TYPE_LABEL[t]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {product.product_categories?.name ?? "Chưa thuộc nhóm"} · ĐVT: {product.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <InfoRow label="Giá bán" value={fmt(product.unit_price) + " ₫"} />
          {!isService && <InfoRow label="Giá vốn" value={fmt(product.unit_cost) + " ₫"} />}
          <InfoRow label="VAT" value={(product.vat_rate ?? 0) + "%"} />
          {!isService && (
            <InfoRow label="Tồn kho hiện tại" value={fmt(product.on_hand) + " " + product.unit} />
          )}
          {!isService && (
            <InfoRow
              label="Tồn min / max"
              value={`${fmt(product.min_stock)} / ${fmt(product.max_stock)}`}
            />
          )}
          <InfoRow label="Mã vạch" value={product.barcode || "—"} />
          <InfoRow label="Trạng thái" value={product.is_active ? "Đang kinh doanh" : "Ngừng"} />
          <InfoRow
            label="Dùng cho"
            value={
              [product.can_be_sold && "Bán", product.can_be_purchased && "Mua"]
                .filter(Boolean)
                .join(" + ") || "—"
            }
          />
          <InfoRow
            label="TK doanh thu"
            value={product.can_be_sold ? product.revenue_account || "—" : "—"}
          />
          {isService ? (
            <InfoRow
              label="TK chi phí"
              value={product.can_be_purchased ? product.expense_account || "—" : "—"}
            />
          ) : (
            <>
              <InfoRow label="TK kho" value={product.stock_account || "—"} />
              <InfoRow label="TK giá vốn" value={product.cogs_account || "—"} />
            </>
          )}
          {product.notes && (
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Ghi chú</div>
              <div className="rounded-md bg-muted/40 p-2 text-sm whitespace-pre-wrap">
                {product.notes}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {!isService && (
            <Button variant="outline" asChild>
              <Link to="/inventory/$id" params={{ id: product.id }}>
                <Warehouse className="mr-2 h-4 w-4" /> Thẻ kho
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" /> Chỉnh sửa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground uppercase">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

// ---------------- Merge dialog ----------------

function MergeDialog({
  open,
  onOpenChange,
  selectedIds,
  products,
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  selectedIds: string[];
  products: any[];
  isPending: boolean;
  onConfirm: (target_id: string, source_ids: string[]) => void;
}) {
  const usageFn = useServerFn(getProductUsage);
  const selected = useMemo(
    () => products.filter((p) => selectedIds.includes(p.id)),
    [products, selectedIds],
  );
  const [targetId, setTargetId] = useState<string>(selectedIds[0] ?? "");
  const [extraTargetSearch, setExtraTargetSearch] = useState("");

  // If only 1 row was selected, allow picking a target from full list
  const needsExternalTarget = selected.length < 2;
  const candidates = useMemo(() => {
    if (!needsExternalTarget) return selected;
    const s = extraTargetSearch.trim().toLowerCase();
    return products
      .filter((p) => !selectedIds.includes(p.id))
      .filter((p) => (!s ? true : [p.code, p.name].some((v) => v?.toLowerCase().includes(s))))
      .slice(0, 50);
  }, [needsExternalTarget, selected, products, selectedIds, extraTargetSearch]);

  const target = products.find((p) => p.id === targetId);
  const sources = selected.filter((p) => p.id !== targetId);

  // Compute total usage of sources for warning
  const { data: sourceUsage } = useQuery({
    queryKey: ["product-usage-batch", sources.map((s) => s.id).join(",")],
    queryFn: async () => {
      const res = await Promise.all(sources.map((s) => usageFn({ data: { id: s.id } })));
      return res.reduce((sum, r) => sum + r.total, 0);
    },
    enabled: sources.length > 0,
  });

  const canConfirm = !!targetId && sources.length > 0 && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" /> Gộp mặt hàng
          </DialogTitle>
          <DialogDescription>
            Chọn một mặt hàng <strong>đích</strong>. Mọi tham chiếu (chứng từ, tồn kho) từ các mặt
            hàng còn lại sẽ được chuyển sang mặt hàng đích, và các mặt hàng nguồn sẽ bị xoá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Mặt hàng đích (giữ lại)</Label>
            {needsExternalTarget && (
              <Input
                className="mt-1 mb-2"
                placeholder="Tìm mặt hàng đích..."
                value={extraTargetSearch}
                onChange={(e) => setExtraTargetSearch(e.target.value)}
              />
            )}
            <div className="max-h-48 overflow-y-auto rounded-md border border-border">
              {[...selected, ...(needsExternalTarget ? candidates : [])].map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-border last:border-0 ${
                    targetId === p.id ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="merge-target"
                    checked={targetId === p.id}
                    onChange={() => setTargetId(p.id)}
                  />
                  <span className="font-mono text-xs text-muted-foreground w-20">{p.code}</span>
                  <span className="flex-1">{p.name}</span>
                  <span className="text-xs text-muted-foreground">{p.unit}</span>
                </label>
              ))}
              {selected.length === 0 && candidates.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Không có mặt hàng
                </div>
              )}
            </div>
          </div>

          {sources.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-medium text-amber-900">
                    Sẽ xoá {sources.length} mặt hàng nguồn:
                  </div>
                  <ul className="text-amber-800 text-xs list-disc ml-4">
                    {sources.map((s) => (
                      <li key={s.id}>
                        <span className="font-mono">{s.code}</span> — {s.name}
                      </li>
                    ))}
                  </ul>
                  {typeof sourceUsage === "number" && (
                    <div className="text-amber-800 text-xs pt-1">
                      {sourceUsage > 0
                        ? `${sourceUsage} tham chiếu sẽ được chuyển về mặt hàng đích.`
                        : "Không có tham chiếu nào — chỉ xoá các mặt hàng nguồn."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {target && sources.length === 0 && needsExternalTarget && (
            <div className="text-xs text-muted-foreground">Cần chọn ít nhất 2 mặt hàng để gộp.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() =>
              onConfirm(
                targetId,
                sources.map((s) => s.id),
              )
            }
            disabled={!canConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang gộp…
              </>
            ) : (
              <>Gộp vào {target?.code ?? ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Create / Edit / Duplicate Dialog ----------------

type DialogMode = "create" | "edit" | "duplicate";

const emptyForm = () => ({
  id: undefined as string | undefined,
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
  expense_account: "642",
  vat_rate: 10,
  category_id: null as string | null,
  is_active: true,
  can_be_sold: true,
  can_be_purchased: true,
  notes: "",
});

function fromProduct(p: any, mode: DialogMode) {
  return {
    id: mode === "edit" ? p.id : undefined,
    code: mode === "duplicate" ? "" : (p.code ?? ""),
    name: mode === "duplicate" ? `${p.name} (sao chép)` : (p.name ?? ""),
    item_type: (p.item_type ?? "goods") as ItemType,
    unit: p.unit ?? "cái",
    barcode: mode === "duplicate" ? "" : (p.barcode ?? ""),
    unit_cost: Number(p.unit_cost ?? 0),
    unit_price: Number(p.unit_price ?? 0),
    min_stock: Number(p.min_stock ?? 0),
    max_stock: Number(p.max_stock ?? 0),
    stock_account: p.stock_account ?? "156",
    revenue_account: p.revenue_account ?? "511",
    cogs_account: p.cogs_account ?? "632",
    expense_account: p.expense_account ?? "642",
    vat_rate: Number(p.vat_rate ?? 10),
    category_id: p.category_id ?? null,
    is_active: p.is_active ?? true,
    can_be_sold: p.can_be_sold ?? true,
    can_be_purchased: p.can_be_purchased ?? true,
    notes: p.notes ?? "",
  };
}

function ProductDialog({
  categories,
  existingCodes,
  units,
  mode = "create",
  open,
  onOpenChange,
  initial,
}: {
  categories: any[];
  existingCodes: string[];
  units: any[];
  mode?: DialogMode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  initial?: any;
}) {
  const upsert = useServerFn(upsertProduct);
  const qc = useQueryClient();

  const controlled = open !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlled ? open : internalOpen;
  const setOpen = (o: boolean) => {
    if (controlled) onOpenChange?.(o);
    else setInternalOpen(o);
  };

  const [tab, setTab] = useState("general");
  const [form, setForm] = useState(() => (initial ? fromProduct(initial, mode) : emptyForm()));
  const codeRef = useRef<HTMLInputElement>(null);

  // reset form when opening
  useEffect(() => {
    if (isOpen) {
      setForm(initial ? fromProduct(initial, mode) : emptyForm());
      setTab("general");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const isService = form.item_type === "service";
  const hasStock = form.item_type !== "service";

  const codeDuplicate = useMemo(
    () => form.code.trim().length > 0 && existingCodes.includes(form.code.trim()),
    [form.code, existingCodes],
  );

  const m = useMutation({
    mutationFn: (keepOpen: boolean) => upsert({ data: form as any }).then(() => keepOpen),
    onSuccess: (keepOpen) => {
      toast.success(mode === "edit" ? "Đã cập nhật mặt hàng" : "Đã lưu mặt hàng");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-report"] });
      qc.invalidateQueries({ queryKey: ["inv-dashboard"] });
      if (keepOpen && mode === "create") {
        setForm(emptyForm());
        setTab("general");
        setTimeout(() => codeRef.current?.focus(), 50);
      } else {
        setOpen(false);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canSave =
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    !codeDuplicate &&
    (form.can_be_sold || form.can_be_purchased) &&
    (!form.can_be_sold || form.revenue_account.trim().length > 0) &&
    (!(form.can_be_purchased && form.item_type === "service") ||
      (form.expense_account ?? "").trim().length > 0) &&
    !m.isPending;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canSave) m.mutate(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form]);

  const setType = (t: ItemType) => {
    if (mode === "edit") return; // không cho đổi loại khi sửa
    setForm((f) => ({
      ...f,
      item_type: t,
      unit: t === "service" ? "lần" : f.unit === "lần" || f.unit === "giờ" ? "cái" : f.unit,
      ...(t === "service" ? { unit_cost: 0, min_stock: 0, max_stock: 0 } : {}),
    }));
  };

  const title =
    mode === "edit"
      ? "Chỉnh sửa mặt hàng"
      : mode === "duplicate"
        ? "Nhân bản mặt hàng"
        : "Thêm hàng hoá / dịch vụ";

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <AddNew label="Thêm mặt hàng" />
        </DialogTrigger>
      )}
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg mb-4">
            {(["goods", "service", "combo"] as ItemType[]).map((t) => {
              const Icon = t === "goods" ? Package : t === "service" ? Wrench : Boxes;
              const active = form.item_type === t;
              const disabled = mode === "edit" && !active;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  disabled={disabled}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                    active
                      ? "bg-background shadow-sm text-foreground"
                      : disabled
                        ? "opacity-40 cursor-not-allowed text-muted-foreground"
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

          <TabsContent value="general" className="space-y-3 pt-4 min-h-[280px]">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Mã *"
                hint={codeDuplicate ? "Mã đã tồn tại" : undefined}
                error={codeDuplicate}
              >
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
                  autoFillOnMount={mode !== "edit" && !form.code}
                />
              </Field>
              <Field label="Tên *">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
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
                <Select
                  value={form.category_id ?? ""}
                  onValueChange={(v) => setForm({ ...form, category_id: v || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {hasStock && (
                <Field label="Mã vạch" full>
                  <Input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="Quét hoặc nhập mã vạch"
                  />
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
              <div className="col-span-2 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tính chất sử dụng{" "}
                  {isService && (
                    <span className="text-emerald-600 normal-case">· quan trọng với dịch vụ</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-start gap-2 rounded-md border border-border bg-background p-3 cursor-pointer hover:border-primary/50 transition-colors">
                    <Checkbox
                      checked={form.can_be_sold}
                      onCheckedChange={(v) => setForm({ ...form, can_be_sold: !!v })}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Có thể bán</div>
                      <div className="text-[11px] text-muted-foreground">
                        Xuất hiện trong hoá đơn bán, phiếu bán
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 rounded-md border border-border bg-background p-3 cursor-pointer hover:border-primary/50 transition-colors">
                    <Checkbox
                      checked={form.can_be_purchased}
                      onCheckedChange={(v) => setForm({ ...form, can_be_purchased: !!v })}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Có thể mua</div>
                      <div className="text-[11px] text-muted-foreground">
                        Xuất hiện trong hoá đơn mua, phiếu mua
                      </div>
                    </div>
                  </label>
                </div>
                {!form.can_be_sold && !form.can_be_purchased && (
                  <div className="text-[11px] text-destructive">Chọn ít nhất một tính chất</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-3 pt-4 min-h-[280px]">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giá bán (VND)">
                <NumberInput
                  value={form.unit_price}
                  onChange={(v) => setForm({ ...form, unit_price: v })}
                />
              </Field>
              {hasStock && (
                <Field label="Giá vốn (VND)">
                  <NumberInput
                    value={form.unit_cost}
                    onChange={(v) => setForm({ ...form, unit_cost: v })}
                  />
                </Field>
              )}
              <Field label="Thuế suất GTGT">
                <Select
                  value={String(form.vat_rate)}
                  onValueChange={(v) => setForm({ ...form, vat_rate: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <div className="text-xs text-muted-foreground">
                    Mặt hàng hiển thị trong bán hàng / mua hàng
                  </div>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>
            </div>
          </TabsContent>

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
                    <NumberInput
                      value={form.min_stock}
                      onChange={(v) => setForm({ ...form, min_stock: v })}
                    />
                  </Field>
                  <Field label="Tồn tối đa">
                    <NumberInput
                      value={form.max_stock}
                      onChange={(v) => setForm({ ...form, max_stock: v })}
                    />
                  </Field>
                </div>
              </Section>
            )}

            <Section title="Tài khoản kế toán">
              <div className="grid grid-cols-2 gap-3">
                {form.can_be_sold && (
                  <Field label="TK doanh thu *" hint="TT133/TT200: 511x">
                    <Input
                      value={form.revenue_account}
                      onChange={(e) => setForm({ ...form, revenue_account: e.target.value })}
                      placeholder="511"
                    />
                  </Field>
                )}
                {form.can_be_purchased && isService && (
                  <Field label="TK chi phí khi mua *" hint="154 / 627 / 642">
                    <Input
                      value={form.expense_account ?? ""}
                      onChange={(e) => setForm({ ...form, expense_account: e.target.value })}
                      placeholder="642"
                    />
                  </Field>
                )}
                {hasStock && (
                  <>
                    <Field label="TK kho" hint="156 - Hàng hoá / 155 - Thành phẩm">
                      <Input
                        value={form.stock_account}
                        onChange={(e) => setForm({ ...form, stock_account: e.target.value })}
                        placeholder="156"
                      />
                    </Field>
                    <Field label="TK giá vốn" hint="632 - Giá vốn hàng bán">
                      <Input
                        value={form.cogs_account}
                        onChange={(e) => setForm({ ...form, cogs_account: e.target.value })}
                        placeholder="632"
                      />
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
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            {mode === "create" && (
              <Button variant="secondary" onClick={() => m.mutate(true)} disabled={!canSave}>
                Lưu & thêm mới
              </Button>
            )}
            <Button onClick={() => m.mutate(false)} disabled={!canSave}>
              {m.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang lưu…
                </>
              ) : (
                "Lưu"
              )}
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
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
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
    for (const u of active)
      map.set(u.code.toLowerCase(), { code: u.code, name: u.name, usage: u.usage ?? 0 });
    for (const s of UNIT_SUGGESTIONS)
      if (!map.has(s.toLowerCase())) map.set(s.toLowerCase(), { code: s, name: s });
    if (value && !map.has(value.toLowerCase()))
      map.set(value.toLowerCase(), { code: value, name: value });
    return Array.from(map.values()).sort(
      (a, b) => (b.usage ?? 0) - (a.usage ?? 0) || a.code.localeCompare(b.code),
    );
  }, [active, value]);
  const [custom, setCustom] = useState(false);
  const inCatalog = useMemo(
    () => merged.some((m) => m.code.toLowerCase() === value.toLowerCase()),
    [merged, value],
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
        <Button type="button" variant="ghost" size="sm" onClick={() => setCustom(false)}>
          Chọn
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Select value={inCatalog ? value : ""} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Chọn đơn vị..." />
        </SelectTrigger>
        <SelectContent>
          {merged.map((u) => (
            <SelectItem key={u.code} value={u.code}>
              <span className="font-mono">{u.code}</span>
              {u.name !== u.code && <span className="text-muted-foreground"> · {u.name}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCustom(true)}
        title="Nhập thủ công"
      >
        +
      </Button>
    </div>
  );
}
