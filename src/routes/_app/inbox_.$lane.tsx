import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ClipboardCheck,
  AlertTriangle,
  Landmark,
  Calendar,
  Sparkles,
  Search,
  Plus,
  FileText,
  ExternalLink,
  Filter,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { openAskAi } from "@/components/ai/AskAiSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getInboxLane, type InboxRow } from "@/lib/inbox.functions";

type LaneConfig = {
  key: "approve" | "overdue" | "reconcile" | "deadline" | "anomaly";
  icon: React.ElementType;
  title: string;
  caption: string;
  accent: string;
  sourceLink: { to: string; label: string };
  composerIntent: string;
  composerLabel: string;
  filters: { status: string[]; ranges: string[] };
  emptyHint: string;
};

const LANES: Record<string, LaneConfig> = {
  approve: {
    key: "approve",
    icon: ClipboardCheck,
    title: "Cần duyệt",
    caption: "Tài liệu OCR & nháp do AI tạo từ hoá đơn, sao kê",
    accent: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/25",
    sourceLink: { to: "/documents", label: "Mở Chứng từ" },
    composerIntent: "Tạo bút toán từ tài liệu: ",
    composerLabel: "Tạo bút toán mới",
    filters: {
      status: ["Tất cả", "AI đề xuất", "Chờ duyệt", "Cần bổ sung"],
      ranges: ["", "Hôm nay", "7 ngày qua", "Tháng này"],
    },
    emptyHint: "Chưa có tài liệu nào chờ duyệt. Tải hoá đơn hoặc sao kê để AI bóc tách.",
  },
  overdue: {
    key: "overdue",
    icon: AlertTriangle,
    title: "Quá hạn",
    caption: "Công nợ phải thu (TK 131) / phải trả (TK 331) còn dư",
    accent: "from-rose-500/15 to-rose-500/5 ring-rose-500/25",
    sourceLink: { to: "/receivables", label: "Mở Phải thu" },
    composerIntent: "Tạo phiếu thu cho công nợ quá hạn của: ",
    composerLabel: "Tạo phiếu thu/chi",
    filters: {
      status: ["Tất cả", "Phải thu", "Phải trả"],
      ranges: ["", "≤ 7 ngày", "8–30 ngày", "> 30 ngày"],
    },
    emptyHint: "Không có công nợ quá hạn. 🎉",
  },
  reconcile: {
    key: "reconcile",
    icon: Landmark,
    title: "Chưa đối soát",
    caption: "Giao dịch ngân hàng chưa khớp với chứng từ",
    accent: "from-sky-500/15 to-sky-500/5 ring-sky-500/25",
    sourceLink: { to: "/bank/reconcile", label: "Mở Đối soát ngân hàng" },
    composerIntent: "Tạo bút toán đối ứng cho giao dịch: ",
    composerLabel: "Tạo bút toán đối ứng",
    filters: {
      status: ["Tất cả"],
      ranges: ["", "7 ngày qua", "Tháng này", "Quý này"],
    },
    emptyHint: "Toàn bộ giao dịch ngân hàng đã được khớp.",
  },
  deadline: {
    key: "deadline",
    icon: Calendar,
    title: "Sắp đến hạn",
    caption: "Khai thuế GTGT và công nợ NCC đến hạn trong vài ngày tới",
    accent: "from-amber-500/15 to-amber-500/5 ring-amber-500/25",
    sourceLink: { to: "/tax", label: "Mở Thuế" },
    composerIntent: "Lập kế hoạch chi cho khoản đến hạn: ",
    composerLabel: "Lập kế hoạch chi",
    filters: {
      status: ["Tất cả", "Thuế", "Công nợ"],
      ranges: ["", "Hôm nay", "3 ngày tới", "7 ngày tới"],
    },
    emptyHint: "Không có hạn nào trong khoảng đã chọn.",
  },
  anomaly: {
    key: "anomaly",
    icon: Sparkles,
    title: "Bất thường",
    caption: "AI phát hiện các điểm cần kiểm tra (ai_insights)",
    accent: "from-violet-500/15 to-violet-500/5 ring-violet-500/25",
    sourceLink: { to: "/chat", label: "Hỏi AI chi tiết" },
    composerIntent: "Tạo bút toán điều chỉnh cho bất thường: ",
    composerLabel: "Tạo bút toán điều chỉnh",
    filters: {
      status: ["Tất cả"],
      ranges: [""],
    },
    emptyHint: "AI chưa phát hiện điểm bất thường.",
  },
};

export const Route = createFileRoute("/_app/inbox_/$lane")({
  beforeLoad: ({ params }) => {
    if (!LANES[params.lane]) throw notFound();
  },
  component: LaneDetailPage,
  head: ({ params }) => ({
    meta: [{ title: `${LANES[params.lane]?.title ?? "Lane"} · Hộp việc · FinAI` }],
  }),
});

function formatVnd(n: number) {
  if (!n) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toLocaleString("vi-VN") + " ₫";
}

function LaneDetailPage() {
  const { lane } = Route.useParams();
  const config = LANES[lane]!;
  const Icon = config.icon;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(config.filters.status[0] ?? "Tất cả");
  const [rangeFilter, setRangeFilter] = useState<string>(config.filters.ranges[0] ?? "");

  const fn = useServerFn(getInboxLane);
  const query = useQuery({
    queryKey: ["inbox-lane", lane, statusFilter, rangeFilter, search],
    queryFn: () => fn({ data: { lane: config.key, search, statusFilter, rangeFilter, limit: 100 } }),
    staleTime: 30_000,
  });

  const rows: InboxRow[] = query.data?.rows ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/inbox"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Hộp việc
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-inset",
                config.accent,
              )}
            >
              <Icon className="h-5 w-5 text-foreground/80" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {config.title}
              </h1>
              <p className="text-sm text-muted-foreground">{config.caption}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
            Làm mới
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <a href={config.sourceLink.to}>
              <ExternalLink className="h-4 w-4" /> {config.sourceLink.label}
            </a>
          </Button>
          <Button onClick={() => openAskAi(config.composerIntent)} className="gap-2">
            <Plus className="h-4 w-4" /> {config.composerLabel}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/40 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã, tên, đối tác…"
            className="h-9 pl-8"
          />
        </div>
        {config.filters.status.length > 1 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.filters.status.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {config.filters.ranges.length > 1 && (
          <Select value={rangeFilter} onValueChange={setRangeFilter}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Khoảng thời gian" />
            </SelectTrigger>
            <SelectContent>
              {config.filters.ranges.map((r) => (
                <SelectItem key={r || "all"} value={r}>
                  {r || "Tất cả"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" disabled>
          <Filter className="h-3.5 w-3.5" /> {rows.length} mục
        </Button>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dữ liệu…
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
            <div className="text-sm text-foreground">Không tải được dữ liệu</div>
            <div className="text-xs text-muted-foreground">{(query.error as Error)?.message}</div>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <div className="text-sm text-muted-foreground">{config.emptyHint}</div>
            <Button size="sm" onClick={() => openAskAi(config.composerIntent)} className="gap-2">
              <Plus className="h-4 w-4" /> {config.composerLabel}
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Mã</th>
                <th className="px-4 py-2.5 text-left font-medium">Nội dung</th>
                <th className="px-4 py-2.5 text-left font-medium">Đối tác</th>
                <th className="px-4 py-2.5 text-left font-medium">Ngày</th>
                <th className="px-4 py-2.5 text-right font-medium">Số tiền</th>
                <th className="px-4 py-2.5 text-left font-medium">Trạng thái</th>
                <th className="px-4 py-2.5 text-right font-medium">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.ref}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{r.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.partner}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                  <td className={cn("px-4 py-3 text-right font-mono tabular-nums", r.amount < 0 ? "text-rose-500" : "text-foreground")}>{formatVnd(r.amount)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] font-normal",
                        r.severity === "high" && "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
                        r.severity === "medium" && "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                        r.severity === "low" && "border-muted-foreground/30 bg-muted/30",
                      )}
                    >
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => openAskAi(`${config.composerIntent}${r.ref} — ${r.title} — ${r.partner}`)}
                      >
                        Bút toán
                      </Button>
                      {r.href && (
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          <a href={r.href}>Mở</a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Nguồn dữ liệu: <span className="font-mono">{query.data?.source ?? "—"}</span> · cập nhật trực tiếp từ hệ thống kế toán của bạn.
      </p>
    </div>
  );
}
