import { createServerFn } from "@tanstack/react-start";

import { withTenant } from "@/integrations/supabase/with-tenant";
import type { DimFilter } from "@/lib/ledgers.functions";

export type VoucherListRow = {
  entry_id: string;
  line_id: string;
  line_index: number;
  entry_date: string;
  voucher_no: string;
  voucher_type: string;
  source_table: string;
  description: string | null;
  account_code: string;
  debit: number;
  credit: number;
  party_name: string | null;
  reference: string | null;
  invoice_no: string | null;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  project_id: string | null;
  project_name: string | null;
  cost_center_id: string | null;
  cost_center_name: string | null;
};

const hasDims = (d?: DimFilter) =>
  !!(d && (d.branch_id || d.department_id || d.project_id || d.cost_center_id));

type Meta = { voucher_no: string; voucher_type: string; source_table: string; party_name: string | null; reference: string | null; invoice_no: string | null };

async function loadVoucherMeta(supabase: any, userId: string, entryIds: string[]): Promise<Map<string, Meta>> {
  const meta = new Map<string, Meta>();
  if (entryIds.length === 0) return meta;
  const priority = new Map<string, number>();
  const set = (id: string, m: Meta, p = 10) => {
    const current = priority.get(id) ?? -1;
    if (id && p > current) {
      meta.set(id, m);
      priority.set(id, p);
    }
  };
  const invoiceLabel = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" ").trim();

  // Chunked .in() — Supabase limits URL length; 200 per chunk is safe.
  const chunks: string[][] = [];
  for (let i = 0; i < entryIds.length; i += 200) chunks.push(entryIds.slice(i, i + 200));

  const VTYPE_BANK: Record<string, string> = { receipt: "BC", payment: "BN" };
  const VTYPE_CASH: Record<string, string> = { receipt: "PT", payment: "PC", PT: "PT", PC: "PC" };

  for (const ch of chunks) {
    const [cash, bank, cr, sp, si, sv, pr, de, salesV, purchV] = await Promise.all([
      supabase.from("cash_vouchers").select("journal_entry_id, voucher_no, voucher_type, party_name, reason").in("journal_entry_id", ch),
      supabase.from("bank_vouchers").select("journal_entry_id, voucher_no, voucher_type, party_name, reference, reason").in("journal_entry_id", ch),
      supabase.from("customer_receipts").select("journal_entry_id, reference, customer_name, method, invoice_id").in("journal_entry_id", ch),
      supabase.from("supplier_payments").select("journal_entry_id, reference, supplier_name, method, invoice_id").in("journal_entry_id", ch),
      supabase.from("sales_invoices").select("journal_entry_id, invoice_series, invoice_no, customer_name").in("journal_entry_id", ch),
      supabase.from("stock_vouchers").select("journal_entry_id, voucher_no, voucher_type, reason").in("journal_entry_id", ch),
      supabase.from("payroll_runs").select("journal_entry_id, period_month").in("journal_entry_id", ch),
      supabase.from("depreciation_entries").select("journal_entry_id, period_month").in("journal_entry_id", ch),
      supabase.from("sales_vouchers").select("journal_entry_id, voucher_no, customer_name, reason, einvoice_id").in("journal_entry_id", ch),
      supabase.from("purchase_vouchers").select("journal_entry_id, voucher_no, supplier_name, invoice_id, invoice_no, reason").in("journal_entry_id", ch),
    ]);

    const salesInvoiceIds = Array.from(new Set(((cr.data ?? []) as any[]).map((r) => r.invoice_id).filter(Boolean)));
    const purchaseInvoiceIds = Array.from(new Set([
      ...((sp.data ?? []) as any[]).map((r) => r.invoice_id).filter(Boolean),
      ...((purchV.data ?? []) as any[]).map((r) => r.invoice_id).filter(Boolean),
    ]));
    const salesInvoiceNoById = new Map<string, string>();
    const purchaseInvoiceNoById = new Map<string, string>();
    if (salesInvoiceIds.length > 0) {
      const { data } = await supabase
        .from("sales_invoices")
        .select("id, invoice_series, invoice_no")
        .in("id", salesInvoiceIds);
      for (const r of (data ?? []) as any[]) {
        const no = invoiceLabel(r.invoice_series, r.invoice_no);
        if (no) salesInvoiceNoById.set(r.id, no);
      }
    }
    if (purchaseInvoiceIds.length > 0) {
      const [{ data: invs }, { data: einvs }] = await Promise.all([
        supabase.from("invoices").select("id, invoice_no").in("id", purchaseInvoiceIds),
        supabase.from("einvoices").select("matched_purchase_invoice_id, invoice_series, invoice_no").in("matched_purchase_invoice_id", purchaseInvoiceIds),
      ]);
      for (const r of (invs ?? []) as any[]) {
        const no = invoiceLabel(r.invoice_no);
        if (no) purchaseInvoiceNoById.set(r.id, no);
      }
      for (const r of (einvs ?? []) as any[]) {
        const no = invoiceLabel(r.invoice_series, r.invoice_no);
        if (r.matched_purchase_invoice_id && no && !purchaseInvoiceNoById.has(r.matched_purchase_invoice_id)) {
          purchaseInvoiceNoById.set(r.matched_purchase_invoice_id, no);
        }
      }
    }
    for (const r of cash.data ?? []) set(r.journal_entry_id, {
      voucher_no: r.voucher_no, voucher_type: VTYPE_CASH[r.voucher_type] ?? r.voucher_type,
      source_table: "cash_vouchers", party_name: r.party_name, reference: r.reason ?? null,
      invoice_no: null,
    });
    for (const r of bank.data ?? []) set(r.journal_entry_id, {
      voucher_no: r.voucher_no, voucher_type: VTYPE_BANK[r.voucher_type] ?? r.voucher_type,
      source_table: "bank_vouchers", party_name: r.party_name, reference: r.reference ?? r.reason ?? null,
      invoice_no: null,
    });
    for (const r of cr.data ?? []) set(r.journal_entry_id, {
      voucher_no: r.reference ?? "—", voucher_type: "Phiếu thu KH",
      source_table: "customer_receipts", party_name: r.customer_name, reference: r.method,
      invoice_no: r.invoice_id ? (salesInvoiceNoById.get(r.invoice_id) ?? null) : null,
    }, 10);
    for (const r of sp.data ?? []) set(r.journal_entry_id, {
      voucher_no: r.reference ?? "—", voucher_type: "Phiếu chi NCC",
      source_table: "supplier_payments", party_name: r.supplier_name, reference: r.method,
      invoice_no: r.invoice_id ? (purchaseInvoiceNoById.get(r.invoice_id) ?? null) : null,
    }, 10);
    for (const r of si.data ?? []) set(r.journal_entry_id, {
      voucher_no: invoiceLabel(r.invoice_series, r.invoice_no),
      voucher_type: "Hóa đơn bán", source_table: "sales_invoices",
      party_name: r.customer_name, reference: null,
      invoice_no: invoiceLabel(r.invoice_series, r.invoice_no) || null,
    }, 20);
    for (const r of sv.data ?? []) set(r.journal_entry_id, {
      voucher_no: r.voucher_no, voucher_type: r.voucher_type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho",
      source_table: "stock_vouchers", party_name: null, reference: r.reason ?? null,
      invoice_no: null,
    }, 5);
    for (const r of pr.data ?? []) set(r.journal_entry_id, {
      voucher_no: `Lương ${String(r.period_month ?? "").slice(0, 7)}`, voucher_type: "Bảng lương",
      source_table: "payroll_runs", party_name: null, reference: null,
      invoice_no: null,
    });
    for (const r of de.data ?? []) set(r.journal_entry_id, {
      voucher_no: `KH ${String(r.period_month ?? "").slice(0, 7)}`, voucher_type: "Khấu hao",
      source_table: "depreciation_entries", party_name: null, reference: null,
      invoice_no: null,
    });

    // Sales vouchers (Phiếu bán hàng) — invoice_no resolved via linked einvoice
    const svRows = (salesV.data ?? []) as any[];
    const einvIds = Array.from(new Set(svRows.map((r) => r.einvoice_id).filter(Boolean)));
    const einvMap = new Map<string, string>();
    if (einvIds.length > 0) {
      const { data: einvs } = await supabase
        .from("einvoices")
        .select("id, invoice_series, invoice_no")
        .in("id", einvIds);
      for (const e of (einvs ?? []) as any[]) {
        const no = invoiceLabel(e.invoice_series, e.invoice_no);
        if (no) einvMap.set(e.id, no);
      }
    }
    for (const r of svRows) set(r.journal_entry_id, {
      voucher_no: r.voucher_no, voucher_type: "Phiếu bán hàng",
      source_table: "sales_vouchers", party_name: r.customer_name,
      reference: r.reason ?? null,
      invoice_no: r.einvoice_id ? (einvMap.get(r.einvoice_id) ?? null) : null,
    }, 20);
    for (const r of (purchV.data ?? []) as any[]) {
      const no = invoiceLabel(r.invoice_no) || (r.invoice_id ? (purchaseInvoiceNoById.get(r.invoice_id) ?? "") : "");
      set(r.journal_entry_id, {
        voucher_no: r.voucher_no, voucher_type: "Phiếu mua hàng",
        source_table: "purchase_vouchers", party_name: r.supplier_name,
        reference: r.reason ?? null,
        invoice_no: no || null,
      }, 20);
    }
  }

  // Purchase invoices linked via journal_entries.invoice_id (not journal_entry_id)
  const need = entryIds.filter((id) => !meta.has(id));
  if (need.length > 0) {
    const invMap = new Map<string, string>(); // entryId -> invoice_id
    for (let i = 0; i < need.length; i += 200) {
      const ch = need.slice(i, i + 200);
      const { data } = await supabase
        .from("journal_entries")
        .select("id, invoice_id")
        .eq("user_id", userId)
        .in("id", ch)
        .not("invoice_id", "is", null);
      for (const r of data ?? []) if (r.invoice_id) invMap.set(r.id, r.invoice_id);
    }
    const invIds = Array.from(new Set(invMap.values()));
    const invInfo = new Map<string, { no: string; supplier: string | null }>();
    for (let i = 0; i < invIds.length; i += 200) {
      const ch = invIds.slice(i, i + 200);
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_no, supplier_name")
        .in("id", ch);
      for (const r of data ?? []) invInfo.set(r.id, { no: r.invoice_no, supplier: r.supplier_name });
    }
    for (const [entryId, invId] of invMap) {
      const info = invInfo.get(invId);
      if (info) set(entryId, {
        voucher_no: info.no, voucher_type: "Hóa đơn mua",
        source_table: "invoices", party_name: info.supplier, reference: null,
        invoice_no: info.no,
      });
    }
  }
  return meta;
}

async function loadDimNames(supabase: any) {
  const [br, dept, pr, cc] = await Promise.all([
    supabase.from("branches").select("id, name, code"),
    supabase.from("departments").select("id, name, code"),
    supabase.from("projects").select("id, name, code"),
    supabase.from("cost_centers").select("id, name, code"),
  ]);
  const fmt = (r: any) => r.code ? `${r.code} — ${r.name}` : r.name;
  return {
    branch: new Map((br.data ?? []).map((r: any) => [r.id, fmt(r)])),
    dept: new Map((dept.data ?? []).map((r: any) => [r.id, fmt(r)])),
    project: new Map((pr.data ?? []).map((r: any) => [r.id, fmt(r)])),
    cc: new Map((cc.data ?? []).map((r: any) => [r.id, fmt(r)])),
  };
}

async function buildVoucherList(
  supabase: any, userId: string, tenantId: string | null,
  data: {
    from: string; to: string;
    dims?: DimFilter;
    sourceTables?: string[];
    voucherTypes?: string[];
    accountPrefix?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, Math.floor(data.page ?? 1));
  const pageSize = Math.min(100000, Math.max(10, Math.floor(data.pageSize ?? 100)));

  // Base filter (shared by data + count queries)
  const applyBase = (q: any) => {
    q = q
      .eq("journal_entries.user_id", userId)
      .gte("journal_entries.entry_date", data.from)
      .lte("journal_entries.entry_date", data.to);
    if (tenantId) q = q.eq("journal_entries.tenant_id", tenantId);
    if (data.accountPrefix) q = q.like("account_code", `${data.accountPrefix}%`);
    if (hasDims(data.dims)) {
      const d = data.dims!;
      if (d.branch_id) q = q.eq("branch_id", d.branch_id);
      if (d.department_id) q = q.eq("department_id", d.department_id);
      if (d.project_id) q = q.eq("project_id", d.project_id);
      if (d.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);
    }
    return q;
  };

  // Count query (no rows fetched)
  const countQ = applyBase(
    supabase
      .from("journal_lines")
      .select("id, journal_entries!inner(id, user_id, entry_date)", {
        count: "exact",
        head: true,
      }),
  );

  // Paginated data query
  const offset = (page - 1) * pageSize;
  let dataQ = applyBase(
    supabase
      .from("journal_lines")
      .select(
        "id, account_code, debit, credit, line_order, entry_id, branch_id, department_id, project_id, cost_center_id, journal_entries!inner(id, entry_date, description, user_id)",
      ),
  )
    .order("entry_date", { foreignTable: "journal_entries", ascending: true })
    .order("entry_id", { ascending: true })
    .order("line_order", { ascending: true })
    .range(offset, offset + pageSize - 1);

  const [{ data: lines, error }, { count: totalCount, error: countErr }] =
    await Promise.all([dataQ, countQ]);
  if (error) throw error;
  if (countErr) throw countErr;

  const entryIds = Array.from(new Set((lines ?? []).map((l: any) => l.entry_id))) as string[];
  const [meta, dimNames] = await Promise.all([
    loadVoucherMeta(supabase, userId, entryIds),
    loadDimNames(supabase),
  ]);

    const rows: VoucherListRow[] = (lines ?? []).map((l: any) => {
      const e = l.journal_entries;
      const m = meta.get(l.entry_id);
      return {
        entry_id: l.entry_id,
        line_id: l.id,
        line_index: Number(l.line_order) || 0,
        entry_date: e.entry_date,
        voucher_no: m?.voucher_no ?? `PKT-${String(l.entry_id).slice(0, 8)}`,
        voucher_type: m?.voucher_type ?? "Phiếu kế toán",
        source_table: m?.source_table ?? "journal_entries",
        description: e.description,
        account_code: l.account_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        party_name: m?.party_name ?? null,
        reference: m?.reference ?? null,
        invoice_no: m?.invoice_no ?? null,
        branch_id: l.branch_id,
        branch_name: (l.branch_id ? (dimNames.branch.get(l.branch_id) as string) : null) ?? null,
        department_id: l.department_id,
        department_name: (l.department_id ? (dimNames.dept.get(l.department_id) as string) : null) ?? null,
        project_id: l.project_id,
        project_name: (l.project_id ? (dimNames.project.get(l.project_id) as string) : null) ?? null,
        cost_center_id: l.cost_center_id,
        cost_center_name: (l.cost_center_id ? (dimNames.cc.get(l.cost_center_id) as string) : null) ?? null,
      };
    });

  // sourceTables / voucherTypes filters are applied AFTER meta resolution;
  // for paginated mode we keep these page-local to avoid an extra full scan.
  let pageRows = rows;
  if (data.sourceTables && data.sourceTables.length > 0) {
    const set = new Set(data.sourceTables);
    pageRows = pageRows.filter((r) => set.has(r.source_table));
  }
  if (data.voucherTypes && data.voucherTypes.length > 0) {
    const set = new Set(data.voucherTypes);
    pageRows = pageRows.filter((r) => set.has(r.voucher_type));
  }

  pageRows.sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date) ||
    a.voucher_no.localeCompare(b.voucher_no) ||
    a.line_index - b.line_index
  );

  const pageTotals = pageRows.reduce(
    (s, r) => ({ debit: s.debit + r.debit, credit: s.credit + r.credit }),
    { debit: 0, credit: 0 },
  );

  return {
    rows: pageRows,
    totals: pageTotals,
    page,
    pageSize,
    totalRows: totalCount ?? 0,
    totalPages: Math.max(1, Math.ceil((totalCount ?? 0) / pageSize)),
  };
}

export const getVoucherList = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: {
    from: string; to: string;
    dims?: DimFilter;
    sourceTables?: string[];
    voucherTypes?: string[];
    accountPrefix?: string;
    page?: number;
    pageSize?: number;
  }) => i)
  .handler(async ({ data, context }) => {
    return buildVoucherList(context.supabase, context.userId, context.tenantId, data);
  });

export const exportVoucherListXlsx = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { from: string; to: string; dims?: DimFilter; sourceTables?: string[]; voucherTypes?: string[]; accountPrefix?: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const res = await buildVoucherList(supabase, userId, tenantId, { ...data, page: 1, pageSize: 100000 });

    const profile = (await supabase
      .from("profiles")
      .select("company_name, tax_id, address")
      .eq("id", userId)
      .maybeSingle()).data;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bang ke chung tu");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";
    ws.mergeCells("A5:N5");
    ws.getCell("A5").value = "BẢNG KÊ CHỨNG TỪ";
    ws.getCell("A5").font = { bold: true, size: 14 };
    ws.getCell("A5").alignment = { horizontal: "center" };
    ws.mergeCells("A6:N6");
    ws.getCell("A6").value = `Kỳ từ ${data.from} đến ${data.to}`;
    ws.getCell("A6").alignment = { horizontal: "center" };

    const headers = [
      "Ngày", "Số CT", "Loại CT", "Số HĐ", "Diễn giải", "TK", "Phát sinh Nợ", "Phát sinh Có",
      "Đối tác", "Tham chiếu", "Chi nhánh", "Phòng ban", "Dự án", "TT chi phí",
    ];
    const headerRow = ws.addRow([]);
    ws.getRow(8).values = headers;
    ws.getRow(8).font = { bold: true };
    ws.getRow(8).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(8).eachCell((c) => {
      c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
    });
    void headerRow;

    let rowIdx = 9;
    for (const r of res.rows) {
      ws.getRow(rowIdx).values = [
        r.entry_date, r.voucher_no, r.voucher_type, r.invoice_no ?? "", r.description ?? "",
        r.account_code, r.debit || null, r.credit || null,
        r.party_name ?? "", r.reference ?? "",
        r.branch_name ?? "", r.department_name ?? "", r.project_name ?? "", r.cost_center_name ?? "",
      ];
      ws.getCell(`G${rowIdx}`).numFmt = "#,##0";
      ws.getCell(`H${rowIdx}`).numFmt = "#,##0";
      rowIdx++;
    }
    ws.getRow(rowIdx).values = ["", "", "", "", "TỔNG CỘNG", "", res.totals.debit, res.totals.credit];
    ws.getRow(rowIdx).font = { bold: true };
    ws.getCell(`G${rowIdx}`).numFmt = "#,##0";
    ws.getCell(`H${rowIdx}`).numFmt = "#,##0";

    ws.columns = [
      { width: 12 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 38 }, { width: 8 },
      { width: 16 }, { width: 16 }, { width: 24 }, { width: 16 },
      { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 },
    ];

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf as ArrayBuffer).toString("base64");
    return { base64, filename: `bang-ke-chung-tu_${data.from}_${data.to}.xlsx` };
  });
