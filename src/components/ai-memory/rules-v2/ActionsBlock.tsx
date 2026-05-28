import { BookOpen, Tag, Bell, Flag, SkipForward, Edit3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipLabel } from "./ChipLabel";
import { DEBIT_ACCOUNT_PRESETS, CREDIT_ACCOUNT_PRESETS } from "@/lib/rules/account-presets";
import type { RuleAction, RuleActionType } from "@/types/rule";

const ACTION_META: Record<RuleActionType, { label: string; Icon: typeof BookOpen }> = {
  book: { label: "Hạch toán", Icon: BookOpen },
  tag: { label: "Gắn tag", Icon: Tag },
  notify: { label: "Thông báo", Icon: Bell },
  flag: { label: "Đánh dấu xem lại", Icon: Flag },
  skip: { label: "Bỏ qua", Icon: SkipForward },
  set_field: { label: "Set giá trị field", Icon: Edit3 },
};

function actionSummary(a: RuleAction): { line1: string; line2?: string } {
  const m = ACTION_META[a.type];
  switch (a.type) {
    case "book":
      return {
        line1: `${m.label}: Nợ ${a.params.account_debit ?? "?"} / Có ${a.params.account_credit ?? "?"}`,
        line2: a.params.note ? `ghi chú: "${a.params.note}"` : undefined,
      };
    case "tag": {
      const parts: string[] = [];
      if (a.params.department) parts.push(`phòng: ${a.params.department}`);
      if (a.params.project) parts.push(`dự án: ${a.params.project}`);
      if (a.params.custom_tags?.length)
        parts.push(`tags: [${a.params.custom_tags.join(", ")}]`);
      return { line1: `${m.label}: ${parts.join(" · ") || "—"}` };
    }
    case "notify":
      return {
        line1: `Thông báo ${a.params.channel ?? "in_app"} → ${a.params.target ?? "—"}${
          a.params.when_condition ? ` khi ${a.params.when_condition}` : ""
        }`,
        line2: a.params.message_template ? `"${a.params.message_template}"` : undefined,
      };
    case "flag":
      return { line1: `Đánh dấu xem lại${a.params.note ? `: ${a.params.note}` : ""}` };
    case "skip":
      return { line1: "Bỏ qua, không xử lý" };
    case "set_field":
      return { line1: `Set ${a.params.field} = ${String(a.params.value ?? "")}` };
  }
}

export function ActionsRead({ actions }: { actions: RuleAction[] }) {
  return (
    <div className="space-y-1">
      {actions.map((a, i) => {
        const meta = ACTION_META[a.type];
        const s = actionSummary(a);
        return (
          <div key={a.id} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
            <ChipLabel kind={i === 0 ? "then" : "and"} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <meta.Icon className="h-3 w-3 translate-y-0.5 text-muted-foreground" />
                <span className="font-medium">{s.line1}</span>
              </div>
              {s.line2 && (
                <div className="pl-4 text-[11.5px] text-muted-foreground">{s.line2}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ActionsEdit({
  actions,
  onChange,
}: {
  actions: RuleAction[];
  onChange: (next: RuleAction[]) => void;
}) {
  const update = (id: string, patch: Partial<RuleAction>) =>
    onChange(actions.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const updateParams = (id: string, p: Partial<RuleAction["params"]>) =>
    onChange(
      actions.map((a) => (a.id === id ? { ...a, params: { ...a.params, ...p } } : a)),
    );
  const remove = (id: string) => onChange(actions.filter((a) => a.id !== id));
  const add = () =>
    onChange([
      ...actions,
      { id: `a${Date.now()}`, type: "tag", params: { custom_tags: [] } },
    ]);

  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <div key={a.id} className="rounded-md border border-dashed bg-muted/20 p-2">
          <div className="flex items-center gap-1.5">
            <Select
              value={a.type}
              onValueChange={(v) => update(a.id, { type: v as RuleActionType, params: {} })}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ACTION_META) as RuleActionType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {ACTION_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => remove(a.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-2">
            <ActionParamsEditor action={a} onChange={(p) => updateParams(a.id, p)} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="h-8 text-xs">
        <Plus className="mr-1 h-3.5 w-3.5" /> Thêm hành động
      </Button>
    </div>
  );
}

function ActionParamsEditor({
  action,
  onChange,
}: {
  action: RuleAction;
  onChange: (p: Partial<RuleAction["params"]>) => void;
}) {
  const p = action.params;
  switch (action.type) {
    case "book":
      return (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <AccountSelect
              value={p.account_debit}
              onChange={(v) => onChange({ account_debit: v })}
              placeholder="TK Nợ"
              options={DEBIT_ACCOUNT_PRESETS}
            />
            <AccountSelect
              value={p.account_credit}
              onChange={(v) => onChange({ account_credit: v })}
              placeholder="TK Có"
              options={CREDIT_ACCOUNT_PRESETS}
            />
          </div>
          <Input
            placeholder="Ghi chú (hỗ trợ {vendor.name})"
            className="h-8 text-xs"
            value={p.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value })}
          />
        </div>
      );
    case "tag":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            placeholder="Phòng ban"
            className="h-8 text-xs"
            value={p.department ?? ""}
            onChange={(e) => onChange({ department: e.target.value })}
          />
          <Input
            placeholder="Dự án"
            className="h-8 text-xs"
            value={p.project ?? ""}
            onChange={(e) => onChange({ project: e.target.value })}
          />
          <Input
            placeholder="Custom tags (A, B, C)"
            className="col-span-2 h-8 text-xs"
            value={(p.custom_tags ?? []).join(", ")}
            onChange={(e) =>
              onChange({
                custom_tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean),
              })
            }
          />
        </div>
      );
    case "notify":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          <Select
            value={p.channel ?? "in_app"}
            onValueChange={(v) => onChange({ channel: v as "zalo" | "email" | "in_app" })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="zalo">Zalo</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="in_app">Trong app</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Người nhận (ktt / kd / userId)"
            className="h-8 text-xs"
            value={p.target ?? ""}
            onChange={(e) => onChange({ target: e.target.value })}
          />
          <Input
            placeholder="Điều kiện phụ (vd amount > 5000000)"
            className="col-span-2 h-8 text-xs"
            value={p.when_condition ?? ""}
            onChange={(e) => onChange({ when_condition: e.target.value })}
          />
          <Input
            placeholder="Mẫu tin nhắn"
            className="col-span-2 h-8 text-xs"
            value={p.message_template ?? ""}
            onChange={(e) => onChange({ message_template: e.target.value })}
          />
        </div>
      );
    case "flag":
    case "skip":
      return (
        <Input
          placeholder="Ghi chú (tùy chọn)"
          className="h-8 text-xs"
          value={p.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      );
    case "set_field":
      return (
        <div className="grid grid-cols-2 gap-1.5">
          <Input
            placeholder="Field"
            className="h-8 text-xs"
            value={p.field ?? ""}
            onChange={(e) => onChange({ field: e.target.value })}
          />
          <Input
            placeholder="Value"
            className="h-8 text-xs"
            value={String(p.value ?? "")}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        </div>
      );
  }
}

function AccountSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder: string;
  options: { code: string; label: string }[];
}) {
  const isPreset = !!value && options.some((o) => o.code === value);
  const isCustom = !!value && !isPreset;
  return (
    <div className="space-y-1">
      <Select
        value={isCustom ? "__custom__" : (value ?? "")}
        onValueChange={(v) => onChange(v === "__custom__" ? value ?? "" : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.code} value={o.code} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value="__custom__" className="text-xs">
            Tài khoản khác…
          </SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          placeholder="Nhập số tài khoản"
          className="h-7 text-xs"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
