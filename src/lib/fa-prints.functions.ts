import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";

async function getTenantInfo(supabase: any, tenantId: string) {
  const { data } = await supabase
    .from("tenants")
    .select("name, address, tax_id, legal_rep_name, business_reg_no, phone, email")
    .eq("id", tenantId)
    .maybeSingle();
  return data ?? { name: "", address: "", tax_id: "", legal_rep_name: "" };
}

// ============ 01-TSCĐ — Biên bản giao nhận TSCĐ ============
export const getHandoverPrint = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { asset_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: a, error } = await supabase
      .from("fixed_assets")
      .select("*, fa_categories(code, name), departments(name), branches(name), suppliers(name, address, tax_id)")
      .eq("id", data.asset_id).eq("tenant_id", tenantId).single();
    if (error || !a) throw new Error("Không tìm thấy tài sản");
    const tenant = await getTenantInfo(supabase, tenantId);
    return { asset: a, tenant };
  });

// ============ 02-TSCĐ — Biên bản thanh lý TSCĐ ============
export const getDisposalPrint = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { disposal_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: d, error } = await supabase
      .from("fa_disposals")
      .select("*, asset:fixed_assets(*, fa_categories(name), departments(name), branches(name))")
      .eq("id", data.disposal_id).eq("tenant_id", tenantId).single();
    if (error || !d) throw new Error("Không tìm thấy chứng từ thanh lý");
    let buyer: any = null;
    if (d.buyer_party_id) {
      const { data: b } = await supabase.from("customers")
        .select("name, address, tax_id").eq("id", d.buyer_party_id).maybeSingle();
      buyer = b;
    }
    const tenant = await getTenantInfo(supabase, tenantId);
    return { disposal: d, buyer, tenant };
  });

// ============ 05-TSCĐ — Biên bản kiểm kê TSCĐ ============
export const getInventoryPrint = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { count_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: header, error } = await supabase
      .from("fa_inventory_counts")
      .select("*")
      .eq("id", data.count_id).eq("tenant_id", tenantId).single();
    if (error || !header) throw new Error("Không tìm thấy phiên kiểm kê");
    const [{ data: branch }, { data: dept }] = await Promise.all([
      header.branch_id ? supabase.from("branches").select("name").eq("id", header.branch_id).maybeSingle() : Promise.resolve({ data: null }),
      header.department_id ? supabase.from("departments").select("name").eq("id", header.department_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const headerOut = { ...header, branches: branch, departments: dept };
    const { data: lines } = await supabase
      .from("fa_inventory_count_lines")
      .select("*, asset:fixed_assets(id, code, name, unit, quantity, cost, in_service_date, location, useful_life_months, opening_accumulated)")
      .eq("count_id", data.count_id).order("created_at");

    // Compute accumulated for each asset on primary book
    const ids = (lines ?? []).filter((l: any) => l.asset_id).map((l: any) => l.asset_id);
    const { data: prim } = await supabase.from("fa_depreciation_books")
      .select("id").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    let accumMap = new Map<string, number>();
    if (ids.length && prim?.id) {
      const { data: deps } = await supabase.from("depreciation_entries")
        .select("asset_id, amount").in("asset_id", ids).eq("book_id", prim.id);
      for (const id of ids) {
        const sum = (deps ?? []).filter((d: any) => d.asset_id === id).reduce((s: number, d: any) => s + Number(d.amount), 0);
        accumMap.set(id, sum);
      }
    }
    const enriched = (lines ?? []).map((l: any) => {
      const a = l.asset;
      const accum = (accumMap.get(l.asset_id) ?? 0) + Number(a?.opening_accumulated ?? 0);
      const nbv = a ? Math.max(0, Number(a.cost) - accum) : 0;
      return { ...l, accumulated: accum, nbv };
    });

    const tenant = await getTenantInfo(supabase, tenantId);
    return { header: headerOut, lines: enriched, tenant };
  });

// ============ 03-TSCĐ — Biên bản giao nhận TSCĐ sửa chữa lớn hoàn thành ============
// ============ 04-TSCĐ — Biên bản đánh giá lại TSCĐ ============
// Both share the same data shape (fa_event + asset + tenant). The route decides which template to render.
export const getEventPrint = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { event_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: ev, error } = await supabase
      .from("fa_events")
      .select("*, asset:fixed_assets(*, fa_categories(name), departments(name), branches(name))")
      .eq("id", data.event_id).eq("tenant_id", tenantId).single();
    if (error || !ev) throw new Error("Không tìm thấy biến động");

    // Cumulative depreciation up to event_date (primary book)
    const { data: prim } = await supabase
      .from("fa_depreciation_books").select("id")
      .eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    const { data: deps } = prim?.id
      ? await supabase.from("depreciation_entries")
          .select("amount, period_month")
          .eq("asset_id", ev.asset_id).eq("book_id", prim.id)
          .lte("period_month", ev.event_date)
      : { data: [] as any[] };
    const accumulated = (deps ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0)
      + Number(ev.asset?.opening_accumulated ?? 0);

    const tenant = await getTenantInfo(supabase, tenantId);
    return { event: ev, tenant, accumulated };
  });
