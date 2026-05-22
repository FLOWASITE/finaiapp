import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyHmacSignature } from "@/lib/crypto.server";

const TxnSchema = z.object({
  external_ref: z.string().min(1).max(120),
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  description: z.string().max(2000).optional().nullable(),
  counterparty: z.string().max(300).optional().nullable(),
  running_balance: z.number().optional().nullable(),
});

const BodySchema = z.object({
  bank_account_id: z.string().uuid(),
  balance: z.number().optional().nullable(),
  transactions: z.array(TxnSchema).max(500),
  sync_log_id: z.string().uuid().optional().nullable(),
});

export const Route = createFileRoute("/api/public/mbbank/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.MBBANK_WORKER_SECRET;
        if (!secret) return new Response("worker not configured", { status: 500 });
        const raw = await request.text();
        const sig = verifyHmacSignature(raw, request.headers.get("x-mb-signature"), secret);
        if (!sig.ok) return new Response(sig.reason, { status: 401 });

        let payload: z.infer<typeof BodySchema>;
        try {
          payload = BodySchema.parse(JSON.parse(raw));
        } catch (e: any) {
          return new Response(`invalid body: ${e?.message || e}`, { status: 400 });
        }

        // Lookup account
        const { data: acc, error: accErr } = await supabaseAdmin
          .from("bank_accounts")
          .select("id, tenant_id, user_id")
          .eq("id", payload.bank_account_id)
          .maybeSingle();
        if (accErr || !acc) return new Response("account not found", { status: 404 });

        // Upsert transactions (skip duplicates via UNIQUE INDEX)
        let inserted = 0;
        if (payload.transactions.length > 0) {
          const rows = payload.transactions.map((t) => ({
            tenant_id: acc.tenant_id,
            user_id: acc.user_id,
            bank_account_id: acc.id,
            txn_date: t.txn_date,
            amount: t.amount,
            description: t.description ?? null,
            counterparty: t.counterparty ?? null,
            running_balance: t.running_balance ?? null,
            external_ref: t.external_ref,
            status: "unmatched",
          }));
          const { data, error } = await supabaseAdmin
            .from("bank_transactions")
            .upsert(rows, { onConflict: "bank_account_id,external_ref", ignoreDuplicates: true })
            .select("id");
          if (error) return new Response(`ingest error: ${error.message}`, { status: 500 });
          inserted = data?.length ?? 0;
        }

        // Update account snapshot
        const now = new Date().toISOString();
        const accUpdate = {
          last_synced_at: now,
          last_sync_status: "ok",
          last_sync_error: null,
          ...(typeof payload.balance === "number"
            ? { current_balance: payload.balance, balance_synced_at: now }
            : {}),
        };
        await supabaseAdmin.from("bank_accounts").update(accUpdate as any).eq("id", acc.id);

        // Finalize sync log
        if (payload.sync_log_id) {
          await supabaseAdmin
            .from("bank_sync_logs")
            .update({
              finished_at: new Date().toISOString(),
              status: "ok",
              txn_fetched: payload.transactions.length,
              txn_new: inserted,
            })
            .eq("id", payload.sync_log_id);
        } else {
          await supabaseAdmin.from("bank_sync_logs").insert({
            tenant_id: acc.tenant_id,
            bank_account_id: acc.id,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            status: "ok",
            txn_fetched: payload.transactions.length,
            txn_new: inserted,
          });
        }

        return Response.json({ ok: true, inserted, fetched: payload.transactions.length });
      },
    },
  },
});
