import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listSuppliers, upsertSupplier, deleteSupplier,
} from "@/lib/purchases.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/suppliers/")({
  component: SuppliersPage,
});

type Supplier = {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms_days: number;
};

function SuppliersPage() {
  const list = useServerFn(listSuppliers);
  const save = useServerFn(upsertSupplier);
  const del = useServerFn(deleteSupplier);

  const { data, refetch } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => list(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);

  const saveMut = useMutation({
    mutationFn: (s: Partial<Supplier>) =>
      save({
        data: {
          id: s.id,
          name: s.name ?? "",
          tax_id: s.tax_id || null,
          email: s.email || null,
          phone: s.phone || null,
          address: s.address || null,
          payment_terms_days: Number(s.payment_terms_days ?? 30),
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu");
      setOpen(false);
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nhà cung cấp</h1>
          <p className="text-sm text-muted-foreground">Quản lý danh mục NCC và công nợ</p>
        </div>
        <Button
          onClick={() => {
            setEditing({ payment_terms_days: 30 });
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Thêm NCC
        </Button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Tên NCC</th>
              <th className="px-4 py-3">MST</th>
              <th className="px-4 py-3">Email / Phone</th>
              <th className="px-4 py-3 text-right">Hạn TT (ngày)</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <Link to="/suppliers/$id" params={{ id: s.id }} className="font-medium text-accent">
                    {s.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{s.tax_id ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {s.email ?? "—"}<br />{s.phone ?? ""}
                </td>
                <td className="px-4 py-3 text-right">{s.payment_terms_days}</td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(s);
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Xoá ${s.name}?`)) return;
                      try {
                        await del({ data: { id: s.id } });
                        toast.success("Đã xoá");
                        refetch();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Lỗi");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Chưa có nhà cung cấp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa NCC" : "Thêm NCC"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Tên NCC *</Label>
              <Input
                value={editing?.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Mã số thuế</Label>
              <Input
                value={editing?.tax_id ?? ""}
                onChange={(e) => setEditing({ ...editing, tax_id: e.target.value })}
              />
            </div>
            <div>
              <Label>Hạn thanh toán (ngày)</Label>
              <Input
                type="number"
                value={editing?.payment_terms_days ?? 30}
                onChange={(e) =>
                  setEditing({ ...editing, payment_terms_days: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                value={editing?.email ?? ""}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Điện thoại</Label>
              <Input
                value={editing?.phone ?? ""}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Địa chỉ</Label>
              <Input
                value={editing?.address ?? ""}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              onClick={() => saveMut.mutate(editing ?? {})}
              disabled={!editing?.name || saveMut.isPending}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
