import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listOrganizations,
  updateOrganization,
  deleteOrganization,
} from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Building2 } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin/organizations")({
  beforeLoad: requireSuperadminGuard,
  component: OrgsPage,
});

function OrgsPage() {
  const list = useServerFn(listOrganizations);
  const upd = useServerFn(updateOrganization);
  const del = useServerFn(deleteOrganization);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-orgs"],
    queryFn: () => list(),
  });

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const orgs = useMemo(() => {
    const all = data?.organizations ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (o: any) =>
        (o.email ?? "").toLowerCase().includes(s) ||
        (o.company_name ?? "").toLowerCase().includes(s) ||
        (o.tax_id ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["superadmin-orgs"] });
    qc.invalidateQueries({ queryKey: ["superadmin-tenants"] });
  };

  const openEdit = (o: any) => {
    setEditing(o);
    setForm({
      company_name: o.company_name ?? "",
      tax_id: o.tax_id ?? "",
      address: o.address ?? "",
      phone: o.phone ?? "",
      accounting_standard: o.accounting_standard ?? "TT133",
      base_currency: o.base_currency ?? "VND",
      fiscal_year_start: o.fiscal_year_start ?? 1,
    });
  };

  const save = async () => {
    if (!editing) return;
    try {
      await upd({
        data: {
          tenant_id: editing.id,
          company_name: form.company_name || null,
          tax_id: form.tax_id || null,
          address: form.address || null,
          phone: form.phone || null,
          accounting_standard: form.accounting_standard,
          base_currency: form.base_currency,
          fiscal_year_start: Number(form.fiscal_year_start),
        },
      });
      toast.success("Đã cập nhật tổ chức");
      setEditing(null);
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await del({ data: { tenant_id: confirmDelete.id, confirm_email: confirmEmail } });
      toast.success("Đã xóa tổ chức và toàn bộ dữ liệu");
      setConfirmDelete(null);
      setConfirmEmail("");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Tìm theo email / công ty / MST…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">{orgs.length} tổ chức</p>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Công ty</th>
              <th className="text-left">Email chủ TK</th>
              <th className="text-left">MST</th>
              <th className="text-left">Chuẩn KT</th>
              <th className="text-left">Tiền tệ</th>
              <th className="text-left">Ngày tạo</th>
              <th className="text-right pr-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !orgs.length && (
              <tr><td colSpan={7} className="px-3 py-4 text-muted-foreground">Không có tổ chức.</td></tr>
            )}
            {orgs.map((o: any) => (
              <tr key={o.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{o.company_name ?? "(chưa đặt tên)"}</span>
                  </div>
                </td>
                <td className="text-muted-foreground">{o.email ?? "—"}</td>
                <td className="text-xs">{o.tax_id ?? "—"}</td>
                <td className="text-xs">{o.accounting_standard}</td>
                <td className="text-xs">{o.base_currency}</td>
                <td className="text-xs text-muted-foreground">
                  {o.created_at ? new Date(o.created_at).toLocaleDateString("vi-VN") : "—"}
                </td>
                <td className="text-right pr-3 space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => { setConfirmDelete(o); setConfirmEmail(""); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sửa tổ chức</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Tên công ty</Label>
              <Input value={form.company_name ?? ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Mã số thuế</Label>
                <Input value={form.tax_id ?? ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Điện thoại</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Địa chỉ</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Chuẩn KT</Label>
                <Select value={form.accounting_standard} onValueChange={(v) => setForm({ ...form, accounting_standard: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TT133">TT133</SelectItem>
                    <SelectItem value="TT200">TT200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tiền tệ</Label>
                <Input value={form.base_currency ?? ""} onChange={(e) => setForm({ ...form, base_currency: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Tháng bắt đầu NĐ</Label>
                <Input type="number" min={1} max={12} value={form.fiscal_year_start ?? 1} onChange={(e) => setForm({ ...form, fiscal_year_start: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Hủy</Button>
            <Button onClick={save}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa tổ chức vĩnh viễn</DialogTitle>
            <DialogDescription>
              Thao tác này sẽ xóa <b>toàn bộ dữ liệu</b> của tổ chức{" "}
              <b>{confirmDelete?.company_name ?? confirmDelete?.email}</b>{" "}
              (hóa đơn, bút toán, kho, lương, v.v.) VÀ tài khoản chủ.
              Hành động không thể hoàn tác. Nhập email chủ TK để xác nhận:
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={confirmDelete?.email ?? ""}
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Hủy</Button>
            <Button
              variant="destructive"
              disabled={confirmEmail.toLowerCase() !== (confirmDelete?.email ?? "").toLowerCase()}
              onClick={handleDelete}
            >
              Xóa vĩnh viễn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
