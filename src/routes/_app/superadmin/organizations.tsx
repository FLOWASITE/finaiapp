import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listOrganizationsWithStats,
  updateOrganization,
  deleteOrganization,
} from "@/lib/superadmin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Building2, ArrowUpDown, Users, FileText, TrendingUp, Activity } from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";

export const Route = createFileRoute("/_app/superadmin/organizations")({
  beforeLoad: requireSuperadminGuard,
  component: OrgsPage,
});

type HealthFilter = "all" | "active" | "idle" | "new";
type SortKey = "company_name" | "invoice_count" | "sales_total_12m" | "last_activity_at" | "created_at";

function formatVND(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function OrgsPage() {
  const list = useServerFn(listOrganizationsWithStats);
  const upd = useServerFn(updateOrganization);
  const del = useServerFn(deleteOrganization);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-orgs-stats"],
    queryFn: () => list(),
    ...QUERY_PRESETS.TENANT_STATIC,
  });

  const [q, setQ] = useState("");
  const [health, setHealth] = useState<HealthFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [confirmEmail, setConfirmEmail] = useState("");

  const orgs = useMemo(() => {
    const all = (data?.organizations ?? []) as any[];
    const s = q.trim().toLowerCase();
    let filtered = !s ? all : all.filter(
      (o) =>
        (o.email ?? "").toLowerCase().includes(s) ||
        (o.company_name ?? "").toLowerCase().includes(s) ||
        (o.tax_id ?? "").toLowerCase().includes(s),
    );

    filtered = filtered.filter((o) => {
      const days = daysSince(o.last_activity_at);
      const createdDays = daysSince(o.created_at) ?? 999;
      if (health === "active") return days !== null && days <= 90;
      if (health === "idle") return days === null || days > 90;
      if (health === "new") return createdDays <= 7;
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });

    return filtered;
  }, [data, q, health, sort]);

  const summary = useMemo(() => {
    const all = (data?.organizations ?? []) as any[];
    const total = all.length;
    const totalInvoices = all.reduce((s, o) => s + (o.invoice_count ?? 0), 0);
    const totalSales = all.reduce((s, o) => s + (o.sales_total_12m ?? 0), 0);
    const idle = all.filter((o) => {
      const d = daysSince(o.last_activity_at);
      return d === null || d > 90;
    }).length;
    return { total, totalInvoices, totalSales, idle };
  }, [data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["superadmin-orgs-stats"] });
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

  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  const statusBadge = (o: any) => {
    const createdDays = daysSince(o.created_at) ?? 999;
    if (createdDays <= 7) return <Badge variant="secondary">Mới</Badge>;
    const d = daysSince(o.last_activity_at);
    if (d === null || d > 90) return <Badge variant="outline" className="text-muted-foreground">Không hoạt động</Badge>;
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">Đang hoạt động</Badge>;
  };

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
      {children}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-4 w-4" />Tổ chức</div>
          <div className="text-2xl font-semibold mt-1">{summary.total}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4" />Tổng hóa đơn</div>
          <div className="text-2xl font-semibold mt-1">{formatVND(summary.totalInvoices)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-4 w-4" />Doanh thu 12T</div>
          <div className="text-2xl font-semibold mt-1">{formatVND(summary.totalSales)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" />Không hoạt động</div>
          <div className="text-2xl font-semibold mt-1">{summary.idle}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm theo email / công ty / MST…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
          <Select value={health} onValueChange={(v) => setHealth(v as HealthFilter)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="active">Đang hoạt động (≤90 ngày)</SelectItem>
              <SelectItem value="idle">Không hoạt động (&gt;90 ngày)</SelectItem>
              <SelectItem value="new">Mới tạo (≤7 ngày)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">{orgs.length} / {summary.total} tổ chức</p>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left"><SortBtn k="company_name">Công ty</SortBtn></th>
              <th className="text-left">Email chủ TK</th>
              <th className="text-left">MST</th>
              <th className="text-right"><SortBtn k="invoice_count">Hóa đơn</SortBtn></th>
              <th className="text-right"><SortBtn k="sales_total_12m">Doanh thu 12T</SortBtn></th>
              <th className="text-center"><Users className="inline h-3 w-3" /></th>
              <th className="text-left"><SortBtn k="last_activity_at">Hoạt động gần nhất</SortBtn></th>
              <th className="text-left">Trạng thái</th>
              <th className="text-right pr-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !orgs.length && (
              <tr><td colSpan={9} className="px-3 py-4 text-muted-foreground">Không có tổ chức phù hợp.</td></tr>
            )}
            {orgs.map((o: any) => {
              const d = daysSince(o.last_activity_at);
              return (
                <tr key={o.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{o.company_name ?? "(chưa đặt tên)"}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground">{o.email ?? "—"}</td>
                  <td className="text-xs">{o.tax_id ?? "—"}</td>
                  <td className="text-right tabular-nums">{o.invoice_count}</td>
                  <td className="text-right tabular-nums">{formatVND(o.sales_total_12m)}</td>
                  <td className="text-center text-xs">{o.members_count}</td>
                  <td className="text-xs text-muted-foreground">
                    {o.last_activity_at
                      ? `${new Date(o.last_activity_at).toLocaleDateString("vi-VN")} (${d}d)`
                      : "—"}
                  </td>
                  <td>{statusBadge(o)}</td>
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
              );
            })}
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
