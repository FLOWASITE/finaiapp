import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listPayables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name, invoice_no, issue_date, total, status")
      .order("issue_date", { ascending: false });
    const { data: payments } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount");

    const paidByInv = new Map<string, number>();
    (payments ?? []).forEach((p) => {
      if (!p.invoice_id) return;
      paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + Number(p.amount));
    });

    const today = new Date();
    const rows = (invoices ?? []).map((i) => {
      const paid = paidByInv.get(i.id) ?? 0;
      const remaining = Number(i.total ?? 0) - paid;
      const days = i.issue_date
        ? Math.floor((today.getTime() - new Date(i.issue_date).getTime()) / 86400000)
        : 0;
      let bucket: "0-30" | "31-60" | "61-90" | ">90" = "0-30";
      if (days > 90) bucket = ">90";
      else if (days > 60) bucket = "61-90";
      else if (days > 30) bucket = "31-60";
      return { ...i, paid, remaining, days, bucket };
    });
    return rows;
  });

const PaymentSchema = z.object({
  invoice_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  supplier_name: z.string().max(255).optional(),
  amount: z.number().positive(),
  pay_date: z.string(),
  method: z.enum(["cash", "bank"]).default("bank"),
  reference: z.string().max(255).optional(),
});

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PaymentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("supplier_payments").insert({
      user_id: userId,
      ...data,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
