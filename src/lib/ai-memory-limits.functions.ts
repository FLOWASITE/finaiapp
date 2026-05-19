import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type LimitKind = "block" | "warn" | "require_review";
export type LimitScope =
  | "amount"
  | "vendor"
  | "account"
  | "category"
  | "variance"
  | "cash"
  | "custom";

export type MemoryLimit = {
  id: string;
  code: string;
  title: string;
  rule_text: string;
  limit_kind: LimitKind;
  scope: LimitScope;
  params: Record<string, any>;
  severity: "low" | "med" | "high";
  is_active: boolean;
  triggered_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id,code,title,rule_text,limit_kind,scope,params,severity,is_active,triggered_count,last_triggered_at,created_at,updated_at";

export const LIMIT_KIND_LABEL: Record<LimitKind, string> = {
  block: "Chặn",
  warn: "Cảnh báo",
  require_review: "Cần xem lại",
};

export const SCOPE_LABEL: Record<LimitScope, string> = {
  amount: "Số tiền",
  vendor: "Đối tác",
  account: "Tài khoản",
  category: "Hạng mục",
  variance: "Biến động",
  cash: "Tiền mặt",
  custom: "Tuỳ chỉnh",
};

export const listLimits = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<MemoryLimit[]> => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("ai_memory_limits")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("severity", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MemoryLimit[];
  });

const limitInput = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  title: z.string().trim().min(1).max(120),
  rule_text: z.string().trim().min(1).max(500),
  limit_kind: z.enum(["block", "warn", "require_review"]),
  scope: z.enum(["amount", "vendor", "account", "category", "variance", "cash", "custom"]),
  params: z.record(z.string(), z.any()).optional(),
  severity: z.enum(["low", "med", "high"]).optional(),
});

export const createLimit = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => limitInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_memory_limits")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        code: data.code,
        title: data.title,
        rule_text: data.rule_text,
        limit_kind: data.limit_kind,
        scope: data.scope,
        params: data.params ?? {},
        severity: data.severity ?? "med",
      })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as MemoryLimit;
  });

export const updateLimit = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    limitInput.partial().extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("ai_memory_limits")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleLimit = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_limits")
      .update({ is_active: data.is_active })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLimit = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_limits")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
