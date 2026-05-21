import { Check, AlertTriangle, FileText, Loader2, Play, Image as ImageIcon, FileSpreadsheet, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BulkPlan, BulkItem, BulkItemKindGroup } from "./types";

const GROUP_LABEL: Record<BulkItemKindGroup, { label: string; Icon: any; status: string; tone: "ok" | "warn" }> = {
  purchase_invoice: { label: "Hoá đơn vào (HĐ điện tử)", Icon: FileText, status: "✓ đọc rõ", tone: "ok" },
  sales_invoice:    { label: "Hoá đơn ra (xuất cho KH)", Icon: FileText, status: "✓ đọc rõ", tone: "ok" },
  bank_statement:   { label: "Sao kê ngân hàng",          Icon: Landmark, status: "✓ đọc rõ", tone: "ok" },
  invoice_image:    { label: "Ảnh chụp HĐ giấy",          Icon: ImageIcon, status: "⚠ OCR khó", tone: "warn" },
  excel_unknown:    { label: "Excel chưa rõ nội dung",    Icon: FileSpreadsheet, status: "cần xác nhận", tone: "warn" },
  other:            { label: "Định dạng khác",            Icon: FileText, status: "cần kiểm tra", tone: "warn" },
};

export function BulkIntakeCard({
  plan,
  onRun,
  running,
  done,
}: {
  plan: BulkPlan;
  onRun: () => void;
  running?: boolean;
  done?: boolean;
}) {
  const auto = plan.items.filter((i) => i.bucket === "auto");
  const review = plan.items.filter((i) => i.bucket === "review");
  const ask = plan.items.filter((i) => i.bucket === "ask");

  const groups = (Object.keys(plan.groupCounts) as BulkItemKindGroup[])
    .filter((g) => plan.groupCounts[g] > 0);

  const etaMin = Math.max(1, Math.round(plan.etaSec / 60));

  return (
    <div className="space-y-3">
      {/* Phân loại table */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="border-b border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Phân loại {plan.items.length} files
          {plan.duplicates.length ? ` (đã bỏ ${plan.duplicates.length} file trùng)` : ""}
        </div>
        <ul className="divide-y divide-border/40">
          {groups.map((g) => {
            const meta = GROUP_LABEL[g];
            const Icon = meta.Icon;
            return (
              <li key={g} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{meta.label}</span>
                <span className="font-semibold tabular-nums">{plan.groupCounts[g]}</span>
                <span
                  className={cn(
                    "ml-3 text-xs",
                    meta.tone === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {meta.status}
                </span>
              </li>
            );
          })}
        </ul>
        {plan.duplicates.length > 0 && (
          <div className="border-t border-border/40 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {plan.duplicates.length} file trùng đã bỏ qua:
            </span>{" "}
            {plan.duplicates.slice(0, 3).map((d, i) => (
              <span key={d.id}>
                {i > 0 ? ", " : ""}
                <span className="font-mono">{d.filename}</span>
                {d.dupOf?.reason ? ` (${d.dupOf.reason})` : ""}
              </span>
            ))}
            {plan.duplicates.length > 3 && ` … +${plan.duplicates.length - 3}`}
          </div>
        )}
      </div>

      {/* Plan buckets */}
      <div className="space-y-2">
        <BucketRow
          tone="ok"
          title="Tự hạch toán"
          subtitle="Tin cậy ≥ 95% · khớp quy tắc đã có"
          count={auto.length}
          items={auto}
        />
        <BucketRow
          tone="warn"
          title="Đẩy vào “Cần xem lại”"
          subtitle="Tôi không tự quyết được — sếp duyệt khi rảnh, không gấp"
          count={review.length}
          items={review}
        />
        <BucketRow
          tone="danger"
          title="Hỏi sếp ngay"
          subtitle="Cần thêm thông tin trước khi xử lý tiếp"
          count={ask.length}
          items={ask}
        />
      </div>

      {/* Actions */}
      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={onRun}
            disabled={running || auto.length + review.length === 0}
            className="gap-1.5"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Chạy kế hoạch
          </Button>
          <span className="text-xs text-muted-foreground">~{etaMin} phút</span>
        </div>
      )}
    </div>
  );
}

function BucketRow({
  tone,
  title,
  subtitle,
  count,
  items,
}: {
  tone: "ok" | "warn" | "danger";
  title: string;
  subtitle: string;
  count: number;
  items: BulkItem[];
}) {
  if (count === 0) return null;
  const border =
    tone === "ok"
      ? "border-l-emerald-500/60"
      : tone === "warn"
        ? "border-l-amber-500/60"
        : "border-l-rose-500/60";
  const Icon = tone === "ok" ? Check : tone === "warn" ? AlertTriangle : AlertTriangle;
  return (
    <div className={cn("rounded-xl border border-border/60 border-l-4 bg-card/40 p-3", border)}>
      <div className="flex items-start gap-3">
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            tone === "ok"
              ? "text-emerald-600 dark:text-emerald-400"
              : tone === "warn"
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-lg font-bold tabular-nums">{count} mục</div>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
          {items.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground/90">
              {items.slice(0, 3).map((it) => (
                <li key={it.id} className="truncate">
                  · <span className="font-mono">{it.filename}</span>
                  {it.reason && <span className="text-muted-foreground/70"> — {it.reason}</span>}
                </li>
              ))}
              {items.length > 3 && <li>… +{items.length - 3} mục</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
