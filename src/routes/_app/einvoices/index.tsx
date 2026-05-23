import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  RefreshCw,
  Search,
  CloudDownload,
  Link2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  KeyRound,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportEinvoiceStoreDialog } from "@/components/import-einvoice-store-dialog";
import { SyncTctDialog } from "@/components/sync-tct-dialog";
import { listEInvoices, autoMatchEInvoices } from "@/lib/einvoices.functions";
import { Zap } from "lucide-react";
import { DateRangeFilter } from "@/components/date-range-filter";

export const Route = createFileRoute("/_app/einvoices/")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab === "in" ? "in" : "out") as "in" | "out",
  }),
  component: EInvoicesPage,
});

function XmlStatusBadge({ s, err }: { s: string | null; err?: string | null }) {
  if (s === "done")
    return (
      <Badge
        variant="outline"
        className="gap-1 text-emerald-700 border-emerald-500/30"
        title="Đã tải chi tiết XML"
      >
        <CheckCircle2 className="h-3 w-3" />XML
      </Badge>
    );
  if (s === "failed")
    return (
      <Badge
        variant="outline"
        className="gap-1 text-destructive border-destructive/30"
        title={err || "Tải XML lỗi"}
      >
        <XCircle className="h-3 w-3" />Lỗi
      </Badge>
    );
  if (s === "pending")
    return (
      <Badge variant="secondary" className="gap-1" title="Chờ tải chi tiết">
        <RefreshCw className="h-3 w-3 animate-spin" />Đang tải
      </Badge>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

const vnd = (n: number | string | null | undefined) =>
  n == null ? "-" : Number(n).toLocaleString("vi-VN");

function StatusBadge({ s }: { s: string | null }) {
  if (!s)
    return (
      <Badge variant="outline" className="gap-1">
        <HelpCircle className="h-3 w-3" />—
      </Badge>
    );
  if (s === "valid")
    return (
      <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 border border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />Hợp lệ
      </Badge>
    );
  if (s === "cancelled")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />Đã huỷ
      </Badge>
    );
  if (s === "replaced")
    return (
      <Badge variant="outline" className="gap-1 text-amber-700 border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />Thay thế
      </Badge>
    );
  if (s === "adjusted")
    return (
      <Badge variant="outline" className="gap-1 text-amber-700 border-amber-500/30">
        <AlertTriangle className="h-3 w-3" />Điều chỉnh
      </Badge>
    );
  if (s === "pending")
    return <Badge variant="secondary">Chờ kiểm tra</Badge>;
  return (
    <Badge variant="outline" className="gap-1">
      <HelpCircle className="h-3 w-3" />Chưa rõ
    </Badge>
  );
}

function EInvoicesPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useServerFn(listEInvoices);
  const autoMatch = useServerFn(autoMatchEInvoices);

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [matched, setMatched] = React.useState<"all" | "matched" | "unmatched">(
    "all",
  );
  const [xmlStatus, setXmlStatus] = React.useState<string>("all");
  const [dateRange, setDateRange] = React.useState<{
    from?: string;
    to?: string;
  }>({});
  const [page, setPage] = React.useState(1);
  const [syncOpen, setSyncOpen] = React.useState(false);

  React.useEffect(() => setPage(1), [tab, q, status, matched, xmlStatus, dateRange]);

  const autoMatchMut = useMutation({
    mutationFn: () =>
      autoMatch({
        data: {
          direction: tab,
          dateFrom: dateRange.from ?? null,
          dateTo: dateRange.to ?? null,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `Tự động ghép: ${r.matched} thành công · ${r.ambiguous} mơ hồ · ${r.skipped} bỏ qua (quét ${r.scanned})`,
      );
      query.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi auto-match"),
  });

  const query = useQuery({
    queryKey: [
      "einvoices",
      tab,
      q,
      status,
      matched,
      xmlStatus,
      dateRange.from,
      dateRange.to,
      page,
    ],
    queryFn: () =>
      list({
        data: {
          direction: tab,
          q,
          status: status === "all" ? null : status,
          matched,
          xmlStatus: xmlStatus === "all" ? null : xmlStatus,
          dateFrom: dateRange.from ?? null,
          dateTo: dateRange.to ?? null,
          page,
          pageSize: 50,
        },
      }),
      ...QUERY_PRESETS.TRANSACTIONAL,
    });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hoá đơn điện tử
          </h1>
          <p className="text-sm text-muted-foreground">
            Quản lý HĐĐT đầu ra & đầu vào, kết nối Tổng cục Thuế.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild title="Nhật ký HĐĐT theo ngày">
            <Link to="/einvoices/digest">
              <FileCheck2 className="mr-2 h-4 w-4" />
              Nhật ký ngày
            </Link>
          </Button>
          <Button variant="outline" asChild title="Hộp thư gợi ý ghép HĐĐT">
            <Link to="/einvoices/inbox" search={{ tab }}>
              <HelpCircle className="mr-2 h-4 w-4" />
              Hộp thư gợi ý
            </Link>
          </Button>
          <Button variant="outline" asChild title="Khai báo tài khoản TCT">
            <Link to="/einvoices/credentials">
              <KeyRound className="mr-2 h-4 w-4" />
              Tài khoản TCT
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => autoMatchMut.mutate()}
            disabled={autoMatchMut.isPending}
            title="Tự động ghép HĐĐT với HĐ nội bộ theo MST + số HĐ"
          >
            <Zap className="mr-2 h-4 w-4" />
            {autoMatchMut.isPending ? "Đang ghép…" : "Tự động ghép"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSyncOpen(true)}
            title="Đồng bộ trực tiếp từ cổng TCT"
          >
            <CloudDownload className="mr-2 h-4 w-4" />
            Đồng bộ từ TCT
          </Button>
          <ImportEinvoiceStoreDialog />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "in" | "out" } })
        }
      >
        <TabsList>
          <TabsTrigger value="out">Đầu ra (bán)</TabsTrigger>
          <TabsTrigger value="in">Đầu vào (mua)</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo MST / Số HĐ / Mã tra cứu / Tên"
            className="pl-8 w-72"
          />
        </div>
        <DateRangeFilter
          from={dateRange.from ?? ""}
          to={dateRange.to ?? ""}
          onChange={(r) => setDateRange({ from: r.from, to: r.to })}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Trạng thái TCT" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="valid">Hợp lệ</SelectItem>
            <SelectItem value="cancelled">Đã huỷ</SelectItem>
            <SelectItem value="replaced">Thay thế</SelectItem>
            <SelectItem value="adjusted">Điều chỉnh</SelectItem>
            <SelectItem value="pending">Chờ kiểm tra</SelectItem>
            <SelectItem value="unknown">Chưa rõ</SelectItem>
          </SelectContent>
        </Select>
        <Select value={matched} onValueChange={(v) => setMatched(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Đối chiếu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="matched">Đã ghi nhận sổ</SelectItem>
            <SelectItem value="unmatched">Chưa ghi nhận</SelectItem>
          </SelectContent>
        </Select>
        <Select value={xmlStatus} onValueChange={setXmlStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tải XML" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">XML: Tất cả</SelectItem>
            <SelectItem value="done">XML: Đã tải</SelectItem>
            <SelectItem value="pending">XML: Đang chờ</SelectItem>
            <SelectItem value="failed">XML: Lỗi</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
          />
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {total} hoá đơn
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Ngày HĐ</th>
              <th className="px-3 py-2 text-left">Ký hiệu / Số</th>
              <th className="px-3 py-2 text-left">
                {tab === "out" ? "Khách hàng" : "Nhà cung cấp"}
              </th>
              <th className="px-3 py-2 text-left">MST</th>
              <th className="px-3 py-2 text-right">Tổng</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              <th className="px-3 py-2 text-left">XML</th>
              <th className="px-3 py-2 text-left">Đã ghi nhận</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-border">
                  <td colSpan={9} className="px-3 py-2">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-12 text-center text-muted-foreground"
                >
                  Chưa có HĐĐT nào. Bấm{" "}
                  <b>Nhập XML vào kho HĐĐT</b> để bắt đầu, hoặc{" "}
                  <b>Đồng bộ từ TCT</b> để kéo trực tiếp.
                </td>
              </tr>
            ) : (
              rows.map((r: any) => {
                const partyName =
                  tab === "out" ? r.buyer_name : r.seller_name;
                const partyTax =
                  tab === "out" ? r.buyer_tax_id : r.seller_tax_id;
                const matchedId =
                  tab === "out"
                    ? r.matched_sales_invoice_id
                    : r.matched_purchase_invoice_id;
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.issue_date || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        to="/einvoices/$id"
                        params={{ id: r.id }}
                        className="font-medium hover:underline"
                      >
                        {r.invoice_series ? `${r.invoice_series} · ` : ""}
                        {r.invoice_no || "—"}
                      </Link>
                      {r.tct_lookup_code && (
                        <div className="text-[11px] text-muted-foreground">
                          MTC: {r.tct_lookup_code}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[260px] truncate">
                      {partyName || "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {partyTax || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {vnd(r.total)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge s={r.tct_status} />
                    </td>
                    <td className="px-3 py-2">
                      <XmlStatusBadge
                        s={r.xml_fetch_status}
                        err={r.xml_fetch_error}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {matchedId ? (
                        <Link
                          to={tab === "out" ? "/sales/$id" : "/invoices/$id"}
                          params={{ id: matchedId }}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          Đã liên kết
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Chưa
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to="/einvoices/$id"
                        params={{ id: r.id }}
                        className="text-xs text-primary hover:underline"
                      >
                        Chi tiết →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Trước
          </Button>
          <span>
            Trang {page} / {Math.ceil(total / 50)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 50 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau →
          </Button>
        </div>
      )}

      <SyncTctDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        defaultDirection={tab}
      />
    </div>
  );
}
