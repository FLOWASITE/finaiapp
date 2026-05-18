import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

const CountInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  count_date: z.string(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

export const listInventoryCounts = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("fa_inventory_counts").select("*")
      .eq("tenant_id", context.tenantId)
      .order("count_date", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInventoryCount = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: header } = await supabase.from("fa_inventory_counts").select("*")
      .eq("id", data.id).eq("tenant_id", tenantId).single();
    if (!header) throw new Error("Không tìm thấy phiên kiểm kê");
    const { data: lines } = await supabase.from("fa_inventory_count_lines")
      .select("*, asset:fixed_assets(id, code, name, location, barcode, status)")
      .eq("count_id", data.id).order("created_at");
    return { header, lines: lines ?? [] };
  });

export const upsertInventoryCount = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => CountInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    if (data.id) {
      const { error } = await supabase.from("fa_inventory_counts").update({
        code: data.code, count_date: data.count_date,
        branch_id: data.branch_id ?? null, department_id: data.department_id ?? null,
        location: data.location ?? null, description: data.description ?? null,
      }).eq("id", data.id).eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: out, error } = await supabase.from("fa_inventory_counts").insert({
      tenant_id: tenantId, code: data.code, count_date: data.count_date,
      branch_id: data.branch_id ?? null, department_id: data.department_id ?? null,
      location: data.location ?? null, description: data.description ?? null,
      created_by: userId, status: "draft",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: out!.id };
  });

export const seedInventoryLines = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { count_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: h } = await supabase.from("fa_inventory_counts").select("*")
      .eq("id", data.count_id).eq("tenant_id", tenantId).single();
    if (!h) throw new Error("Không tìm thấy phiên kiểm kê");
    let q = supabase.from("fixed_assets").select("id, location")
      .eq("tenant_id", tenantId).eq("status", "active");
    if (h.branch_id) q = q.eq("branch_id", h.branch_id);
    if (h.department_id) q = q.eq("department_id", h.department_id);
    if (h.location) q = q.eq("location", h.location);
    const { data: assets } = await q;
    if (!assets?.length) return { added: 0 };
    const { data: existing } = await supabase.from("fa_inventory_count_lines")
      .select("asset_id").eq("count_id", data.count_id);
    const have = new Set((existing ?? []).map((r: any) => r.asset_id));
    const rows = assets.filter((a: any) => !have.has(a.id)).map((a: any) => ({
      tenant_id: tenantId, count_id: data.count_id, asset_id: a.id,
      expected_location: a.location, status: "pending",
    }));
    if (!rows.length) return { added: 0 };
    const { error } = await supabase.from("fa_inventory_count_lines").insert(rows);
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

export const scanInventoryCode = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { count_id: string; code: string; found_location?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId, userId } = context;
    const code = data.code.trim();
    if (!code) throw new Error("Mã trống");
    const { data: byBar } = await supabase.from("fixed_assets")
      .select("id, code, name, location")
      .eq("tenant_id", tenantId).eq("barcode", code).maybeSingle();
    const { data: byCode } = !byBar ? await supabase.from("fixed_assets")
      .select("id, code, name, location")
      .eq("tenant_id", tenantId).eq("code", code).maybeSingle() : { data: null };
    const asset = byBar ?? byCode;

    if (!asset) {
      const { data: out, error } = await supabase.from("fa_inventory_count_lines").insert({
        tenant_id: tenantId, count_id: data.count_id,
        asset_id: null, scanned_code: code,
        found_location: data.found_location ?? null,
        status: "extra", scanned_at: new Date().toISOString(), scanned_by: userId,
      }).select("*").single();
      if (error) throw new Error(error.message);
      return { line: out, kind: "extra" };
    }

    const { data: existing } = await supabase.from("fa_inventory_count_lines")
      .select("*").eq("count_id", data.count_id).eq("asset_id", asset.id).maybeSingle();
    const found = data.found_location ?? null;
    const status = (found && asset.location && found !== asset.location) ? "wrong_location" : "matched";
    if (existing) {
      const { data: out, error } = await supabase.from("fa_inventory_count_lines").update({
        scanned_code: code, found_location: found, status,
        scanned_at: new Date().toISOString(), scanned_by: userId,
      }).eq("id", existing.id).select("*").single();
      if (error) throw new Error(error.message);
      return { line: out, kind: status };
    }
    const { data: out, error } = await supabase.from("fa_inventory_count_lines").insert({
      tenant_id: tenantId, count_id: data.count_id,
      asset_id: asset.id, scanned_code: code,
      expected_location: asset.location, found_location: found,
      status, scanned_at: new Date().toISOString(), scanned_by: userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { line: out, kind: status };
  });

export const updateCountLine = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; status?: string; notes?: string }) => i)
  .handler(async ({ data, context }) => {
    const update: any = {};
    if (data.status) update.status = data.status;
    if (data.notes !== undefined) update.notes = data.notes;
    const { error } = await context.supabase.from("fa_inventory_count_lines")
      .update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCountLine = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("fa_inventory_count_lines").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const postInventoryCount = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    await supabase.from("fa_inventory_count_lines")
      .update({ status: "missing" }).eq("count_id", data.id).eq("status", "pending");
    const { error } = await supabase.from("fa_inventory_counts").update({
      status: "posted", posted_at: new Date().toISOString(),
    }).eq("id", data.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
