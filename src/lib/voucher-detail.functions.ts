import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VoucherDetailLine = {
  id: string;
  line_order: number;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  branch_name: string | null;
  department_name: string | null;
  project_name: string | null;
  cost_center_name: string | null;
};

export type RelatedDoc = {
  kind: "sales_invoice" | "customer_receipt" | "purchase_invoice" | "supplier_payment";
  id: string;
  date: string | null;
  doc_no: string | null;
  party_name: string | null;
  amount: number;
  method: string | null;
  status: string | null;
  is_self: boolean;
};

export type VoucherAttachment = {
  document_id: string;
  link_type: string;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
};

export type VoucherDetailResult = {
  entry: {
    id: string;
    entry_date: string;
    description: string | null;
    voucher_no: string;
    voucher_type: string;
    source_table: string;
    party_name: string | null;
    reference: string | null;
    branch_name: string | null;
    department_name: string | null;
    project_name: string | null;
    cost_center_name: string | null;
  };
  lines: VoucherDetailLine[];
  totals: { debit: number; credit: number };
  related: RelatedDoc[];
  attachments: VoucherAttachment[];
};

async function resolveDimNames(supabase: any) {
  const [br, dept, pr, cc, coa] = await Promise.all([
    supabase.from("branches").select("id, name, code"),
    supabase.from("departments").select("id, name, code"),
    supabase.from("projects").select("id, name, code"),
    supabase.from("cost_centers").select("id, name, code"),
    supabase.from("chart_of_accounts").select("code, name"),
  ]);
  const fmt = (r: any) => (r.code ? `${r.code} — ${r.name}` : r.name);
  return {
    branch: new Map((br.data ?? []).map((r: any) => [r.id, fmt(r)])),
    dept: new Map((dept.data ?? []).map((r: any) => [r.id, fmt(r)])),
    project: new Map((pr.data ?? []).map((r: any) => [r.id, fmt(r)])),
    cc: new Map((cc.data ?? []).map((r: any) => [r.id, fmt(r)])),
    coa: new Map((coa.data ?? []).map((r: any) => [r.code, r.name as string])),
  };
}

async function resolveVoucherMeta(supabase: any, entryId: string, userId: string) {
  // Try each known source in parallel; first hit wins
  const [cash, bank, cr, sp, si, sv, pr, de, je] = await Promise.all([
    supabase.from("cash_vouchers").select("id, journal_entry_id, voucher_no, voucher_type, party_name, reason").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("bank_vouchers").select("id, journal_entry_id, voucher_no, voucher_type, party_name, reference, reason").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("customer_receipts").select("id, journal_entry_id, reference, customer_name, method, invoice_id, amount, pay_date, status").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("supplier_payments").select("id, journal_entry_id, reference, supplier_name, method, invoice_id, amount, pay_date, status").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("sales_invoices").select("id, journal_entry_id, invoice_series, invoice_no, customer_name, issue_date, total, status").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("stock_vouchers").select("id, journal_entry_id, voucher_no, voucher_type, reason").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("payroll_runs").select("id, journal_entry_id, period_month").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("depreciation_entries").select("id, journal_entry_id, period_month").eq("journal_entry_id", entryId).maybeSingle(),
    supabase.from("journal_entries").select("id, invoice_id").eq("id", entryId).eq("user_id", userId).maybeSingle(),
  ]);

  if (cash.data) return {
    voucher_no: cash.data.voucher_no, voucher_type: cash.data.voucher_type === "receipt" ? "PT" : cash.data.voucher_type === "payment" ? "PC" : cash.data.voucher_type,
    source_table: "cash_vouchers", source_id: cash.data.id,
    party_name: cash.data.party_name, reference: cash.data.reason ?? null,
  };
  if (bank.data) return {
    voucher_no: bank.data.voucher_no, voucher_type: bank.data.voucher_type === "receipt" ? "BC" : bank.data.voucher_type === "payment" ? "BN" : bank.data.voucher_type,
    source_table: "bank_vouchers", source_id: bank.data.id,
    party_name: bank.data.party_name, reference: bank.data.reference ?? bank.data.reason ?? null,
  };
  if (cr.data) return {
    voucher_no: cr.data.reference ?? "—", voucher_type: "Phiếu thu KH",
    source_table: "customer_receipts", source_id: cr.data.id,
    party_name: cr.data.customer_name, reference: cr.data.method,
    invoice_id: cr.data.invoice_id, amount: Number(cr.data.amount ?? 0),
    date: cr.data.pay_date, status: cr.data.status,
  };
  if (sp.data) return {
    voucher_no: sp.data.reference ?? "—", voucher_type: "Phiếu chi NCC",
    source_table: "supplier_payments", source_id: sp.data.id,
    party_name: sp.data.supplier_name, reference: sp.data.method,
    invoice_id: sp.data.invoice_id, amount: Number(sp.data.amount ?? 0),
    date: sp.data.pay_date, status: sp.data.status,
  };
  if (si.data) return {
    voucher_no: [si.data.invoice_series, si.data.invoice_no].filter(Boolean).join(" "),
    voucher_type: "Hóa đơn bán", source_table: "sales_invoices", source_id: si.data.id,
    party_name: si.data.customer_name, reference: null,
    amount: Number(si.data.total ?? 0), date: si.data.issue_date, status: si.data.status,
  };
  if (sv.data) return {
    voucher_no: sv.data.voucher_no,
    voucher_type: sv.data.voucher_type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho",
    source_table: "stock_vouchers", source_id: sv.data.id,
    party_name: null, reference: sv.data.reason ?? null,
  };
  if (pr.data) return {
    voucher_no: `Lương ${String(pr.data.period_month ?? "").slice(0, 7)}`,
    voucher_type: "Bảng lương", source_table: "payroll_runs", source_id: pr.data.id,
    party_name: null, reference: null,
  };
  if (de.data) return {
    voucher_no: `KH ${String(de.data.period_month ?? "").slice(0, 7)}`,
    voucher_type: "Khấu hao", source_table: "depreciation_entries", source_id: de.data.id,
    party_name: null, reference: null,
  };
  if (je.data?.invoice_id) {
    const { data: inv } = await supabase.from("invoices").select("id, invoice_no, supplier_name, issue_date, total, status").eq("id", je.data.invoice_id).maybeSingle();
    if (inv) return {
      voucher_no: inv.invoice_no, voucher_type: "Hóa đơn mua",
      source_table: "invoices", source_id: inv.id,
      party_name: inv.supplier_name, reference: null,
      amount: Number(inv.total ?? 0), date: inv.issue_date, status: inv.status,
    };
  }
  return {
    voucher_no: `PKT-${entryId.slice(0, 8)}`, voucher_type: "Phiếu kế toán",
    source_table: "journal_entries", source_id: entryId,
    party_name: null, reference: null,
  };
}

async function loadRelated(supabase: any, userId: string, meta: any): Promise<RelatedDoc[]> {
  const related: RelatedDoc[] = [];

  // HD bán → các phiếu thu liên quan (same invoice_id)
  if (meta.source_table === "sales_invoices") {
    related.push({
      kind: "sales_invoice", id: meta.source_id, date: meta.date ?? null,
      doc_no: meta.voucher_no, party_name: meta.party_name,
      amount: meta.amount ?? 0, method: null, status: meta.status ?? null, is_self: true,
    });
    const { data } = await supabase
      .from("customer_receipts")
      .select("id, reference, customer_name, method, amount, pay_date, status")
      .eq("user_id", userId)
      .eq("invoice_id", meta.source_id);
    for (const r of data ?? []) {
      related.push({
        kind: "customer_receipt", id: r.id, date: r.pay_date,
        doc_no: r.reference, party_name: r.customer_name,
        amount: Number(r.amount ?? 0), method: r.method, status: r.status, is_self: false,
      });
    }
  }

  // Phiếu thu KH → HD bán liên quan + các phiếu thu khác cùng HD
  if (meta.source_table === "customer_receipts" && meta.invoice_id) {
    const { data: si } = await supabase
      .from("sales_invoices")
      .select("id, invoice_series, invoice_no, customer_name, issue_date, total, status")
      .eq("id", meta.invoice_id)
      .maybeSingle();
    if (si) {
      related.push({
        kind: "sales_invoice", id: si.id, date: si.issue_date,
        doc_no: [si.invoice_series, si.invoice_no].filter(Boolean).join(" "),
        party_name: si.customer_name, amount: Number(si.total ?? 0),
        method: null, status: si.status, is_self: false,
      });
    }
    const { data: others } = await supabase
      .from("customer_receipts")
      .select("id, reference, customer_name, method, amount, pay_date, status")
      .eq("user_id", userId)
      .eq("invoice_id", meta.invoice_id);
    for (const r of others ?? []) {
      related.push({
        kind: "customer_receipt", id: r.id, date: r.pay_date,
        doc_no: r.reference, party_name: r.customer_name,
        amount: Number(r.amount ?? 0), method: r.method, status: r.status,
        is_self: r.id === meta.source_id,
      });
    }
  }

  // HĐ mua → các phiếu chi NCC liên quan
  if (meta.source_table === "invoices") {
    related.push({
      kind: "purchase_invoice", id: meta.source_id, date: meta.date ?? null,
      doc_no: meta.voucher_no, party_name: meta.party_name,
      amount: meta.amount ?? 0, method: null, status: meta.status ?? null, is_self: true,
    });
    const { data } = await supabase
      .from("supplier_payments")
      .select("id, reference, supplier_name, method, amount, pay_date, status")
      .eq("user_id", userId)
      .eq("invoice_id", meta.source_id);
    for (const r of data ?? []) {
      related.push({
        kind: "supplier_payment", id: r.id, date: r.pay_date,
        doc_no: r.reference, party_name: r.supplier_name,
        amount: Number(r.amount ?? 0), method: r.method, status: r.status, is_self: false,
      });
    }
  }

  // Phiếu chi NCC → HĐ mua liên quan
  if (meta.source_table === "supplier_payments" && meta.invoice_id) {
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, invoice_no, supplier_name, issue_date, total, status")
      .eq("id", meta.invoice_id)
      .maybeSingle();
    if (inv) {
      related.push({
        kind: "purchase_invoice", id: inv.id, date: inv.issue_date,
        doc_no: inv.invoice_no, party_name: inv.supplier_name,
        amount: Number(inv.total ?? 0), method: null, status: inv.status, is_self: false,
      });
    }
  }

  return related;
}

async function loadAttachments(supabase: any, sourceTable: string, sourceId: string): Promise<VoucherAttachment[]> {
  const ALLOWED = new Set([
    "invoices", "sales_invoices", "einvoices",
    "cash_vouchers", "bank_vouchers", "customer_receipts", "supplier_payments",
  ]);
  if (!ALLOWED.has(sourceTable)) return [];
  const { data } = await supabase
    .from("document_links")
    .select("document_id, link_type, documents!inner(id, original_filename, storage_path, mime_type)")
    .eq("entity_table", sourceTable)
    .eq("entity_id", sourceId);
  return (data ?? []).map((r: any) => ({
    document_id: r.document_id,
    link_type: r.link_type,
    file_name: r.documents?.original_filename ?? null,
    storage_path: r.documents?.storage_path ?? null,
    mime_type: r.documents?.mime_type ?? null,
  }));
}

export const getVoucherDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { entry_id: string }) => i)
  .handler(async ({ data, context }): Promise<VoucherDetailResult> => {
    const { supabase, userId } = context;
    const entryId = data.entry_id;

    const [{ data: entry, error: entryErr }, { data: rawLines, error: linesErr }, dim, meta] = await Promise.all([
      supabase.from("journal_entries").select("id, entry_date, description, branch_id, project_id, cost_center_id").eq("id", entryId).eq("user_id", userId).maybeSingle(),
      supabase.from("journal_lines").select("id, line_order, account_code, debit, credit, branch_id, department_id, project_id, cost_center_id").eq("entry_id", entryId).order("line_order", { ascending: true }),
      resolveDimNames(supabase),
      resolveVoucherMeta(supabase, entryId, userId),
    ]);
    if (entryErr) throw entryErr;
    if (linesErr) throw linesErr;
    if (!entry) throw new Error("Không tìm thấy chứng từ");

    const lines: VoucherDetailLine[] = (rawLines ?? []).map((l: any) => ({
      id: l.id,
      line_order: Number(l.line_order) || 0,
      account_code: l.account_code,
      account_name: (dim.coa.get(l.account_code) as string | undefined) ?? null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      branch_name: (l.branch_id ? (dim.branch.get(l.branch_id) as string) : null) ?? null,
      department_name: (l.department_id ? (dim.dept.get(l.department_id) as string) : null) ?? null,
      project_name: (l.project_id ? (dim.project.get(l.project_id) as string) : null) ?? null,
      cost_center_name: (l.cost_center_id ? (dim.cc.get(l.cost_center_id) as string) : null) ?? null,
    }));

    const totals = lines.reduce(
      (s, l) => ({ debit: s.debit + l.debit, credit: s.credit + l.credit }),
      { debit: 0, credit: 0 },
    );

    const [related, attachments] = await Promise.all([
      loadRelated(supabase, userId, meta),
      loadAttachments(supabase, meta.source_table, meta.source_id),
    ]);

    return {
      entry: {
        id: entry.id,
        entry_date: entry.entry_date,
        description: entry.description,
        voucher_no: meta.voucher_no,
        voucher_type: meta.voucher_type,
        source_table: meta.source_table,
        party_name: meta.party_name,
        reference: meta.reference,
        branch_name: (entry.branch_id ? (dim.branch.get(entry.branch_id) as string) : null) ?? null,
        department_name: null,
        project_name: (entry.project_id ? (dim.project.get(entry.project_id) as string) : null) ?? null,
        cost_center_name: (entry.cost_center_id ? (dim.cc.get(entry.cost_center_id) as string) : null) ?? null,
      },
      lines,
      totals,
      related,
      attachments,
    };
  });
