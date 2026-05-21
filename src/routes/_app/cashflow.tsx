import { createFileRoute, Link } from "@tanstack/react-router";
import { TrendingUp, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/cashflow")({
  component: CashflowPage,
  head: () => ({ meta: [{ title: "Dòng tiền · FinAI" }] }),
});

function CashflowPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dòng tiền</h1>
          <p className="text-sm text-muted-foreground">
            Phân tích dòng tiền vào – ra theo thời gian thực
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Tính năng đang được phát triển. Trong lúc chờ, bạn có thể xem báo cáo
          lưu chuyển tiền tệ chuẩn.
        </p>
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Xem báo cáo lưu chuyển tiền tệ
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
