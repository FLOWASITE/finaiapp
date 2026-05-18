import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Users, FolderKanban, Layers } from "lucide-react";
import {
  listBranches, listDepartments, listProjects, listCostCenters,
} from "@/lib/dimensions.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";

export type DimensionValue = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};

const NONE = "__none__";

type Props = {
  value: DimensionValue;
  onChange: (v: DimensionValue) => void;
  /** Which pickers to show. Defaults to all four. */
  show?: Array<"branch" | "department" | "project" | "cost_center">;
  /** layout: grid 2 cols (default) or row (4 in a row) */
  layout?: "grid" | "row";
  className?: string;
  /** Use small (h-8) trigger height for embedded tables */
  compact?: boolean;
};

export function DimensionPickers({
  value, onChange,
  show = ["branch", "department", "project", "cost_center"],
  layout = "grid",
  className = "",
  compact = false,
}: Props) {
  const listB = useServerFn(listBranches);
  const listD = useServerFn(listDepartments);
  const listP = useServerFn(listProjects);
  const listC = useServerFn(listCostCenters);

  const { data: branches } = useQuery({
    queryKey: ["dim-branches"], queryFn: () => listB(),
    enabled: show.includes("branch"), staleTime: 5 * 60_000,
  });
  const { data: departments } = useQuery({
    queryKey: ["dim-departments"], queryFn: () => listD(),
    enabled: show.includes("department"), staleTime: 5 * 60_000,
  });
  const { data: projects } = useQuery({
    queryKey: ["dim-projects"], queryFn: () => listP(),
    enabled: show.includes("project"), staleTime: 5 * 60_000,
  });
  const { data: ccs } = useQuery({
    queryKey: ["dim-cost-centers"], queryFn: () => listC(),
    enabled: show.includes("cost_center"), staleTime: 5 * 60_000,
  });

  const wrap = layout === "row"
    ? "grid grid-cols-2 md:grid-cols-4 gap-2"
    : "grid grid-cols-1 md:grid-cols-2 gap-2";
  const trig = compact ? "h-8 text-xs" : "";

  const render = (
    key: keyof DimensionValue,
    label: string,
    icon: React.ReactNode,
    rows?: any[],
  ) => {
    const opts = (rows ?? []).filter((r) => r.is_active !== false);
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</Label>
        <Select
          value={value[key] ?? NONE}
          onValueChange={(v) => onChange({ ...value, [key]: v === NONE ? null : v })}
        >
          <SelectTrigger className={trig}><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— Không —</SelectItem>
            {opts.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>
                {o.code ? <span className="font-mono text-muted-foreground mr-2">{o.code}</span> : null}
                {o.name || o.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className={`${wrap} ${className}`.trim()}>
      {show.includes("branch") && render("branch_id", "Chi nhánh", <Building2 className="h-3 w-3" />, branches as any[])}
      {show.includes("department") && render("department_id", "Phòng ban", <Users className="h-3 w-3" />, departments as any[])}
      {show.includes("project") && render("project_id", "Dự án", <FolderKanban className="h-3 w-3" />, projects as any[])}
      {show.includes("cost_center") && render("cost_center_id", "Bộ phận chi phí", <Layers className="h-3 w-3" />, ccs as any[])}
    </div>
  );
}
