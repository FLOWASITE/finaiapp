import * as React from "react";
import { DimensionPickers, type DimensionValue } from "@/components/dimension-pickers";
import { Button } from "@/components/ui/button";
import { Filter, X } from "lucide-react";

export type { DimensionValue };

/** Compact inline dimension filter (chip) for reports. */
export function DimensionFilterBar({
  value, onChange, show,
}: {
  value: DimensionValue;
  onChange: (v: DimensionValue) => void;
  show?: Array<"branch" | "department" | "project" | "cost_center">;
}) {
  const [open, setOpen] = React.useState(false);
  const active = Object.values(value).filter(Boolean).length;
  const clear = () => onChange({ branch_id: null, department_id: null, project_id: null, cost_center_id: null });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant={active > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="h-9"
        >
          <Filter className="mr-1 h-3.5 w-3.5" />
          Chiều phân tích{active > 0 ? ` (${active})` : ""}
        </Button>
        {active > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} className="h-9 text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" />Xoá lọc
          </Button>
        )}
      </div>
      {open && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <DimensionPickers value={value} onChange={onChange} show={show} layout="row" compact />
        </div>
      )}
    </div>
  );
}
