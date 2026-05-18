import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

// ===================== BANK ACCOUNTS =====================

const BankAccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  bank_name: z.string().max(120).optional().nullable(),
  account_no: z.string().max(40).optional().nullable(),
  currency: z.string().min(3).max(8).default("VND"),
  gl_account_code: z.string().min(3).max(20).default("1121"),
  opening_balance: z.number().default(0),
});

async function getTenant(supabase: any, userId: string) {
  const { data: p } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return p?.active_tenant_id ?? null;
}

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    let q = supabase.from("bank_accounts").select("*").order("created_at");
    if (tenantId) q = q.eq("tenant_id", tenantId);
    else q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // Compute current balance per account from journal_lines
    const accountIds = (data ?? []).map((a: any) => a.id);
    const accounts = data ?? [];
    if (accounts.length === 0) return [];

    // Get all bank_vouchers amounts per account
    const { data: vouchers } = await supabase
      .from("bank_vouchers")
      .select("bank_account_id, voucher_type, amount")
      .in("bank_account_id", accountIds);

    const balanceById = new Map<string, number>();
    const txnCountById = new Map<string, number>();
    for (const v of (vouchers ?? []) as any[]) {
      const cur = balanceById.get(v.bank_account_id) ?? 0;
      const sign = v.voucher_type === "receipt" || v.voucher_type === "transfer_in" ? 1 : -1;
      balanceById.set(v.bank_account_id, cur + sign * Number(v.amount));
      txnCountById.set(v.bank_account_id, (txnCountById.get(v.bank_account_id) ?? 0) + 1);
    }

    return accounts.map((a: any) => ({
      ...a,
      current_balance: Number(a.opening_balance ?? 0) + (balanceById.get(a.id) ?? 0),
      txn_count: txnCountById.get(a.id) ?? 0,
    }));
  });

export const upsertBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BankAccountSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (data.id) {
      const { error } = await supabase
        .from("bank_accounts")
        .update({
          name: data.name,
          bank_name: data.bank_name,
          account_no: data.account_no,
          currency: data.currency,
          gl_account_code: data.gl_account_code,
          opening_balance: data.opening_balance,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("bank_accounts")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        name: data.name,
        bank_name: data.bank_name,
        account_no: data.account_no,
        currency: data.currency,
        gl_account_code: data.gl_account_code,
        opening_balance: data.opening_balance,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count } = await supabase
      .from("bank_vouchers")
      .select("id", { count: "exact", head: true })
      .eq("bank_account_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Không thể xoá: TK này đã có phiếu thu/chi");
    const { error } = await supabase.from("bank_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===================== BANK VOUCHERS =====================

const BankVoucherSchema = z.object({
  voucher_no: z.string().min(1).max(50),
  voucher_type: z.enum(["receipt", "payment"]),
  voucher_date: z.string(),
  bank_account_id: z.string().uuid(),
  amount: z.number().positive(),
  counter_account: z.string().min(1).max(20),
  party_id: z.string().uuid().optional().nullable(),
  party_name: z.string().max(255).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  reference: z.string().max(100).optional().nullable(),
  branch_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
});

export const listBankVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bankAccountId?: string; from?: string; to?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    let q = supabase
      .from("bank_vouchers")
      .select("*")
      .order("voucher_date", { ascending: false })
      .limit(500);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    else q = q.eq("user_id", userId);
    if (data.bankAccountId) q = q.eq("bank_account_id", data.bankAccountId);
    if (data.from) q = q.gte("voucher_date", data.from);
    if (data.to) q = q.lte("voucher_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.bank_account_id).filter(Boolean)));
    let accMap = new Map<string, any>();
    if (ids.length) {
      const { data: accs } = await supabase
        .from("bank_accounts")
        .select("id, name, bank_name, account_no, gl_account_code")
        .in("id", ids);
      accMap = new Map((accs ?? []).map((a: any) => [a.id, a]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, bank_accounts: accMap.get(r.bank_account_id) ?? null }));
  });

export const createBankVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BankVoucherSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);

    const { data: acc, error: accErr } = await supabase
      .from("bank_accounts")
      .select("gl_account_code, name")
      .eq("id", data.bank_account_id)
      .single();
    if (accErr || !acc) throw new Error("Không tìm thấy tài khoản ngân hàng");
    const bankGl = acc.gl_account_code || "1121";

    // receipt (báo có): Nợ 112x / Có counter
    // payment (báo nợ): Nợ counter / Có 112x
    const debit = data.voucher_type === "receipt" ? bankGl : data.counter_account;
    const credit = data.voucher_type === "receipt" ? data.counter_account : bankGl;

    const prefix = data.voucher_type === "receipt" ? "Báo có" : "Báo nợ";
    const desc = `${prefix} ${data.voucher_no}${data.reason ? ` — ${data.reason}` : ""}`;

    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        entry_date: data.voucher_date,
        description: desc,
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: debit, debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: credit, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    // Also create a bank_transactions row so it appears in the bank book / reconciliation
    const signedAmount = data.voucher_type === "receipt" ? data.amount : -data.amount;
    const { data: txn } = await supabase
      .from("bank_transactions")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        bank_account_id: data.bank_account_id,
        txn_date: data.voucher_date,
        description: data.reason || desc,
        amount: signedAmount,
        counterparty: data.party_name,
        status: "matched",
        matched_entry_id: entry.id,
        match_confidence: 1,
        match_reason: "Tạo từ phiếu " + data.voucher_no,
      })
      .select("id")
      .single();

    const { data: voucher, error: vErr } = await supabase
      .from("bank_vouchers")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        bank_account_id: data.bank_account_id,
        voucher_type: data.voucher_type,
        voucher_no: data.voucher_no,
        voucher_date: data.voucher_date,
        amount: data.amount,
        counter_account: data.counter_account,
        party_id: data.party_id || null,
        party_name: data.party_name || null,
        reason: data.reason || null,
        reference: data.reference || null,
        branch_id: data.branch_id || null,
        project_id: data.project_id || null,
        cost_center_id: data.cost_center_id || null,
        journal_entry_id: entry.id,
        bank_transaction_id: txn?.id ?? null,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);

    return { ok: true, id: voucher!.id, entry_id: entry.id };
  });

export const deleteBankVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: v } = await supabase
      .from("bank_vouchers")
      .select("journal_entry_id, bank_transaction_id, transfer_pair_id")
      .eq("id", data.id)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");

    // delete linked journal entries (cascade lines via FK? no — manual)
    const entryIds = [v.journal_entry_id].filter(Boolean) as string[];
    if (v.transfer_pair_id) {
      const { data: pair } = await supabase
        .from("bank_vouchers")
        .select("journal_entry_id, bank_transaction_id")
        .eq("id", v.transfer_pair_id)
        .single();
      if (pair?.journal_entry_id) entryIds.push(pair.journal_entry_id);
      if (pair?.bank_transaction_id) {
        await supabase.from("bank_transactions").delete().eq("id", pair.bank_transaction_id);
      }
      await supabase.from("bank_vouchers").delete().eq("id", v.transfer_pair_id);
    }
    if (v.bank_transaction_id) {
      await supabase.from("bank_transactions").delete().eq("id", v.bank_transaction_id);
    }
    await supabase.from("bank_vouchers").delete().eq("id", data.id);
    for (const eid of entryIds) {
      await supabase.from("journal_lines").delete().eq("entry_id", eid);
      await supabase.from("journal_entries").delete().eq("id", eid);
    }
    return { ok: true };
  });

// ===================== INTERNAL TRANSFER =====================

const TransferSchema = z.object({
  voucher_no: z.string().min(1).max(50),
  voucher_date: z.string(),
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().max(500).optional().nullable(),
});

export const createBankTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TransferSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (data.from_account_id === data.to_account_id)
      throw new Error("Tài khoản nguồn và đích phải khác nhau");

    const { data: accs } = await supabase
      .from("bank_accounts")
      .select("id, gl_account_code, name")
      .in("id", [data.from_account_id, data.to_account_id]);
    const fromAcc = (accs ?? []).find((a: any) => a.id === data.from_account_id);
    const toAcc = (accs ?? []).find((a: any) => a.id === data.to_account_id);
    if (!fromAcc || !toAcc) throw new Error("Không tìm thấy tài khoản ngân hàng");

    const fromGl = fromAcc.gl_account_code || "1121";
    const toGl = toAcc.gl_account_code || "1121";

    const desc = `Chuyển khoản nội bộ ${data.voucher_no}: ${fromAcc.name} → ${toAcc.name}${data.reason ? ` — ${data.reason}` : ""}`;

    // Single journal entry: Nợ toGl / Có fromGl
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({ user_id: userId, tenant_id: tenantId, entry_date: data.voucher_date, description: desc })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: toGl, debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: fromGl, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    // Two bank_transactions (one negative for source, one positive for dest)
    const { data: txnOut } = await supabase
      .from("bank_transactions")
      .insert({
        user_id: userId, tenant_id: tenantId, bank_account_id: data.from_account_id,
        txn_date: data.voucher_date, description: desc, amount: -data.amount,
        counterparty: toAcc.name, status: "matched", matched_entry_id: entry.id,
        match_confidence: 1, match_reason: "Chuyển khoản nội bộ",
      }).select("id").single();
    const { data: txnIn } = await supabase
      .from("bank_transactions")
      .insert({
        user_id: userId, tenant_id: tenantId, bank_account_id: data.to_account_id,
        txn_date: data.voucher_date, description: desc, amount: data.amount,
        counterparty: fromAcc.name, status: "matched", matched_entry_id: entry.id,
        match_confidence: 1, match_reason: "Chuyển khoản nội bộ",
      }).select("id").single();

    // Two paired vouchers
    const { data: vOut, error: vErr } = await supabase
      .from("bank_vouchers")
      .insert({
        user_id: userId, tenant_id: tenantId, bank_account_id: data.from_account_id,
        voucher_type: "transfer_out", voucher_no: data.voucher_no, voucher_date: data.voucher_date,
        amount: data.amount, counter_account: toGl, party_name: toAcc.name,
        reason: data.reason, journal_entry_id: entry.id, bank_transaction_id: txnOut?.id ?? null,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);
    const { data: vIn, error: vErr2 } = await supabase
      .from("bank_vouchers")
      .insert({
        user_id: userId, tenant_id: tenantId, bank_account_id: data.to_account_id,
        voucher_type: "transfer_in", voucher_no: data.voucher_no, voucher_date: data.voucher_date,
        amount: data.amount, counter_account: fromGl, party_name: fromAcc.name,
        reason: data.reason, journal_entry_id: entry.id, bank_transaction_id: txnIn?.id ?? null,
        transfer_pair_id: vOut!.id,
      })
      .select("id")
      .single();
    if (vErr2) throw new Error(vErr2.message);
    await supabase.from("bank_vouchers").update({ transfer_pair_id: vIn!.id }).eq("id", vOut!.id);

    return { ok: true, entry_id: entry.id, voucher_out_id: vOut!.id, voucher_in_id: vIn!.id };
  });

// ===================== BANK BOOK / REPORTS =====================

export const getBankBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bankAccountId: string; from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("name, bank_name, account_no, currency, opening_balance, gl_account_code")
      .eq("id", data.bankAccountId)
      .single();
    if (!acc) throw new Error("Không tìm thấy TK");

    // Opening balance up to "from"
    const { data: priorVouchers } = await supabase
      .from("bank_vouchers")
      .select("voucher_type, amount")
      .eq("bank_account_id", data.bankAccountId)
      .lt("voucher_date", data.from);
    let opening = Number(acc.opening_balance ?? 0);
    for (const v of (priorVouchers ?? []) as any[]) {
      const sign = v.voucher_type === "receipt" || v.voucher_type === "transfer_in" ? 1 : -1;
      opening += sign * Number(v.amount);
    }

    const { data: rows } = await supabase
      .from("bank_vouchers")
      .select("id, voucher_date, voucher_no, voucher_type, amount, counter_account, party_name, reason, reference")
      .eq("bank_account_id", data.bankAccountId)
      .gte("voucher_date", data.from)
      .lte("voucher_date", data.to)
      .order("voucher_date")
      .order("created_at");

    let running = opening;
    const entries: any[] = [];
    let totalIn = 0;
    let totalOut = 0;
    for (const r of (rows ?? []) as any[]) {
      const isIn = r.voucher_type === "receipt" || r.voucher_type === "transfer_in";
      const inAmt = isIn ? Number(r.amount) : 0;
      const outAmt = !isIn ? Number(r.amount) : 0;
      running += inAmt - outAmt;
      totalIn += inAmt;
      totalOut += outAmt;
      entries.push({ ...r, debit: inAmt, credit: outAmt, balance: running });
    }
    return {
      account: acc,
      opening,
      closing: running,
      total_in: totalIn,
      total_out: totalOut,
      entries,
    };
  });

// ===================== CSV IMPORT (existing) =====================

const TxnSchema = z.object({
  txn_date: z.string(),
  description: z.string().optional().nullable(),
  amount: z.number(),
  running_balance: z.number().optional().nullable(),
  counterparty: z.string().optional().nullable(),
});

export const importBankCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bankAccountId: string; csv: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    const rows = data.csv.trim().split(/\r?\n/);
    if (rows.length < 2) throw new Error("CSV trống");
    const header = rows[0].toLowerCase().split(",").map(s => s.trim());
    const idx = {
      date: header.findIndex(h => h.includes("date") || h.includes("ngay") || h.includes("ngày")),
      desc: header.findIndex(h => h.includes("desc") || h.includes("dien giai") || h.includes("diễn giải") || h.includes("noi dung")),
      amount: header.findIndex(h => h.includes("amount") || h.includes("so tien") || h.includes("số tiền")),
      balance: header.findIndex(h => h.includes("balance") || h.includes("so du") || h.includes("số dư")),
      counter: header.findIndex(h => h.includes("counter") || h.includes("doi tac") || h.includes("đối tác")),
    };
    if (idx.date < 0 || idx.amount < 0) throw new Error("CSV cần có cột date và amount");

    const parsed = rows.slice(1).map(line => {
      const cols = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
      const dateRaw = cols[idx.date];
      const d = dateRaw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      const isoDate = d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : dateRaw;
      return {
        user_id: userId,
        tenant_id: tenantId,
        bank_account_id: data.bankAccountId,
        txn_date: isoDate,
        description: idx.desc >= 0 ? cols[idx.desc] : null,
        amount: Number(cols[idx.amount].replace(/[,\s]/g, "")),
        running_balance: idx.balance >= 0 ? Number(cols[idx.balance].replace(/[,\s]/g, "")) : null,
        counterparty: idx.counter >= 0 ? cols[idx.counter] : null,
      };
    }).filter(r => !isNaN(r.amount) && r.txn_date);

    const { error } = await supabase.from("bank_transactions").insert(parsed);
    if (error) throw error;
    return { imported: parsed.length };
  });

const MatchSchema = z.object({
  matches: z.array(z.object({
    transaction_id: z.string(),
    entry_id: z.string().nullable().describe("ID bút toán khớp, null nếu không tìm thấy"),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })),
});

export const aiMatchTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bankAccountId: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Thiếu LOVABLE_API_KEY");

    const { data: txns } = await supabase
      .from("bank_transactions")
      .select("id, txn_date, description, amount, counterparty")
      .eq("user_id", userId)
      .eq("bank_account_id", data.bankAccountId)
      .eq("status", "unmatched")
      .limit(50);
    if (!txns || txns.length === 0) return { matches: [] };

    const { data: entries } = await supabase
      .from("journal_entries")
      .select("id, entry_date, description, journal_lines(account_code, debit, credit)")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(200);

    const candidatesByTxn = txns.map((t: any) => {
      const cands = (entries ?? []).filter((e: any) => {
        const dayDiff = Math.abs((+new Date(e.entry_date) - +new Date(t.txn_date)) / 86400000);
        if (dayDiff > 7) return false;
        const cashLine = (e.journal_lines ?? []).find((l: any) =>
          l.account_code.startsWith("111") || l.account_code.startsWith("112"));
        if (!cashLine) return false;
        const delta = Number(cashLine.debit) - Number(cashLine.credit);
        return Math.abs(delta - t.amount) < 0.01;
      }).slice(0, 5);
      return { txn: t, candidates: cands };
    });

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");
    const { experimental_output } = await generateText({
      model,
      experimental_output: Output.object({ schema: MatchSchema }),
      messages: [
        { role: "system", content: "Bạn là kế toán đối soát ngân hàng. Với mỗi giao dịch, chọn entry_id khớp nhất từ candidates (nếu có), confidence 0-1, lý do ngắn gọn. Trả null nếu không có ứng viên phù hợp." },
        { role: "user", content: JSON.stringify(candidatesByTxn, null, 2) },
      ],
    });

    for (const m of experimental_output.matches) {
      if (m.entry_id && m.confidence >= 0.6) {
        await supabase.from("bank_transactions").update({
          status: "matched",
          matched_entry_id: m.entry_id,
          match_confidence: m.confidence,
          match_reason: m.reason,
        }).eq("id", m.transaction_id).eq("user_id", userId);
      }
    }

    return experimental_output;
  });
