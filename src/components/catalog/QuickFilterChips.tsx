import { AlertTriangle, Clock, Globe, Wallet } from "lucide-react";
import { useCatalogStore } from "@/stores/catalogStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const FILTER_KEYS = {
  USED_THIS_MONTH: "used_this_month",
  HAS_WARNING: "has_warning",
  PREPAID: "prepaid",
  FOREIGN: "foreign",
} as const;

export function QuickFilterChips() {
  const activeFilters = useCatalogStore((s) => s.activeFilters);
  const toggleFilter = useCatalogStore((s) => s.toggleFilter);
  const items = useCatalogStore((s) => s.items);

  const warningCount = items.filter(
    (i) =>
      i.isActive &&
      (i.foreignSupplierTax === "fct_applicable" ||
        i.allocationMethod === "manual_split" ||
        i.amortization !== "expense_immediately"),
  ).length;

  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const prepaidLabel = regime === "TT99" ? "Chi phí chờ phân bổ" : "Chi phí trả trước";

  const chips = [
    {
      key: FILTER_KEYS.USED_THIS_MONTH,
      label: "Đang dùng tháng này",
      icon: <Clock className="h-3.5 w-3.5" />,
      tone: "default" as const,
    },
    {
      key: FILTER_KEYS.HAS_WARNING,
      label: `Có cảnh báo (${warningCount})`,
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      tone: "warn" as const,
    },
    {
      key: FILTER_KEYS.PREPAID,
      label: "Trả trước · 242",
      icon: <Wallet className="h-3.5 w-3.5" />,
      tone: "default" as const,
      tip: `TK 242 — ${prepaidLabel} (theo ${regime === "TT99" ? "TT 99" : "TT 133"})`,
    },
    {
      key: FILTER_KEYS.FOREIGN,
      label: "NCC nước ngoài · FCT",
      icon: <Globe className="h-3.5 w-3.5" />,
      tone: "default" as const,
    },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const active = activeFilters.has(c.key);
          const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border";
          const styles = active
            ? c.tone === "warn"
              ? "bg-[#FCEBEB] text-[#791F1F] border-[#791F1F]/30"
              : "bg-[#0F6E56] text-white border-[#0F6E56]"
            : c.tone === "warn"
              ? "bg-white text-[#791F1F] border-[#791F1F]/30 hover:bg-[#FCEBEB]"
              : "bg-white text-[#2C2C2A] border-gray-200 hover:bg-gray-50";
          const btn = (
            <button key={c.key} onClick={() => toggleFilter(c.key)} className={`${base} ${styles}`}>
              {c.icon}
              {c.label}
            </button>
          );
          return c.tip ? (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent>{c.tip}</TooltipContent>
            </Tooltip>
          ) : (
            btn
          );
        })}
      </div>
    </TooltipProvider>
  );
}
