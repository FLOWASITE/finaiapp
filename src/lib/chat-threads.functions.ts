import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type ChatThread = {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

const Uuid = z.string().uuid();

export const listThreads = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<ChatThread[]> => {
    const { supabase, userId, tenantId } = context;
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatThread[];
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ threadId: Uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: thread, error: e1 } = await supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!thread) throw new Error("Không tìm thấy cuộc trò chuyện");
    const { data: messages, error: e2 } = await supabase
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("thread_id", data.threadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (e2) throw new Error(e2.message);
    return {
      thread: thread as ChatThread,
      messages: (messages ?? []) as ChatMessage[],
    };
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ title: z.string().trim().min(1).max(200).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: row, error } = await supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        title: data.title?.trim() || "Cuộc trò chuyện mới",
      })
      .select("id,title,last_message_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatThread;
  });

export const renameThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ threadId: Uuid, title: z.string().trim().min(1).max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { error } = await supabase
      .from("chat_threads")
      .update({ title: data.title.trim() })
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ threadId: Uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const appendMessage = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        threadId: Uuid,
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(50_000),
        updateTitleIfBlank: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: row, error } = await supabase
      .from("chat_messages")
      .insert({
        thread_id: data.threadId,
        tenant_id: tenantId,
        user_id: userId,
        role: data.role,
        content: data.content,
      })
      .select("id,role,content,created_at")
      .single();
    if (error) throw new Error(error.message);

    // bump last_message_at, and auto-title from first user message if needed
    let nextTitle: string | undefined;
    if (data.updateTitleIfBlank && data.role === "user") {
      const { data: t } = await supabase
        .from("chat_threads")
        .select("title")
        .eq("id", data.threadId)
        .maybeSingle();
      if (t && (t.title === "Cuộc trò chuyện mới" || !t.title)) {
        nextTitle = data.content.trim().slice(0, 60) || "Cuộc trò chuyện mới";
      }
    }
    await supabase
      .from("chat_threads")
      .update({
        last_message_at: new Date().toISOString(),
        ...(nextTitle ? { title: nextTitle } : {}),
      })
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);

    return row as ChatMessage;
  });
