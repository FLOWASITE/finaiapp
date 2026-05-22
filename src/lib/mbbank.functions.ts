import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptAesGcm, signHmac } from "@/lib/crypto.server";

export const setMbCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_account_id: string; username: string; password: string; corporate_id?: string | null }) =>
    z.object({
      bank_account_id: z.string().uuid(),
      username: z.string().min(1).max(100),
      password: z.string().min(1).max(200),
      corporate_id: z.string().trim().min(1).max(50).regex(/^[A-Za-z0-9._-]+$/).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: acc, error: e1 } = await supabase
      .from("bank_accounts").select("id").eq("id", data.bank_account_id).maybeSingle();
    if (e1 || !acc) throw new Error("Không tìm thấy tài khoản");
    const { cipher, iv } = encryptAesGcm(data.password);
    const patch: Record<string, unknown> = {
      mb_username: data.username,
      mb_password_enc: cipher,
      mb_password_iv: iv,
    };
    if (data.corporate_id !== undefined) {
      patch.mb_corporate_id = data.corporate_id ? data.corporate_id.trim() : null;
    }
    const { error } = await supabase
      .from("bank_accounts")
      .update(patch as any)
      .eq("id", data.bank_account_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleMbSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_account_id: string; enabled: boolean }) =>
    z.object({ bank_account_id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_accounts")
      .update({ sync_enabled: data.enabled } as any)
      .eq("id", data.bank_account_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectMb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_account_id: string }) =>
    z.object({ bank_account_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_accounts")
      .update({
        mb_username: null,
        mb_password_enc: null,
        mb_password_iv: null,
        mb_corporate_id: null,
        sync_enabled: false,
      } as any)
      .eq("id", data.bank_account_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerMbSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_account_id: string }) =>
    z.object({ bank_account_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const url = process.env.MBBANK_WORKER_URL;
    const secret = process.env.MBBANK_WORKER_SECRET;
    if (!url || !secret) {
      throw new Error("Worker MB Bank chưa được cấu hình. Vui lòng triển khai Worker (xem external/mbbank-worker/README.md) và thêm secret MBBANK_WORKER_URL + MBBANK_WORKER_SECRET.");
    }
    const body = JSON.stringify({ bank_account_id: data.bank_account_id });
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/sync-now`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-mb-signature": signHmac(body, secret) },
        body,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Worker trả về ${res.status}: ${text || res.statusText}`);
      }
      return { ok: true };
    } catch (e: any) {
      if (e?.message?.startsWith("Worker trả về")) throw e;
      if (e?.name === "TimeoutError" || e?.name === "AbortError") {
        throw new Error(`Worker MB Bank không phản hồi sau 15s (${url}). Kiểm tra worker còn chạy và domain HTTPS hợp lệ.`);
      }
      throw new Error(`Không kết nối được Worker MB Bank (${url}). Kiểm tra URL hoặc Worker đang chạy. Chi tiết: ${e?.message || e}`);
    }
  });

export const getMbSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { bank_account_id: string }) =>
    z.object({ bank_account_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: acc } = await context.supabase
      .from("bank_accounts")
      .select("sync_enabled, last_synced_at, last_sync_status, last_sync_error, current_balance, balance_synced_at, mb_username, mb_corporate_id")
      .eq("id", data.bank_account_id).maybeSingle();
    const { data: logs } = await context.supabase
      .from("bank_sync_logs")
      .select("started_at, finished_at, status, txn_fetched, txn_new, error_text")
      .eq("bank_account_id", data.bank_account_id)
      .order("started_at", { ascending: false })
      .limit(5);
    return { account: acc, logs: logs ?? [] };
  });

export const listUnmatchedBankTxns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bank_transactions")
      .select("id, txn_date, amount, description, counterparty, status, match_confidence, bank_account_id")
      .in("status", ["unmatched", "suggested"])
      .order("txn_date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { transactions: data ?? [] };
  });

export const manualMatchBankTxn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { txn_id: string; entry_id: string; entry_type: "receipt" | "payment" }) =>
    z.object({
      txn_id: z.string().uuid(),
      entry_id: z.string().uuid(),
      entry_type: z.enum(["receipt", "payment"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bank_transactions")
      .update({
        matched_entry_id: data.entry_id,
        status: "matched",
        match_confidence: 1,
        match_reason: `manual:${data.entry_type}`,
      } as any)
      .eq("id", data.txn_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
