import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listConversions, upsertConversion, deleteConversion } from "@/lib/unit-conversions.functions";
import { listUnits } from "@/lib/units.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 });

export function UnitConversionsEditor({
  productId,
  baseUnit,
}: {
  productId: string;
  baseUnit: string;
}) {
  const listFn = useServerFn(listConversions);
  const { data: rows } = useQuery({
    queryKey: ["unit-conversions", productId],
    queryFn: () => listFn({ data: { product_id: productId } }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4" /> Đơn vị quy đổi
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Đơn vị gốc: <Badge variant="secondary">{baseUnit || "—"}</Badge>{" "}
            (1 {baseUnit} = 1 {baseUnit}). Hệ số &gt; 1 nghĩa là 1 đơn vị mới = nhiều đơn vị gốc.
          </p>
        </div>
        <ConversionDialog productId={productId} baseUnit={baseUnit} />
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Đơn vị</th>
              <th className="px-4 py-2 text-right">Hệ số</th>
              <th className="px-4 py-2 text-left">Quy đổi</th>
              <th className="px-4 py-2 text-center">Mặc định</th>
              <th className="px-4 py-2 text-left">Ghi chú</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {((rows as any[]) ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.unit}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(r.factor)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  1 {r.unit} = {fmt(r.factor)} {baseUnit}
                </td>
                <td className="px-4 py-2 text-center">
                  <div className="flex flex-wrap justify-center gap-1">
                    {r.is_default_purchase && <Badge variant="outline" className="text-[10px]">Mua</Badge>}
                    {r.is_default_sale && <Badge variant="outline" className="text-[10px]">Bán</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <ConversionDialog productId={productId} baseUnit={baseUnit} row={r} />
                  <DeleteBtn id={r.id} productId={productId} unit={r.unit} />
                </td>
              </tr>
            ))}
            {((rows as any[]) ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                Chưa có đơn vị quy đổi. Thêm để nhập/xuất theo nhiều đơn vị.
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ConversionDialog({
  productId, baseUnit, row,
}: { productId: string; baseUnit: string; row?: any }) {
  const up = useServerFn(upsertConversion);
  const unitsFn = useServerFn(listUnits);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: units } = useQuery({ queryKey: ["units"], queryFn: () => unitsFn(), enabled: open });
  const [form, setForm] = useState(() => ({
    unit: row?.unit ?? "",
    factor: row ? String(row.factor) : "",
    is_default_purchase: !!row?.is_default_purchase,
    is_default_sale: !!row?.is_default_sale,
    note: row?.note ?? "",
  }));

  const unitOptions = useMemo(
    () => ((units as any[]) ?? []).filter((u) => u.is_active && u.code.toLowerCase() !== (baseUnit ?? "").toLowerCase()),
    [units, baseUnit],
  );

  const m = useMutation({
    mutationFn: () => up({
      data: {
        id: row?.id,
        product_id: productId,
        unit: form.unit.trim(),
        factor: Number(form.factor),
        is_default_purchase: form.is_default_purchase,
        is_default_sale: form.is_default_sale,
        note: form.note || null,
      },
    }),
    onSuccess: () => {
      toast.success(row ? "Đã cập nhật quy đổi" : "Đã thêm quy đổi");
      qc.invalidateQueries({ queryKey: ["unit-conversions", productId] });
      setOpen(false);
      if (!row) setForm({ unit: "", factor: "", is_default_purchase: false, is_default_sale: false, note: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {row ? (
          <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
        ) : (
          <Button size="sm"><Plus className="mr-1 h-4 w-4" />Thêm quy đổi</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Sửa đơn vị quy đổi" : "Thêm đơn vị quy đổi"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Đơn vị *</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u: any) => (
                    <SelectItem key={u.id} value={u.code}>{u.code} — {u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hệ số (1 đv mới = ? đv gốc) *</Label>
              <Input
                type="number" min={0} step="any" value={form.factor}
                onChange={(e) => setForm({ ...form, factor: e.target.value })}
                placeholder="VD: 24"
              />
            </div>
          </div>
          {form.unit && Number(form.factor) > 0 && (
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              1 <b>{form.unit}</b> = <b>{fmt(Number(form.factor))}</b> {baseUnit}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default_purchase}
                onCheckedChange={(v) => setForm({ ...form, is_default_purchase: v })} id="dp" />
              <Label htmlFor="dp" className="text-xs">Mặc định khi NHẬP</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default_sale}
                onCheckedChange={(v) => setForm({ ...form, is_default_sale: v })} id="ds" />
              <Label htmlFor="ds" className="text-xs">Mặc định khi XUẤT</Label>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!form.unit.trim() || !(Number(form.factor) > 0) || m.isPending}
          >Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBtn({ id, productId, unit }: { id: string; productId: string; unit: string }) {
  const del = useServerFn(deleteConversion);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      qc.invalidateQueries({ queryKey: ["unit-conversions", productId] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-rose-600">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá quy đổi "{unit}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Các phiếu đã lập trước đó không bị ảnh hưởng. Phiếu lập mới sẽ không còn dùng được đơn vị này.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
