import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { isPeriodLocked } from "@/lib/period-lock";
import { z } from "zod";


// =================== Books ===================
const BookInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_]+$/, "Mã sổ chỉ gồm A-Z 0-9 _"),
  name: z.string().min(1).max(100),
  is_primary: z.boolean().default(false),
  post_to_gl: z.boolean().default(false),
  currency: z.string().min(3).max(8).default("VND"),
  notes: z.string().max(500).nullable().optional(),
});

export const listDepBooks = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data, error } = await supabase
      .from("fa_depreciation_books")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("is_primary", { ascending: false })
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertDepBook = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => BookInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    // If marking primary, unset other primaries first
    if (data.is_primary) {
      await supabase
        .from("fa_depreciation_books")
        .update({ is_primary: false })
        .eq("tenant_id", tenantId)
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const row: any = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase.from("fa_depreciation_books").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: out, error } = await supabase
      .from("fa_depreciation_books").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: out!.id };
  });

export const deleteDepBook = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("depreciation_entries")
      .select("id", { count: "exact", head: true })
      .eq("book_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Sổ đã có bút toán khấu hao, không thể xoá");
    const { error } = await supabase.from("fa_depreciation_books").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================== Asset-Book settings ===================
const AssetBookInput = z.object({
  id: z.string().uuid().optional(),
  asset_id: z.string().uuid(),
  book_id: z.string().uuid(),
  method: z.enum(["straight_line", "declining_balance", "sum_of_years_digits", "units_of_production"]),
  cost_basis: z.number().positive().nullable().optional(),
  salvage_value: z.number().min(0).default(0),
  useful_life_months: z.number().int().positive(),
  declining_factor: z.number().min(1).max(5).default(2),
  total_units: z.number().positive().nullable().optional(),
  asset_account: z.string().min(1).max(20).default("211"),
  accumulated_account: z.string().min(1).max(20).default("214"),
  expense_account: z.string().min(1).max(20).default("6422"),
  start_date: z.string(),
  opening_accumulated: z.number().min(0).default(0),
  opening_months: z.number().int().min(0).default(0),
  status: z.enum(["active", "suspended", "closed"]).default("active"),
  suspend_from: z.string().nullable().optional(),
  suspend_to: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const listAssetBooks = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { assetId?: string; bookId?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("fa_asset_books")
      .select("*, asset:fixed_assets(id, code, name, cost), book:fa_depreciation_books(id, code, name, is_primary, post_to_gl)")
      .eq("tenant_id", tenantId);
    if (data.assetId) q = q.eq("asset_id", data.assetId);
    if (data.bookId) q = q.eq("book_id", data.bookId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAssetBook = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => AssetBookInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    const row: any = { ...data, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase.from("fa_asset_books").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: out, error } = await supabase
      .from("fa_asset_books").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: out!.id };
  });

export const setAssetBookStatus = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string; status: "active" | "suspended" | "closed"; suspend_from?: string | null; suspend_to?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("fa_asset_books").update({
      status: data.status,
      suspend_from: data.suspend_from ?? null,
      suspend_to: data.suspend_to ?? null,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =================== Depreciation engine ===================
function monthDiff(a: Date, b: Date) {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function lastDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function periodKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Compute monthly depreciation amount for an asset-book at given month index
 * (0 = first month of life). Returns 0 for periods past useful life.
 */
function computeMonthlyAmount(ab: any, monthIdx: number, life: number): number {
  const cost = Number(ab.cost_basis ?? ab.asset?.cost ?? 0);
  const salvage = Number(ab.salvage_value ?? 0);
  const depBase = Math.max(0, cost - salvage);
  if (monthIdx < 0 || monthIdx >= life) return 0;

  switch (ab.method) {
    case "straight_line":
      return depBase / life;

    case "declining_balance": {
      // Annual DB rate then divide by 12. Switch to SL when SL on remaining is larger.
      const factor = Number(ab.declining_factor ?? 2);
      const annualRate = factor / (life / 12);
      const monthlyRate = annualRate / 12;
      // Walk through prior months to get current book value (small life so OK)
      let bv = cost;
      let accum = 0;
      for (let i = 0; i <= monthIdx; i++) {
        const remainingMonths = life - i;
        const dbAmt = Math.max(0, bv) * monthlyRate;
        const slAmt = Math.max(0, bv - salvage) / remainingMonths;
        const amt = Math.min(Math.max(dbAmt, slAmt), Math.max(0, bv - salvage));
        if (i === monthIdx) return amt;
        accum += amt;
        bv = cost - accum;
      }
      return 0;
    }

    case "sum_of_years_digits": {
      // Apply at month resolution: weight = (life - monthIdx) over sum(1..life)
      const sumDigits = (life * (life + 1)) / 2;
      return (depBase * (life - monthIdx)) / sumDigits;
    }

    case "units_of_production":
      // Handled separately via recordUnitsProduction; batch run skips.
      return 0;

    default:
      return depBase / life;
  }
}

export const runBookDepreciation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { bookId: string; upToMonth: string; preview?: boolean }) =>
    z.object({
      bookId: z.string().uuid(),
      upToMonth: z.string().regex(/^\d{4}-\d{2}$/),
      preview: z.boolean().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const [yStr, mStr] = data.upToMonth.split("-");
    const target = new Date(Number(yStr), Number(mStr) - 1, 1);

    const { data: book } = await supabase
      .from("fa_depreciation_books").select("*").eq("id", data.bookId).single();
    if (!book) throw new Error("Không tìm thấy sổ khấu hao");

    const { data: rows } = await supabase
      .from("fa_asset_books")
      .select("*, asset:fixed_assets(id, code, name, cost, status)")
      .eq("tenant_id", tenantId)
      .eq("book_id", data.bookId);

    let createdCount = 0;
    let totalAmount = 0;
    const previewRows: any[] = [];

    for (const ab of rows ?? []) {
      if (ab.status === "closed") continue;
      if (ab.asset?.status === "disposed") continue;
      if (ab.method === "units_of_production") continue;

      const life = Number(ab.useful_life_months);
      const start = new Date(ab.start_date);
      const openingMonths = Number(ab.opening_months ?? 0);
      const firstPost = addMonths(start, openingMonths);

      const { data: existing } = await supabase
        .from("depreciation_entries")
        .select("period_month")
        .eq("asset_id", ab.asset_id)
        .eq("book_id", data.bookId);
      const done = new Set((existing ?? []).map((e: any) => e.period_month));

      let cur = new Date(firstPost);
      while (cur <= target) {
        const idx = monthDiff(cur, start);
        if (idx >= life) break;
        const period = periodKey(cur);

        // suspend window check
        const suspended =
          ab.status === "suspended" ||
          (ab.suspend_from && cur >= new Date(ab.suspend_from) &&
            (!ab.suspend_to || cur <= new Date(ab.suspend_to)));

        if (!done.has(period) && !suspended) {
          const amt = computeMonthlyAmount(ab, idx, life);
          if (amt > 0) {
            const periodLastDay = ymd(lastDay(cur));
            const locked = !data.preview && await isPeriodLocked(supabase, userId, periodLastDay);
            if (locked) {
              // Skip locked period — caller can re-run later after unlock
              cur = addMonths(cur, 1);
              continue;
            }
            if (data.preview) {
              previewRows.push({
                asset_code: ab.asset?.code,
                asset_name: ab.asset?.name,
                period,
                amount: amt,
              });

            } else {
              let entryId: string | null = null;
              if (book.post_to_gl) {
                const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
                  user_id: userId,
                  tenant_id: tenantId,
                  entry_date: ymd(lastDay(cur)),
                  description: `[${book.code}] Khấu hao ${ab.asset?.name} (${ab.asset?.code}) ${period.slice(0, 7)}`,
                }).select("id").single();
                if (eErr || !entry) {
                  cur = addMonths(cur, 1);
                  continue;
                }
                entryId = entry.id;
                await supabase.from("journal_lines").insert([
                  { entry_id: entry.id, account_code: ab.expense_account, debit: amt, credit: 0, line_order: 0 },
                  { entry_id: entry.id, account_code: ab.accumulated_account, debit: 0, credit: amt, line_order: 1 },
                ]);
              }
              await supabase.from("depreciation_entries").insert({
                asset_id: ab.asset_id,
                book_id: data.bookId,
                period_month: period,
                amount: amt,
                journal_entry_id: entryId,
              });
              createdCount++;
              totalAmount += amt;
            }
          }
        }
        cur = addMonths(cur, 1);
      }
    }

    if (data.preview) return { preview: true, rows: previewRows, total: previewRows.reduce((s, r) => s + r.amount, 0) };
    return { created: createdCount, total: totalAmount };
  });

export const listBookEntries = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .inputValidator((i: { bookId: string; periodMonth?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("depreciation_entries")
      .select("*, asset:fixed_assets!inner(id, code, name, tenant_id)")
      .eq("book_id", data.bookId)
      .eq("asset.tenant_id", tenantId)
      .order("period_month", { ascending: false })
      .limit(500);
    if (data.periodMonth) q = q.eq("period_month", data.periodMonth);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Huỷ (đảo ngược) một bút toán khấu hao đã đăng
export const voidDepEntry = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i) => z.object({
    entry_id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: newJe, error } = await supabase.rpc("void_depreciation_entry", {
      _entry_id: data.entry_id,
      _reason: data.reason,
    });

    if (error) throw new Error(error.message);
    return { ok: true, journal_entry_id: newJe ?? null };
  });

