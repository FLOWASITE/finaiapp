import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  listWarehouses,
  upsertWarehouse,
  deleteWarehouse,
  setDefaultWarehouse,
} from "@/lib/warehouses.functions";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Warehouse as WarehouseIcon, Star } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

export const Route = createFileRoute("/_app/inventory/warehouses")({ component: WarehousesPage });

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  manager: string | null;
  phone: string | null;
  notes: string | null;
  is_default: boolean;
  is_active: boolean;
  stock_value: number;
  sku_count: number;
};

function WarehousesPage() {
  const list = useServerFn(listWarehouses);
  const del = useServerFn(deleteWarehouse);
  const setDefault = useServerFn(setDefaultWarehouse);
  const qc = useQueryClient();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => list(),
    ...QUERY_PRESETS.REFERENCE,
  });

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [toDelete, setToDelete] = useState<WarehouseRow | null>(null);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return ((warehouses as WarehouseRow[]) ?? []).filter(
      (w) =>
        !s ||
        [w.code, w.name, w.address, w.manager].some((v) => v?.toLowerCase().includes(s)),
    );
  }, [warehouses, search]);

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá kho");
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const defaultMut = useMutation({
    mutationFn: (id: string) => setDefault({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã đặt làm kho mặc định");
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalValue = (filtered ?? []).reduce((s, w) => s + Number(w.stock_value || 0), 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6" /> Danh mục kho
          </h1>
          <p className="text-sm text-muted-foreground">
            Quản lý nhiều kho (kho tổng, kho chi nhánh…). Mỗi phiếu nhập/xuất và kiểm kê đều
            được gắn với một kho cụ thể.
          </p>
        </div>
        <AddNew
          label="Thêm kho"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Số kho</div>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Kho đang hoạt động</div>
            <div className="text-2xl font-bold">
              {filtered.filter((w) => w.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Tổng giá trị tồn (theo PS)</div>
            <div className="text-2xl font-bold text-primary">{fmt(totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Tìm theo mã, tên, địa chỉ, người quản lý…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên kho</th>
              <th className="px-4 py-2 text-left">Địa chỉ</th>
              <th className="px-4 py-2 text-left">Người quản lý</th>
              <th className="px-4 py-2 text-right">SL mã hàng</th>
              <th className="px-4 py-2 text-right">Giá trị tồn</th>
              <th className="px-4 py-2 text-center">Mặc định</th>
              <th className="px-4 py-2 text-center">Trạng thái</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  Đang tải…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <WarehouseIcon className="h-8 w-8 opacity-40" />
                    <div>Chưa có kho nào. Hãy thêm kho đầu tiên.</div>
                    <AddNew
                      size="sm"
                      label="Thêm kho"
                      onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                    />
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((w) => (
              <tr key={w.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-mono">{w.code}</td>
                <td className="px-4 py-2 font-medium">{w.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{w.address ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {w.manager ?? "—"}
                  {w.phone && <div className="text-xs">{w.phone}</div>}
                </td>
                <td className="px-4 py-2 text-right font-mono">{w.sku_count}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(w.stock_value)}</td>
                <td className="px-4 py-2 text-center">
                  {w.is_default ? (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      <Star className="mr-1 h-3 w-3" /> Mặc định
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => defaultMut.mutate(w.id)}
                      disabled={defaultMut.isPending}
                    >
                      Đặt mặc định
                    </Button>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <Badge variant={w.is_active ? "default" : "outline"}>
                    {w.is_active ? "Hoạt động" : "Ngưng"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(w);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setToDelete(w)}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WarehouseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        existingCodes={
          ((warehouses as WarehouseRow[]) ?? [])
            .filter((w) => !editing || w.id !== editing.id)
            .map((w) => w.code)
        }
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Sẽ xoá kho <strong>{toDelete?.name}</strong>. Nếu kho đã có phát sinh, hệ
              thống sẽ chặn. Bạn vẫn có thể chuyển kho sang trạng thái “Ngưng hoạt động”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && delMut.mutate(toDelete.id)}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WarehouseDialog({
  open,
  onOpenChange,
  editing,
  existingCodes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: WarehouseRow | null;
  existingCodes: string[];
}) {
  const upsert = useServerFn(upsertWarehouse);
  const qc = useQueryClient();

  const emptyForm = {
    code: "",
    name: "",
    address: "",
    manager: "",
    phone: "",
    notes: "",
    is_default: false,
    is_active: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              code: editing.code,
              name: editing.name,
              address: editing.address ?? "",
              manager: editing.manager ?? "",
              phone: editing.phone ?? "",
              notes: editing.notes ?? "",
              is_default: editing.is_default,
              is_active: editing.is_active,
            }
          : emptyForm,
      );
    }
  }, [open, editing]);

  const codeError =
    form.code && existingCodes.includes(form.code.trim())
      ? "Mã kho đã tồn tại"
      : undefined;

  const save = useMutation({
    mutationFn: (andNew: boolean) =>
      upsert({
        data: {
          ...(editing ? { id: editing.id } : {}),
          code: form.code.trim(),
          name: form.name.trim(),
          address: form.address || null,
          manager: form.manager || null,
          phone: form.phone || null,
          notes: form.notes || null,
          is_default: form.is_default,
          is_active: form.is_active,
        },
      }).then(() => andNew),
    onSuccess: (andNew) => {
      toast.success(editing ? "Đã cập nhật" : "Đã thêm kho");
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouses-active"] });
      if (andNew) {
        setForm(emptyForm);
      } else {
        onOpenChange(false);
      }
    },
    onError: (e: any) => {
      const msg = String(e?.message || "");
      if (msg.includes("23505")) toast.error("Mã kho đã tồn tại");
      else toast.error(msg || "Lỗi lưu");
    },
  });

  const canSave = form.code.trim() && form.name.trim() && !codeError;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canSave && !save.isPending) save.mutate(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, canSave, save]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa kho" : "Thêm kho mới"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mã kho *</Label>
              <AutoCodeInput
                entity="warehouse"
                value={form.code}
                onChange={(v) => setForm({ ...form, code: v })}
                autoFillOnMount={!editing}
                placeholder="KHO01"
                error={!!codeError}
              />
              {codeError && <p className="text-xs text-rose-600">{codeError}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tên kho *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Kho chính / Kho chi nhánh Hà Nội…"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Địa chỉ</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Người quản lý</Label>
              <Input
                value={form.manager}
                onChange={(e) => setForm({ ...form, manager: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">SĐT</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Kho mặc định</div>
              <div className="text-xs text-muted-foreground">
                Tự chọn khi tạo phiếu nhập / xuất / kiểm kê
              </div>
            </div>
            <Switch
              checked={form.is_default}
              onCheckedChange={(v) => setForm({ ...form, is_default: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Đang hoạt động</div>
              <div className="text-xs text-muted-foreground">
                Bỏ chọn để ẩn khỏi các dropdown chọn kho
              </div>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          {!editing && (
            <Button
              variant="secondary"
              onClick={() => save.mutate(true)}
              disabled={!canSave || save.isPending}
            >
              Lưu &amp; thêm mới
            </Button>
          )}
          <Button onClick={() => save.mutate(false)} disabled={!canSave || save.isPending}>
            {save.isPending ? "Đang lưu…" : "Lưu (Ctrl+S)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
