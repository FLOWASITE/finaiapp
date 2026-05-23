import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  RefreshCw,
  CheckCircle2,
  X,
  ArrowLeft,
  Inbox as InboxIcon,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listEInvoiceSuggestions,
  linkEInvoice,
  dismissEInvoiceSuggestion,
} from "@/lib/einvoices.functions";

export const Route = createFileRoute("/_app/einvoices/inbox")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab === "out" ? "out" : "in") as "in" | "out",
  }),
  component: InboxPage,
});

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("vi-VN").format(Number(n));

function InboxPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useServerFn(listEInvoiceSuggestions);
  const link = useServerFn(linkEInvoice);
  const dismiss = useServerFn(dismissEInvoiceSuggestion);

  const query = useQuery({
    queryKey: ["einvoice-suggestions", tab],
    queryFn: () => list({ data: { direction: tab, limit: 50 } }),
  });

  const linkMut = useMutation({
    mutationFn: (vars: { einvoiceId: string; targetId: string }) =>
      link({ data: vars }),
    onSuccess: () => {
      toast.success("Đã liên kết HĐĐT với chứng từ nội bộ");
      query.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi liên kết"),
  });

  const dismissMut = useMutation({
    mutationFn: (einvoiceId: string) => dismiss({ data: { einvoiceId } }),
    onSuccess: () => {
      toast.success("Đã loại khỏi danh sách gợi ý");
      query.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const suggestions = query.data?.suggestions ?? [];

  return (
    <div className="space-y-4 p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/einvoices" search={{ tab }}>
                <ArrowLeft className="h-3 w-3 mr-1" /> HĐĐT
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <InboxIcon className="h-6 w-6" />
            Hộp thư gợi ý ghép HĐĐT
          </h1>
          <p className="text-sm text-muted-foreground">
            Các hoá đơn điện tử chưa liên kết, hệ thống tìm thấy chứng từ nội bộ
            có khả năng trùng khớp. Xác nhận hoặc loại bỏ.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`}
          />
          Làm mới
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "in" | "out" } })
        }
      >
        <TabsList>
          <TabsTrigger value="in">Đầu vào (mua)</TabsTrigger>
          <TabsTrigger value="out">Đầu ra (bán)</TabsTrigger>
        </TabsList>
      </Tabs>

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <InboxIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Không có gợi ý nào. Tất cả HĐĐT đã được xử lý.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((s) => {
            const e = s.einvoice;
            const party =
              tab === "in"
                ? `${e.seller_name ?? "—"} (MST ${e.seller_tax_id ?? "—"})`
                : `${e.buyer_name ?? "—"} (MST ${e.buyer_tax_id ?? "—"})`;
            return (
              <div
                key={e.id}
                className="rounded-lg border border-border bg-card p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        HĐĐT {e.invoice_series ? `${e.invoice_series}-` : ""}
                        {e.invoice_no ?? "—"}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {e.issue_date ?? "—"}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {fmtMoney(e.total)} đ
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {party}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      title="Xem chi tiết HĐĐT"
                    >
                      <Link to="/einvoices/$id" params={{ id: e.id }}>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => dismissMut.mutate(e.id)}
                      disabled={dismissMut.isPending}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Loại bỏ
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 pl-2 border-l-2 border-primary/30">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Gợi ý ghép với {s.candidates.length} chứng từ nội bộ
                  </p>
                  {s.candidates.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="font-medium">
                            Số {c.invoice_no ?? "—"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {c.issue_date ?? "—"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            • {fmtMoney(c.total)} đ
                          </span>
                          <Badge
                            variant={c.score >= 90 ? "default" : "outline"}
                            className="text-[10px]"
                          >
                            Tin cậy {c.score}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {c.reasons.join(" • ")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() =>
                          linkMut.mutate({
                            einvoiceId: e.id,
                            targetId: c.id,
                          })
                        }
                        disabled={linkMut.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Chấp nhận
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
