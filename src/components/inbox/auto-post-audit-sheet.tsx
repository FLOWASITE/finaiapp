import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Zap, Loader2, ExternalLink, AlertTriangle, Settings2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAutoPostedRecent } from "@/lib/categorize.functions";
import { toast } from "sonner";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n || 0));

const fmtDateTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export function AutoPostAuditSheet({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings?: { enabled: boolean; min_confidence: number; max_amount: number };
}) {
  const fetchRecent = useServerFn(getAutoPostedRecent);
  const { data, isLoading } = useQuery({
    queryKey: ["auto-posted-recent", 7],
    queryFn: () => fetchRecent({ data: { days: 7, limit: 50 } }),
    enabled: open,
  });

  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Fin đã tự duyệt 7 ngày qua
          </SheetTitle>
          <SheetDescription>
            Danh sách bút toán Fin tự ghi sổ — kiểm tra nhanh, báo sai nếu phát hiện lỗi.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-4 grid grid-cols-2 gap-3 border-b border-border/40">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Số bút toán
            </div>
            <div className="text-2xl font-bold mt-1">{data?.count_7d ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Tổng giá trị
            </div>
            <div className="text-2xl font-bold mt-1">
              {data ? `${fmtMoney(data.sum_amount_7d)} đ` : "—"}
            </div>
          </div>
        </div>

        {settings && (
          <div className="px-6 py-3 border-b border-border/40 flex items-start gap-2 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fin chỉ tự duyệt khi <b>độ tin cậy ≥ {Math.round(settings.min_confidence * 100)}%</b>,{" "}
              <b>giá trị ≤ {fmtMoney(settings.max_amount)} đ</b>, NCC đã định danh và không có cảnh báo.
              Mọi thao tác đều có log audit. Bạn có thể rút phép bất cứ lúc nào.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Chưa có bút toán nào"
              description="Fin chưa tự duyệt bút toán nào trong 7 ngày qua."
            />
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border/50 bg-card p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {item.party_name ?? "—"}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {item.invoice_kind === "sales" ? "Bán" : "Mua"}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          {Math.round(item.confidence * 100)}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>Số {item.invoice_no ?? "—"}</span>
                        <span>•</span>
                        <span>{item.issue_date ?? "—"}</span>
                        <span>•</span>
                        <span className="font-medium text-foreground">{fmtMoney(item.total)} đ</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Tự ghi lúc {fmtDateTime(item.resolved_at)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs">
                        <Link
                          to="/invoices/$id"
                          params={{ id: item.invoice_id }}
                          onClick={() => onOpenChange(false)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Xem
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800"
                        onClick={() =>
                          toast.success("Đã ghi nhận, Fin sẽ học lại từ phản hồi này.")
                        }
                      >
                        Báo sai
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/40 px-6 py-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Cài đặt ngưỡng auto-duyệt tại Trí nhớ AI.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/ai/memory" onClick={() => onOpenChange(false)}>
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
              Mở cài đặt
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
