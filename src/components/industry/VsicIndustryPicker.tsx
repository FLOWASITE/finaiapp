import * as React from "react";
import {
  Check, ChevronRight, ChevronsUpDown, Search, Sparkles, X, Star, Plus,
  Wheat, Pickaxe, Factory, Zap, Recycle, HardHat, ShoppingBag, Truck,
  UtensilsCrossed, Newspaper, Laptop, Landmark, Home, Briefcase, Settings,
  Building, GraduationCap, Stethoscope, Music, Sparkles as SparklesIcon,
  Users, Globe, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  VSIC_2025_LEVEL1,
  VsicL1Industry,
  getChildren,
  getVsicLevel1,
  getVsicNode,
  inferLevel,
  getL1CodeOf,
  searchVsic,
  getAncestors,
} from "@/lib/vsic-2025";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Wheat, Pickaxe, Factory, Zap, Recycle, HardHat, ShoppingBag, Truck,
  UtensilsCrossed, Newspaper, Laptop, Landmark, Home, Briefcase, Settings,
  Building, GraduationCap, Stethoscope, Music, Sparkles: SparklesIcon,
  Users, Globe,
};

/** Item lưu xuống DB — giữ shape cũ {code, name} để tương thích server schema */
export interface VsicSelection {
  code: string;
  name: string;
}

interface Props {
  value: VsicSelection[];
  onChange: (v: VsicSelection[]) => void;
  disabled?: boolean;
  /** Cho phép chọn nhiều ngành (DN có thể đa ngành). Default true. */
  multi?: boolean;
  /** Ẩn các ngành P/U/V (gov/hộ/quốc tế). Default true. */
  hideNonBusiness?: boolean;
}

function levelBadgeClass(level: number) {
  switch (level) {
    case 1: return "bg-primary/15 text-primary border-primary/20";
    case 2: return "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400";
    case 3: return "bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400";
    case 4: return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-400";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function pathLabel(code: string): string {
  // Build "A → 01 → 011" path
  const lvl = inferLevel(code);
  if (!lvl) return code;
  if (lvl === 1) return code;
  const node = getVsicNode(code);
  if (!node) return code;
  const ancestors = getAncestors(code).map((a) => a.code);
  const l1 = getL1CodeOf(code);
  return [l1, ...ancestors, code].filter(Boolean).join(" → ");
}

function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const i = lower.indexOf(ql);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function VsicIndustryPicker({
  value, onChange, disabled, multi = true, hideNonBusiness = true,
}: Props) {
  const [showNonBiz, setShowNonBiz] = React.useState(!hideNonBusiness);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const visibleL1 = React.useMemo(
    () => VSIC_2025_LEVEL1.filter((i) => showNonBiz || !i.nonBusiness),
    [showNonBiz],
  );

  const decorated = React.useMemo(
    () => value.map((v) => {
      const lvl = inferLevel(v.code) ?? 1;
      const l1 = getL1CodeOf(v.code);
      const l1Info = (l1 ? getVsicLevel1(l1) : null) ?? null;
      return { ...v, level: lvl, l1Code: l1, l1Info };
    }),
    [value],
  );

  const primary = decorated[0];
  const secondary = decorated.slice(1);

  const remove = (code: string) => onChange(value.filter((x) => x.code !== code));
  const setPrimary = (code: string) => {
    const idx = value.findIndex((x) => x.code === code);
    if (idx <= 0) return;
    const next = [...value];
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    onChange(next);
  };
  const addItem = (sel: VsicSelection) => {
    if (value.some((x) => x.code === sel.code)) return;
    if (!multi) onChange([sel]);
    else onChange([...value, sel]);
    setSearch("");
    setPickerOpen(false);
  };

  const searchHits = React.useMemo(
    () => (search.trim().length >= 2 ? searchVsic(search, 50) : []),
    [search],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-3">
        {/* Primary industry card */}
        {primary && (
          <PrimaryCard
            item={primary}
            disabled={disabled}
            onRemove={() => remove(primary.code)}
          />
        )}

        {/* Secondary chips */}
        {secondary.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Ngành phụ ({secondary.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {secondary.map((it) => (
                <SecondaryChip
                  key={it.code}
                  item={it}
                  disabled={disabled}
                  onMakePrimary={() => setPrimary(it.code)}
                  onRemove={() => remove(it.code)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Trigger */}
        {(multi || value.length === 0) && !disabled && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              {value.length === 0 ? (
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-4 py-4 text-sm font-medium text-primary hover:bg-primary/10 hover:border-primary/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Sparkles className="h-4 w-4" />
                  Chọn ngành nghề kinh doanh
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              ) : (
                <Button variant="outline" size="sm" className="font-normal">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Thêm ngành phụ
                </Button>
              )}
            </PopoverTrigger>
            <PopoverContent
              className="p-0 w-[min(680px,calc(100vw-2rem))]"
              align="start"
            >
              <PickerBody
                showNonBiz={showNonBiz}
                onToggleNonBiz={setShowNonBiz}
                visibleL1={visibleL1}
                search={search}
                onSearch={setSearch}
                searchHits={searchHits}
                onPick={addItem}
                existingCodes={new Set(value.map((v) => v.code))}
              />
            </PopoverContent>
          </Popover>
        )}

        {value.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Chọn ít nhất 1 ngành cấp 1. Có thể thêm cấp 2-4 chi tiết hơn để FinAI gợi ý chính xác catalog & tài khoản.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Selected items
// ============================================================

function PrimaryCard({
  item, disabled, onRemove,
}: {
  item: ReturnType<typeof Object> & { code: string; name: string; level: number; l1Info: VsicL1Industry | null };
  disabled?: boolean;
  onRemove: () => void;
}) {
  const Icon = item.l1Info?.icon ? ICONS[item.l1Info.icon] : null;
  return (
    <div className="flex items-start gap-3 rounded-lg border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        {Icon ? <Icon className="h-5 w-5" /> : <Building className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="default" className="h-5 px-1.5 text-[10px] uppercase tracking-wider">
            <Star className="h-2.5 w-2.5 mr-1 fill-current" />
            Ngành chính
          </Badge>
          <span className={cn("font-mono text-[10px] border rounded px-1.5 py-0.5", levelBadgeClass(item.level))}>
            L{item.level} · {item.code}
          </span>
          {item.l1Info?.finaiSupported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>FinAI có overlay chuyên biệt cho ngành này</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-sm font-medium mt-1 leading-snug">{item.name}</p>
        {item.l1Info && item.level > 1 && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {item.l1Info.code} · {item.l1Info.nameViShort}
          </p>
        )}
      </div>
      {!disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Xoá ngành chính"
              onClick={onRemove}
              className="rounded-md p-1.5 hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition"
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Xoá ngành chính</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function SecondaryChip({
  item, disabled, onMakePrimary, onRemove,
}: {
  item: { code: string; name: string; level: number; l1Info: VsicL1Industry | null };
  disabled?: boolean;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const Icon = item.l1Info?.icon ? ICONS[item.l1Info.icon] : null;
  const fullLabel = `${pathLabel(item.code)} · ${item.name}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group flex items-center gap-1.5 rounded-md border bg-background pl-2 pr-1 py-1 text-xs hover:border-primary/40 transition">
          {Icon && <Icon className="h-3 w-3 text-primary shrink-0" />}
          <span className={cn("font-mono text-[10px] border rounded px-1 py-px", levelBadgeClass(item.level))}>
            L{item.level}·{item.code}
          </span>
          <span className="truncate max-w-[200px]">{item.name}</span>
          {!disabled && (
            <>
              <button
                type="button"
                aria-label="Đặt làm ngành chính"
                onClick={onMakePrimary}
                className="rounded-sm hover:bg-amber-500/15 hover:text-amber-600 p-0.5 text-muted-foreground transition"
              >
                <Star className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Xoá"
                onClick={onRemove}
                className="rounded-sm hover:bg-destructive/15 hover:text-destructive p-0.5 text-muted-foreground transition"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="text-[11px] font-mono opacity-80">{pathLabel(item.code)}</div>
        <div className="text-xs mt-0.5">{item.name}</div>
        <div className="text-[10px] mt-1 opacity-70">Bấm ⭐ để đặt làm ngành chính</div>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================
// Picker popover body
// ============================================================

function PickerBody({
  visibleL1, showNonBiz, onToggleNonBiz, search, onSearch, searchHits, onPick, existingCodes,
}: {
  visibleL1: VsicL1Industry[];
  showNonBiz: boolean;
  onToggleNonBiz: (v: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  searchHits: ReturnType<typeof searchVsic>;
  onPick: (sel: VsicSelection) => void;
  existingCodes: Set<string>;
}) {
  const [step, setStep] = React.useState<"l1" | "drill">("l1");
  const [selectedL1, setSelectedL1] = React.useState<VsicL1Industry | null>(null);

  const goL1 = () => { setStep("l1"); setSelectedL1(null); };
  const pickL1 = (l1: VsicL1Industry) => {
    setSelectedL1(l1);
    setStep("drill");
  };

  return (
    <div className="flex flex-col max-h-[560px]">
      {/* Search bar */}
      <div className="border-b p-2 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc mã (vd: nhà hàng, 5610, lập trình)…"
          className="h-8 border-0 focus-visible:ring-0 px-0 shadow-none"
        />
        {search && (
          <button
            type="button"
            aria-label="Xoá tìm kiếm"
            onClick={() => onSearch("")}
            className="rounded-sm hover:bg-muted p-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex items-center gap-1.5 border-l pl-2 ml-1">
          <Switch
            id="vsic-nonbiz"
            checked={showNonBiz}
            onCheckedChange={onToggleNonBiz}
            className="scale-75"
          />
          <Label htmlFor="vsic-nonbiz" className="text-[11px] text-muted-foreground cursor-pointer whitespace-nowrap">
            Ngành ngoài DN
          </Label>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {search.trim().length >= 2 ? (
          <SearchResults
            hits={searchHits}
            query={search}
            onPick={onPick}
            existingCodes={existingCodes}
          />
        ) : step === "l1" ? (
          <L1Grid
            items={visibleL1}
            onPick={pickL1}
            onPickL1Direct={(l1) => onPick({ code: l1.code, name: l1.nameVi })}
            existingCodes={existingCodes}
          />
        ) : selectedL1 ? (
          <DrillView
            l1={selectedL1}
            onBack={goL1}
            onPick={onPick}
            existingCodes={existingCodes}
          />
        ) : null}
      </div>

      {/* Meta footer */}
      <div className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground text-center">
        Theo QĐ 36/2025/QĐ-TTg · hiệu lực 15/11/2025 · 359 ngành (L1: 22 · L2: 88 · L3: 158 · L4: 91)
      </div>
    </div>
  );
}

// ============================================================
// Search results — grouped by L1
// ============================================================

function SearchResults({
  hits, query, onPick, existingCodes,
}: {
  hits: ReturnType<typeof searchVsic>;
  query: string;
  onPick: (sel: VsicSelection) => void;
  existingCodes: Set<string>;
}) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof hits>();
    for (const h of hits) {
      const arr = map.get(h.l1Code) ?? [];
      arr.push(h);
      map.set(h.l1Code, arr);
    }
    return Array.from(map.entries());
  }, [hits]);

  if (hits.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <Search className="h-6 w-6 mx-auto mb-2 opacity-40" />
        Không tìm thấy ngành phù hợp.
        <div className="text-xs mt-1">Thử từ khoá khác hoặc duyệt theo cấp 1.</div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[440px]">
      {grouped.map(([l1Code, items]) => {
        const l1 = getVsicLevel1(l1Code);
        const Icon = l1?.icon ? ICONS[l1.icon] : null;
        return (
          <div key={l1Code}>
            <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
              <span className="font-mono">{l1Code}</span>
              <span>·</span>
              <span className="truncate">{l1?.nameViShort}</span>
              <span className="ml-auto text-[10px] font-normal opacity-60">{items.length} kết quả</span>
            </div>
            <ul>
              {items.map((h) => {
                const exists = existingCodes.has(h.code);
                return (
                  <li key={`${h.level}-${h.code}`}>
                    <button
                      type="button"
                      disabled={exists}
                      onClick={() => onPick({ code: h.code, name: h.nameVi })}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:bg-muted/60"
                    >
                      <span className={cn("font-mono text-[10px] border rounded px-1.5 py-0.5 shrink-0 mt-0.5", levelBadgeClass(h.level))}>
                        L{h.level}·{h.code}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-snug">
                          {highlight(h.nameVi, query)}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {pathLabel(h.code)}
                        </div>
                      </div>
                      {exists && <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// L1 grid — grouped business / non-business
// ============================================================

function L1Grid({
  items, onPick, onPickL1Direct, existingCodes,
}: {
  items: VsicL1Industry[];
  onPick: (l1: VsicL1Industry) => void;
  onPickL1Direct: (l1: VsicL1Industry) => void;
  existingCodes: Set<string>;
}) {
  const biz = items.filter((i) => !i.nonBusiness);
  const nonBiz = items.filter((i) => i.nonBusiness);

  return (
    <div className="overflow-y-auto max-h-[440px] p-2 space-y-3">
      <Section title="Ngành kinh doanh" count={biz.length}>
        <div className="grid grid-cols-2 gap-1.5">
          {biz.map((l1) => (
            <L1Card key={l1.code} l1={l1} onPick={onPick} onPickL1Direct={onPickL1Direct} existingCodes={existingCodes} />
          ))}
        </div>
      </Section>
      {nonBiz.length > 0 && (
        <Section title="Khác (Nhà nước · Hộ gia đình · Tổ chức quốc tế)" count={nonBiz.length}>
          <div className="grid grid-cols-2 gap-1.5">
            {nonBiz.map((l1) => (
              <L1Card key={l1.code} l1={l1} onPick={onPick} onPickL1Direct={onPickL1Direct} existingCodes={existingCodes} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
        {title}
        <span className="text-[10px] font-normal opacity-60">({count})</span>
      </p>
      {children}
    </div>
  );
}

function L1Card({
  l1, onPick, onPickL1Direct, existingCodes,
}: {
  l1: VsicL1Industry;
  onPick: (l1: VsicL1Industry) => void;
  onPickL1Direct: (l1: VsicL1Industry) => void;
  existingCodes: Set<string>;
}) {
  const Icon = ICONS[l1.icon];
  const childCount = getChildren(l1.code).length;
  const picked = existingCodes.has(l1.code);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPick(l1)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(l1); } }}
      className={cn(
        "group relative flex items-start gap-2 rounded-md border p-2 hover:border-primary/40 hover:bg-muted/40 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        picked && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {Icon ? <Icon className="h-4 w-4" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] border rounded px-1 py-px bg-muted text-muted-foreground">
            {l1.code}
          </span>
          <span className="text-xs font-semibold truncate flex-1">{l1.nameViShort}</span>
          {l1.finaiSupported && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent>FinAI có overlay chuyên biệt</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
          {l1.description}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {!picked ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPickL1Direct(l1); }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Chọn cấp 1
            </button>
          ) : (
            <span className="text-[10px] font-medium text-primary flex items-center gap-0.5">
              <Check className="h-2.5 w-2.5" />
              Đã chọn
            </span>
          )}
          {childCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {childCount} ngành con
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto group-hover:text-primary transition" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Drill view
// ============================================================

function DrillView({
  l1, onBack, onPick, existingCodes,
}: {
  l1: VsicL1Industry;
  onBack: () => void;
  onPick: (sel: VsicSelection) => void;
  existingCodes: Set<string>;
}) {
  const Icon = ICONS[l1.icon];
  const [path, setPath] = React.useState<string[]>([]);

  const currentCode = path.length > 0 ? path[path.length - 1] : l1.code;
  const currentNode = path.length > 0 ? getVsicNode(currentCode) : null;
  const currentLevel = currentNode?.level ?? 1;
  const currentName = currentNode?.nameVi ?? l1.nameVi;
  const children = getChildren(currentCode);
  const isPickedHere = existingCodes.has(currentCode);

  return (
    <div className="flex flex-col h-full max-h-[440px]">
      {/* Breadcrumb header */}
      <div className="border-b px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground rounded px-1 py-0.5 hover:bg-muted"
          >
            <ArrowLeft className="h-3 w-3" />
            Cấp 1
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          <button
            type="button"
            onClick={() => setPath([])}
            className={cn(
              "rounded px-1 py-0.5 hover:bg-muted",
              path.length === 0 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-mono mr-1">{l1.code}</span>
            {l1.nameViShort}
          </button>
          {path.map((code, idx) => {
            const n = getVsicNode(code);
            const isLast = idx === path.length - 1;
            return (
              <React.Fragment key={code}>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => setPath(path.slice(0, idx + 1))}
                  className={cn(
                    "rounded px-1 py-0.5 hover:bg-muted max-w-[180px] truncate",
                    isLast ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                  title={n?.nameVi}
                >
                  <span className="font-mono mr-1">{code}</span>
                  <span>{n?.nameVi ?? code}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Children list */}
      <div className="flex-1 overflow-y-auto">
        {children.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Check className="h-6 w-6 mx-auto mb-2 opacity-40" />
            Đã đến cấp chi tiết nhất hiện có.
            <div className="text-xs mt-1">Bấm nút bên dưới để chọn cấp này.</div>
          </div>
        ) : (
          <ul className="divide-y">
            {children.map((c) => {
              const hasChildren = getChildren(c.code).length > 0;
              const picked = existingCodes.has(c.code);
              return (
                <li key={c.code} className="flex items-stretch hover:bg-muted/40">
                  <button
                    type="button"
                    onClick={() => onPick({ code: c.code, name: c.nameVi })}
                    disabled={picked}
                    className="flex-1 flex items-center gap-2 px-3 py-2 text-left disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:bg-muted/60"
                  >
                    <span className={cn("font-mono text-[10px] border rounded px-1.5 py-0.5 shrink-0", levelBadgeClass(c.level))}>
                      L{c.level}·{c.code}
                    </span>
                    <span className="text-sm flex-1 truncate">{c.nameVi}</span>
                    {picked && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => setPath([...path, c.code])}
                      className="flex items-center gap-1 px-3 text-[11px] text-muted-foreground hover:text-primary hover:bg-muted/60 border-l"
                      aria-label={`Vào ${c.nameVi}`}
                    >
                      Vào trong
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky footer CTA */}
      <div className="border-t bg-background p-2 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={isPickedHere}
          onClick={() => {
            if (path.length === 0) onPick({ code: l1.code, name: l1.nameVi });
            else if (currentNode) onPick({ code: currentNode.code, name: currentNode.nameVi });
          }}
        >
          <Check className="h-3.5 w-3.5 mr-1.5" />
          {isPickedHere
            ? `Đã chọn ${currentCode}`
            : `Chọn cấp ${currentLevel}: ${currentName.length > 40 ? currentName.slice(0, 40) + "…" : currentName}`}
        </Button>
      </div>
    </div>
  );
}
