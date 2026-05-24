import { useMemo, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChipLabel } from "./ChipLabel";
import {
  FIELDS,
  FIELDS_BY_KEY,
  FIELD_GROUPS,
  OPERATOR_LABEL,
  operatorsFor,
} from "@/lib/rules/rule-fields";
import type {
  RuleCondition,
  RuleConditionField,
  RuleConditionValue,
  RuleOperator,
} from "@/types/rule";

function formatValue(v: RuleConditionValue): string {
  if (Array.isArray(v)) {
    if (v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number") {
      return `${v[0]} – ${v[1]}`;
    }
    return (v as string[]).map((x) => `"${x}"`).join(", ");
  }
  if (typeof v === "number") return v.toLocaleString("vi-VN");
  return String(v);
}

export function ConditionsRead({ conditions }: { conditions: RuleCondition[] }) {
  return (
    <div className="space-y-1">
      {conditions.map((c, i) => {
        const meta = FIELDS_BY_KEY[c.field];
        const kind = i === 0 ? "when" : c.logic === "OR" ? "or" : "and";
        const isPattern = c.operator === "matches_pattern";
        return (
          <div key={c.id} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
            <ChipLabel kind={kind} className="mt-0.5 shrink-0" />
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="font-mono text-[12px] text-muted-foreground">
                {meta?.label ?? c.field}
              </span>
              <span className="text-[10px] italic text-muted-foreground/70">
                {OPERATOR_LABEL[c.operator]}
              </span>
              {isPattern ? (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px] text-foreground">
                  {String(c.value)}
                </code>
              ) : (
                <span className="font-mono text-[12px] font-semibold text-foreground">
                  {formatValue(c.value)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function defaultValueFor(op: RuleOperator): RuleConditionValue {
  if (op === "in" || op === "not_in") return [];
  if (op === "between") return [0, 0];
  if (op === "greater_than" || op === "less_than") return 0;
  return "";
}

export function ConditionsEdit({
  conditions,
  onChange,
}: {
  conditions: RuleCondition[];
  onChange: (next: RuleCondition[]) => void;
}) {
  const update = (id: string, patch: Partial<RuleCondition>) =>
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => onChange(conditions.filter((c) => c.id !== id));
  const add = () =>
    onChange([
      ...conditions,
      {
        id: `c${Date.now()}`,
        logic: "AND",
        field: "vendor.name",
        operator: "contains",
        value: "",
      },
    ]);

  return (
    <div className="space-y-2">
      {conditions.map((c, i) => (
        <ConditionRow
          key={c.id}
          condition={c}
          isFirst={i === 0}
          onUpdate={(p) => update(c.id, p)}
          onRemove={() => remove(c.id)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 text-xs">
        <Plus className="mr-1 h-3.5 w-3.5" /> Thêm điều kiện
      </Button>
    </div>
  );
}

function ConditionRow({
  condition,
  isFirst,
  onUpdate,
  onRemove,
}: {
  condition: RuleCondition;
  isFirst: boolean;
  onUpdate: (p: Partial<RuleCondition>) => void;
  onRemove: () => void;
}) {
  const meta = FIELDS_BY_KEY[condition.field];
  const ops = useMemo(() => operatorsFor(meta?.type ?? "text"), [meta?.type]);
  const [regexErr, setRegexErr] = useState<string | null>(null);

  return (
    <div className="flex items-start gap-1.5 rounded-md border border-dashed bg-muted/20 p-2">
      <GripVertical className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/50" />
      <div className="grid flex-1 grid-cols-[80px_1fr_1fr_1.5fr] gap-1.5">
        {isFirst ? (
          <div className="flex items-center"><ChipLabel kind="when" /></div>
        ) : (
          <Select
            value={condition.logic ?? "AND"}
            onValueChange={(v) => onUpdate({ logic: v as "AND" | "OR" })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AND">VÀ</SelectItem>
              <SelectItem value="OR">HOẶC</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select
          value={condition.field}
          onValueChange={(v) => {
            const next = FIELDS_BY_KEY[v as RuleConditionField];
            const newOps = operatorsFor(next.type);
            const nextOp = newOps.includes(condition.operator) ? condition.operator : newOps[0];
            onUpdate({
              field: v as RuleConditionField,
              operator: nextOp,
              value: defaultValueFor(nextOp),
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FIELD_GROUPS.map((g) => (
              <SelectGroup key={g}>
                <SelectLabel className="text-[10px] uppercase tracking-wide">{g}</SelectLabel>
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={condition.operator}
          onValueChange={(v) =>
            onUpdate({ operator: v as RuleOperator, value: defaultValueFor(v as RuleOperator) })
          }
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ops.map((o) => (
              <SelectItem key={o} value={o} className="text-xs">{OPERATOR_LABEL[o]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ValueInput
          operator={condition.operator}
          fieldType={meta?.type ?? "text"}
          value={condition.value}
          onChange={(v) => {
            if (condition.operator === "matches_pattern" && typeof v === "string" && v) {
              try {
                new RegExp(v);
                setRegexErr(null);
              } catch (e) {
                setRegexErr((e as Error).message);
              }
            }
            onUpdate({ value: v });
          }}
          error={regexErr}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ValueInput({
  operator,
  fieldType,
  value,
  onChange,
  error,
}: {
  operator: RuleOperator;
  fieldType: string;
  value: RuleConditionValue;
  onChange: (v: RuleConditionValue) => void;
  error?: string | null;
}) {
  if (operator === "is_empty" || operator === "is_not_empty") {
    return <div className="flex h-8 items-center px-2 text-[11px] text-muted-foreground">—</div>;
  }
  if (operator === "in" || operator === "not_in") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Input
        className="h-8 font-mono text-xs"
        placeholder="A, B, C"
        value={arr.join(", ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }
  if (operator === "between") {
    const [a, b] = Array.isArray(value) ? (value as [number, number]) : [0, 0];
    return (
      <div className="flex gap-1">
        <Input
          type="number"
          className="h-8 text-xs"
          value={a}
          onChange={(e) => onChange([Number(e.target.value), b])}
        />
        <Input
          type="number"
          className="h-8 text-xs"
          value={b}
          onChange={(e) => onChange([a, Number(e.target.value)])}
        />
      </div>
    );
  }
  if (fieldType === "number" || fieldType === "currency") {
    return (
      <Input
        type="number"
        className="h-8 text-xs"
        value={typeof value === "number" ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <Input
        className={cn("h-8 font-mono text-xs", error && "border-destructive")}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        placeholder={operator === "matches_pattern" ? "regex pattern" : "giá trị"}
      />
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
