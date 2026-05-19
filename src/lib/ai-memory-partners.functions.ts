import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";

export type PartnerKind = "customer" | "supplier" | "employee" | "individual";

export type MemoryPartner = {
  id: string;
  party_kind: PartnerKind;
  party_id: string | null;
  display_name: string;
  behavior_text: string;
  tags: string[];
  default_account: string | null;
  default_dept_id: string | null;
  default_project_id: string | null;
  memo_keywords: string[];
  bank_hints: string[];
  confidence: number;
  sample_count: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id,party_kind,party_id,display_name,behavior_text,tags,default_account,default_dept_id,default_project_id,memo_keywords,bank_hints,confidence,sample_count,last_seen_at,created_at,updated_at";

export const listPartners = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }): Promise<MemoryPartner[]> => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("ai_memory_partners")
      .select(COLS)
      .eq("tenant_id", tenantId)
      .order("display_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MemoryPartner[];
  });

const partnerInput = z.object({
  party_kind: z.enum(["customer", "supplier", "employee", "individual"]),
  party_id: z.string().uuid().nullable().optional(),
  display_name: z.string().trim().min(1).max(255),
  behavior_text: z.string().trim().min(1).max(1000),
  tags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  default_account: z.string().trim().max(32).nullable().optional(),
  default_dept_id: z.string().uuid().nullable().optional(),
  default_project_id: z.string().uuid().nullable().optional(),
  memo_keywords: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  bank_hints: z.array(z.string().trim().min(1).max(64)).max(10).optional(),
});

export const createPartner = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => partnerInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const { data: row, error } = await supabase
      .from("ai_memory_partners")
      .insert({
        tenant_id: tenantId,
        created_by: userId,
        party_kind: data.party_kind,
        party_id: data.party_id ?? null,
        display_name: data.display_name,
        behavior_text: data.behavior_text,
        tags: data.tags ?? [],
        default_account: data.default_account ?? null,
        default_dept_id: data.default_dept_id ?? null,
        default_project_id: data.default_project_id ?? null,
        memo_keywords: data.memo_keywords ?? [],
        bank_hints: data.bank_hints ?? [],
      })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as MemoryPartner;
  });

export const updatePartner = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    partnerInput.partial().extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("ai_memory_partners")
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePartner = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { error } = await supabase
      .from("ai_memory_partners")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
