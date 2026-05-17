import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const TxnSchema = z.object({
  txn_date: z.string(),
  description: z.string().optional().nullable(),
  amount: z.number(),
  running_balance: z.number().optional().nullable(),
  counterparty: z.string().optional().nullable(),
});

// Parse CSV (header: date,description,amount[,balance[,counterparty]])
export const importBankCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { bankAccountId: string; csv: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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

    // Pre-filter: candidate entries within ±7 days with matching cash leg
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

    // Apply matches
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
