import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { parseSuggestion, renderRule, TEMPLATES_BY_ID } from "./ai-memory-templates";

export type RuleType = "suggestion" | "active" | "disabled";
export type RuleSource = "ai-learned" | "user-taught";

export type MemoryRule = {
  id: string;
  type: RuleType;
  source: RuleSource | null;
  title: string;
  when_text: string;
  then_text: string;
  origin: string | null;
  applied_count: number;
  accuracy_correct: number;
  accuracy_total: number;
  last_used_at: string | null;
  disable_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryWatch = {
  id: string;
  text: string;
  seen_count: number;
  target_count: number;
  created_at: string;
};

const RULE_COLS =
  "id,type,source,title,when_text,then_text,origin,applied_count,accuracy_correct,accuracy_total,last_used_at,disable_reason,created_at,updated_at";

export const listAiMemory = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<{ rules: MemoryRule[]; watch: MemoryWatch[] }> => {
    const { supabase, tenantId } = context;
    const [{ data: rules, error: rErr }, { data: watch, error: wErr }] = await Promise.all([
      supabase
        .from("ai_memory_rules")
        .select(RULE_COLS)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
      supabase
        .from("ai_memory_watch")
        .select("id,text,seen_count,target_count,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (wErr) throw new Error(wErr.message);
    return {
      rules: (rules ?? []) as MemoryRule[],
      watch: (watch ?? []) as MemoryWatch[],
    };
  });

export const createRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(255),
        when_text: z.string().trim().min(1).max(2000),
        then_text: z.string().trim().min(1).max(2000),
        origin: z.string().trim().max(500).optional(),
        source: z.enum(["ai-learned", "user-taught"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_memory_rules")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        type: "active",
        source: data.source ?? "user-taught",
        title: data.title,
        when_text: data.when_text,
        then_text: data.then_text,
        origin: data.origin ?? `Bạn tạo ngày ${new Date().toLocaleDateString("vi-VN")}`,
      })
      .select(RULE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as MemoryRule;
  });

export const promoteSuggestion = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        template_id: z.string().min(1).max(64).optional(),
        slots: z.record(z.string(), z.string()).optional(),
        title: z.string().trim().min(1).max(255).optional(),
        when_text: z.string().trim().min(1).max(2000).optional(),
        then_text: z.string().trim().min(1).max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;

    // Load current suggestion để fallback nếu UI không gửi đủ thông tin.
    const { data: current, error: loadErr } = await supabase
      .from("ai_memory_rules")
      .select("title,when_text,then_text")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!current) throw new Error("Không tìm thấy đề xuất");

    // Quyết định mẫu + slot.
    let templateId = data.template_id;
    let slots = data.slots ?? {};
    if (!templateId || Object.keys(slots).length === 0) {
      const parsed = parseSuggestion(current as { title: string; when_text: string; then_text: string });
      templateId = templateId ?? parsed.templateId;
      slots = Object.keys(slots).length === 0 ? parsed.slots : slots;
    }

    const tpl = TEMPLATES_BY_ID[templateId!];
    if (!tpl) throw new Error("Mẫu quy tắc không hợp lệ");

    // Ưu tiên text đã render từ UI; nếu thiếu, render lại từ slot ở server.
    const rendered = renderRule(templateId!, slots);
    const finalTitle = (data.title ?? rendered.title).trim();
    const finalWhen = (data.when_text ?? rendered.when_text).trim();
    const finalThen = (data.then_text ?? rendered.then_text).trim();

    const today = new Date().toLocaleDateString("vi-VN");
    const { error } = await supabase
      .from("ai_memory_rules")
      .update({
        type: "active",
        source: "user-taught",
        title: finalTitle,
        when_text: finalWhen,
        then_text: finalThen,
        origin: `Tạo từ đề xuất ngày ${today} — mẫu: ${tpl.label}`,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true, template_id: templateId };
  });

export const updateRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(255).optional(),
        when_text: z.string().trim().min(1).max(2000).optional(),
        then_text: z.string().trim().min(1).max(2000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const patch: { title?: string; when_text?: string; then_text?: string } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.when_text !== undefined) patch.when_text = data.when_text;
    if (data.then_text !== undefined) patch.then_text = data.then_text;
    const { error } = await supabase
      .from("ai_memory_rules")
      .update(patch)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disableRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(1).max(1000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_rules")
      .update({
        type: "disabled",
        disable_reason: data.reason,
        origin: `Bạn tắt ngày ${new Date().toLocaleDateString("vi-VN")}`,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enableRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_rules")
      .update({
        type: "active",
        source: "user-taught",
        disable_reason: null,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_rules")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const promoteWatchToRule = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        watch_id: z.string().uuid(),
        title: z.string().trim().min(1).max(255),
        when_text: z.string().trim().min(1).max(2000),
        then_text: z.string().trim().min(1).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: watch, error: wErr } = await supabase
      .from("ai_memory_watch")
      .select("id,seen_count,target_count")
      .eq("id", data.watch_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (wErr) throw new Error(wErr.message);
    const origin = watch
      ? `Tạo từ mẫu đang học (${(watch as any).seen_count}/${(watch as any).target_count} lần)`
      : "Tạo từ mẫu đang học";

    const { data: row, error } = await supabase
      .from("ai_memory_rules")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        type: "active",
        source: "user-taught",
        title: data.title,
        when_text: data.when_text,
        then_text: data.then_text,
        origin,
      })
      .select(RULE_COLS)
      .single();
    if (error) throw new Error(error.message);

    const { error: dErr } = await supabase
      .from("ai_memory_watch")
      .delete()
      .eq("id", data.watch_id)
      .eq("tenant_id", tenantId);
    if (dErr) throw new Error(dErr.message);

    return row as MemoryRule;
  });

export const dismissWatch = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_watch")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
