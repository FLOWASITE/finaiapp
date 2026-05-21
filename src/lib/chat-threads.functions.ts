import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type ChatThread = {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
  kind?: "general" | "inbox" | null;
  inbox_external_id?: string | null;
  pinned_at?: string | null;
  starred?: boolean | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  metadata?: any;
};

const Uuid = z.string().uuid();

export const listThreads = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({ kind: z.enum(["general", "inbox", "all"]).optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ChatThread[]> => {
    const { supabase, userId, tenantId } = context;
    const kind = data.kind ?? "general";
    let q = supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at,kind,inbox_external_id,pinned_at,starred")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (kind !== "all") q = q.eq("kind", kind);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatThread[];
  });

export const getInboxThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ externalId: z.string().min(1).max(255) }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ChatThread | null> => {
    const { supabase, userId, tenantId } = context;
    const { data: row, error } = await supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("inbox_external_id", data.externalId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as ChatThread | null) ?? null;
  });

export const getOrCreateInboxThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        externalId: z.string().min(1).max(255),
        title: z.string().trim().min(1).max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<ChatThread> => {
    const { supabase, userId, tenantId } = context;
    const { data: existing } = await supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("inbox_external_id", data.externalId)
      .maybeSingle();
    if (existing) return existing as ChatThread;
    const { data: row, error } = await supabase
      .from("chat_threads")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        title: data.title?.trim() || "Trao đổi về mục Inbox",
        inbox_external_id: data.externalId,
        kind: "inbox",
      } as any)
      .select("id,title,last_message_at,created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatThread;
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ threadId: Uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: thread, error: e1 } = await supabase
      .from("chat_threads")
      .select("id,title,last_message_at,created_at,kind,inbox_external_id,pinned_at,starred")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!thread) return { thread: null, messages: [], notFound: true as const };
    const { data: messages, error: e2 } = await supabase
      .from("chat_messages")
      .select("id,role,content,created_at,metadata")
      .eq("thread_id", data.threadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (e2) throw new Error(e2.message);
    return {
      thread: thread as ChatThread,
      messages: (messages ?? []) as ChatMessage[],
      notFound: false as const,
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

export const createThreadWithFirstMessage = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        threadId: Uuid.optional(),
        messageId: Uuid.optional(),
        title: z.string().trim().min(1).max(200).optional(),
        content: z.string().min(1).max(50_000),
        metadata: z.any().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const title = data.title?.trim() || data.content.trim().slice(0, 60) || "Cuộc trò chuyện mới";
    const nowIso = new Date().toISOString();
    const threadSelect = "id,title,last_message_at,created_at,kind,inbox_external_id,pinned_at,starred";
    const messageSelect = "id,role,content,created_at,metadata";
    const isDuplicate = (error: any) =>
      error?.code === "23505" || String(error?.message ?? "").toLowerCase().includes("duplicate key");

    const loadThread = async () => {
      if (!data.threadId) return null;
      const { data: row, error } = await supabase
        .from("chat_threads")
        .select(threadSelect)
        .eq("id", data.threadId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    };

    let thread = await loadThread();
    if (!thread) {
      const insertPayload: any = { user_id: userId, tenant_id: tenantId, title, last_message_at: nowIso };
      if (data.threadId) insertPayload.id = data.threadId;
      const { data: inserted, error: e1 } = await supabase
        .from("chat_threads")
        .insert(insertPayload)
        .select(threadSelect)
        .single();
      if (e1) {
        if (data.threadId && isDuplicate(e1)) thread = await loadThread();
        else throw new Error(e1.message);
      } else {
        thread = inserted;
      }
    }
    if (!thread) throw new Error("Không tạo được hội thoại");

    const loadMessage = async () => {
      if (!data.messageId) return null;
      const { data: row, error } = await supabase
        .from("chat_messages")
        .select(messageSelect)
        .eq("id", data.messageId)
        .eq("thread_id", thread.id)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return row;
    };

    let msg = await loadMessage();
    if (!msg) {
      const messagePayload: any = {
        thread_id: thread.id,
        tenant_id: tenantId,
        user_id: userId,
        role: "user",
        content: data.content,
        metadata: data.metadata ?? null,
      };
      if (data.messageId) messagePayload.id = data.messageId;
      const { data: insertedMsg, error: e2 } = await supabase
        .from("chat_messages")
        .insert(messagePayload)
        .select(messageSelect)
        .single();
      if (e2) {
        if (data.messageId && isDuplicate(e2)) msg = await loadMessage();
        else throw new Error(e2.message);
      } else {
        msg = insertedMsg;
      }
    }
    if (!msg) throw new Error("Không tạo được tin nhắn đầu tiên");

    return { thread: thread as ChatThread, message: msg as ChatMessage };
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
        metadata: z.any().optional(),
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
        metadata: data.metadata ?? null,
      })
      .select("id,role,content,created_at,metadata")
      .single();
    if (error) throw new Error(error.message);

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

export const deleteLastAssistantMessage = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ threadId: Uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: rows } = await supabase
      .from("chat_messages")
      .select("id,role")
      .eq("thread_id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = rows?.[0];
    if (!last || last.role !== "assistant") return { ok: false };
    const { error } = await supabase.from("chat_messages").delete().eq("id", last.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setThreadPinned = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ threadId: Uuid, pinned: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { error } = await supabase
      .from("chat_threads")
      .update({ pinned_at: data.pinned ? new Date().toISOString() : null })
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setThreadStarred = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ threadId: Uuid, starred: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { error } = await supabase
      .from("chat_threads")
      .update({ starred: data.starred })
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
