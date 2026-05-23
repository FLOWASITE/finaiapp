import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

const TASK_STATUSES = ["todo", "in_progress", "review", "done", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "med", "high", "urgent"] as const;
const TASK_CATEGORIES = [
  "vat_filing",
  "pit",
  "cit",
  "social_insurance",
  "bookkeeping",
  "financial_report",
  "internal",
  "other",
] as const;

const TaskSchema = z.object({
  id: z.string().uuid().optional(),
  link_id: z.string().uuid().optional().nullable(),
  contract_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1, "Bắt buộc").max(255),
  description: z.string().max(4000).optional().nullable(),
  category: z.enum(TASK_CATEGORIES).default("other"),
  priority: z.enum(TASK_PRIORITIES).default("med"),
  status: z.enum(TASK_STATUSES).default("todo"),
  assignee_user_id: z.string().uuid().optional().nullable(),
  reviewer_user_id: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  period_month: z.number().int().min(1).max(12).optional().nullable(),
  period_year: z.number().int().min(2000).max(2200).optional().nullable(),
  checklist: z
    .array(z.object({ text: z.string(), done: z.boolean().default(false) }))
    .default([]),
});

export const listTasks = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator(
    (i?: {
      status?: (typeof TASK_STATUSES)[number];
      assignee_user_id?: string;
      link_id?: string;
      category?: string;
    }) => i ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("office_tasks")
      .select(
        `*, link:office_client_links!office_tasks_link_id_fkey(
          id, display_name, tenant:tenants!office_client_links_client_tenant_id_fkey(name)
        ),
        assignee:profiles!office_tasks_assignee_user_id_fkey(id, display_name, email, avatar_url)`,
      )
      .eq("agency_tenant_id", tenantId)
      .order("position", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.assignee_user_id) q = q.eq("assignee_user_id", data.assignee_user_id);
    if (data.link_id) q = q.eq("link_id", data.link_id);
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => TaskSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { id, checklist, ...rest } = data;
    const payload = { ...rest, checklist: checklist as unknown as object };
    if (id) {
      const { error } = await supabase
        .from("office_tasks")
        .update(payload)
        .eq("id", id)
        .eq("agency_tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("office_tasks")
      .insert({ ...payload, agency_tenant_id: tenantId, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const moveTaskStatus = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; status: (typeof TASK_STATUSES)[number] }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "done") patch.completed_at = new Date().toISOString();
    if (data.status !== "done") patch.completed_at = null;
    const { error } = await supabase
      .from("office_tasks")
      .update(patch)
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("office_tasks")
      .delete()
      .eq("id", data.id)
      .eq("agency_tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
