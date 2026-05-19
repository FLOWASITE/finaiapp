import { Download, Printer, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateRangeFilter } from "@/components/date-range-filter";

type Props = {
  title: string;
  subtitle?: string;
  from: string;
  to: string;
  onRangeChange: (r: { from: string; to: string }) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  isLoading?: boolean;
  children: React.ReactNode;
  extraFilters?: React.ReactNode;
};

export function ReportShell({
  title,
  subtitle,
  from,
  to,
  onRangeChange,
  onRefresh,
  onExport,
  isLoading,
  children,
  extraFilters,
}: Props) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 print:p-0 space-y-4">
      <div className="flex flex-col gap-1 print:hidden">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 sm:p-4 print:hidden">
        <DateRangeFilter from={from} to={to} onChange={onRangeChange} />
        {extraFilters}
        <div className="ml-auto flex gap-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RotateCw className={`mr-1 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Cập nhật
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> In
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="hidden print:block p-4 text-center">
          <h2 className="text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-sm">{subtitle}</p>}
          <p className="text-xs mt-1">Kỳ: {from} → {to}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fmtVN = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
