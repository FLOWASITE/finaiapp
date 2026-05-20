import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Helpers ----------

function normAcctNo(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function normText(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function txnHash(date: string, amount: number, description: string): string {
  return `${date}|${Math.round(amount)}|${normText(description).slice(0, 80)}`;
}

// ---------- Item types ----------

const ClassifyItemSchema = z.object({
  filename: z.string(),
  file_hash: z.string().nullable().optional(),
  kind: z.enum(["purchase_invoice", "bank_statement", "cash_voucher", "unknown"]),
  parsed: z.any(),
});

const ClassifyInputSchema = z.object({
  items: z.array(ClassifyItemSchema).min(1).max(20),
});

// ---------- classifyImports ----------

export const classifyImports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ClassifyInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Determine tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;

    // Preload bank accounts
    const { data: bankAccts } = await supabase
      .from("bank_accounts")
      .select("id, name, bank_name, account_no, currency");
    const accts = bankAccts ?? [];

    const results = [];

    for (const item of data.items) {
      const parsed = item.parsed ?? {};
      const out: any = {
        filename: item.filename,
        kind: item.kind,
        warnings: [] as Array<{
          type: string;
          severity: "info" | "warn" | "error";
          message: string;
          meta?: any;
        }>,
      };

      // ---- A. File hash dedupe ----
      if (item.file_hash) {
        const { data: prev } = await supabase
          .from("ai_uploads")
          .select("id, filename, created_at, kind")
          .eq("file_hash", item.file_hash)
          .order("created_at", { ascending: false })
          .limit(2);
        const olderUploads = (prev ?? []).filter((u) => u.filename !== item.filename || (prev ?? []).length > 1);
        if (olderUploads.length > 0) {
          const p = olderUploads[0];
          out.warnings.push({
            type: "file_duplicate",
            severity: "warn",
            message: `File này đã được upload ngày ${new Date(p.created_at).toLocaleDateString("vi-VN")} (${p.filename})`,
            meta: { previous: p },
          });
        }

        // Check if any doc table already has this file_hash → posted
        const tables = ["invoices", "bank_vouchers", "cash_vouchers"] as const;
        for (const t of tables) {
          const { data: existed } = await supabase
            .from(t)
            .select("id, status, created_at")
            .eq("file_hash", item.file_hash)
            .neq("status", "void")
            .limit(1);
          if (existed && existed.length > 0) {
            out.warnings.push({
              type: "file_already_posted",
              severity: "error",
              message: `File này đã tạo chứng từ trong ${t} (id ${existed[0].id.slice(0, 8)}…). Bỏ qua nếu không phải re-import.`,
              meta: { table: t, id: existed[0].id },
            });
            break;
          }
        }
      }

      // ---- B. Per-kind logic ----
      if (item.kind === "bank_statement") {
        // Bank account match
        const acctNo = normAcctNo(parsed.account_no);
        const bankName = normText(parsed.bank_name);
        let match: any = null;
        if (acctNo) {
          match = accts.find((a: any) => normAcctNo(a.account_no) === acctNo);
        }
        if (!match && acctNo) {
          const last4 = acctNo.slice(-4);
          const candidates = accts.filter(
            (a: any) =>
              normAcctNo(a.account_no).endsWith(last4) &&
              (!bankName || normText(a.bank_name).includes(bankName) || bankName.includes(normText(a.bank_name))),
          );
          if (candidates.length === 1) match = candidates[0];
          else if (candidates.length > 1) {
            out.bank_account_candidates = candidates.map((c: any) => ({
              id: c.id,
              name: c.name,
              account_no: c.account_no,
              bank_name: c.bank_name,
            }));
          }
        }
        out.bank_account_match = match
          ? { id: match.id, name: match.name, account_no: match.account_no, bank_name: match.bank_name }
          : null;
        if (!match) {
          out.warnings.push({
            type: "bank_account_unknown",
            severity: "warn",
            message: parsed.account_no
              ? `Chưa có TK ngân hàng "${parsed.account_no}" trong hệ thống. Cần chọn hoặc tạo mới.`
              : `Không trích xuất được số tài khoản từ sao kê. Chọn TK thủ công.`,
            meta: {
              account_no: parsed.account_no ?? null,
              bank_name: parsed.bank_name ?? null,
              account_holder: parsed.account_holder ?? null,
              currency: parsed.currency ?? null,
            },
          });
        }

        // Txn overlap (only when matched)
        const txns: any[] = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        if (match && txns.length > 0) {
          const dates = txns.map((t) => t.date).filter(Boolean).sort();
          const dMin = dates[0];
          const dMax = dates[dates.length - 1];
          if (dMin && dMax) {
            const { data: existing } = await supabase
              .from("bank_transactions")
              .select("id, txn_date, amount, description")
              .eq("bank_account_id", match.id)
              .gte("txn_date", dMin)
              .lte("txn_date", dMax)
              .limit(2000);
            const existingHashes = new Map<string, string>();
            for (const e of existing ?? []) {
              existingHashes.set(txnHash(e.txn_date, Number(e.amount), e.description ?? ""), e.id);
            }
            const dupIdx: number[] = [];
            txns.forEach((t, i) => {
              const amt = (Number(t.credit) || 0) - (Number(t.debit) || 0);
              const h = txnHash(t.date, amt, t.description ?? "");
              if (existingHashes.has(h)) dupIdx.push(i);
            });
            out.txn_overlap = {
              total: txns.length,
              duplicate_count: dupIdx.length,
              duplicate_indices: dupIdx,
              period_from: dMin,
              period_to: dMax,
            };
            if (dupIdx.length > 0) {
              out.warnings.push({
                type: "txn_overlap",
                severity: "warn",
                message: `${dupIdx.length}/${txns.length} giao dịch đã có trong sổ (${dMin} → ${dMax}). Sẽ bỏ tick mặc định.`,
              });
            }
          }
        }
      } else if (item.kind === "purchase_invoice") {
        const taxId = (parsed.vendor_tax_id ?? "").toString().trim();
        const invNo = (parsed.invoice_no ?? "").toString().trim();
        if (taxId && invNo) {
          const q = supabase
            .from("invoices")
            .select("id, invoice_no, supplier_tax_id, supplier_name, issue_date, total, status, payment_status")
            .eq("supplier_tax_id", taxId)
            .eq("invoice_no", invNo)
            .neq("status", "void")
            .limit(1);
          if (tenantId) q.eq("tenant_id", tenantId);
          const { data: existed } = await q;
          if (existed && existed.length > 0) {
            const e = existed[0];
            out.invoice_duplicate = {
              id: e.id,
              invoice_no: e.invoice_no,
              issue_date: e.issue_date,
              total: e.total,
              status: e.status,
              payment_status: e.payment_status,
            };
            out.warnings.push({
              type: "invoice_duplicate",
              severity: "error",
              message: `Hoá đơn ${invNo} (MST ${taxId}) đã ghi sổ ngày ${e.issue_date ?? "?"} — total ${Number(e.total).toLocaleString("vi-VN")}₫.`,
              meta: { id: e.id },
            });
          }
        } else if (invNo) {
          // fallback: same vendor_name + invoice_no
          const vendor = normText(parsed.vendor_name);
          if (vendor) {
            const q = supabase
              .from("invoices")
              .select("id, invoice_no, supplier_name, issue_date, total, status")
              .eq("invoice_no", invNo)
              .ilike("supplier_name", `%${parsed.vendor_name}%`)
              .neq("status", "void")
              .limit(1);
            if (tenantId) q.eq("tenant_id", tenantId);
            const { data: existed } = await q;
            if (existed && existed.length > 0) {
              out.invoice_duplicate = existed[0];
              out.warnings.push({
                type: "invoice_duplicate_fuzzy",
                severity: "warn",
                message: `Có hoá đơn cùng số ${invNo} của NCC "${existed[0].supplier_name}" ngày ${existed[0].issue_date ?? "?"}. Vui lòng kiểm tra.`,
                meta: { id: existed[0].id },
              });
            }
          }
        }
      } else if (item.kind === "cash_voucher") {
        const vNo = (parsed.voucher_no ?? "").toString().trim();
        if (vNo) {
          const q = supabase
            .from("cash_vouchers")
            .select("id, voucher_no, voucher_date, amount, status")
            .eq("voucher_no", vNo)
            .neq("status", "void")
            .limit(1);
          if (tenantId) q.eq("tenant_id", tenantId);
          const { data: existed } = await q;
          if (existed && existed.length > 0) {
            out.voucher_duplicate = existed[0];
            out.warnings.push({
              type: "voucher_duplicate",
              severity: "warn",
              message: `Phiếu số ${vNo} đã tồn tại trong sổ (ngày ${existed[0].voucher_date}).`,
              meta: { id: existed[0].id },
            });
          }
        }
      }

      // Suggested action
      const hasError = out.warnings.some((w: any) => w.severity === "error");
      out.suggested_action = hasError ? "skip" : "continue";

      results.push(out);
    }

    // Persist batch row
    const { data: batch } = await supabase
      .from("import_batches")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        kind: data.items[0]?.kind ?? "unknown",
        classification: results,
        status: "pending",
      })
      .select("id")
      .single();

    return { batchId: batch?.id ?? null, results };
  });

// ---------- resolveBankAccount: lookup + create ----------

export const resolveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        account_no: z.string().min(1).max(50),
        bank_name: z.string().max(255).optional(),
        account_holder: z.string().max(255).optional(),
        currency: z.string().max(10).optional(),
        gl_account_code: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;

    const norm = normAcctNo(data.account_no);
    if (!norm) throw new Error("Số tài khoản không hợp lệ");

    // Try match first
    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id, name, bank_name, account_no");
    const match = (existing ?? []).find((a: any) => normAcctNo(a.account_no) === norm);
    if (match) return { id: match.id, created: false };

    const { data: created, error } = await supabase
      .from("bank_accounts")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        name: data.bank_name ? `${data.bank_name} — ${data.account_no}` : data.account_no,
        bank_name: data.bank_name ?? null,
        account_no: data.account_no,
        currency: data.currency ?? "VND",
        gl_account_code: data.gl_account_code ?? "1121",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created!.id, created: true };
  });
