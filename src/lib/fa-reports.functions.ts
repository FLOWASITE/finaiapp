import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { z } from "zod";

// =========== S21-DN: Sổ tài sản cố định ===========
// Cột: Mã, Tên, Phân loại, Ngày đưa vào SD, Nguyên giá, Tỉ lệ KH, KH năm, KH luỹ kế, GT còn lại, Lý do giảm
export const reportS21 = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { year?: number; book_id?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const year = data.year ?? new Date().getFullYear();

    const { data: book } = data.book_id
      ? await supabase.from("fa_depreciation_books").select("id, name, code").eq("id", data.book_id).single()
      : await supabase.from("fa_depreciation_books").select("id, name, code").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

    const { data: assets } = await supabase
      .from("fixed_assets")
      .select("*, fa_categories(code, name), departments(name), branches(name)")
      .eq("tenant_id", tenantId)
      .order("code");

    const ids = (assets ?? []).map((a: any) => a.id);
    let depMap = new Map<string, { year: number; total: number; cumulative: number }>();
    if (ids.length && book?.id) {
      const { data: deps } = await supabase
        .from("depreciation_entries")
        .select("asset_id, period_month, amount")
        .in("asset_id", ids)
        .eq("book_id", book.id);
      for (const a of assets!) {
        const arr = (deps ?? []).filter((d: any) => d.asset_id === a.id);
        const yearAmt = arr.filter((d: any) => new Date(d.period_month).getFullYear() === year)
          .reduce((s: number, d: any) => s + Number(d.amount), 0);
        const cum = arr.reduce((s: number, d: any) => s + Number(d.amount), 0)
          + Number(a.opening_accumulated ?? 0);
        depMap.set(a.id, { year, total: yearAmt, cumulative: cum });
      }
    }

    const rows = (assets ?? []).map((a: any) => {
      const d = depMap.get(a.id) ?? { year, total: 0, cumulative: Number(a.opening_accumulated ?? 0) };
      const rate = a.useful_life_months ? (12 / a.useful_life_months) * 100 : 0;
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        category: a.fa_categories?.name ?? null,
        in_service_date: a.in_service_date ?? a.start_date,
        cost: Number(a.cost),
        rate_year: Number(rate.toFixed(2)),
        depreciation_year: d.total,
        accumulated: d.cumulative,
        nbv: Math.max(0, Number(a.cost) - d.cumulative),
        status: a.status,
        department: a.departments?.name ?? null,
        branch: a.branches?.name ?? null,
        location: a.location,
      };
    });

    const totals = {
      cost: rows.reduce((s, r) => s + r.cost, 0),
      depreciation_year: rows.reduce((s, r) => s + r.depreciation_year, 0),
      accumulated: rows.reduce((s, r) => s + r.accumulated, 0),
      nbv: rows.reduce((s, r) => s + r.nbv, 0),
    };

    return { year, book, rows, totals };
  });

// =========== S22-DN: Bảng tính và phân bổ khấu hao TSCĐ ===========
// Chia theo phòng ban / TK chi phí của tháng
export const reportS22 = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { period: string; book_id?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const [y, m] = data.period.split("-").map(Number);
    const periodMonth = `${y}-${String(m).padStart(2, "0")}-01`;

    const { data: book } = data.book_id
      ? await supabase.from("fa_depreciation_books").select("id, name, code").eq("id", data.book_id).single()
      : await supabase.from("fa_depreciation_books").select("id, name, code").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    if (!book?.id) return { period: data.period, book: null, rows: [], totals: { current: 0 }, byAccount: [], byDept: [] };

    const { data: entries } = await supabase
      .from("depreciation_entries")
      .select("asset_id, amount, period_month, asset:fixed_assets(id, code, name, expense_account, department_id, departments(name))")
      .eq("book_id", book.id)
      .eq("period_month", periodMonth);

    const rows = (entries ?? []).map((e: any) => ({
      asset_id: e.asset_id,
      code: e.asset?.code,
      name: e.asset?.name,
      department: e.asset?.departments?.name ?? null,
      expense_account: e.asset?.expense_account ?? "6422",
      amount: Number(e.amount),
    }));

    const byAccount = Object.entries(rows.reduce((m: Record<string, number>, r) => {
      m[r.expense_account] = (m[r.expense_account] || 0) + r.amount; return m;
    }, {})).map(([account, amount]) => ({ account, amount }));

    const byDept = Object.entries(rows.reduce((m: Record<string, number>, r) => {
      const k = r.department || "Chưa phân bổ";
      m[k] = (m[k] || 0) + r.amount; return m;
    }, {})).map(([department, amount]) => ({ department, amount }));

    return {
      period: data.period, book, rows,
      totals: { current: rows.reduce((s, r) => s + r.amount, 0) },
      byAccount, byDept,
    };
  });

// =========== Tổng hợp tăng/giảm theo nguồn vốn ===========
export const reportFundingMovement = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;

    // Tăng: assets có start_date in [from,to]
    const { data: incoming } = await supabase
      .from("fixed_assets")
      .select("id, code, name, cost, funding_source, source_type, start_date")
      .eq("tenant_id", tenantId)
      .gte("start_date", data.from).lte("start_date", data.to);

    // Giảm: fa_disposals trong kỳ + fa_reclassifications fa_to_tool
    const { data: disposals } = await supabase
      .from("fa_disposals")
      .select("id, asset_id, disposal_date, disposal_type, cost_snapshot, residual_value, asset:fixed_assets(code, name, funding_source)")
      .eq("tenant_id", tenantId)
      .gte("disposal_date", data.from).lte("disposal_date", data.to)
      .eq("status", "posted");
    const { data: reclass } = await supabase
      .from("fa_reclassifications")
      .select("id, asset_id, reclass_date, direction, cost_snapshot, residual_value, target_account, asset:fixed_assets(code, name, funding_source)")
      .eq("tenant_id", tenantId)
      .eq("direction", "fa_to_tool")
      .gte("reclass_date", data.from).lte("reclass_date", data.to)
      .eq("status", "posted");

    const groupBy = (rows: any[], keyFn: (r: any) => string, amtFn: (r: any) => number) => {
      const m: Record<string, { count: number; amount: number }> = {};
      for (const r of rows) {
        const k = keyFn(r) || "Chưa phân loại";
        if (!m[k]) m[k] = { count: 0, amount: 0 };
        m[k].count += 1;
        m[k].amount += amtFn(r);
      }
      return Object.entries(m).map(([source, v]) => ({ source, ...v }));
    };

    const incomingBySource = groupBy(incoming ?? [], (r) => r.funding_source, (r) => Number(r.cost));
    const decreaseRows = [
      ...(disposals ?? []).map((r: any) => ({ ...r, kind: r.disposal_type, source: r.asset?.funding_source })),
      ...(reclass ?? []).map((r: any) => ({ ...r, kind: `reclass_${r.target_account}`, source: r.asset?.funding_source })),
    ];
    const decreaseBySource = groupBy(decreaseRows, (r) => r.source, (r) => Number(r.cost_snapshot));

    return {
      from: data.from, to: data.to,
      incoming: incoming ?? [],
      decreases: decreaseRows,
      incomingBySource, decreaseBySource,
      totals: {
        incoming: (incoming ?? []).reduce((s, r) => s + Number(r.cost), 0),
        decrease: decreaseRows.reduce((s, r) => s + Number(r.cost_snapshot), 0),
      },
    };
  });

// =========== Thẻ TSCĐ (dữ liệu in) ===========
export const getAssetCard = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { asset_id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const { data: a } = await supabase
      .from("fixed_assets")
      .select("*, fa_categories(code, name), departments(name), branches(name), suppliers(name)")
      .eq("id", data.asset_id).eq("tenant_id", tenantId).single();
    if (!a) throw new Error("Không tìm thấy tài sản");

    const { data: prim } = await supabase
      .from("fa_depreciation_books").select("id, name, code")
      .eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
    const { data: deps } = prim?.id
      ? await supabase.from("depreciation_entries").select("period_month, amount")
          .eq("asset_id", data.asset_id).eq("book_id", prim.id).order("period_month")
      : { data: [] as any[] };
    const accumulated = (deps ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0)
      + Number(a.opening_accumulated ?? 0);

    const { data: events } = await supabase
      .from("fa_events").select("*").eq("asset_id", data.asset_id).order("event_date");
    const { data: disposals } = await supabase
      .from("fa_disposals").select("*").eq("asset_id", data.asset_id);
    const { data: reclass } = await supabase
      .from("fa_reclassifications").select("*").eq("asset_id", data.asset_id);

    return {
      asset: a,
      book: prim,
      depreciation: deps ?? [],
      accumulated,
      nbv: Math.max(0, Number(a.cost) - accumulated),
      events: events ?? [],
      disposals: disposals ?? [],
      reclassifications: reclass ?? [],
    };
  });
