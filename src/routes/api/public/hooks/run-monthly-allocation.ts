/**
 * Cron hook: chạy phân bổ chi phí 242 (CCDC, trả trước) cho TẤT CẢ tenant đang hoạt động.
 * Lịch chạy: ngày 1 hàng tháng lúc 02:00 — xử lý tháng vừa kết thúc.
 *
 * Auth: dùng apikey (anon/publishable) trong header. Path /api/public/* được bypass auth
 * trên published site, nhưng route handler vẫn check apikey để chặn caller lạ.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/run-monthly-allocation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Tham số: nếu body có { upToMonth: 'YYYY-MM' } thì dùng; nếu không dùng tháng vừa kết thúc.
        let upToMonth: string;
        try {
          const body = (await request.json()) as { upToMonth?: string };
          if (body?.upToMonth && /^\d{4}-\d{2}$/.test(body.upToMonth)) {
            upToMonth = body.upToMonth;
          } else {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - 1);
            upToMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          }
        } catch {
          const d = new Date();
          d.setDate(1);
          d.setMonth(d.getMonth() - 1);
          upToMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }

        const [yS, mS] = upToMonth.split("-");
        const target = { y: Number(yS), m: Number(mS) };

        // Lấy danh sách tenant có asset đang active
        const { data: tenants, error: tErr } = await supabaseAdmin
          .from("allocated_assets")
          .select("tenant_id")
          .eq("status", "active");
        if (tErr) {
          console.error("[run-monthly-allocation] tenant fetch", tErr);
          return Response.json({ error: tErr.message }, { status: 500 });
        }
        const uniqueTenants = Array.from(
          new Set((tenants ?? []).map((r) => r.tenant_id).filter(Boolean) as string[]),
        );

        let createdEntries = 0;
        let touchedAssets = 0;
        let postedAmount = 0;
        const errors: Array<{ tenant_id: string; error: string }> = [];

        for (const tenantId of uniqueTenants) {
          try {
            const res = await runForTenant(tenantId, target, upToMonth);
            createdEntries += res.created;
            touchedAssets += res.touched;
            postedAmount += res.amount;
          } catch (e: any) {
            errors.push({ tenant_id: tenantId, error: e?.message ?? String(e) });
          }
        }

        return Response.json({
          ok: true,
          up_to_month: upToMonth,
          tenants: uniqueTenants.length,
          created_entries: createdEntries,
          assets_touched: touchedAssets,
          total_amount: postedAmount,
          errors,
        });
      },
    },
  },
});

// ----- helpers (sao chép tối thiểu từ allocated-assets.functions.ts) -----

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastDayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return ymd(x);
}

function pendingPeriods(
  asset: { start_date: string; periods_total: number; period_unit: string },
  done: Set<string>,
  target: { y: number; m: number },
): Date[] {
  const start = new Date(asset.start_date);
  const step = asset.period_unit === "year" ? 12 : 1;
  const out: Date[] = [];
  const cursor = new Date(start);
  cursor.setDate(1);
  const targetDate = new Date(target.y, target.m - 1, 1);
  let idx = 0;
  while (idx < asset.periods_total) {
    if (cursor > targetDate) break;
    const key = ymd(cursor);
    if (!done.has(key)) out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + step);
    idx++;
  }
  return out;
}

async function runForTenant(
  tenantId: string,
  target: { y: number; m: number },
  _upToMonth: string,
): Promise<{ created: number; touched: number; amount: number }> {
  const { data: assets, error } = await supabaseAdmin
    .from("allocated_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  if (error) throw new Error(error.message);

  let created = 0;
  let touched = 0;
  let amount = 0;

  // System user_id cho audit — fallback owner đầu tiên của tenant.
  const { data: owner } = await supabaseAdmin
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  const systemUserId = owner?.user_id;
  if (!systemUserId) return { created: 0, touched: 0, amount: 0 };

  for (const a of assets ?? []) {
    const { data: existing } = await supabaseAdmin
      .from("allocation_entries")
      .select("period_month")
      .eq("asset_id", a.id);
    const done = new Set((existing ?? []).map((e) => e.period_month as string));
    const pending = pendingPeriods(a as any, done, target);
    if (pending.length === 0) continue;

    let assetAllocated = Number(a.allocated);
    let assetPeriodsDone = Number(a.periods_done);
    const periodsTotal = Number(a.periods_total);
    const cost = Number(a.cost);
    const perPeriod = Math.round((cost / periodsTotal) * 100) / 100;

    for (const periodStart of pending) {
      assetPeriodsDone += 1;
      const isLast = assetPeriodsDone >= periodsTotal;
      const amt = isLast
        ? Math.round((cost - assetAllocated) * 100) / 100
        : perPeriod;
      if (amt <= 0) continue;

      const periodMonthStr = ymd(periodStart);
      const entryDate = lastDayOf(periodStart);
      const desc = `Phân bổ ${a.name} (${a.code}) kỳ ${String(
        periodStart.getMonth() + 1,
      ).padStart(2, "0")}/${periodStart.getFullYear()} (cron)`;

      const { data: je, error: jErr } = await supabaseAdmin
        .from("journal_entries")
        .insert({
          user_id: systemUserId,
          tenant_id: tenantId,
          entry_date: entryDate,
          description: desc,
        })
        .select("id")
        .single();
      if (jErr || !je) continue;

      const { error: lErr } = await supabaseAdmin.from("journal_lines").insert([
        {
          entry_id: je.id,
          account_code: a.expense_account,
          debit: amt,
          credit: 0,
          line_order: 0,
          branch_id: a.branch_id,
          department_id: a.department_id,
          project_id: a.project_id,
          cost_center_id: a.cost_center_id,
        },
        {
          entry_id: je.id,
          account_code: a.prepaid_account,
          debit: 0,
          credit: amt,
          line_order: 1,
        },
      ]);
      if (lErr) continue;

      await supabaseAdmin.from("allocation_entries").insert({
        asset_id: a.id,
        period_month: periodMonthStr,
        amount: amt,
        journal_entry_id: je.id,
      });

      assetAllocated = Math.round((assetAllocated + amt) * 100) / 100;
      created += 1;
      amount += amt;
    }

    const newStatus = assetPeriodsDone >= periodsTotal ? "finished" : a.status;
    await supabaseAdmin
      .from("allocated_assets")
      .update({
        allocated: assetAllocated,
        periods_done: assetPeriodsDone,
        status: newStatus,
      })
      .eq("id", a.id);
    touched += 1;
  }

  return { created, touched, amount };
}
