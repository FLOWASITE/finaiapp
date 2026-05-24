import { create } from "zustand";
import type { Rule } from "@/types/rule";
import { sampleRules } from "@/data/sampleRules";

type State = {
  rules: Rule[];
  upsert: (r: Rule) => void;
  remove: (id: string) => void;
  toggleEnabled: (id: string, enabled: boolean, reason?: string) => void;
  reorder: (ids: string[]) => void;
};

export const useRuleStore = create<State>((set) => ({
  rules: sampleRules,
  upsert: (r) =>
    set((s) => {
      const idx = s.rules.findIndex((x) => x.id === r.id);
      if (idx === -1) return { rules: [r, ...s.rules] };
      const next = [...s.rules];
      next[idx] = r;
      return { rules: next };
    }),
  remove: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
  toggleEnabled: (id, enabled, reason) =>
    set((s) => ({
      rules: s.rules.map((r) =>
        r.id === id
          ? {
              ...r,
              enabled,
              status: enabled ? "active" : "paused",
              paused_reason: enabled ? undefined : reason ?? r.paused_reason,
              mode: enabled ? (r.mode === "disabled" ? "auto" : r.mode) : "disabled",
            }
          : r,
      ),
    })),
  reorder: (ids) =>
    set((s) => {
      const map = new Map(s.rules.map((r) => [r.id, r]));
      const rest = s.rules.filter((r) => !ids.includes(r.id));
      return { rules: [...ids.map((id) => map.get(id)!).filter(Boolean), ...rest] };
    }),
}));

export function makeEmptyRule(): Rule {
  const id = `rule-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: "Quy tắc mới",
    conditions: [
      { id: "c1", field: "vendor.name", operator: "contains", value: "" },
    ],
    actions: [
      { id: "a1", type: "book", params: { account_debit: "642", account_credit: "331" } },
    ],
    confidence_threshold: 0.85,
    mode: "suggest",
    applies_to: "future",
    enabled: true,
    source: "user_taught",
    created_by: "user_local",
    created_at: new Date().toISOString(),
    applied_count: 0,
    correct_count: 0,
    status: "draft",
    version: 1,
  };
}
