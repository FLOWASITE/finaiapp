import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getTenant(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("active_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.active_tenant_id ?? null;
}

// ============ LIST ============
export const listReconcileTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        bankAccountId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        status: z.enum(["all", "unmatched", "matched"]).default("all"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("bank_transactions")
      .select("*")
      .eq("bank_account_id", data.bankAccountId)
      .gte("txn_date", data.from)
      .lte("txn_date", data.to)
      .order("txn_date", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // attach linked voucher info if any
    const txnIds = (rows ?? []).map((r: any) => r.id);
    let voucherMap = new Map<string, any>();
    if (txnIds.length) {
      const { data: vs } = await supabase
        .from("bank_vouchers")
        .select("id, voucher_no, voucher_type, counter_account, bank_transaction_id")
        .in("bank_transaction_id", txnIds);
      voucherMap = new Map((vs ?? []).map((v: any) => [v.bank_transaction_id, v]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, voucher: voucherMap.get(r.id) ?? null }));
  });

// ============ IMPORT STATEMENT ============
const ImportRowSchema = z.object({
  txn_date: z.string(),
  description: z.string().max(500).optional().nullable(),
  amount: z.number(),
  counterparty: z.string().max(200).optional().nullable(),
});
export const importStatementTxns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        bankAccountId: z.string().uuid(),
        rows: z.array(ImportRowSchema).min(1).max(2000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);

    // dedupe: skip rows with same (date, amount, description) already present
    const existingKey = new Set<string>();
    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("txn_date, amount, description")
      .eq("bank_account_id", data.bankAccountId);
    for (const e of (existing ?? []) as any[]) {
      existingKey.add(`${e.txn_date}|${Number(e.amount)}|${(e.description ?? "").trim()}`);
    }

    const toInsert = data.rows
      .filter((r) => !existingKey.has(`${r.txn_date}|${r.amount}|${(r.description ?? "").trim()}`))
      .map((r) => ({
        user_id: userId,
        tenant_id: tenantId,
        bank_account_id: data.bankAccountId,
        txn_date: r.txn_date,
        description: r.description ?? null,
        amount: r.amount,
        counterparty: r.counterparty ?? null,
        status: "unmatched",
      }));
    if (toInsert.length === 0) return { inserted: 0, skipped: data.rows.length };
    const { error } = await supabase.from("bank_transactions").insert(toInsert);
    if (error) throw new Error(error.message);
    return { inserted: toInsert.length, skipped: data.rows.length - toInsert.length };
  });

// ============ SUGGEST MATCHES ============
export const suggestMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ txnId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("id", data.txnId)
      .single();
    if (!txn) throw new Error("Không tìm thấy giao dịch");

    const amt = Math.abs(Number(txn.amount));
    const date = new Date(txn.txn_date);
    const from = new Date(date); from.setDate(from.getDate() - 5);
    const to = new Date(date); to.setDate(to.getDate() + 5);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    // candidates: bank_vouchers chưa gắn txn, cùng account, cùng amount, gần ngày
    const { data: vs } = await supabase
      .from("bank_vouchers")
      .select("id, voucher_no, voucher_type, voucher_date, amount, counter_account, party_name, reason, journal_entry_id")
      .eq("bank_account_id", txn.bank_account_id)
      .is("bank_transaction_id", null)
      .gte("voucher_date", fromStr)
      .lte("voucher_date", toStr)
      .eq("amount", amt);

    const sign = Number(txn.amount) >= 0 ? "in" : "out";
    const filtered = (vs ?? []).filter((v: any) => {
      if (sign === "in") return v.voucher_type === "receipt" || v.voucher_type === "transfer_in";
      return v.voucher_type === "payment" || v.voucher_type === "transfer_out";
    });
    return filtered.map((v: any) => ({
      ...v,
      score:
        (v.voucher_date === txn.txn_date ? 0.5 : 0.3) +
        (v.party_name && txn.counterparty &&
          v.party_name.toLowerCase().includes(String(txn.counterparty).toLowerCase().slice(0, 8))
            ? 0.5
            : 0),
    }));
  });

// ============ MATCH / UNMATCH ============
export const matchTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ txnId: z.string().uuid(), voucherId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("bank_vouchers")
      .select("id, journal_entry_id, voucher_no")
      .eq("id", data.voucherId)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");
    await supabase
      .from("bank_vouchers")
      .update({ bank_transaction_id: data.txnId })
      .eq("id", data.voucherId);
    await supabase
      .from("bank_transactions")
      .update({
        status: "matched",
        matched_entry_id: v.journal_entry_id,
        match_confidence: 1,
        match_reason: `Ghép thủ công với phiếu ${v.voucher_no}`,
      })
      .eq("id", data.txnId);
    try {
      const { tryLogAgentActivity } = await import("@/lib/ai-agents.server");
      await tryLogAgentActivity(supabase, userId, {
        agent_id: "reconcile",
        action: `Ghép giao dịch NH với phiếu ${v.voucher_no}`,
        result: "success",
        metadata: { txn_id: data.txnId, voucher_id: data.voucherId },
      });
    } catch {}
    return { ok: true };
  });

export const unmatchTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ txnId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("bank_vouchers")
      .update({ bank_transaction_id: null })
      .eq("bank_transaction_id", data.txnId);
    await supabase
      .from("bank_transactions")
      .update({
        status: "unmatched",
        matched_entry_id: null,
        match_confidence: null,
        match_reason: null,
      })
      .eq("id", data.txnId);
    return { ok: true };
  });

// ============ AUTO-POST: tạo voucher + JE từ txn ============
export const autoPostTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        txnId: z.string().uuid(),
        counterAccount: z.string().min(3).max(20),
        partyName: z.string().max(200).optional().nullable(),
        reason: z.string().max(500).optional().nullable(),
        voucherNo: z.string().max(50).optional().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    const { data: txn } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("id", data.txnId)
      .single();
    if (!txn) throw new Error("Không tìm thấy giao dịch");
    if (txn.status === "matched") throw new Error("Giao dịch đã được ghép");

    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("gl_account_code, name")
      .eq("id", txn.bank_account_id)
      .single();
    const bankGl = acc?.gl_account_code || "1121";
    const amt = Math.abs(Number(txn.amount));
    const isReceipt = Number(txn.amount) >= 0;
    const voucherType = isReceipt ? "receipt" : "payment";
    const debit = isReceipt ? bankGl : data.counterAccount;
    const credit = isReceipt ? data.counterAccount : bankGl;

    const vNo =
      data.voucherNo?.trim() ||
      `${isReceipt ? "BC" : "BN"}-${txn.txn_date.replace(/-/g, "")}-${txn.id.slice(0, 4)}`;
    const desc = `${isReceipt ? "Báo có" : "Báo nợ"} ${vNo}${data.reason ? ` — ${data.reason}` : txn.description ? ` — ${txn.description}` : ""}`;

    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({ user_id: userId, tenant_id: tenantId, entry_date: txn.txn_date, description: desc })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: debit, debit: amt, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: credit, debit: 0, credit: amt, line_order: 1 },
    ]);

    const { data: voucher, error: vErr } = await supabase
      .from("bank_vouchers")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        bank_account_id: txn.bank_account_id,
        voucher_type: voucherType,
        voucher_no: vNo,
        voucher_date: txn.txn_date,
        amount: amt,
        counter_account: data.counterAccount,
        party_name: data.partyName || txn.counterparty || null,
        reason: data.reason || txn.description || null,
        journal_entry_id: entry.id,
        bank_transaction_id: txn.id,
      })
      .select("id")
      .single();
    if (vErr) throw new Error(vErr.message);

    await supabase
      .from("bank_transactions")
      .update({
        status: "matched",
        matched_entry_id: entry.id,
        match_confidence: 1,
        match_reason: `Tự sinh phiếu ${vNo}`,
      })
      .eq("id", txn.id);

    return { ok: true, voucher_id: voucher!.id, entry_id: entry.id };
  });

// ============ DETECT INTERNAL TRANSFERS ============
export const detectInternalTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp");

    // Lấy tất cả unmatched txns trong kỳ
    const { data: txns } = await supabase
      .from("bank_transactions")
      .select("id, bank_account_id, txn_date, amount, description, counterparty")
      .eq("tenant_id", tenantId)
      .eq("status", "unmatched")
      .gte("txn_date", data.from)
      .lte("txn_date", data.to);

    const { data: accs } = await supabase
      .from("bank_accounts")
      .select("id, name, gl_account_code")
      .eq("tenant_id", tenantId);
    const accMap = new Map((accs ?? []).map((a: any) => [a.id, a]));

    const pairs: Array<{ outTxn: any; inTxn: any }> = [];
    const used = new Set<string>();
    const list = (txns ?? []) as any[];
    for (const a of list) {
      if (used.has(a.id)) continue;
      if (Number(a.amount) >= 0) continue;
      for (const b of list) {
        if (used.has(b.id) || a.id === b.id) continue;
        if (b.bank_account_id === a.bank_account_id) continue;
        if (Number(b.amount) !== -Number(a.amount)) continue;
        const da = new Date(a.txn_date).getTime();
        const db = new Date(b.txn_date).getTime();
        if (Math.abs(da - db) > 2 * 86400000) continue;
        pairs.push({ outTxn: a, inTxn: b });
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }

    // Build vouchers + JE for each pair
    let created = 0;
    for (const { outTxn, inTxn } of pairs) {
      const fromAcc = accMap.get(outTxn.bank_account_id) as any;
      const toAcc = accMap.get(inTxn.bank_account_id) as any;
      if (!fromAcc || !toAcc) continue;
      const amt = Math.abs(Number(outTxn.amount));
      const vNo = `CKNB-${outTxn.txn_date.replace(/-/g, "")}-${outTxn.id.slice(0, 4)}`;
      const desc = `Chuyển khoản nội bộ ${vNo}: ${fromAcc.name} → ${toAcc.name}`;

      const { data: entry } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          entry_date: outTxn.txn_date,
          description: desc,
        })
        .select("id")
        .single();
      if (!entry) continue;
      await supabase.from("journal_lines").insert([
        {
          entry_id: entry.id,
          account_code: toAcc.gl_account_code || "1121",
          debit: amt,
          credit: 0,
          line_order: 0,
        },
        {
          entry_id: entry.id,
          account_code: fromAcc.gl_account_code || "1121",
          debit: 0,
          credit: amt,
          line_order: 1,
        },
      ]);
      const { data: vOut } = await supabase
        .from("bank_vouchers")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          bank_account_id: outTxn.bank_account_id,
          voucher_type: "transfer_out",
          voucher_no: vNo,
          voucher_date: outTxn.txn_date,
          amount: amt,
          counter_account: toAcc.gl_account_code || "1121",
          party_name: toAcc.name,
          journal_entry_id: entry.id,
          bank_transaction_id: outTxn.id,
        })
        .select("id")
        .single();
      const { data: vIn } = await supabase
        .from("bank_vouchers")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          bank_account_id: inTxn.bank_account_id,
          voucher_type: "transfer_in",
          voucher_no: vNo,
          voucher_date: inTxn.txn_date,
          amount: amt,
          counter_account: fromAcc.gl_account_code || "1121",
          party_name: fromAcc.name,
          journal_entry_id: entry.id,
          bank_transaction_id: inTxn.id,
          transfer_pair_id: vOut?.id ?? null,
        })
        .select("id")
        .single();
      if (vOut && vIn) {
        await supabase.from("bank_vouchers").update({ transfer_pair_id: vIn.id }).eq("id", vOut.id);
      }
      await supabase
        .from("bank_transactions")
        .update({
          status: "matched",
          matched_entry_id: entry.id,
          match_confidence: 0.95,
          match_reason: "Tự phát hiện chuyển khoản nội bộ",
        })
        .in("id", [outTxn.id, inTxn.id]);
      created++;
    }
    return { pairsFound: pairs.length, created };
  });

// ============ IMPORT + AUTO-POST FROM PARSED STATEMENT ============
const PostingRowSchema = z.object({
  txn_date: z.string(),
  description: z.string().max(500).optional().nullable(),
  amount: z.number(),
  counterparty: z.string().max(200).optional().nullable(),
  counter_account: z.string().min(2).max(20),
  party_name: z.string().max(200).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
  skip: z.boolean().optional().default(false),
});

export const importAndPostStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        bankAccountId: z.string().uuid(),
        period: z
          .object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) })
          .optional(),
        rows: z.array(PostingRowSchema).min(1).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getTenant(supabase, userId);
    const { data: acc } = await supabase
      .from("bank_accounts")
      .select("gl_account_code, name")
      .eq("id", data.bankAccountId)
      .single();
    const bankGl = acc?.gl_account_code || "1121";

    // dedupe vs existing txns
    const { data: existing } = await supabase
      .from("bank_transactions")
      .select("txn_date, amount, description")
      .eq("bank_account_id", data.bankAccountId);
    const existKey = new Set<string>(
      (existing ?? []).map((e: any) => `${e.txn_date}|${Number(e.amount)}|${(e.description ?? "").trim()}`),
    );

    let posted = 0;
    let skipped = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      if (r.skip) {
        skipped++;
        continue;
      }
      // period filter
      if (data.period) {
        const d = new Date(r.txn_date);
        if (d.getUTCFullYear() !== data.period.year || d.getUTCMonth() + 1 !== data.period.month) {
          skipped++;
          continue;
        }
      }
      const key = `${r.txn_date}|${Number(r.amount)}|${(r.description ?? "").trim()}`;
      if (existKey.has(key)) {
        skipped++;
        continue;
      }
      try {
        // 1) insert bank_transaction
        const { data: txn, error: tErr } = await supabase
          .from("bank_transactions")
          .insert({
            user_id: userId,
            tenant_id: tenantId,
            bank_account_id: data.bankAccountId,
            txn_date: r.txn_date,
            description: r.description ?? null,
            amount: r.amount,
            counterparty: r.counterparty ?? null,
            status: "unmatched",
          })
          .select("id")
          .single();
        if (tErr || !txn) throw new Error(tErr?.message || "insert txn failed");

        // 2) create journal entry + lines
        const amt = Math.abs(Number(r.amount));
        const isReceipt = Number(r.amount) >= 0;
        const voucherType = isReceipt ? "receipt" : "payment";
        const debit = isReceipt ? bankGl : r.counter_account;
        const credit = isReceipt ? r.counter_account : bankGl;
        const vNo = `${isReceipt ? "BC" : "BN"}-${r.txn_date.replace(/-/g, "")}-${txn.id.slice(0, 4)}`;
        const desc = `${isReceipt ? "Báo có" : "Báo nợ"} ${vNo}${r.reason ? ` — ${r.reason}` : r.description ? ` — ${r.description}` : ""}`;
        const { data: entry, error: eErr } = await supabase
          .from("journal_entries")
          .insert({ user_id: userId, tenant_id: tenantId, entry_date: r.txn_date, description: desc })
          .select("id")
          .single();
        if (eErr || !entry) throw new Error(eErr?.message || "create JE failed");
        await supabase.from("journal_lines").insert([
          { entry_id: entry.id, account_code: debit, debit: amt, credit: 0, line_order: 0 },
          { entry_id: entry.id, account_code: credit, debit: 0, credit: amt, line_order: 1 },
        ]);

        // 3) bank voucher + link
        await supabase.from("bank_vouchers").insert({
          user_id: userId,
          tenant_id: tenantId,
          bank_account_id: data.bankAccountId,
          voucher_type: voucherType,
          voucher_no: vNo,
          voucher_date: r.txn_date,
          amount: amt,
          counter_account: r.counter_account,
          party_name: r.party_name || r.counterparty || null,
          reason: r.reason || r.description || null,
          journal_entry_id: entry.id,
          bank_transaction_id: txn.id,
        });
        await supabase
          .from("bank_transactions")
          .update({
            status: "matched",
            matched_entry_id: entry.id,
            match_confidence: 1,
            match_reason: `Tự sinh phiếu ${vNo}`,
          })
          .eq("id", txn.id);
        posted++;
      } catch (err: any) {
        errors.push({ row: i + 1, error: err?.message || "unknown error" });
      }
    }

    return { posted, skipped, errors };
  });
