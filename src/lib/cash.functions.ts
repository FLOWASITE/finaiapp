import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const VoucherSchema = z.object({
  voucher_no: z.string().min(1).max(50),
  voucher_type: z.enum(["receipt", "payment"]),
  voucher_date: z.string(),
  amount: z.number().positive(),
  cash_account: z.string().default("1111"),
  counter_account: z.string().min(1).max(20),
  party_name: z.string().max(255).optional(),
  reason: z.string().max(500).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
});

export const nextVoucherNo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { voucher_type: "receipt" | "payment"; year_month: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const prefix = data.voucher_type === "receipt" ? "PT" : "PC";
    const pattern = `${prefix}${data.year_month}/%`;
    const { data: rows, error } = await supabase
      .from("cash_vouchers")
      .select("voucher_no")
      .eq("user_id", userId)
      .like("voucher_no", pattern);
    if (error) throw new Error(error.message);
    let max = 0;
    for (const r of rows ?? []) {
      const m = /\/(\d+)$/.exec(r.voucher_no ?? "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const seq = String(max + 1).padStart(5, "0");
    return { voucher_no: `${prefix}${data.year_month}/${seq}` };
  });

export const listCashVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cash_vouchers")
      .select("*")
      .order("voucher_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = rows.map((r: any) => r.id);
    const attMap = new Map<string, any[]>();
    if (ids.length) {
      const { data: links } = await supabase
        .from("document_links")
        .select("entity_id, documents!inner(id, original_filename, storage_bucket, storage_path, mime_type)")
        .eq("entity_table", "cash_vouchers")
        .in("entity_id", ids);
      for (const l of (links ?? []) as any[]) {
        const arr = attMap.get(l.entity_id) ?? [];
        arr.push(l.documents);
        attMap.set(l.entity_id, arr);
      }
    }
    return rows.map((r: any) => ({ ...r, attachments: attMap.get(r.id) ?? [] }));
  });

export const deleteCashVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: v } = await supabase
      .from("cash_vouchers")
      .select("journal_entry_id")
      .eq("id", data.id)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");
    await supabase.from("cash_vouchers").delete().eq("id", data.id);
    if (v.journal_entry_id) {
      await supabase.from("journal_lines").delete().eq("entry_id", v.journal_entry_id);
      await supabase.from("journal_entries").delete().eq("id", v.journal_entry_id);
    }
    return { ok: true };
  });

export const createCashVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VoucherSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Auto-journal: receipt → Nợ cash / Có counter ; payment → Nợ counter / Có cash
    const debitAccount = data.voucher_type === "receipt" ? data.cash_account : data.counter_account;
    const creditAccount = data.voucher_type === "receipt" ? data.counter_account : data.cash_account;

    const desc =
      (data.voucher_type === "receipt" ? `Phiếu thu ${data.voucher_no}` : `Phiếu chi ${data.voucher_no}`) +
      (data.reason ? ` — ${data.reason}` : "");

    const { data: entry, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        entry_date: data.voucher_date,
        description: desc,
      })
      .select("id")
      .single();
    if (error || !entry) throw new Error(error?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: debitAccount, debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: creditAccount, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    const { data: voucher, error: vErr } = await supabase
      .from("cash_vouchers")
      .insert({ ...data, user_id: userId, journal_entry_id: entry.id })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);

    return { ok: true, id: voucher!.id, entry_id: entry.id };
  });

export const getCashBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string; account?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const account = data.account ?? "1111";
    const { data: rows, error } = await supabase
      .from("journal_lines")
      .select("debit, credit, entry_id, journal_entries!inner(user_id, entry_date, description)")
      .eq("account_code", account)
      .eq("journal_entries.user_id", userId)
      .gte("journal_entries.entry_date", data.from)
      .lte("journal_entries.entry_date", data.to)
      .order("entry_id");
    if (error) throw new Error(error.message);
    let balance = 0;
    return (rows ?? []).map((r) => {
      const e: any = r.journal_entries;
      balance += Number(r.debit) - Number(r.credit);
      return {
        date: e.entry_date,
        description: e.description,
        debit: Number(r.debit),
        credit: Number(r.credit),
        balance,
      };
    });
  });
