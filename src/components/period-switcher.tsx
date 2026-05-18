import { useEffect, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PeriodKey = "month" | "quarter" | "ytd";

const STORAGE_KEY = "app.period";
const EVENT = "app:period-change";

const OPTIONS: { key: PeriodKey; label: string; hint: string }[] = [
  { key: "month", label: "Theo tháng", hint: "Dữ liệu tháng hiện tại" },
  { key: "quarter", label: "Theo quý", hint: "Dữ liệu quý hiện tại" },
  { key: "ytd", label: "Lũy kế năm", hint: "Từ đầu năm đến hiện tại" },
];

function formatPeriod(key: PeriodKey, now: Date) {
  const y = now.getFullYear();
  if (key === "month") return `Tháng ${String(now.getMonth() + 1).padStart(2, "0")}/${y}`;
  if (key === "quarter") return `Quý ${Math.floor(now.getMonth() / 3) + 1}/${y}`;
  return `Lũy kế ${y}`;
}

export function usePeriod() {
  const [period, setPeriodState] = useState<PeriodKey>("month");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (localStorage.getItem(STORAGE_KEY) as PeriodKey)) || "month";
    if (stored === "month" || stored === "quarter" || stored === "ytd") setPeriodState(stored);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PeriodKey>).detail;
      if (detail) setPeriodState(detail);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  const setPeriod = (next: PeriodKey) => {
    localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  };

  return { period, setPeriod };
}

export function PeriodSwitcher() {
  const { period, setPeriod } = usePeriod();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const label = mounted ? formatPeriod(period, new Date()) : "Kỳ kế toán";
  const sub = OPTIONS.find((o) => o.key === period)?.label ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="group relative hidden md:flex h-9 items-center gap-2 rounded-full border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-cyan-500/10 px-3 text-xs hover:from-emerald-500/15 hover:to-cyan-500/15"
        >
          <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 opacity-0 blur transition-opacity group-hover:opacity-60" />
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CalendarRange className="h-3.5 w-3.5" />
          </span>
          <span className="relative flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              Kỳ kế toán
            </span>
            <span className="text-[12px] font-medium text-foreground">{label}</span>
          </span>
          <ChevronDown className="relative h-3.5 w-3.5 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Chọn kỳ</span>
          <span className="text-[11px] font-normal text-muted-foreground">{sub}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((o) => {
          const active = o.key === period;
          return (
            <DropdownMenuItem
              key={o.key}
              onClick={() => setPeriod(o.key)}
              className={cn("flex items-start gap-2 py-2", active && "bg-primary/5")}
            >
              <Check className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "opacity-0")} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{o.label}</span>
                <span className="text-[11px] text-muted-foreground">{o.hint}</span>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
