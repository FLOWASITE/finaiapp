import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KindSchema = z.enum(["customer", "supplier"]);
type Kind = z.infer<typeof KindSchema>;

const table = (k: Kind) => (k === "customer" ? "customer_groups" : "supplier_groups");
const partyTable = (k: Kind) => (k === "customer" ? "customers" : "suppliers");

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: KindSchema,
  code: z.string().trim().max(50).regex(/^[A-Za-z0-9_\-./]*$/, "Mã chỉ chứa chữ/số/_-./").optional().nullable()
    .or(z.literal("")).transform((v) => (v ? v : null)),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  parent_id: z.string().uuid().optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
  description: z.string().trim().max(1000).optional().nullable().or(z.literal("")).transform((v) => (v ? v : null)),
});

export const listPartyGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: Kind }) => z.object({ kind: KindSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: groups, error } = await supabase
      .from(table(data.kind) as any)
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    // Count members per group
    const { data: parties } = await supabase
      .from(partyTable(data.kind) as any)
      .select("group_id");
    const counts: Record<string, number> = {};
    for (const p of (parties ?? []) as any[]) {
      if (p.group_id) counts[p.group_id] = (counts[p.group_id] ?? 0) + 1;
    }
    return ((groups ?? []) as any[]).map((g) => ({ ...g, member_count: counts[g.id] ?? 0 }));
  });

export const upsertPartyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpsertSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).single();
    const tenant_id = profile?.active_tenant_id ?? null;
    const { id, kind, ...rest } = data;

    if (id) {
      if (rest.parent_id === id) throw new Error("Nhóm cha không thể là chính nó");
      const { error } = await supabase.from(table(kind) as any).update(rest).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error("Mã nhóm đã tồn tại");
        throw new Error(error.message);
      }
      return { id };
    }
    const { data: row, error } = await supabase
      .from(table(kind) as any)
      .insert({ ...rest, user_id: userId, tenant_id })
      .select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("Mã nhóm đã tồn tại");
      throw new Error(error.message);
    }
    return { id: (row as any).id as string };
  });

export const deletePartyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; kind: Kind }) =>
    z.object({ id: z.string().uuid(), kind: KindSchema }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(table(data.kind) as any).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignPartyGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; kind: Kind; group_id: string | null }) =>
    z.object({ id: z.string().uuid(), kind: KindSchema, group_id: z.string().uuid().nullable() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from(partyTable(data.kind) as any)
      .update({ group_id: data.group_id })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
