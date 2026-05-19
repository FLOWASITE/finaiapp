import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Layers,
  Wallet,
  TrendingDown,
  AlertCircle,
  PlayCircle,
  ExternalLink,
  FileText,
  ArrowRightLeft,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  listAllocatedAssets,
  upsertAllocatedAsset,
  deleteAllocatedAsset,
  allocatedAssetsSummary,
  previewAllocation,
  runMonthlyAllocation,
} from "@/lib/allocated-assets.functions";

export const Route = createFileRoute("/_app/assets/allocations")({
  component: AllocatedAssetsPage,
});

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");

const CATEGORY_LABEL: Record<string, string> = {
  ccdc: "CCDC",
  rent: "Thuê",
  insurance: "Bảo hiểm",
  license: "License",
  repair: "Sửa chữa lớn",
  interest: "Lãi vay",
  other: "Khác",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Đang phân bổ",
  suspended: "Tạm ngừng",
  disposed: "Đã thanh lý",
  finished: "Đã phân bổ hết",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  disposed: "bg-zinc-200 text-zinc-700",
  finished: "bg-blue-100 text-blue-700",
};

function AllocatedAssetsPage() {
  const listFn = useServerFn(listAllocatedAssets);
  const sumFn = useServerFn(allocatedAssetsSummary);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const { data: summary } = useQuery({
    queryKey: ["alloc-assets-summary"],
    queryFn: () => sumFn(),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["alloc-assets", status, category, q],
    queryFn: () => listFn({ data: { status, category, q } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const list = useMemo(() => rows ?? [], [rows]);

  const totalCost = Number(summary?.total_cost ?? 0);
  const totalAllocated = Number(summary?.total_allocated ?? 0);
  const allocPct = totalCost > 0 ? Math.min(100, Math.round((totalAllocated / totalCost) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-50 via-background to-sky-50 dark:from-indigo-950/40 dark:via-background dark:to-sky-950/40">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "16px 16px" }} />
        <div className="relative p-5 sm:p-6 lg:p-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-900/40 rounded-full px-3 py-1 w-fit">
              <Sparkles className="h-3 w-3" /> TK 242 — Sổ chi tiết chi phí trả trước
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Tài sản phân bổ
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Quản lý CCDC & chi phí trả trước, tự sinh bút toán phân bổ định kỳ Nợ 6xx / Có 242
              và đối chiếu trực tiếp với Sổ Cái.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm" className="bg-background/60 backdrop-blur">
              <Link to="/assets/from-invoice"><FileText className="h-4 w-4 mr-1.5" />Từ hoá đơn</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="bg-background/60 backdrop-blur">
              <Link to="/assets/from-fixed-asset"><ArrowRightLeft className="h-4 w-4 mr-1.5" />Từ TSCĐ</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="bg-background/60 backdrop-blur">
              <Link to="/reports/allocation-schedule"><BarChart3 className="h-4 w-4 mr-1.5" />Bảng phân bổ</Link>
            </Button>
            <RunAllocationDialog />
            <UpsertDialog />
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 space-y-6 pb-8">
        {/* KPI strip */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            icon={<Layers className="h-4 w-4" />}
            iconBg="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
            label="Tổng nguyên giá"
            value={fmt(totalCost)}
            sub={`${summary?.count ?? 0} tài sản đang theo dõi`}
          />
          <KpiCard
            icon={<TrendingDown className="h-4 w-4" />}
            iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
            label="Đã phân bổ"
            value={fmt(totalAllocated)}
            sub={`${allocPct}% nguyên giá`}
            progress={allocPct}
            progressTone="bg-emerald-500"
          />
          <KpiCard
            icon={<Wallet className="h-4 w-4" />}
            iconBg="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
            label="Giá trị còn lại"
            value={fmt(summary?.remaining ?? 0)}
            sub="Số dư cuối kỳ TK 242"
          />
          <KpiCard
            icon={<AlertCircle className="h-4 w-4" />}
            iconBg="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
            label="Sắp hết kỳ"
            value={String(summary?.ending_soon ?? 0)}
            sub="≤ 3 kỳ còn lại — cần rà soát"
          />
        </div>

        {/* Filters */}
        <Card className="border-dashed">
          <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm theo mã hoặc tên…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả loại</SelectItem>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Mã</th>
                  <th className="px-3 py-2.5 text-left">Tên tài sản</th>
                  <th className="px-3 py-2.5 text-left hidden md:table-cell">Loại</th>
                  <th className="px-3 py-2.5 text-left hidden lg:table-cell">Bắt đầu</th>
                  <th className="px-3 py-2.5 text-right hidden md:table-cell">Nguyên giá</th>
                  <th className="px-3 py-2.5 text-right hidden lg:table-cell">Đã PB</th>
                  <th className="px-3 py-2.5 text-right">GTCL</th>
                  <th className="px-3 py-2.5 text-left hidden md:table-cell w-[140px]">Tiến độ kỳ</th>
                  <th className="px-3 py-2.5 text-left">Trạng thái</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary animate-pulse" /> Đang tải…</div>
                    </td>
                  </tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                          <Layers className="h-6 w-6" />
                        </div>
                        <div className="font-medium">Chưa có CCDC / Chi phí trả trước</div>
                        <div className="text-xs">Bấm <b>Ghi tăng</b> hoặc tạo từ <b>Hoá đơn</b> / <b>TSCĐ</b> để bắt đầu.</div>
                      </div>
                    </td>
                  </tr>
                )}
                {list.map((r: any) => {
                  const pct = Number(r.periods_total) > 0
                    ? Math.min(100, Math.round((Number(r.periods_done) / Number(r.periods_total)) * 100))
                    : 0;
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <Link to="/assets/allocations/$id" params={{ id: r.id }} className="text-primary hover:underline">
                          {r.code}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">
                        {CATEGORY_LABEL[r.category] ?? r.category}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{r.start_date}</td>
                      <td className="px-3 py-2.5 text-right font-mono hidden md:table-cell">{fmt(r.cost)}</td>
                      <td className="px-3 py-2.5 text-right font-mono hidden lg:table-cell text-emerald-600">{fmt(r.allocated)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(r.remaining)}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
                            {r.periods_done}/{r.periods_total}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className={STATUS_TONE[r.status] ?? ""}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Chi tiết">
                            <Link to="/assets/allocations/$id" params={{ id: r.id }}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          <UpsertDialog asset={r} />
                          <DeleteButton id={r.id} hasEntries={Number(r.periods_done) > 0} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            "Phân bổ kỳ" tự sinh bút toán Nợ 6xx / Có 242 cho các kỳ chưa hạch toán.
          </span>
          <Link to="/reports/allocation-schedule" className="hover:underline text-primary font-medium">
            Xem bảng phân bổ & đối chiếu →
          </Link>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  sub,
  progress,
  progressTone,
}: {
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  progressTone?: string;
}) {
  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <div className="text-xs text-muted-foreground font-medium">{label}</div>
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight truncate">{value}</div>
          </div>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg ?? "bg-muted text-foreground"}`}>
            {icon}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressTone ?? "bg-primary"}`} style={{ width: `${progress}%` }} />
          </div>
        )}
        {sub && <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ---------- Upsert dialog ----------
function UpsertDialog({ asset }: { asset?: any }) {
  const upsertFn = useServerFn(upsertAllocatedAsset);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState(() => ({
    id: asset?.id as string | undefined,
    code: asset?.code ?? "",
    name: asset?.name ?? "",
    category: asset?.category ?? "ccdc",
    source_type: asset?.source_type ?? "direct_expense",
    quantity: Number(asset?.quantity ?? 1),
    unit: asset?.unit ?? "",
    cost: Number(asset?.cost ?? 0),
    periods_total: Number(asset?.periods_total ?? 12),
    period_unit: asset?.period_unit ?? "month",
    start_date: asset?.start_date ?? new Date().toISOString().slice(0, 10),
    method: asset?.method ?? "straight_line",
    prepaid_account: asset?.prepaid_account ?? "242",
    expense_account: asset?.expense_account ?? "6423",
    status: asset?.status ?? "active",
    notes: asset?.notes ?? "",
  }));

  const mut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          ...form,
          unit: form.unit || null,
          notes: form.notes || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success(asset ? "Đã cập nhật" : "Đã ghi tăng tài sản phân bổ");
      qc.invalidateQueries({ queryKey: ["alloc-assets"] });
      qc.invalidateQueries({ queryKey: ["alloc-assets-summary"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {asset ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Ghi tăng
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? "Sửa tài sản phân bổ" : "Ghi tăng CCDC / Chi phí trả trước"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã *">
            <AutoCodeInput
              value={form.code}
              onChange={(v: string) => setForm({ ...form, code: v })}
              entity="allocated_asset"
              autoFillOnMount={!asset}
              placeholder="VD: CCDC-001"
            />
          </Field>
          <Field label="Tên *">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Máy tính xách tay Dell"
            />
          </Field>

          <Field label="Loại">
            <Select
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v as any })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nguồn hình thành">
            <Select
              value={form.source_type}
              onValueChange={(v) => setForm({ ...form, source_type: v as any })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct_expense">Chi phí trực tiếp</SelectItem>
                <SelectItem value="purchase_invoice">Từ hoá đơn mua</SelectItem>
                <SelectItem value="inventory_issue">Từ phiếu xuất 153</SelectItem>
                <SelectItem value="fa_conversion">Chuyển từ TSCĐ</SelectItem>
                <SelectItem value="opening_balance">Số dư đầu kỳ</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Số lượng">
            <Input
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            />
          </Field>
          <Field label="ĐVT">
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="cái, bộ, m²…"
            />
          </Field>

          <Field label="Nguyên giá *">
            <Input
              type="number"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
            />
          </Field>
          <Field label="Ngày bắt đầu phân bổ *">
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </Field>

          <Field label="Số kỳ phân bổ *">
            <Input
              type="number"
              min={1}
              value={form.periods_total}
              onChange={(e) => setForm({ ...form, periods_total: Number(e.target.value) })}
            />
          </Field>
          <Field label="Đơn vị kỳ">
            <Select
              value={form.period_unit}
              onValueChange={(v) => setForm({ ...form, period_unit: v as any })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Tháng</SelectItem>
                <SelectItem value="quarter">Quý</SelectItem>
                <SelectItem value="year">Năm</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="TK trả trước">
            <Input
              value={form.prepaid_account}
              onChange={(e) => setForm({ ...form, prepaid_account: e.target.value })}
            />
          </Field>
          <Field label="TK chi phí">
            <Input
              value={form.expense_account}
              onChange={(e) => setForm({ ...form, expense_account: e.target.value })}
              placeholder="6423, 6273, 6413…"
            />
          </Field>

          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Ghi chú</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DeleteButton({ id, hasEntries }: { id: string; hasEntries: boolean }) {
  const delFn = useServerFn(deleteAllocatedAsset);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      qc.invalidateQueries({ queryKey: ["alloc-assets"] });
      qc.invalidateQueries({ queryKey: ["alloc-assets-summary"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  if (hasEntries) {
    return (
      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" disabled title="Đã có bút toán phân bổ — không thể xoá">
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá tài sản phân bổ này?</AlertDialogTitle>
          <AlertDialogDescription>
            Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()}>Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------- Run allocation dialog ----------
function RunAllocationDialog() {
  const previewFn = useServerFn(previewAllocation);
  const runFn = useServerFn(runMonthlyAllocation);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [upToMonth, setUpToMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );

  const { data: preview, isFetching } = useQuery({
    queryKey: ["alloc-preview", upToMonth, open],
    enabled: open,
    queryFn: () => previewFn({ data: { upToMonth } }),
  });

  const mut = useMutation({
    mutationFn: () => runFn({ data: { upToMonth } }),
    onSuccess: (res) => {
      toast.success(
        `Đã hạch toán ${res.created_entries} kỳ cho ${res.assets_touched} tài sản (${Number(res.total_amount).toLocaleString("vi-VN")} đ)`,
      );
      qc.invalidateQueries({ queryKey: ["alloc-assets"] });
      qc.invalidateQueries({ queryKey: ["alloc-assets-summary"] });
      qc.invalidateQueries({ queryKey: ["alloc-preview"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <PlayCircle className="h-4 w-4" /> Phân bổ kỳ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chạy phân bổ chi phí (Nợ 6xx / Có 242)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Phân bổ đến tháng</Label>
            <Input
              type="month"
              value={upToMonth}
              onChange={(e) => setUpToMonth(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Hệ thống sẽ tự sinh bút toán cho tất cả các kỳ chưa hạch toán
              của các tài sản còn hiệu lực, tính đến hết tháng đã chọn.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Mã</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-center">Số kỳ</th>
                  <th className="px-3 py-2 text-right">Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Đang tính…
                    </td>
                  </tr>
                )}
                {!isFetching && (preview?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Không có tài sản nào cần phân bổ.
                    </td>
                  </tr>
                )}
                {(preview?.items ?? []).map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{it.code}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-center">{it.periods}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(it.total_amount).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
                {(preview?.items?.length ?? 0) > 0 && (
                  <tr className="border-t bg-muted/40 font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-right">Tổng</td>
                    <td className="px-3 py-2 text-center">{preview?.total_periods}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(preview?.total_amount ?? 0).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || (preview?.items?.length ?? 0) === 0}
          >
            {mut.isPending ? "Đang chạy…" : "Hạch toán"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
