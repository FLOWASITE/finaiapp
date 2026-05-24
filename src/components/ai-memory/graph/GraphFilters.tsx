import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, RotateCcw } from "lucide-react";

export type GraphFilterState = {
  search: string;
  nodeKinds: Set<"rule" | "vendor" | "account">;
  modes: Set<"auto" | "suggest" | "disabled">;
  showOrphans: boolean;
};

export function GraphFilters({
  state,
  onChange,
  onReset,
}: {
  state: GraphFilterState;
  onChange: (next: GraphFilterState) => void;
  onReset: () => void;
}) {
  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
          placeholder="Tìm quy tắc, đối tác, TK…"
          className="h-7 w-[220px] pl-7 text-[12px]"
        />
      </div>

      <div className="flex items-center gap-1">
        <FilterChip
          active={state.nodeKinds.has("rule")}
          color="#4F46C7"
          onClick={() => onChange({ ...state, nodeKinds: toggle(state.nodeKinds, "rule") })}
        >
          Quy tắc
        </FilterChip>
        <FilterChip
          active={state.nodeKinds.has("vendor")}
          color="#0F6E56"
          onClick={() => onChange({ ...state, nodeKinds: toggle(state.nodeKinds, "vendor") })}
        >
          Đối tác
        </FilterChip>
        <FilterChip
          active={state.nodeKinds.has("account")}
          color="#BA7517"
          onClick={() => onChange({ ...state, nodeKinds: toggle(state.nodeKinds, "account") })}
        >
          Tài khoản
        </FilterChip>
      </div>

      <span className="mx-1 h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        <FilterChip
          active={state.modes.has("auto")}
          color="#0F6E56"
          onClick={() => onChange({ ...state, modes: toggle(state.modes, "auto") })}
        >
          Auto
        </FilterChip>
        <FilterChip
          active={state.modes.has("suggest")}
          color="#BA7517"
          onClick={() => onChange({ ...state, modes: toggle(state.modes, "suggest") })}
        >
          Đề xuất
        </FilterChip>
        <FilterChip
          active={state.modes.has("disabled")}
          color="#737373"
          onClick={() => onChange({ ...state, modes: toggle(state.modes, "disabled") })}
        >
          Đã tắt
        </FilterChip>
      </div>

      <span className="mx-1 h-4 w-px bg-border" />

      <FilterChip
        active={state.showOrphans}
        color="#D97706"
        onClick={() => onChange({ ...state, showOrphans: !state.showOrphans })}
      >
        Chỉ node cô lập
      </FilterChip>

      <div className="ml-auto">
        <Button size="sm" variant="ghost" onClick={onReset} className="h-7 gap-1 text-[12px]">
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all",
        active ? "text-white" : "bg-card text-muted-foreground hover:bg-muted",
      )}
      style={{
        backgroundColor: active ? color : undefined,
        borderColor: active ? color : undefined,
      }}
    >
      {children}
    </button>
  );
}
