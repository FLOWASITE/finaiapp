import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileCheck2,
  Link2,
  Bell,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  getEInvoiceDailyDigest,
  emitEInvoiceDigestNotification,
} from "@/lib/einvoices.functions";

export const Route = createFileRoute("/_app/einvoices/digest")({
  validateSearch: (s: Record<string, unknown>) => ({
    date: typeof s.date === "string" ? s.date : undefined,
  }),
  component: DigestPage,
});

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("vi-VN").format(Number(n));

function DigestPage() {
  const { date } = Route.useSearch();
  const navigate = Route.useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const day = date ?? today;

  const get = useServerFn(getEInvoiceDailyDigest);
  const emit = useServerFn(emitEInvoiceDigestNotification);

  const query = useQuery({
    queryKey: ["einvoice-digest", day],
    queryFn: () => get({ data: { date: day } }),
  });

  const emitMut = useMutation({
    mutationFn: () => emit({ data: { date: day } }),
    onSuccess: (r: any) => {
      if (r?.skipped) toast.info("Thông báo trong ngày đã tồn tại");
      else if (r?.empty) toast.info("Không có hoạt động để thông báo");
      else toast.success("Đã tạo thông báo tổng hợp");
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const d = query.data;

  return (
    <div className="space-y-4 p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/einvoices" search={{ tab: "in" }}>
              <ArrowLeft className="h-3 w-3 mr-1" /> HĐĐT
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileCheck2 className="h-6 w-6" />
            Nhật ký HĐĐT theo ngày
          </h1>
          <p className="text-sm text-muted-foreground">
            Tổng hợp hoá đơn tải XML, ghép sổ và lỗi trong ngày.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={day}
            onChange={(e) =>
              navigate({ search: { date: e.target.value || undefined } })
            }
            className="w-44"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => emitMut.mutate()}
            disabled={emitMut.isPending}
            title="Tạo thông báo tổng hợp trong chuông"
          >
            <Bell className="h-4 w-4 mr-2" />
            Tạo thông báo
          </Button>
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
        </div>
      </div>

      {query.isLoading || !d ? (
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard
              icon={<FileCheck2 className="h-4 w-4 text-emerald-600" />}
              label="Tải chi tiết XML"
              value={d.fetched.count}
              tone="emerald"
            />
            <StatCard
              icon={<Link2 className="h-4 w-4 text-blue-600" />}
              label="Đã khớp chứng từ nội bộ"
              value={d.matched.count}
              tone="blue"
            />
            <StatCard
              icon={<XCircle className="h-4 w-4 text-destructive" />}
              label="Lỗi tải XML"
              value={d.failed.count}
              tone="rose"
            />
          </div>

          <Section
            title="Vừa tải chi tiết XML"
            empty="Không có hóa đơn nào tải chi tiết trong ngày."
            items={d.fetched.items}
            badge="OK"
            badgeTone="emerald"
          />
          <Section
            title="Vừa được ghép với chứng từ nội bộ"
            empty="Không có hóa đơn nào được ghép trong ngày."
            items={d.matched.items}
            badge="Khớp"
            badgeTone="blue"
          />
          <Section
            title="Lỗi tải XML"
            empty="Không có lỗi trong ngày."
            items={d.failed.items}
            badge="Lỗi"
            badgeTone="rose"
            showError
          />
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "emerald" | "blue" | "rose";
}) {
  const toneCls = {
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    rose: "border-destructive/30 bg-destructive/5",
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${toneCls}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  );
}

function Section({
  title,
  empty,
  items,
  badge,
  badgeTone,
  showError,
}: {
  title: string;
  empty: string;
  items: any[];
  badge: string;
  badgeTone: "emerald" | "blue" | "rose";
  showError?: boolean;
}) {
  const toneCls = {
    emerald: "text-emerald-700 border-emerald-500/30",
    blue: "text-blue-700 border-blue-500/30",
    rose: "text-destructive border-destructive/30",
  }[badgeTone];
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}{" "}
        <span className="text-foreground/70 normal-case">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border first:border-t-0">
                  <td className="p-3 w-24">
                    <Badge variant="outline" className={`gap-1 ${toneCls}`}>
                      {badgeTone === "emerald" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : badgeTone === "rose" ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      {badge}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Link
                      to="/einvoices/$id"
                      params={{ id: it.id }}
                      className="font-medium hover:underline"
                    >
                      {it.invoice_series ? `${it.invoice_series}-` : ""}
                      {it.invoice_no ?? "—"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {it.direction === "in"
                        ? it.seller_name ?? "—"
                        : it.buyer_name ?? "—"}
                      {showError && it.xml_fetch_error ? (
                        <span className="text-destructive">
                          {" "}
                          • {it.xml_fetch_error}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap text-xs text-muted-foreground">
                    {it.issue_date ?? "—"}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {fmtMoney(it.total)} đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
