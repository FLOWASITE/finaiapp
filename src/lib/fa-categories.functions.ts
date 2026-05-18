import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

const CategoryInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  parent_id: z.string().uuid().nullable().optional(),
  default_useful_life_years_min: z.number().int().nullable().optional(),
  default_useful_life_years_max: z.number().int().nullable().optional(),
  default_useful_life_months: z.number().int().nullable().optional(),
  default_method: z.enum(["straight_line", "declining_balance", "units_of_production"]).default("straight_line"),
  default_asset_account: z.string().min(1).max(20).default("211"),
  default_accumulated_account: z.string().min(1).max(20).default("214"),
  default_expense_account: z.string().min(1).max(20).default("6422"),
  asset_kind: z.enum(["tangible", "intangible"]).default("tangible"),
  notes: z.string().max(1000).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const listFaCategories = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("fa_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertFaCategory = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => CategoryInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const row = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase.from("fa_categories").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: out, error } = await supabase
      .from("fa_categories").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: out!.id };
  });

export const deleteFaCategory = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("fa_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Seed danh mục TSCĐ chuẩn theo TT45/2013
const DEFAULT_CATEGORIES = [
  { code: "TS-NHA", name: "Nhà cửa, vật kiến trúc", min: 5, max: 50, asset_account: "2111" },
  { code: "TS-MMT", name: "Máy móc, thiết bị động lực", min: 7, max: 15, asset_account: "2112" },
  { code: "TS-MMC", name: "Máy móc, thiết bị công tác", min: 5, max: 12, asset_account: "2112" },
  { code: "TS-PTV", name: "Phương tiện vận tải đường bộ", min: 6, max: 10, asset_account: "2113" },
  { code: "TS-TBD", name: "Thiết bị, dụng cụ quản lý", min: 3, max: 8, asset_account: "2114" },
  { code: "TS-VTH", name: "TSCĐ vô hình — Phần mềm", min: 3, max: 8, asset_account: "2135", kind: "intangible" as const },
  { code: "TS-QSDD", name: "TSCĐ vô hình — Quyền sử dụng đất có thời hạn", min: 10, max: 50, asset_account: "2131", kind: "intangible" as const },
];

export const seedFaCategories = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, userId, tenantId } = context;
    const rows = DEFAULT_CATEGORIES.map((c) => ({
      tenant_id: tenantId,
      user_id: userId,
      code: c.code,
      name: c.name,
      default_useful_life_years_min: c.min,
      default_useful_life_years_max: c.max,
      default_useful_life_months: Math.round(((c.min + c.max) / 2) * 12),
      default_method: "straight_line",
      default_asset_account: c.asset_account,
      default_accumulated_account: c.kind === "intangible" ? "2147" : "2141",
      default_expense_account: "6422",
      asset_kind: c.kind ?? "tangible",
    }));
    const { error } = await supabase.from("fa_categories").upsert(rows, { onConflict: "tenant_id,code", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });
