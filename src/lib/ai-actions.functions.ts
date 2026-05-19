import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTION_HANDLERS } from "@/lib/ai/action-handlers.server";

/** Called by the AI's proposeAction tool. Validates input, generates preview, inserts pending row. */
export const proposeActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        tool_name: z.string().min(1),
        input: z.record(z.string(), z.any()),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const handler = ACTION_HANDLERS[data.tool_name];
    if (!handler) throw new Error(`Tool không hỗ trợ: ${data.tool_name}`);

    const parsed = handler.schema.parse(data.input);
    const summary = await handler.preview(parsed, { supabase, userId });

    const { data: row, error } = await supabase
      .from("ai_actions")
      .insert({
        user_id: userId,
        tool_name: data.tool_name,
        input: parsed,
        summary,
        status: "pending",
      })
      .select("id, summary")
      .single();
    if (error) throw new Error(error.message);
    return { action_id: row.id, summary: row.summary };
  });

export const listPendingAiActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("ai_actions")
      .select("id, tool_name, summary, status, result, result_ref_table, result_ref_id, error_message, created_at")
      .eq("user_id", userId)
      .in("status", ["pending", "approved", "executed", "failed"])
      .order("created_at", { ascending: false })
      .limit(20);
    return { actions: data ?? [] };
  });

export const approveAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ action_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: row, error: fErr } = await supabase
      .from("ai_actions")
      .select("*")
      .eq("id", data.action_id)
      .eq("user_id", userId)
      .single();
    if (fErr || !row) throw new Error("Không tìm thấy hành động");
    if (row.status !== "pending") throw new Error(`Hành động đã ở trạng thái ${row.status}`);

    const handler = ACTION_HANDLERS[row.tool_name];
    if (!handler) throw new Error(`Tool không hỗ trợ: ${row.tool_name}`);

    await supabase
      .from("ai_actions")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", row.id);

    try {
      const parsed = handler.schema.parse(row.input);
      const result = await handler.execute(parsed, { supabase, userId });
      await supabase
        .from("ai_actions")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          result: result as any,
          result_ref_table: result.ref_table ?? null,
          result_ref_id: result.ref_id ?? null,
        })
        .eq("id", row.id);
      return { ok: true, result };
    } catch (e: any) {
      await supabase
        .from("ai_actions")
        .update({ status: "failed", error_message: e?.message ?? String(e) })
        .eq("id", row.id);
      throw new Error(e?.message ?? "Lỗi thực thi");
    }
  });

export const cancelAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ action_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase
      .from("ai_actions")
      .update({ status: "cancelled" })
      .eq("id", data.action_id)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
