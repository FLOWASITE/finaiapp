import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

type LaneConfig = {
  key: string;
  icon: React.ElementType;
  title: string;
  caption: string;
  accent: string;
  sourceLink: { to: string; label: string };
  composerIntent: string;
  composerLabel: string;
  filters: { status?: string[]; ranges?: string[] };
  emptyHint: string;
  sampleRows: Array<{
    id: string;
    title: string;
    partner: string;
    date: string;
    amount: number;
    status: string;
    severity?: "low" | "medium" | "high";
  }>;
};

const LANES: Record<string, LaneConfig> = {
  approve: {
    key: "approve",
    icon: ClipboardCheck,
    title: "Cần duyệt",
    caption: "Nháp do AI tạo từ hoá đơn, sao kê — kiểm tra & ghi sổ",
    accent: "from-emerald-500/15 to-emerald-500/5 ring-emerald-500/25",
    sourceLink: { to: "/documents", label: "Mở Chứng từ" },
    composerIntent: "Tạo bút toán từ nháp: ",
    composerLabel: "Tạo bút toán mới",
    filters: {
      status: ["Tất cả", "AI đề xuất", "Chờ duyệt", "Cần bổ sung"],
      ranges: ["Hôm nay", "7 ngày qua", "Tháng này"],
    },
    emptyHint: "Chưa có nháp nào chờ bạn duyệt. Tải hoá đơn hoặc sao kê để AI đề xuất.",
    sampleRows: [
      { id: "DR-0421", title: "Hoá đơn mua văn phòng phẩm", partner: "Cty TNHH ABC", date: "2026-05-18", amount: 2_450_000, status: "AI đề xuất" },
      { id: "DR-0420", title: "Phiếu chi tiền điện T5", partner: "EVN", date: "2026-05-17", amount: 1_820_500, status: "Chờ duyệt" },
      { id: "DR-0419", title: "Hoá đơn bán hàng #INV-882", partner: "Khách lẻ", date: "2026-05-16", amount: 5_600_000, status: "Cần bổ sung" },
    ],
  },
  overdue: {
    key: "overdue",
    icon: AlertTriangle,
    title: "Quá hạn",
    caption: "Phải thu / phải trả đã đến hạn nhưng chưa thanh toán",
    accent: "from-rose-500/15 to-rose-500/5 ring-rose-500/25",
    sourceLink: { to: "/receivables", label: "Mở Phải thu" },
    composerIntent: "Tạo phiếu thu cho công nợ quá hạn của: ",
    composerLabel: "Tạo phiếu thu/chi",
    filters: {
      status: ["Tất cả", "Phải thu", "Phải trả"],
      ranges: ["≤ 7 ngày", "8–30 ngày", "> 30 ngày"],
    },
    emptyHint: "Không có công nợ quá hạn. 🎉",
    sampleRows: [
      { id: "AR-2201", title: "Công nợ KH Nam Việt", partner: "Cty Nam Việt", date: "2026-04-12", amount: 18_500_000, status: "Quá hạn 37 ngày", severity: "high" },
      { id: "AR-2188", title: "Công nợ KH Bình Minh", partner: "Cty Bình Minh", date: "2026-05-02", amount: 6_200_000, status: "Quá hạn 17 ngày", severity: "medium" },
      { id: "AP-1102", title: "Phải trả NCC Hoàng Gia", partner: "NCC Hoàng Gia", date: "2026-05-10", amount: 4_300_000, status: "Quá hạn 9 ngày", severity: "low" },
    ],
  },
  reconcile: {
    key: "reconcile",
    icon: Landmark,
    title: "Chưa đối soát",
    caption: "Giao dịch ngân hàng đã nhập nhưng chưa ghép với chứng từ",
    accent: "from-sky-500/15 to-sky-500/5 ring-sky-500/25",
    sourceLink: { to: "/bank/reconcile", label: "Mở Đối soát ngân hàng" },
    composerIntent: "Tạo bút toán đối ứng cho giao dịch: ",
    composerLabel: "Tạo bút toán đối ứng",
    filters: {
      status: ["Tất cả", "Có gợi ý AI", "Chưa có gợi ý"],
      ranges: ["7 ngày qua", "Tháng này", "Quý này"],
    },
    emptyHint: "Toàn bộ giao dịch ngân hàng đã được đối soát.",
    sampleRows: [
      { id: "BT-9912", title: "CK đến từ Cty Phúc Thịnh", partner: "VCB ****1234", date: "2026-05-18", amount: 12_000_000, status: "Có gợi ý AI" },
      { id: "BT-9911", title: "Thanh toán cho NCC TMV", partner: "VCB ****1234", date: "2026-05-17", amount: -3_400_000, status: "Chưa có gợi ý" },
      { id: "BT-9908", title: "Phí dịch vụ ngân hàng", partner: "TCB ****5678", date: "2026-05-16", amount: -55_000, status: "Có gợi ý AI" },
    ],
  },
  deadline: {
    key: "deadline",
    icon: Calendar,
    title: "Sắp đến hạn",
    caption: "Khai thuế, trả lương, hoặc công nợ trong 7 ngày tới",
    accent: "from-amber-500/15 to-amber-500/5 ring-amber-500/25",
    sourceLink: { to: "/tax", label: "Mở Thuế" },
    composerIntent: "Lập kế hoạch chi cho khoản đến hạn: ",
    composerLabel: "Lập kế hoạch chi",
    filters: {
      status: ["Tất cả", "Thuế", "Lương", "Công nợ"],
      ranges: ["Hôm nay", "3 ngày tới", "7 ngày tới"],
    },
    emptyHint: "Không có hạn nào trong 7 ngày tới.",
    sampleRows: [
      { id: "TX-GTGT-T5", title: "Khai GTGT tháng 5/2026", partner: "Cơ quan thuế", date: "2026-05-20", amount: 8_700_000, status: "Còn 1 ngày", severity: "high" },
      { id: "PR-T5", title: "Trả lương tháng 5", partner: "Toàn công ty", date: "2026-05-25", amount: 142_000_000, status: "Còn 6 ngày", severity: "medium" },
      { id: "AP-1120", title: "Đến hạn trả NCC An Phú", partner: "NCC An Phú", date: "2026-05-22", amount: 7_800_000, status: "Còn 3 ngày", severity: "medium" },
    ],
  },
  anomaly: {
    key: "anomaly",
    icon: Sparkles,
    title: "Bất thường",
    caption: "AI phát hiện các điểm cần kiểm tra trong dữ liệu kế toán",
    accent: "from-violet-500/15 to-violet-500/5 ring-violet-500/25",
    sourceLink: { to: "/chat", label: "Hỏi AI chi tiết" },
    composerIntent: "Tạo bút toán điều chỉnh cho bất thường: ",
    composerLabel: "Tạo bút toán điều chỉnh",
    filters: {
      status: ["Tất cả", "Trùng lặp", "Chênh lệch", "Thiếu chứng từ"],
      ranges: ["Tháng này", "Quý này"],
    },
    emptyHint: "AI chưa phát hiện điểm bất thường.",
    sampleRows: [
      { id: "AN-014", title: "Có 2 hoá đơn cùng số HĐ-2210", partner: "Cty Sao Mai", date: "2026-05-15", amount: 3_300_000, status: "Trùng lặp", severity: "high" },
      { id: "AN-013", title: "Chi tiền mặt > 20tr không kèm chứng từ", partner: "—", date: "2026-05-12", amount: 25_000_000, status: "Thiếu chứng từ", severity: "medium" },
      { id: "AN-012", title: "Chênh lệch tồn kho vs sổ", partner: "Kho HN", date: "2026-05-10", amount: 1_120_000, status: "Chênh lệch", severity: "low" },
    ],
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
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toLocaleString("vi-VN") + " ₫";
}

function LaneDetailPage() {
  const { lane } = Route.useParams();
  const config = LANES[lane]!;
  const Icon = config.icon;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(config.filters.status?.[0] ?? "Tất cả");
  const [range, setRange] = useState<string>(config.filters.ranges?.[0] ?? "");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return config.sampleRows.filter((r) => {
      if (status && status !== "Tất cả" && !r.status.toLowerCase().includes(status.toLowerCase())) {
        if (!status.toLowerCase().includes(r.status.toLowerCase())) return false;
      }
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.partner.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [config, search, status]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 lg:py-10">
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
          <Button variant="outline" asChild className="gap-2">
            <Link to={config.sourceLink.to}>
              <ExternalLink className="h-4 w-4" /> {config.sourceLink.label}
            </Link>
          </Button>
          <Button onClick={() => openAskAi(config.composerIntent)} className="gap-2">
            <Plus className="h-4 w-4" /> {config.composerLabel}
          </Button>
        </div>
      </div>

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
        {config.filters.status && (
          <Select value={status} onValueChange={setStatus}>
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
        {config.filters.ranges && (
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {config.filters.ranges.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Bộ lọc nâng cao
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30">
        {rows.length === 0 ? (
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
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.id}</td>
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
                        onClick={() => openAskAi(`${config.composerIntent}${r.id} — ${r.title}`)}
                      >
                        Bút toán
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => openAskAi(`Tạo phiếu nháp từ: ${r.id} — ${r.title}`)}
                      >
                        Nháp
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Dữ liệu hiển thị là mẫu để duyệt UI. Khi bạn đồng ý, mình sẽ nối với dữ liệu thật từ các module tương ứng.
      </p>
    </div>
  );
}
