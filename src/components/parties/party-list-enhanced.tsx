import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus, Search, Pencil, Archive, ArchiveRestore, Users, Truck, FolderTree,
  TrendingUp, TrendingDown, Wallet, AlertCircle, ChevronDown, X,
  MoreVertical, FilePlus, BookOpen, GitMerge, Trash2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { DateRangeFilter } from "@/components/date-range-filter";
import { PartyForm, type PartyInitial } from "@/components/party-form";
import { TablePagination, usePagination } from "@/components/table-pagination";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { getPresetRange } from "@/lib/date-presets";
import { listCustomers, archiveCustomer } from "@/lib/customers.functions";
import { listSuppliers, upsertSupplier, deleteSupplier } from "@/lib/purchases.functions";
import { getArSummary } from "@/lib/receivables.functions";
import { getApSummary } from "@/lib/payables.functions";
import { listPartyGroups } from "@/lib/partyGroups.functions";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

type Kind = "customer" | "supplier";

type SummaryRow = {
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
};

export function PartyListEnhanced({ kind }: { kind: Kind }) {
  const isCustomer = kind === "customer";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const listFn = useServerFn((isCustomer ? listCustomers : listSuppliers) as any) as any;
  const summaryFn = useServerFn((isCustomer ? getArSummary : getApSummary) as any) as any;
  const groupsFn = useServerFn(listPartyGroups);

  // Default period: current year
  const [range, setRange] = useState(() => getPresetRange("thisYear"));

  const { data: parties = [] } = useQuery<any[]>({
    queryKey: [isCustomer ? "customers" : "suppliers"],
    queryFn: () => listFn(isCustomer ? {} : undefined),
    ...QUERY_PRESETS.REFERENCE,
  });

  const { data: groups = [] } = useQuery<any[]>({
    queryKey: ["party-groups", kind],
    queryFn: () => groupsFn({ data: { kind } }),
    ...QUERY_PRESETS.REFERENCE,
  });

  const { data: summary = [], isFetching: loadingSummary } = useQuery<any[]>({
    queryKey: [isCustomer ? "ar-summary" : "ap-summary", range.from, range.to],
    queryFn: () => summaryFn({ data: { from: range.from, to: range.to } }),
  });

  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState<PartyInitial | null>(null);

  const groupMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups as any[]) m.set(g.id, g.name);
    return m;
  }, [groups]);

  const summaryById = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    for (const r of summary as any[]) {
      const id = isCustomer ? r.customer_id : r.supplier_id;
      if (id) m.set(id, r);
    }
    return m;
  }, [summary, isCustomer]);

  const enriched = useMemo(() => {
    return (parties as any[]).map((p, idx) => {
      const s = summaryById.get(p.id);
      return {
        ...p,
        _stt: idx + 1,
        _groupName: p.group_id ? groupMap.get(p.group_id) ?? null : null,
        _opening_debit: Number(s?.opening_debit ?? p.opening_balance_debit ?? 0),
        _opening_credit: Number(s?.opening_credit ?? p.opening_balance_credit ?? 0),
        _debit: Number(s?.debit ?? 0),
        _credit: Number(s?.credit ?? 0),
        _closing_debit: Number(s?.closing_debit ?? p.opening_balance_debit ?? 0),
        _closing_credit: Number(s?.closing_credit ?? p.opening_balance_credit ?? 0),
      };
    });
  }, [parties, summaryById, groupMap]);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return enriched.filter((p) => {
      if (!showArchived && p.is_active === false) return false;
      if (!lq) return true;
      return (
        (p.code ?? "").toLowerCase().includes(lq) ||
        p.name.toLowerCase().includes(lq) ||
        (p.tax_id ?? "").toLowerCase().includes(lq) ||
        (p.email ?? "").toLowerCase().includes(lq) ||
        (p._groupName ?? "").toLowerCase().includes(lq)
      );
    }).map((p, i) => ({ ...p, _stt: i + 1 }));
  }, [enriched, q, showArchived]);

  // KPIs based on the filtered (visible) set
  const kpi = useMemo(() => {
    const k = {
      total: filtered.length,
      active: filtered.filter((p) => p.is_active !== false).length,
      closing_debit: 0,
      closing_credit: 0,
      debit: 0,
      credit: 0,
    };
    for (const r of filtered) {
      k.closing_debit += r._closing_debit;
      k.closing_credit += r._closing_credit;
      k.debit += r._debit;
      k.credit += r._credit;
    }
    return k;
  }, [filtered]);

  const pg = usePagination(filtered, 20, `${q}|${showArchived}|${range.from}|${range.to}`);

  // ===== Archive mutation (different fn shape per kind) =====
  const archiveCustomerFn = useServerFn(archiveCustomer);
  const upsertSupplierFn = useServerFn(upsertSupplier);
  const deleteSupplierFn = useServerFn(deleteSupplier);

  const onArchive = (p: any) => {
    if (isCustomer) {
      archiveCustomerFn({ data: { id: p.id, archived: p.is_active !== false } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["customers"] });
          toast.success(p.is_active === false ? "Đã khôi phục" : "Đã lưu trữ");
        })
        .catch((e: any) => toast.error(e.message));
    } else {
      upsertSupplierFn({
        data: {
          id: p.id,
          name: p.name,
          tax_id: p.tax_id,
          payment_terms_days: p.payment_terms_days ?? 30,
          currency: p.currency ?? "VND",
          payable_account: p.payable_account ?? "331",
          is_active: !(p.is_active === false ? false : true),
        } as any,
      })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["suppliers"] });
          toast.success("Đã cập nhật");
        })
        .catch((e: any) => toast.error(e.message));
    }
  };

  const onDelete = async (p: any) => {
    if (isCustomer) {
      toast.info("Khách hàng chỉ có thể lưu trữ, không thể xoá vĩnh viễn.");
      return;
    }
    if (!confirm(`Xoá ${p.name}?`)) return;
    try {
      await deleteSupplierFn({ data: { id: p.id } });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Đã xoá");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const titleIcon = isCustomer ? <Users className="h-6 w-6" /> : <Truck className="h-6 w-6" />;
  const title = isCustomer ? "Khách hàng" : "Nhà cung cấp";
  const groupsHref = isCustomer ? "/customers/groups" : "/suppliers/groups";
  const groupsLabel = isCustomer ? "Nhóm KH" : "Nhóm NCC";
  const addLabel = isCustomer ? "Khách hàng mới" : "Thêm NCC";
  const hasActiveFilters = q.length > 0 || showArchived;

  return (
    <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            {titleIcon} {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCustomer
              ? "Số dư & phát sinh công nợ phải thu (TK 131) theo kỳ"
              : "Số dư & phát sinh công nợ phải trả (TK 331) theo kỳ"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DateRangeFilter from={range.from} to={range.to} onChange={setRange} />
          <Button variant="outline" asChild>
            <Link to={groupsHref}><FolderTree className="mr-2 h-4 w-4" />{groupsLabel}</Link>
          </Button>
          <Button onClick={() => setEditing({})}>
            <Plus className="mr-2 h-4 w-4" />{addLabel}
          </Button>
        </div>
      </div>

      {/* KPI cards — 5 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        <KpiCard
          icon={isCustomer ? <Users className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
          label={isCustomer ? "Tổng KH" : "Tổng NCC"}
          value={`${kpi.total.toLocaleString("vi-VN")}`}
          sub={`${kpi.active} đang hoạt động`}
          tone="slate"
        />
        <KpiCard
          icon={<AlertCircle className="h-5 w-5" />}
          label={isCustomer ? "Phải thu cuối kỳ" : "Ứng trước NCC"}
          value={fmt(kpi.closing_debit)}
          tone={isCustomer ? "rose" : "sky"}
        />
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label={isCustomer ? "Khách trả trước" : "Phải trả cuối kỳ"}
          value={fmt(kpi.closing_credit)}
          tone={isCustomer ? "sky" : "amber"}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Phát sinh Nợ"
          value={fmt(kpi.debit)}
          tone="emerald"
        />
        <KpiCard
          icon={<TrendingDown className="h-5 w-5" />}
          label="Phát sinh Có"
          value={fmt(kpi.credit)}
          tone="violet"
        />
      </div>

      {/* Search / archive toggle */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="flex items-center justify-between mb-2 md:hidden">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="text-sm font-medium inline-flex items-center gap-1"
            >
              Bộ lọc{hasActiveFilters ? " (đang lọc)" : ""}
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
            </button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); setShowArchived(false); }} className="h-7 px-2 text-xs">
                <X className="h-3 w-3 mr-1" /> Xoá lọc
              </Button>
            )}
          </div>
          <div className={`${showFilters ? "flex" : "hidden"} md:flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3`}>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm theo mã, tên, MST, email, nhóm…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} id="show-archived" />
              <Label htmlFor="show-archived" className="text-muted-foreground">Hiện đã lưu trữ</Label>
            </div>
            <div className="sm:ml-auto text-sm text-muted-foreground">
              {loadingSummary ? "Đang tính số dư…" : `${filtered.length} ${isCustomer ? "KH" : "NCC"}`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {pg.pageRows.map((p) => (
          <div key={p.id} className={"rounded-lg border border-border bg-card p-3 space-y-2 " + (p.is_active === false ? "opacity-60" : "")}>
            <div className="flex items-start gap-2">
              <div className="text-xs text-muted-foreground tabular-nums w-6 shrink-0 pt-0.5">{p._stt}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  <span className="font-mono">{p.code ?? "—"}</span>
                  {p.tax_id ? <> · MST <span className="font-mono">{p.tax_id}</span></> : null}
                </div>
                {p._groupName && <div className="text-[11px] text-muted-foreground truncate">Nhóm: {p._groupName}</div>}
              </div>
              <div className="shrink-0">
                <RowActions
                  kind={kind}
                  party={p}
                  onEdit={() => setEditing(toInitial(p, kind))}
                  onOpening={() => setEditing(toInitial(p, kind))}
                  onArchive={() => onArchive(p)}
                  onDelete={() => onDelete(p)}
                  onCreateVoucher={() =>
                    navigate({ to: isCustomer ? "/sales/vouchers" : "/purchases/vouchers" })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px]">
              <Cell label="Dư đầu Nợ" value={p._opening_debit} />
              <Cell label="Phát sinh Nợ" value={p._debit} />
              <Cell label="Dư cuối Nợ" value={p._closing_debit} bold />
              <Cell label="Dư đầu Có" value={p._opening_credit} />
              <Cell label="Phát sinh Có" value={p._credit} />
              <Cell label="Dư cuối Có" value={p._closing_credit} bold />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Không có dữ liệu
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-right w-10">STT</th>
              <th className="px-3 py-2 text-left">Mã đối tác</th>
              <th className="px-3 py-2 text-left">Tên đối tác</th>
              <th className="px-3 py-2 text-left">Mã số thuế</th>
              <th className="px-3 py-2 text-left">{isCustomer ? "Nhóm KH" : "Nhóm NCC"}</th>
              <th className="px-3 py-2 text-right">Dư nợ đầu kỳ</th>
              <th className="px-3 py-2 text-right">Dư có đầu kỳ</th>
              <th className="px-3 py-2 text-right">Phát sinh nợ</th>
              <th className="px-3 py-2 text-right">Phát sinh có</th>
              <th className="px-3 py-2 text-right">Dư nợ cuối kỳ</th>
              <th className="px-3 py-2 text-right">Dư có cuối kỳ</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pg.pageRows.map((p) => (
              <tr key={p.id} className={"border-t border-border hover:bg-muted/30 " + (p.is_active === false ? "opacity-60" : "")}>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-muted-foreground">{p._stt}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.code ?? "—"}</td>
                <td className="px-3 py-2">
                  {!isCustomer ? (
                    <Link to="/suppliers/$id" params={{ id: p.id }} className="font-medium text-accent">
                      {p.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                  {p.contact_person && <div className="text-xs text-muted-foreground">{p.contact_person}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{p.tax_id ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{p._groupName ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(p._opening_debit)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(p._opening_credit)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(p._debit)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(p._credit)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{fmt(p._closing_debit)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{fmt(p._closing_credit)}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <RowActions
                    kind={kind}
                    party={p}
                    onEdit={() => setEditing(toInitial(p, kind))}
                    onOpening={() => setEditing(toInitial(p, kind))}
                    onArchive={() => onArchive(p)}
                    onDelete={() => onDelete(p)}
                    onCreateVoucher={() =>
                      navigate({ to: isCustomer ? "/sales/vouchers" : "/purchases/vouchers" })
                    }
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">Không có dữ liệu</td></tr>
            )}
          </tbody>
        </table>
        <TablePagination
          page={pg.page}
          pageSize={pg.pageSize}
          pageCount={pg.pageCount}
          total={pg.total}
          setPage={pg.setPage}
          setPageSize={pg.setPageSize}
        />
      </div>

      {/* Mobile pagination */}
      <div className="md:hidden">
        <TablePagination
          page={pg.page}
          pageSize={pg.pageSize}
          pageCount={pg.pageCount}
          total={pg.total}
          setPage={pg.setPage}
          setPageSize={pg.setPageSize}
        />
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id
                ? isCustomer ? "Sửa khách hàng" : "Sửa nhà cung cấp"
                : isCustomer ? "Khách hàng mới" : "Nhà cung cấp mới"}
            </DialogTitle>
          </DialogHeader>
          {editing && <PartyForm mode={kind} initial={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Cell({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="rounded bg-muted/40 px-1.5 py-1">
      <div className="text-muted-foreground leading-none">{label}</div>
      <div className={`font-mono tabular-nums leading-tight ${bold ? "font-semibold" : ""}`}>{fmt(value)}</div>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: "slate" | "amber" | "emerald" | "sky" | "rose" | "violet";
}) {
  const toneCls = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  } as const;
  return (
    <Card>
      <CardContent className="p-2 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className={`h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-full grid place-items-center ${toneCls[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs text-muted-foreground truncate leading-tight">{label}</div>
          <div className="text-sm sm:text-lg font-semibold tabular-nums truncate">{value}</div>
          {sub && <div className="text-[10px] text-muted-foreground truncate leading-tight">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function toInitial(p: any, kind: Kind): PartyInitial {
  return {
    id: p.id,
    code: p.code ?? "",
    name: p.name,
    party_type: (p.party_type ?? "company") as "company" | "individual",
    tax_id: p.tax_id ?? "",
    legal_rep: p.legal_rep ?? "",
    contact_person: p.contact_person ?? "",
    email: p.email ?? "",
    email_cc: p.email_cc ?? "",
    phone: p.phone ?? "",
    fax: p.fax ?? "",
    website: p.website ?? "",
    address: p.address ?? "",
    bank_account_no: p.bank_account_no ?? "",
    bank_name: p.bank_name ?? "",
    bank_branch: p.bank_branch ?? "",
    currency: p.currency ?? "VND",
    payment_terms_days: p.payment_terms_days ?? 30,
    counter_account: kind === "customer" ? (p.receivable_account ?? "131") : (p.payable_account ?? "331"),
    opening_balance_debit: Number(p.opening_balance_debit ?? 0),
    opening_balance_credit: Number(p.opening_balance_credit ?? 0),
    notes: p.notes ?? "",
    is_active: p.is_active !== false,
  };
}
