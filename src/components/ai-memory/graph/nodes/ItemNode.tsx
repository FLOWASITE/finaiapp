import { Handle, Position } from "@xyflow/react";
import { Package, Wrench, Boxes, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNodeData } from "@/lib/graph/build-graph";

const ITEM_COLOR = "#0891B2";

const ICONS = {
  goods: Package,
  service: Wrench,
  fixed_asset: Boxes,
  ccdc: Hammer,
} as const;

const KIND_LABEL = {
  goods: "Hàng hoá",
  service: "Dịch vụ",
  fixed_asset: "TSCĐ",
  ccdc: "CCDC",
} as const;

export function ItemNode({ data, selected }: any) {
  const d = data as GraphNodeData;
  const it = d.item!;
  const Icon = ICONS[it.kind] ?? Package;

  return (
    <div
      className={cn(
        "w-[200px] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-all",
        selected ? "ring-2 ring-offset-1" : "",
      )}
      style={{
        borderColor: ITEM_COLOR,
        boxShadow: selected ? `0 0 0 2px ${ITEM_COLOR}` : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2" style={{ background: ITEM_COLOR }} />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2" style={{ background: ITEM_COLOR }} />

      <div
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: ITEM_COLOR }}
      >
        <Icon className="h-3 w-3" />
        {KIND_LABEL[it.kind]}
        <span className="ml-auto rounded-sm bg-cyan-50 px-1 text-[9px] font-bold text-cyan-700">
          ×{it.hitCount}
        </span>
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug">{d.label}</div>
      <div className="text-[10px] text-muted-foreground">
        {it.defaultAccount ? `TK ${it.defaultAccount} · ` : ""}
        {d.ruleCount ?? 0} liên kết
      </div>
    </div>
  );
}
