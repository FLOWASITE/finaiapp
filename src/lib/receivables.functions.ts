import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withLatency } from "@/lib/with-latency";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export type DimFilter = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};

function bucket(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export const getReceivables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: "AR" | "AP"; dims?: DimFilter }) => i)
  .handler(withLatency("getReceivables", async ({ data, context }) => {
    const { supabase, userId } = context;
    const account = data.kind === "AR" ? "131" : "331";
    const d = data.dims;

    let q = supabase
      .from("journal_lines")
      .select("debit, credit, branch_id, department_id, project_id, cost_center_id, journal_entries!inner(user_id, entry_date, description, invoice_id)")
      .eq("account_code", account)
      .eq("journal_entries.user_id", userId);
    if (d?.branch_id) q = q.eq("branch_id", d.branch_id);
    if (d?.department_id) q = q.eq("department_id", d.department_id);
    if (d?.project_id) q = q.eq("project_id", d.project_id);
    if (d?.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const today = new Date();
    const byParty = new Map<
      string,
      { party: string; balance: number; aging: Record<AgingBucket, number>; lastDate: string }
    >();

    for (const r of rows ?? []) {
      const e: any = r.journal_entries;
      const party = (e.description ?? "Không rõ").split("—")[0].trim().slice(0, 80) || "Không rõ";
      const signed = data.kind === "AR"
        ? Number(r.debit) - Number(r.credit)
        : Number(r.credit) - Number(r.debit);
      const days = Math.max(0, Math.floor((today.getTime() - new Date(e.entry_date).getTime()) / 86400000));
      const b = bucket(days);
      const cur = byParty.get(party) ?? {
        party,
        balance: 0,
        aging: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        lastDate: e.entry_date,
      };
      cur.balance += signed;
      cur.aging[b] += signed;
      if (e.entry_date > cur.lastDate) cur.lastDate = e.entry_date;
      byParty.set(party, cur);
    }

    return Array.from(byParty.values())
      .filter((r) => Math.abs(r.balance) > 0.5)
      .sort((a, b) => b.balance - a.balance);
  }));

