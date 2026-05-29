import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listTenantsAdmin } from "@/lib/superadmin-tenants.functions";
import { setTenantSuspended, updateTenantPlan } from "@/lib/superadmin-extra.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Building2, ArrowUpDown, Users, FileText, Activity, ShieldCheck, ShieldOff,
  MoreHorizontal, Download, ChevronRight, BadgeCheck,
} from "lucide-react";
import { requireSuperadminGuard } from "@/lib/superadmin-guard";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/superadmin/organizations")({
  beforeLoad: requireSuperadminGuard,
  component: OrgsPage,
});

type StatusFilter = "all" | "active" | "suspended" | "archived";
type StdFilter = "all" | "TT133" | "TT200";
type SortKey = "name" | "members_count" | "last_activity_at" | "created_at";
const PLANS = ["free", "pro", "business", "enterprise"];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function OrgsPage() {
  const listFn = useServerFn(listTenantsAdmin);
  const susFn = useServerFn(setTenantSuspended);
  const planFn = useServerFn(updateTenantPlan);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [std, setStd] = useState<StdFilter>("all");
  const [plan, setPlan] = useState<string>("all");
  const [idle, setIdle] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [suspendDialog, setSuspendDialog] = useState<any | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [planDialog, setPlanDialog] = useState<any | null>(null);
  const [planValue, setPlanValue] = useState("free");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin-tenants-admin", q, status, std, plan, idle],
    queryFn: () =>
      listFn({
        data: {
          q: q || undefined,
          status: status,
          accounting_standard: std,
          plan: plan === "all" ? undefined : plan,
          idle_only: idle,
        },
      }),
  });

  const tenants = useMemo(() => {
    const rows = (data?.tenants ?? []) as any[];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [data, sort]);

  const summary = useMemo(() => {
    const all = (data?.tenants ?? []) as any[];
    return {
      total: data?.total ?? all.length,
      active: all.filter((t) => t.status === "active").length,
      suspended: all.filter((t) => t.status === "suspended").length,
      idle: all.filter((t) => {
        const d = daysSince(t.last_activity_at);
        return d === null || d > 90;
      }).length,
    };
  }, [data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["superadmin-tenants-admin"] });

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === tenants.length) setSelected(new Set());
    else setSelected(new Set(tenants.map((t) => t.id)));
  };

  const handleSuspend = async () => {
    if (!suspendDialog) return;
    try {
      const willSuspend = suspendDialog.status !== "suspended";
      await susFn({
        data: {
          tenant_id: suspendDialog.id,
          suspended: willSuspend,
          reason: willSuspend ? suspendReason : undefined,
        },
      });
      toast.success(willSuspend ? "Đã tạm khóa tenant" : "Đã khôi phục tenant");
      setSuspendDialog(null);
      setSuspendReason("");
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleBulkSuspend = async () => {
    if (!selected.size) return;
    if (!confirm(`Tạm khóa ${selected.size} tenant?`)) return;
    try {
      for (const id of selected) {
        await susFn({ data: { tenant_id: id, suspended: true, reason: "Bulk suspend" } });
      }
      toast.success(`Đã tạm khóa ${selected.size} tenant`);
      setSelected(new Set());
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleExportCsv = () => {
    downloadCsv(`tenants-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { key: "id", header: "Tenant ID" },
        { key: "name", header: "Tên" },
        { key: "company_name", header: "Công ty" },
        { key: "tax_id", header: "MST" },
        { key: "owner_email", header: "Chủ sở hữu" },
        { key: "accounting_standard", header: "Chuẩn KT" },
        { key: "status", header: "Trạng thái" },
        { key: "plan", header: "Plan" },
        { key: "members_count", header: "Thành viên", numeric: true },
        { key: "last_activity_at", header: "Hoạt động cuối" },
        { key: "created_at", header: "Tạo lúc" },
      ],
      tenants,
    );
  };

  const handleChangePlan = async () => {
    if (!planDialog) return;
    try {
      await planFn({ data: { tenant_id: planDialog.id, plan: planValue } });
      toast.success("Đã cập nhật gói");
      setPlanDialog(null);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const SortBtn = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button
      onClick={() => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "desc" }))}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {children}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  const statusBadge = (t: any) => {
    if (t.status === "suspended") return <Badge variant="destructive">Tạm khóa</Badge>;
    if (t.status === "archived") return <Badge variant="outline">Lưu trữ</Badge>;
    const d = daysSince(t.last_activity_at);
    if (d === null || d > 90) return <Badge variant="outline" className="text-muted-foreground">Không hoạt động</Badge>;
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">Hoạt động</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-4 w-4" />Tổng tenants</div>
          <div className="text-2xl font-semibold mt-1">{summary.total}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><BadgeCheck className="h-4 w-4" />Đang hoạt động</div>
          <div className="text-2xl font-semibold mt-1 text-emerald-600">{summary.active}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldOff className="h-4 w-4" />Tạm khóa</div>
          <div className="text-2xl font-semibold mt-1 text-destructive">{summary.suspended}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" />Không hoạt động (&gt;90d)</div>
          <div className="text-2xl font-semibold mt-1">{summary.idle}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Tìm theo tên / công ty / MST / email chủ…"
            value={q} onChange={(e) => setQ(e.target.value)}
            className="w-72"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi trạng thái</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi gói</SelectItem>
              {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={std} onValueChange={(v) => setStd(v as StdFilter)}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi chuẩn</SelectItem>
              <SelectItem value="TT133">TT133</SelectItem>
              <SelectItem value="TT200">TT200</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={idle} onCheckedChange={(v) => setIdle(!!v)} />
            Idle &gt;90d
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-1.5 h-4 w-4" />CSV
          </Button>
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkSuspend}>
              <ShieldOff className="mr-1.5 h-4 w-4" />Khóa {selected.size}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{tenants.length} / {summary.total}</p>
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={tenants.length > 0 && selected.size === tenants.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-3 py-2 text-left"><SortBtn k="name">Tên / Công ty</SortBtn></th>
              <th className="text-left">MST</th>
              <th className="text-left">Chủ sở hữu</th>
              <th className="text-left">Chuẩn KT</th>
              <th className="text-left">Trạng thái</th>
              <th className="text-left">Plan</th>
              <th className="text-right"><SortBtn k="members_count"><Users className="inline h-3 w-3" /></SortBtn></th>
              <th className="text-left"><SortBtn k="last_activity_at">Hoạt động cuối</SortBtn></th>
              <th className="text-right pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="px-3 py-4 text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && !tenants.length && (
              <tr><td colSpan={10} className="px-3 py-4 text-muted-foreground">Không có tenant phù hợp.</td></tr>
            )}
            {tenants.map((t: any) => {
              const d = daysSince(t.last_activity_at);
              return (
                <tr key={t.id} className="border-t border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to="/superadmin/tenant/$id"
                      params={{ id: t.id }}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t.name ?? "(không tên)"}</span>
                      {t.company_name && t.company_name !== t.name && (
                        <span className="text-xs text-muted-foreground">· {t.company_name}</span>
                      )}
                    </Link>
                  </td>
                  <td className="text-xs">{t.tax_id ?? "—"}</td>
                  <td className="text-muted-foreground text-xs">{t.owner_email ?? "—"}</td>
                  <td className="text-xs">{t.accounting_standard ?? "—"}</td>
                  <td>{statusBadge(t)}</td>
                  <td><Badge variant="secondary">{t.plan}</Badge></td>
                  <td className="text-right tabular-nums">{t.members_count}</td>
                  <td className="text-xs text-muted-foreground">
                    {t.last_activity_at
                      ? `${new Date(t.last_activity_at).toLocaleDateString("vi-VN")} (${d}d)`
                      : "—"}
                  </td>
                  <td className="text-right pr-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/superadmin/tenant/$id" params={{ id: t.id }}>
                            <ChevronRight className="mr-2 h-4 w-4" />Xem chi tiết
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setPlanDialog(t); setPlanValue(t.plan ?? "free"); }}>
                          <BadgeCheck className="mr-2 h-4 w-4" />Đổi gói
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => { setSuspendDialog(t); setSuspendReason(t.suspended_reason ?? ""); }}
                          className={t.status === "suspended" ? "" : "text-destructive"}
                        >
                          {t.status === "suspended"
                            ? <><ShieldCheck className="mr-2 h-4 w-4" />Khôi phục</>
                            : <><ShieldOff className="mr-2 h-4 w-4" />Tạm khóa</>}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!suspendDialog} onOpenChange={(o) => !o && setSuspendDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspendDialog?.status === "suspended" ? "Khôi phục tenant" : "Tạm khóa tenant"}
            </DialogTitle>
            <DialogDescription>
              <b>{suspendDialog?.name}</b>
              {suspendDialog?.status !== "suspended" && " — người dùng sẽ mất quyền truy cập cho tới khi được khôi phục."}
            </DialogDescription>
          </DialogHeader>
          {suspendDialog?.status !== "suspended" && (
            <div className="grid gap-1.5">
              <Label>Lý do (tùy chọn)</Label>
              <Input value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendDialog(null)}>Hủy</Button>
            <Button
              variant={suspendDialog?.status === "suspended" ? "default" : "destructive"}
              onClick={handleSuspend}
            >
              {suspendDialog?.status === "suspended" ? "Khôi phục" : "Tạm khóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!planDialog} onOpenChange={(o) => !o && setPlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi gói cho {planDialog?.name}</DialogTitle>
          </DialogHeader>
          <Select value={planValue} onValueChange={setPlanValue}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(null)}>Hủy</Button>
            <Button onClick={handleChangePlan}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
