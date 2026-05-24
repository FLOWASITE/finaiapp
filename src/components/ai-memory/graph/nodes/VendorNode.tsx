import { Handle, Position } from "@xyflow/react";
import { Building2, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNodeData } from "@/lib/graph/build-graph";

export function VendorNode({ data, selected }: any) {
  const d = data as GraphNodeData;
  const orphan = (d.ruleCount ?? 0) === 0;
  const hasIndustry = !!d.industryCode;
  const industryShort = d.industryLabel
    ? d.industryLabel.length > 28
      ? `${d.industryLabel.slice(0, 26)}…`
      : d.industryLabel
    : d.industryCode ?? "";

  return (
    <div
      className={cn(
        "w-[210px] rounded-md border bg-card px-2.5 py-2 shadow-sm transition-all",
        selected ? "ring-2 ring-[#0F6E56] ring-offset-1" : "",
        orphan && "border-dashed",
      )}
      style={{ borderColor: orphan ? "#A3A3A3" : "#0F6E56" }}
    >
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-[#0F6E56]" />

      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#0F6E56]">
        <Building2 className="h-3 w-3" />
        Đối tác
        {orphan && (
          <span className="ml-auto rounded-sm bg-amber-100 px-1 text-[9px] font-bold text-amber-800">
            CHƯA CÓ QUY TẮC
          </span>
        )}
      </div>
      <div className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug">{d.label}</div>
      <div className="text-[10px] text-muted-foreground">
        {d.ruleCount ?? 0} quy tắc
        {(d.historyTotal ?? 0) > 0 && <> · {d.historyTotal} hit/12T</>}
      </div>
      <div
        className={cn(
          "mt-1 flex items-center gap-1 rounded-sm px-1 py-0.5 text-[9.5px]",
          hasIndustry
            ? "bg-emerald-50 text-emerald-800"
            : "bg-muted text-muted-foreground",
        )}
        title={d.industryLabel ?? undefined}
      >
        <Tag className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">
          {hasIndustry ? industryShort : "Chưa gắn ngành"}
        </span>
      </div>
    </div>
  );
}
