import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { parseSuggestion, renderRule, TEMPLATES_BY_ID } from "./ai-memory-templates";
import {
  ruleV2PartialSchema,
  renderConditions,
  renderActions,
  type RuleV2Patch,
} from "./rules/rule-shared";
import type { RuleAction, RuleCondition, RuleMode, RuleStatus } from "@/types/rule";

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
  conditions: RuleCondition[];
  actions: RuleAction[];
  mode: RuleMode;
  confidence_threshold: number;
  applies_to: "future" | "retroactive";
  enabled: boolean;
  status: RuleStatus;
  schema_version: number;
};

export type MemoryWatch = {
  id: string;
  text: string;
  seen_count: number;
  target_count: number;
  created_at: string;
};

const RULE_COLS =
  "id,type,source,title,when_text,then_text,origin,applied_count,accuracy_correct,accuracy_total,last_used_at,disable_reason,created_at,updated_at,conditions,actions,mode,confidence_threshold,applies_to,enabled,status,schema_version";

/** Áp patch v2 → DB; auto-derive when_text/then_text khi user gửi structured. */
function buildV2Patch(v2: RuleV2Patch, fallbackWhen?: string, fallbackThen?: string) {
  const patch: Record<string, unknown> = {};
  if (v2.conditions !== undefined) {
    patch.conditions = v2.conditions;
    const rendered = renderConditions(v2.conditions);
    if (rendered) patch.when_text = rendered;
    else if (fallbackWhen) patch.when_text = fallbackWhen;
    patch.schema_version = 2;
  }
  if (v2.actions !== undefined) {
    patch.actions = v2.actions;
    const rendered = renderActions(v2.actions);
    if (rendered) patch.then_text = rendered;
    else if (fallbackThen) patch.then_text = fallbackThen;
    patch.schema_version = 2;
  }
  if (v2.mode !== undefined) patch.mode = v2.mode;
  if (v2.confidence_threshold !== undefined) patch.confidence_threshold = v2.confidence_threshold;
  if (v2.applies_to !== undefined) patch.applies_to = v2.applies_to;
  if (v2.enabled !== undefined) patch.enabled = v2.enabled;
  if (v2.status !== undefined) patch.status = v2.status;
  return patch;
}

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
      .merge(ruleV2PartialSchema)
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const v2 = buildV2Patch(
      {
        conditions: data.conditions,
        actions: data.actions,
        mode: data.mode,
        confidence_threshold: data.confidence_threshold,
        applies_to: data.applies_to,
        enabled: data.enabled,
        status: data.status,
      },
      data.when_text,
      data.then_text,
    );
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
        ...v2,
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
      .merge(ruleV2PartialSchema)
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;

    const { data: current, error: loadErr } = await supabase
      .from("ai_memory_rules")
      .select("title,when_text,then_text")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!current) throw new Error("Không tìm thấy đề xuất");

    const hasV2 =
      (data.conditions && data.conditions.length > 0) ||
      (data.actions && data.actions.length > 0);

    let finalTitle = (data.title ?? current.title ?? "").trim();
    let finalWhen = (data.when_text ?? current.when_text ?? "").trim();
    let finalThen = (data.then_text ?? current.then_text ?? "").trim();
    let originSuffix = `Tạo từ đề xuất ngày ${new Date().toLocaleDateString("vi-VN")}`;
    let templateIdResult: string | undefined = data.template_id;

    if (!hasV2) {
      let templateId = data.template_id;
      let slots = data.slots ?? {};
      if (!templateId || Object.keys(slots).length === 0) {
        const parsed = parseSuggestion(
          current as { title: string; when_text: string; then_text: string },
        );
        templateId = templateId ?? parsed.templateId;
        slots = Object.keys(slots).length === 0 ? parsed.slots : slots;
      }
      const tpl = templateId ? TEMPLATES_BY_ID[templateId] : undefined;
      if (!tpl) throw new Error("Mẫu quy tắc không hợp lệ");
      const rendered = renderRule(templateId!, slots);
      finalTitle = (data.title ?? rendered.title).trim();
      finalWhen = (data.when_text ?? rendered.when_text).trim();
      finalThen = (data.then_text ?? rendered.then_text).trim();
      originSuffix += ` — mẫu: ${tpl.label}`;
      templateIdResult = templateId;
    }

    const v2Patch = buildV2Patch(
      {
        conditions: data.conditions,
        actions: data.actions,
        mode: data.mode,
        confidence_threshold: data.confidence_threshold,
        applies_to: data.applies_to,
        enabled: data.enabled,
        status: data.status,
      },
      finalWhen,
      finalThen,
    );

    const updatePayload: Record<string, unknown> = {
      type: "active",
      source: "user-taught",
      title: finalTitle,
      when_text: finalWhen,
      then_text: finalThen,
      origin: originSuffix,
      ...v2Patch,
    };
    if (updatePayload.status === undefined) updatePayload.status = "active";
    if (updatePayload.enabled === undefined) updatePayload.enabled = true;

    const { error } = await supabase
      .from("ai_memory_rules")
      .update(updatePayload as never)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true, template_id: templateIdResult };
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
      .merge(ruleV2PartialSchema)
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.when_text !== undefined) patch.when_text = data.when_text;
    if (data.then_text !== undefined) patch.then_text = data.then_text;
    Object.assign(
      patch,
      buildV2Patch(
        {
          conditions: data.conditions,
          actions: data.actions,
          mode: data.mode,
          confidence_threshold: data.confidence_threshold,
          applies_to: data.applies_to,
          enabled: data.enabled,
          status: data.status,
        },
        data.when_text,
        data.then_text,
      ),
    );
    const { error } = await supabase
      .from("ai_memory_rules")
      .update(patch as never)
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

// ============ Lịch sử áp dụng quy tắc ============

export type RuleApplication = {
  id: string;
  rule_id: string;
  document_table: string | null;
  document_id: string | null;
  document_label: string | null;
  journal_entry_id: string | null;
  journal_code: string | null;
  then_snapshot: string;
  ai_log: Record<string, any>;
  status: "applied" | "undone";
  applied_at: string;
  undone_at: string | null;
  undo_reason: string | null;
};

const APP_COLS =
  "id,rule_id,document_table,document_id,document_label,journal_entry_id,journal_code,then_snapshot,ai_log,status,applied_at,undone_at,undo_reason";

export const listRuleApplications = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ rule_id: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<RuleApplication[]> => {
    const { supabase, tenantId } = context;
    const { data: rows, error } = await supabase
      .from("ai_rule_applications")
      .select(APP_COLS)
      .eq("tenant_id", tenantId)
      .eq("rule_id", data.rule_id)
      .order("applied_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as RuleApplication[];
  });

export const undoRuleApplication = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;

    // Tải application + xác nhận quyền (RLS đảm bảo cross-tenant).
    const { data: app, error: loadErr } = await supabase
      .from("ai_rule_applications")
      .select("id,rule_id,journal_entry_id,status")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!app) throw new Error("Không tìm thấy lần áp dụng");
    if ((app as any).status === "undone") throw new Error("Lần áp dụng này đã được hoàn tác trước đó");

    // Đảo bút toán nếu có (giữ chứng từ, chỉ xoá liên kết JE).
    const jeId = (app as any).journal_entry_id as string | null;
    if (jeId) {
      const { error: delLineErr } = await supabase.from("journal_lines").delete().eq("entry_id", jeId);
      if (delLineErr) throw new Error(delLineErr.message);
      const { error: delEntryErr } = await supabase.from("journal_entries").delete().eq("id", jeId);
      if (delEntryErr) throw new Error(delEntryErr.message);
    }

    // Đánh dấu application là undone.
    const { error: updErr } = await supabase
      .from("ai_rule_applications")
      .update({
        status: "undone",
        undone_at: new Date().toISOString(),
        undone_by: userId,
        undo_reason: data.reason ?? null,
        journal_entry_id: null,
      })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (updErr) throw new Error(updErr.message);

    // Trigger ai_rule_applications_stats_trg sẽ tự trừ applied_count + accuracy.
    return { ok: true };
  });

// ============ Áp dụng theo "nguồn ghi nhớ" (partner / context / limit) ============

export type SourceKind = "rule" | "partner" | "context" | "limit";

export const listApplicationsBySource = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        source_kind: z.enum(["rule", "partner", "context", "limit"]),
        source_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RuleApplication[]> => {
    const { supabase, tenantId } = context;
    const { data: rows, error } = await supabase
      .from("ai_rule_applications")
      .select(APP_COLS)
      .eq("tenant_id", tenantId)
      .eq("source_kind", data.source_kind)
      .eq("source_id", data.source_id)
      .order("applied_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as RuleApplication[];
  });

export type RetroPreview = {
  affected_count: number;
  samples: Array<{
    id: string;
    document_label: string | null;
    journal_code: string | null;
    then_snapshot: string;
    applied_at: string;
  }>;
};

// Time-travel: xem trước những bút toán đã chịu ảnh hưởng của một mục bối cảnh
// (chỉ đếm + lấy mẫu — không tự sửa sổ kế toán; người dùng quyết định).
export const previewRetroApply = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        source_kind: z.enum(["rule", "partner", "context", "limit"]),
        source_id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<RetroPreview> => {
    const { supabase, tenantId } = context;
    const { data: rows, error, count } = await supabase
      .from("ai_rule_applications")
      .select("id,document_label,journal_code,then_snapshot,applied_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("source_kind", data.source_kind)
      .eq("source_id", data.source_id)
      .eq("status", "applied")
      .order("applied_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return {
      affected_count: count ?? 0,
      samples: (rows ?? []) as RetroPreview["samples"],
    };
  });

/** Học quy tắc ngay (nút "Học từ phiếu đã ghi sổ" ở empty state). */
export const learnRulesNow = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<{ created: number }> => {
    const { supabase, tenantId, userId } = context;
    const { learnRulesFromPurchaseVouchers } = await import("./rules/learn-rules.server");
    return learnRulesFromPurchaseVouchers(supabase, { tenantId, userId });
  });

/** Ghi nhận kết quả của một lần áp dụng rule: đúng/sai. */
export const markApplicationOutcome = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ application_id: z.string().uuid(), correct: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await supabase.rpc("record_rule_outcome", {
      _application_id: data.application_id,
      _correct: data.correct,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
