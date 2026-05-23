import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export const listTaskComments = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { task_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: t } = await supabase
      .from("office_tasks")
      .select("id")
      .eq("id", data.task_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (!t) throw new Error("Không tìm thấy công việc");
    const { data: rows, error } = await supabase
      .from("office_task_comments")
      .select(
        "id, body, created_at, author:profiles!office_task_comments_author_id_fkey(id, display_name, email, avatar_url)",
      )
      .eq("task_id", data.task_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addTaskComment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ task_id: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: t } = await supabase
      .from("office_tasks")
      .select("id")
      .eq("id", data.task_id)
      .eq("agency_tenant_id", tenantId)
      .single();
    if (!t) throw new Error("Không tìm thấy công việc");
    const { error } = await supabase
      .from("office_task_comments")
      .insert({ task_id: data.task_id, body: data.body, author_id: userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTaskComment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("office_task_comments")
      .delete()
      .eq("id", data.id)
      .eq("author_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
