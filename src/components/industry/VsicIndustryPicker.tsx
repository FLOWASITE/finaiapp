import * as React from "react";
import {
  Check, ChevronRight, ChevronsUpDown, Search, Sparkles, X, EyeOff, Eye,
  Wheat, Pickaxe, Factory, Zap, Recycle, HardHat, ShoppingBag, Truck,
  UtensilsCrossed, Newspaper, Laptop, Landmark, Home, Briefcase, Settings,
  Building, GraduationCap, Stethoscope, Music, Sparkles as SparklesIcon,
  Users, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  // Chips currently selected
  const decorated = React.useMemo(
    () => value.map((v) => {
      const lvl = inferLevel(v.code) ?? 1;
      const l1 = getL1CodeOf(v.code);
      const l1Info = l1 ? getVsicLevel1(l1) : null;
      return { ...v, level: lvl, l1Code: l1, l1Info };
    }),
    [value],
  );

  const remove = (code: string) => {
    onChange(value.filter((x) => x.code !== code));
  };
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
    if (!multi) {
      onChange([sel]);
    } else {
      onChange([...value, sel]);
    }
    setSearch("");
    setPickerOpen(false);
  };

  const searchHits = React.useMemo(
    () => (search.trim().length >= 2 ? searchVsic(search, 30) : []),
    [search],
  );

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {decorated.length > 0 && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Ngành đã chọn ({decorated.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {decorated.map((it, idx) => {
              const Icon = it.l1Info?.icon ? ICONS[it.l1Info.icon] : null;
              return (
                <div
                  key={it.code}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs",
                    idx === 0 && "border-primary/60 bg-primary/5",
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    L{it.level} · {it.code}
                  </span>
                  <span className="truncate max-w-[260px]">{it.name}</span>
                  {idx === 0 ? (
                    <Badge variant="default" className="ml-1 h-4 px-1.5 text-[9px] uppercase tracking-wider">
                      Chính
                    </Badge>
                  ) : (
                    !disabled && (
                      <button
                        type="button"
                        onClick={() => setPrimary(it.code)}
                        className="ml-1 text-[10px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                      >
                        Đặt chính
                      </button>
                    )
                  )}
                  {!disabled && (
                    <button
                      type="button"
                      aria-label="Xoá"
                      onClick={() => remove(it.code)}
                      className="ml-0.5 rounded-sm hover:bg-foreground/10 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {decorated.length > 1 && (
            <p className="text-[10px] text-muted-foreground">
              Ngành đầu tiên là ngành chính — dùng để FinAI gợi ý mặt hàng & tài khoản.
            </p>
          )}
        </div>
      )}

      {/* Add button + quick search */}
      {(multi || value.length === 0) && !disabled && (
        <div className="flex flex-wrap gap-2 items-center">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="font-normal">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                {value.length === 0 ? "Chọn ngành nghề kinh doanh…" : "Thêm ngành"}
                <ChevronsUpDown className="h-3.5 w-3.5 ml-1.5 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[640px] p-0" align="start">
              <PickerBody
                showNonBiz={showNonBiz}
                onToggleNonBiz={() => setShowNonBiz((v) => !v)}
                visibleL1={visibleL1}
                search={search}
                onSearch={setSearch}
                searchHits={searchHits}
                onPick={addItem}
                existingCodes={new Set(value.map((v) => v.code))}
              />
            </PopoverContent>
          </Popover>

          {value.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Chọn ít nhất 1 ngành cấp 1 để FinAI gợi ý đúng catalog & tài khoản.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Picker popover body — Step 1 L1 grid, Step 2 cascader L2-L5
// ============================================================

function PickerBody({
  visibleL1, showNonBiz, onToggleNonBiz, search, onSearch, searchHits, onPick, existingCodes,
}: {
  visibleL1: VsicL1Industry[];
  showNonBiz: boolean;
  onToggleNonBiz: () => void;
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
    <div className="flex flex-col max-h-[520px]">
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-muted-foreground"
          onClick={onToggleNonBiz}
        >
          {showNonBiz ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
          {showNonBiz ? "Ẩn ngành ngoài DN" : "Hiện ngành ngoài DN"}
        </Button>
      </div>

      {/* Search results override */}
      {search.trim().length >= 2 ? (
        <div className="overflow-y-auto">
          {searchHits.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy. Thử từ khoá khác hoặc duyệt theo cấp 1.
            </div>
          ) : (
            <ul className="divide-y">
              {searchHits.map((h) => {
                const l1 = getVsicLevel1(h.l1Code);
                const Icon = l1?.icon ? ICONS[l1.icon] : null;
                const exists = existingCodes.has(h.code);
                return (
                  <li key={`${h.level}-${h.code}`}>
                    <button
                      type="button"
                      disabled={exists}
                      onClick={() => onPick({ code: h.code, name: h.nameVi })}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                    >
                      {Icon && <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            L{h.level}
                          </span>
                          <span className="font-mono text-xs">{h.code}</span>
                          <span className="truncate">{h.nameVi}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {l1?.nameViShort} ({h.l1Code})
                        </div>
                      </div>
                      {exists && <Check className="h-4 w-4 text-primary mt-0.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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

      {/* Meta footer */}
      <div className="border-t bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground text-center">
        Theo Quyết định 36/2025/QĐ-TTg · hiệu lực 15/11/2025 · L1-L4 (~360 ngành)
      </div>
    </div>
  );
}

function L1Grid({
  items, onPick, onPickL1Direct, existingCodes,
}: {
  items: VsicL1Industry[];
  onPick: (l1: VsicL1Industry) => void;
  onPickL1Direct: (l1: VsicL1Industry) => void;
  existingCodes: Set<string>;
}) {
  return (
    <div className="overflow-y-auto p-2">
      <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        Chọn ngành cấp 1 (22 ngành)
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((l1) => {
          const Icon = ICONS[l1.icon];
          const childCount = getChildren(l1.code).length;
          const picked = existingCodes.has(l1.code);
          return (
            <div
              key={l1.code}
              className={cn(
                "group relative flex items-start gap-2 rounded-md border p-2 hover:border-primary/40 hover:bg-muted/40 transition cursor-pointer",
                picked && "border-primary/40 bg-primary/5",
              )}
              onClick={() => onPick(l1)}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {Icon ? <Icon className="h-4 w-4" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {l1.code}
                  </span>
                  <span className="text-xs font-medium truncate">{l1.nameViShort}</span>
                  {l1.finaiSupported && (
                    <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                  {l1.description}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPickL1Direct(l1); }}
                    className="text-[10px] text-primary hover:underline"
                    disabled={picked}
                  >
                    {picked ? "Đã chọn" : "Chọn ngành này"}
                  </button>
                  {childCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      · {childCount} ngành con
                    </span>
                  )}
                  <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto group-hover:text-primary" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DrillView({
  l1, onBack, onPick, existingCodes,
}: {
  l1: VsicL1Industry;
  onBack: () => void;
  onPick: (sel: VsicSelection) => void;
  existingCodes: Set<string>;
}) {
  const Icon = ICONS[l1.icon];
  // path: codes from L2 down (excluding L1)
  const [path, setPath] = React.useState<string[]>([]);

  const currentParent = path.length > 0 ? path[path.length - 1] : l1.code;
  const children = getChildren(currentParent);

  return (
    <div className="overflow-y-auto">
      {/* Breadcrumb */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            ← Cấp 1
          </button>
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
          {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
          <button
            type="button"
            onClick={() => setPath([])}
            className={cn(
              "font-medium",
              path.length === 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l1.code} · {l1.nameViShort}
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
                    isLast ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="font-mono text-[10px] mr-1">{code}</span>
                  <span className="truncate">{n?.nameVi ?? code}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="h-7 text-[11px]"
            disabled={existingCodes.has(path.length > 0 ? path[path.length - 1] : l1.code)}
            onClick={() => {
              if (path.length === 0) {
                onPick({ code: l1.code, name: l1.nameVi });
              } else {
                const code = path[path.length - 1];
                const n = getVsicNode(code);
                if (n) onPick({ code: n.code, name: n.nameVi });
              }
            }}
          >
            <Check className="h-3 w-3 mr-1" />
            {path.length === 0
              ? `Chọn ngành cấp 1: ${l1.nameViShort}`
              : `Chọn ngành cấp ${getVsicNode(path[path.length - 1])?.level ?? "?"} này`}
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Hoặc duyệt sâu hơn ↓
          </span>
        </div>
      </div>

      {/* Children list */}
      {children.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Đã đến cấp chi tiết nhất hiện có. Bấm "Chọn ngành này" ở trên.
        </div>
      ) : (
        <ul className="divide-y">
          {children.map((c) => {
            const hasChildren = getChildren(c.code).length > 0;
            const picked = existingCodes.has(c.code);
            return (
              <li key={c.code} className="flex items-center hover:bg-muted/40">
                <button
                  type="button"
                  onClick={() => onPick({ code: c.code, name: c.nameVi })}
                  disabled={picked}
                  className="flex-1 flex items-start gap-2 px-3 py-2 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="font-mono text-[10px] text-muted-foreground mt-0.5 w-12 shrink-0">
                    L{c.level} · {c.code}
                  </span>
                  <span className="text-sm flex-1">{c.nameVi}</span>
                  {picked && <Check className="h-4 w-4 text-primary" />}
                </button>
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => setPath([...path, c.code])}
                    className="px-3 py-2 text-[10px] text-muted-foreground hover:text-primary border-l"
                  >
                    Vào sâu hơn
                    <ChevronRight className="inline h-3 w-3 ml-0.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
