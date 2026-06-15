import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, PackagePlus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listProducts } from "@/lib/inventory.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { cn } from "@/lib/utils";
import { ItemCreateDialog } from "@/components/catalog/ItemCreateDialog";

type Mode = "purchase" | "sales";

type Product = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  on_hand?: number | null;
  item_type?: string | null;
  stock_account?: string | null;
  expense_account?: string | null;
  revenue_account?: string | null;
  vat_rate?: number | null;
  can_be_sold?: boolean;
  can_be_purchased?: boolean;
  barcode?: string | null;
  usage_count?: number | null;
};

function normalizeVi(s: string) {
  return (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const fmt = (n: number | null | undefined) => nf.format(Math.round(Number(n ?? 0)));

function productTypeLabel(p: Product): { label: string; tone: "default" | "secondary" | "outline" } {
  if (p.item_type === "service") return { label: "Dịch vụ", tone: "secondary" };
  if (p.item_type === "combo") return { label: "Combo", tone: "outline" };
  if (p.stock_account === "152") return { label: "NVL", tone: "outline" };
  if (p.stock_account === "153") return { label: "CCDC", tone: "outline" };
  if (p.stock_account === "211" || p.stock_account === "213") return { label: "TSCĐ", tone: "outline" };
  if (p.stock_account === "242") return { label: "CP phân bổ", tone: "outline" };
  return { label: "Hàng hóa", tone: "default" };
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const nq = normalizeVi(query);
  const nt = normalizeVi(text);
  const idx = nt.indexOf(nq);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export type ProductPickerCellProps = {
  /** Hiển thị trong ô (thường là tên sản phẩm) */
  value: string;
  /** Mã hiển thị cùng tên (tuỳ chọn) — nếu có sẽ render dạng chip [SP001] */
  code?: string;
  onPick: (p: Product) => void;
  /** "purchase" → cần `can_be_purchased`, hiển thị Giá mua. "sales" → `can_be_sold`, Giá bán. */
  mode?: Mode;
  /** Nếu cha đã có danh sách sản phẩm, có thể truyền vào để tránh fetch lại */
  products?: Product[];
  /** Cho phép xoá nhanh khi đã chọn */
  onClear?: () => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function ProductPickerCell({
  value,
  code,
  onPick,
  mode = "purchase",
  products: productsProp,
  onClear,
  className,
  inputClassName,
  placeholder = "Vui lòng chọn",
  disabled,
}: ProductPickerCellProps) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const fn = useServerFn(listProducts);
  const internal = useQuery({
    queryKey: ["products-picker"],
    queryFn: () => fn(),
    enabled: open && !productsProp,
    ...QUERY_PRESETS.REFERENCE,
  });
  const all = (productsProp ?? (internal.data as Product[] | undefined) ?? []) as Product[];
  const isLoading = !productsProp && internal.isLoading;

  const filtered = useMemo(() => {
    const nq = normalizeVi(q.trim());
    const base = all.map((p) => {
      const allowedFlag = mode === "purchase" ? p.can_be_purchased : p.can_be_sold;
      return { p, disallowed: allowedFlag === false };
    });
    const matched = nq
      ? base.filter(({ p }) =>
          normalizeVi(p.code).includes(nq) ||
          normalizeVi(p.name).includes(nq) ||
          normalizeVi(p.barcode ?? "").includes(nq),
        )
      : base;
    // Khi chưa gõ, sort theo usage_count desc rồi code asc
    if (!nq) {
      matched.sort((a, b) => {
        const ua = Number(a.p.usage_count ?? 0);
        const ub = Number(b.p.usage_count ?? 0);
        if (ua !== ub) return ub - ua;
        return (a.p.code ?? "").localeCompare(b.p.code ?? "");
      });
    }
    return matched;
  }, [all, q, mode]);

  // Reset highlight khi filter đổi
  useEffect(() => {
    setHighlight(0);
  }, [q, open]);

  // Cuộn dòng đang highlight vào viewport
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const pick = useCallback(
    (p: Product) => {
      onPick(p);
      setOpen(false);
      setQ("");
    },
    [onPick],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const row = filtered[highlight];
      if (row && !row.disallowed) {
        e.preventDefault();
        pick(row.p);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const hasValue = !!value;
  const showCode = !!code;

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "group relative flex h-8 w-full items-center rounded-md border border-input bg-background pl-2 pr-7 text-sm transition-colors",
            hasValue ? "cursor-pointer hover:border-primary/40" : "cursor-pointer",
            disabled && "pointer-events-none opacity-50",
            className,
          )}
          onClick={() => !disabled && setOpen(true)}
          role="combobox"
          aria-expanded={open}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        >
          {hasValue ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {showCode && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {code}
                </span>
              )}
              <span className="truncate">{value}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}

          {hasValue && onClear ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              aria-label="Bỏ chọn sản phẩm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[min(1080px,95vw)] p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Tìm theo mã, tên hoặc mã vạch…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              className="h-8 pl-7"
            />
          </div>
        </div>

        <div ref={listRef} className="max-h-[420px] overflow-auto">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[90px]" />
              <col />
              <col className="w-[120px]" />
              <col className="w-[80px]" />
              <col className="w-[120px]" />
              <col className="w-[100px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">Mã</th>
                <th className="px-2 py-1.5 font-medium">Tên sản phẩm</th>
                <th className="px-2 py-1.5 font-medium">Loại</th>
                <th className="px-2 py-1.5 font-medium">ĐVT</th>
                <th className="px-2 py-1.5 text-right font-medium">
                  {mode === "purchase" ? "Giá mua" : "Giá bán"}
                </th>
                <th className="px-2 py-1.5 text-right font-medium">SL tồn</th>
                <th className="px-2 py-1.5 text-right font-medium">GT tồn</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-2 py-2">
                        <Skeleton className="h-3.5 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-8">
                    <EmptyState
                      size="sm"
                      bordered={false}
                      title={
                        q.trim()
                          ? `Không tìm thấy "${q.trim()}"`
                          : "Chưa có sản phẩm nào"
                      }
                      description={
                        q.trim()
                          ? "Thử từ khoá khác, hoặc tạo sản phẩm mới."
                          : "Vào Kho hàng để tạo sản phẩm đầu tiên."
                      }
                    />
                  </td>
                </tr>
              ) : (
                <TooltipProvider delayDuration={200}>
                  {filtered.map(({ p, disallowed }, idx) => {
                    const onHand = Number(p.on_hand ?? 0);
                    const unitCost = Number(p.unit_cost ?? 0);
                    const stockValue = onHand * unitCost;
                    const price =
                      mode === "purchase"
                        ? unitCost
                        : Number(p.unit_price ?? 0);
                    const tip = productTypeLabel(p);
                    const isHi = idx === highlight;
                    const outOfStock = mode === "sales" && onHand <= 0;
                    const isService = p.item_type === "service";

                    const row = (
                      <tr
                        key={p.id}
                        data-row={idx}
                        className={cn(
                          "border-t",
                          disallowed
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer hover:bg-accent",
                          isHi && !disallowed && "bg-accent",
                        )}
                        onMouseEnter={() => !disallowed && setHighlight(idx)}
                        onClick={() => !disallowed && pick(p)}
                      >
                        <td className="truncate px-2 py-1.5 font-mono text-xs">
                          <HighlightedText text={p.code ?? ""} query={q} />
                        </td>
                        <td className="truncate px-2 py-1.5">
                          <HighlightedText text={p.name ?? ""} query={q} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Badge variant={tip.tone} className="whitespace-nowrap font-normal">
                            {tip.label}
                          </Badge>
                        </td>
                        <td className="truncate px-2 py-1.5 text-muted-foreground">
                          {p.unit ?? "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {price > 0 ? fmt(price) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums",
                            outOfStock && "text-destructive",
                          )}
                        >
                          {isService ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            fmt(onHand)
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {isService ? (
                            <span className="text-muted-foreground">—</span>
                          ) : stockValue > 0 ? (
                            fmt(stockValue)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );

                    if (disallowed) {
                      return (
                        <Tooltip key={p.id}>
                          <TooltipTrigger asChild>{row}</TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {mode === "purchase"
                              ? "Sản phẩm không cho phép mua"
                              : "Sản phẩm không cho phép bán"}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return row;
                  })}
                </TooltipProvider>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{filtered.length} sản phẩm</span>
            <span className="hidden sm:inline">
              <kbd className="rounded border bg-background px-1">↑</kbd>{" "}
              <kbd className="rounded border bg-background px-1">↓</kbd> chọn ·{" "}
              <kbd className="rounded border bg-background px-1">Enter</kbd> xác nhận ·{" "}
              <kbd className="rounded border bg-background px-1">Esc</kbd> đóng
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
          >
            <PackagePlus className="h-3.5 w-3.5" />
            Tạo sản phẩm mới
          </Button>
        </div>

        {filtered.length === 0 && !isLoading && all.length === 0 && q.trim() === "" ? (
          <div className="flex items-center gap-2 border-t bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="h-3.5 w-3.5" />
            Chưa có sản phẩm trong kho. Hãy tạo sản phẩm trước khi lập phiếu.
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
    <ItemCreateDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={(p: Product) => {
        setCreateOpen(false);
        onPick(p);
      }}
    />
    </>
  );
}
