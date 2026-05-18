import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";

// Run monthly depreciation: for each active asset, for every month from start_date up to target month
// that hasn't been posted yet, compute amount and create journal entry: Nợ expense / Có accumulated.
export const runMonthlyDepreciation = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { upToMonth: string }) => i) // YYYY-MM
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const [yStr, mStr] = data.upToMonth.split("-");
    const targetY = Number(yStr), targetM = Number(mStr);
    if (!targetY || !targetM) throw new Error("upToMonth phải có dạng YYYY-MM");

    const { data: assets } = await supabase
      .from("fixed_assets")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active");

    let created = 0;
    for (const a of assets ?? []) {
      const monthlyAmount = (Number(a.cost) - Number(a.salvage_value)) / Number(a.useful_life_months);
      const start = new Date(a.start_date);
      const { data: existing } = await supabase
        .from("depreciation_entries")
        .select("period_month")
        .eq("asset_id", a.id);
      const done = new Set((existing ?? []).map((e: any) => e.period_month));

      let cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const target = new Date(targetY, targetM - 1, 1);
      let monthsPosted = 0;
      while (cur <= target && monthsPosted < Number(a.useful_life_months)) {
        const period = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
        if (!done.has(period)) {
          // Create journal entry
          const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
          const { data: entry, error: eErr } = await supabase.from("journal_entries").insert({
            user_id: userId,
            tenant_id: tenantId,
            entry_date: lastDay.toISOString().slice(0, 10),
            description: `Trích khấu hao ${a.name} (${a.code}) tháng ${String(cur.getMonth() + 1).padStart(2, "0")}/${cur.getFullYear()}`,
          }).select("id").single();
          if (eErr || !entry) continue;
          await supabase.from("journal_lines").insert([
            { entry_id: entry.id, account_code: a.expense_account, debit: monthlyAmount, credit: 0, line_order: 0 },
            { entry_id: entry.id, account_code: a.accumulated_account, debit: 0, credit: monthlyAmount, line_order: 1 },
          ]);
          await supabase.from("depreciation_entries").insert({
            asset_id: a.id,
            period_month: period,
            amount: monthlyAmount,
            journal_entry_id: entry.id,
          });
          created++;
        }
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        monthsPosted++;
      }
    }
    return { created };
  });
