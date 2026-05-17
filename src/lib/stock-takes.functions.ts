import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listStockTakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("stock_takes")
      .select("*")
      .order("take_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data;
  });

export const getStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: take }, { data: lines }] = await Promise.all([
      supabase.from("stock_takes").select("*").eq("id", data.id).maybeSingle(),
      supabase
        .from("stock_take_lines")
        .select("*, products(code, name, unit)")
        .eq("stock_take_id", data.id)
        .order("id"),
    ]);
    if (!take) throw new Error("Không tìm thấy phiếu kiểm kê");
    return { take, lines: lines ?? [] };
  });

export const createStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { take_date: string; warehouse?: string; notes?: string; product_ids?: string[] }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenant_id = profile?.active_tenant_id ?? null;

    // generate code KK-YYYYMM-XXX
    const ym = data.take_date.slice(0, 7).replace("-", "");
    const { count } = await supabase
      .from("stock_takes")
      .select("id", { count: "exact", head: true })
      .gte("take_date", `${data.take_date.slice(0, 7)}-01`);
    const code = `KK-${ym}-${String((count ?? 0) + 1).padStart(3, "0")}`;

    const { data: take, error } = await supabase
      .from("stock_takes")
      .insert({
        user_id: userId,
        tenant_id,
        code,
        take_date: data.take_date,
        warehouse: data.warehouse ?? null,
        notes: data.notes ?? null,
        status: "draft",
      })
      .select("id")
      .single();
    if (error || !take) throw new Error(error?.message || "Không tạo phiếu");

    // seed lines with all active products (or selected)
    let prodQ = supabase
      .from("products")
      .select("id, on_hand, unit_cost")
      .eq("is_active", true);
    if (data.product_ids?.length) prodQ = prodQ.in("id", data.product_ids);
    const { data: products = [] } = await prodQ;

    if ((products ?? []).length) {
      await supabase.from("stock_take_lines").insert(
        (products ?? []).map((p: any) => ({
          stock_take_id: take.id,
          product_id: p.id,
          system_qty: Number(p.on_hand),
          counted_qty: Number(p.on_hand),
          diff_qty: 0,
          unit_cost: Number(p.unit_cost),
          diff_value: 0,
        })),
      );
    }
    return { id: take.id, code };
  });

const UpdateLinesSchema = z.object({
  stock_take_id: z.string().uuid(),
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      counted_qty: z.number().min(0),
      note: z.string().max(255).optional().nullable(),
    }),
  ),
});

export const updateStockTakeLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateLinesSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("stock_take_lines")
      .select("id, system_qty, unit_cost")
      .eq("stock_take_id", data.stock_take_id);
    const byId = new Map((existing ?? []).map((l: any) => [l.id, l]));

    for (const line of data.lines) {
      const orig: any = byId.get(line.id);
      if (!orig) continue;
      const diff = line.counted_qty - Number(orig.system_qty);
      await supabase
        .from("stock_take_lines")
        .update({
          counted_qty: line.counted_qty,
          diff_qty: diff,
          diff_value: diff * Number(orig.unit_cost),
          note: line.note ?? null,
        })
        .eq("id", line.id);
    }
    return { ok: true };
  });

export const postStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: take } = await supabase
      .from("stock_takes")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!take) throw new Error("Không tìm thấy phiếu");
    if (take.status !== "draft") throw new Error("Phiếu đã được xử lý");

    const { data: lines = [] } = await supabase
      .from("stock_take_lines")
      .select("*, products(stock_account, cogs_account)")
      .eq("stock_take_id", data.id);

    const withDiff = (lines ?? []).filter((l: any) => Math.abs(Number(l.diff_qty)) > 0.0001);

    // Build journal lines:
    //   Diff > 0 (thừa): Nợ 156 / Có 711
    //   Diff < 0 (thiếu): Nợ 632 / Có 156
    let stockDebit = 0; // 156 debit (surplus)
    let stockCredit = 0; // 156 credit (shortage)
    let revenue711 = 0;
    let expense632 = 0;

    for (const l of withDiff) {
      const v = Math.abs(Number(l.diff_value));
      if (Number(l.diff_qty) > 0) {
        stockDebit += v;
        revenue711 += v;
      } else {
        stockCredit += v;
        expense632 += v;
      }
    }

    let journal_entry_id: string | null = null;
    if (withDiff.length) {
      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: take.tenant_id,
          entry_date: take.take_date,
          description: `Kiểm kê kho ${take.code}`,
        })
        .select("id")
        .single();
      if (!entry) throw new Error("Không tạo bút toán");
      journal_entry_id = entry.id;
      const jl: any[] = [];
      let order = 0;
      if (stockDebit > 0) jl.push({ entry_id: entry.id, account_code: "156", debit: stockDebit, credit: 0, line_order: order++ });
      if (revenue711 > 0) jl.push({ entry_id: entry.id, account_code: "711", debit: 0, credit: revenue711, line_order: order++ });
      if (expense632 > 0) jl.push({ entry_id: entry.id, account_code: "632", debit: expense632, credit: 0, line_order: order++ });
      if (stockCredit > 0) jl.push({ entry_id: entry.id, account_code: "156", debit: 0, credit: stockCredit, line_order: order++ });
      await supabase.from("journal_lines").insert(jl);
    }

    // Update product on_hand + stock_movements
    for (const l of withDiff) {
      const diff = Number(l.diff_qty);
      await supabase.from("stock_movements").insert({
        user_id: userId,
        tenant_id: take.tenant_id,
        product_id: l.product_id,
        movement_type: diff > 0 ? "in" : "out",
        qty: Math.abs(diff),
        unit_cost: Number(l.unit_cost),
        movement_date: take.take_date,
        ref_type: "stock_take",
        ref_id: take.id,
        note: `Kiểm kê ${take.code}`,
      });
      // set new on_hand = counted_qty
      await supabase.from("products").update({ on_hand: Number(l.counted_qty) }).eq("id", l.product_id);
    }

    await supabase
      .from("stock_takes")
      .update({
        status: "posted",
        journal_entry_id,
        posted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", take.id);

    return { ok: true, journal_entry_id };
  });

export const voidStockTake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: take } = await supabase.from("stock_takes").select("*").eq("id", data.id).single();
    if (!take) throw new Error("Không tìm thấy");
    if (take.status === "void") return { ok: true };
    await supabase
      .from("stock_takes")
      .update({ status: "void", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });
