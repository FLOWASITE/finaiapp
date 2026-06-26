import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { withLatency } from "@/lib/with-latency";

// ============ AGING LIST (existing) ============
export const listPayables = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name, invoice_no, issue_date, total, status")
      .eq("tenant_id", tenantId)
      .order("issue_date", { ascending: false });
    const { data: payments } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount")
      .eq("tenant_id", tenantId);

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

// ============ RECORD PAYMENT (with journal posting) ============
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
  .middleware([withTenant])
  .inputValidator((i: unknown) => PaymentSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;

    // Resolve supplier name from invoice if needed
    let supplierId = data.supplier_id ?? null;
    let supplierName = data.supplier_name ?? null;
    if (data.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("supplier_id, supplier_name, total")
        .eq("id", data.invoice_id)
        .eq("tenant_id", tenantId)
        .single();
      if (inv) {
        supplierId = supplierId ?? inv.supplier_id ?? null;
        supplierName = supplierName ?? inv.supplier_name ?? null;
      }
    }

    // Journal: Nợ 331 / Có 111|112
    const credit = data.method === "cash" ? "111" : "112";
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        entry_date: data.pay_date,
        description: `Chi trả NCC — ${supplierName ?? ""}`,
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: "331", debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: credit, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    const { error } = await supabase.from("supplier_payments").insert({
      user_id: userId,
      tenant_id: tenantId,
      invoice_id: data.invoice_id ?? null,
      supplier_id: supplierId,
      supplier_name: supplierName,
      pay_date: data.pay_date,
      method: data.method,
      amount: data.amount,
      reference: data.reference || null,
      journal_entry_id: entry.id,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ DELETE PAYMENT (reverse journal) ============
export const deleteSupplierPayment = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    const { data: p } = await supabase
      .from("supplier_payments")
      .select("id, journal_entry_id, supplier_name")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();
    if (!p) throw new Error("Không tìm thấy phiếu chi");
    if (p.journal_entry_id) {
      const { data: orig } = await supabase
        .from("journal_lines")
        .select("account_code, debit, credit")
        .eq("entry_id", p.journal_entry_id);
      const { data: re } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: tenantId,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `Hủy phiếu chi — ${p.supplier_name ?? ""}`,
        })
        .select("id")
        .single();
      if (re && orig) {
        await supabase.from("journal_lines").insert(
          (orig as any[]).map((l: any, i: number) => ({
            entry_id: re.id,
            account_code: l.account_code,
            debit: Number(l.credit),
            credit: Number(l.debit),
            line_order: i,
          })),
        );
      }
    }
    await supabase.from("supplier_payments").delete().eq("id", data.id).eq("tenant_id", tenantId);
    return { ok: true };
  });

// ============ LIST SUPPLIER PAYMENTS (filterable) ============
const ListPaymentsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  method: z.string().optional(),
});

export const listSupplierPayments = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ListPaymentsSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase
      .from("supplier_payments")
      .select(
        "id, pay_date, supplier_id, supplier_name, invoice_id, amount, method, reference, invoices(invoice_no, payment_status)",
      )
      .eq("tenant_id", tenantId)
      .order("pay_date", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    if (data.method && data.method !== "all") q = q.eq("method", data.method);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const payablesStats = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: { from?: string; to?: string }) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(i ?? {}),
  )
  .handler(withLatency("payablesStats", async ({ data, context }) => {
    const { supabase, tenantId } = context;
    let q = supabase.from("supplier_payments").select("amount, method").eq("tenant_id", tenantId);
    if (data.from) q = q.gte("pay_date", data.from);
    if (data.to) q = q.lte("pay_date", data.to);
    const { data: rows } = await q;
    const total = ((rows ?? []) as any[]).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const cash = ((rows ?? []) as any[]).filter((r: any) => r.method === "cash").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const bank = ((rows ?? []) as any[]).filter((r: any) => r.method === "bank").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // Outstanding = sum of (invoice.total - sum payments)
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, total")
      .eq("tenant_id", tenantId);
    const { data: pays } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount")
      .eq("tenant_id", tenantId);
    const paidMap = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) {
      if (p.invoice_id)
        paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
    let outstanding = 0;
    for (const i of (invs ?? []) as any[]) {
      outstanding += Math.max(0, Number(i.total || 0) - (paidMap.get(i.id) ?? 0));
    }

    return { total, cash, bank, outstanding, count: (rows ?? []).length };
  }));


export const listOutstandingPurchaseInvoices = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data: invs } = await supabase
      .from("invoices")
      .select("id, invoice_no, supplier_id, supplier_name, issue_date, total")
      .eq("tenant_id", tenantId)
      .order("issue_date", { ascending: false })
      .limit(500);
    const { data: pays } = await supabase
      .from("supplier_payments")
      .select("invoice_id, amount")
      .eq("tenant_id", tenantId);
    const paidMap = new Map<string, number>();
    for (const p of (pays ?? []) as any[]) {
      if (p.invoice_id)
        paidMap.set(p.invoice_id, (paidMap.get(p.invoice_id) ?? 0) + Number(p.amount || 0));
    }
    return ((invs ?? []) as any[])
      .map((i: any) => ({
        ...i,
        paid_amount: paidMap.get(i.id) ?? 0,
        remaining: Number(i.total || 0) - (paidMap.get(i.id) ?? 0),
      }))
      .filter((i: any) => i.remaining > 0.5);
  });

// ============ Bảng tổng hợp công nợ phải trả (TK 331) ============
export type ApDimFilter = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};

export type ApSummaryRow = {
  supplier_id: string | null;
  supplier_code: string | null;
  supplier_name: string;
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
};

async function buildApSummary(
  supabase: any,
  tenantId: string,
  data: { from: string; to: string; dims?: ApDimFilter; account?: string },
): Promise<ApSummaryRow[]> {
  const account = data.account ?? "331";
  let q = supabase
    .from("journal_lines")
    .select(
      "debit, credit, entry_id, branch_id, department_id, project_id, cost_center_id, journal_entries!inner(tenant_id, entry_date, description, invoice_id)",
    )
    .like("account_code", `${account}%`)
    .eq("journal_entries.tenant_id", tenantId)
    .lte("journal_entries.entry_date", data.to);

  const d = data.dims;
  if (d?.branch_id) q = q.eq("branch_id", d.branch_id);
  if (d?.department_id) q = q.eq("department_id", d.department_id);
  if (d?.project_id) q = q.eq("project_id", d.project_id);
  if (d?.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);

  const { data: lines, error } = await q;
  if (error) throw new Error(error.message);

  const entryIds = Array.from(new Set((lines ?? []).map((l: any) => l.entry_id)));
  const invoiceIds = Array.from(
    new Set(
      (lines ?? [])
        .map((l: any) => l.journal_entries?.invoice_id)
        .filter((x: any): x is string => !!x),
    ),
  );
  const placeholder = ["00000000-0000-0000-0000-000000000000"];
  const eIds = entryIds.length ? entryIds : placeholder;
  const iIds = invoiceIds.length ? invoiceIds : placeholder;

  const [{ data: pInv }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, supplier_id, supplier_name")
      .eq("tenant_id", tenantId)
      .in("id", iIds),
    supabase
      .from("supplier_payments")
      .select("journal_entry_id, supplier_id, supplier_name")
      .eq("tenant_id", tenantId)
      .in("journal_entry_id", eIds),
  ]);

  const invToSupplier = new Map<string, { id: string | null; name: string }>();
  for (const r of (pInv ?? []) as any[]) {
    invToSupplier.set(r.id, {
      id: r.supplier_id ?? null,
      name: (r.supplier_name ?? "").trim() || "Không rõ",
    });
  }
  const entryToSupplier = new Map<string, { id: string | null; name: string }>();
  for (const r of (payments ?? []) as any[]) {
    entryToSupplier.set(r.journal_entry_id, {
      id: r.supplier_id ?? null,
      name: (r.supplier_name ?? "").trim() || "Không rõ",
    });
  }

  // Supplier codes
  const supIds = Array.from(
    new Set([
      ...Array.from(invToSupplier.values()).map((s) => s.id),
      ...Array.from(entryToSupplier.values()).map((s) => s.id),
    ].filter((x): x is string => !!x)),
  );
  const codeMap = new Map<string, string>();
  if (supIds.length) {
    const { data: sups } = await supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .in("id", supIds);
    for (const s of (sups ?? []) as any[]) {
      if (s.code) codeMap.set(s.id, s.code);
    }
  }

  type Agg = {
    supplier_id: string | null;
    supplier_name: string;
    opening: number;
    debit: number;
    credit: number;
  };
  const byKey = new Map<string, Agg>();

  for (const l of (lines ?? []) as any[]) {
    const e = l.journal_entries;
    const invId: string | null = e?.invoice_id ?? null;
    const s =
      (invId ? invToSupplier.get(invId) : null) ??
      entryToSupplier.get(l.entry_id) ?? {
        id: null,
        name:
          ((e.description ?? "Không rõ").split("—")[0].trim().slice(0, 80) ||
            "Không rõ") as string,
      };
    const key = s.id ?? `name:${s.name}`;
    const row =
      byKey.get(key) ?? {
        supplier_id: s.id,
        supplier_name: s.name,
        opening: 0,
        debit: 0,
        credit: 0,
      };
    const dr = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    if (e.entry_date < data.from) {
      // payable opening (credit side positive)
      row.opening += cr - dr;
    } else {
      row.debit += dr;
      row.credit += cr;
    }
    byKey.set(key, row);
  }

  const out: ApSummaryRow[] = Array.from(byKey.values()).map((r) => {
    const closing = r.opening + r.credit - r.debit;
    return {
      supplier_id: r.supplier_id,
      supplier_code: r.supplier_id ? codeMap.get(r.supplier_id) ?? null : null,
      supplier_name: r.supplier_name,
      opening_debit: r.opening < 0 ? -r.opening : 0,
      opening_credit: r.opening > 0 ? r.opening : 0,
      debit: r.debit,
      credit: r.credit,
      closing_debit: closing < 0 ? -closing : 0,
      closing_credit: closing > 0 ? closing : 0,
    };
  });

  return out
    .filter(
      (r) =>
        Math.abs(r.opening_debit) +
          Math.abs(r.opening_credit) +
          Math.abs(r.debit) +
          Math.abs(r.credit) +
          Math.abs(r.closing_debit) +
          Math.abs(r.closing_credit) >
        0.5,
    )
    .sort(
      (a, b) =>
        (a.supplier_code ?? "zzz").localeCompare(b.supplier_code ?? "zzz") ||
        a.supplier_name.localeCompare(b.supplier_name, "vi"),
    );
}

export const getApSummary = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: { from: string; to: string; dims?: ApDimFilter; account?: string }) => i,
  )
  .handler(
    withLatency("getApSummary", async ({ data, context }) => {
      const { supabase, tenantId } = context;
      return buildApSummary(supabase, tenantId, data);
    }),
  );

export const exportApSummaryXlsx = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator(
    (i: { from: string; to: string; dims?: ApDimFilter; account?: string }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = await buildApSummary(supabase, userId, data);

    const totals = rows.reduce(
      (s, r) => ({
        opening_debit: s.opening_debit + r.opening_debit,
        opening_credit: s.opening_credit + r.opening_credit,
        debit: s.debit + r.debit,
        credit: s.credit + r.credit,
        closing_debit: s.closing_debit + r.closing_debit,
        closing_credit: s.closing_credit + r.closing_credit,
      }),
      {
        opening_debit: 0,
        opening_credit: 0,
        debit: 0,
        credit: 0,
        closing_debit: 0,
        closing_credit: 0,
      },
    );

    const profile = (
      await supabase
        .from("profiles")
        .select("company_name, tax_id, address")
        .eq("id", userId)
        .maybeSingle()
    ).data;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("CongNoPhaiTra");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    ws.mergeCells("A5:I5");
    ws.getCell("A5").value = "BẢNG TỔNG HỢP CÔNG NỢ PHẢI TRẢ (TK 331)";
    ws.getCell("A5").font = { bold: true, size: 13 };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells("A6:I6");
    ws.getCell("A6").value = `Kỳ từ ${data.from} đến ${data.to}`;
    ws.getCell("A6").alignment = { horizontal: "center" };

    ws.mergeCells("A8:A9");
    ws.mergeCells("B8:B9");
    ws.mergeCells("C8:C9");
    ws.mergeCells("D8:E8");
    ws.mergeCells("F8:G8");
    ws.mergeCells("H8:I8");
    ws.getCell("A8").value = "Mã NCC";
    ws.getCell("B8").value = "Tên nhà cung cấp";
    ws.getCell("C8").value = "Mã TK";
    ws.getCell("D8").value = "Số dư đầu kỳ";
    ws.getCell("F8").value = "Phát sinh trong kỳ";
    ws.getCell("H8").value = "Số dư cuối kỳ";
    ws.getCell("D9").value = "Nợ";
    ws.getCell("E9").value = "Có";
    ws.getCell("F9").value = "Nợ";
    ws.getCell("G9").value = "Có";
    ws.getCell("H9").value = "Nợ";
    ws.getCell("I9").value = "Có";
    ["A8", "B8", "C8", "D8", "F8", "H8", "D9", "E9", "F9", "G9", "H9", "I9"].forEach((c) => {
      const cell = ws.getCell(c);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const account = data.account ?? "331";
    let r = 10;
    for (const row of rows) {
      ws.getCell(`A${r}`).value = row.supplier_code ?? "";
      ws.getCell(`B${r}`).value = row.supplier_name;
      ws.getCell(`C${r}`).value = account;
      ws.getCell(`D${r}`).value = Math.round(row.opening_debit);
      ws.getCell(`E${r}`).value = Math.round(row.opening_credit);
      ws.getCell(`F${r}`).value = Math.round(row.debit);
      ws.getCell(`G${r}`).value = Math.round(row.credit);
      ws.getCell(`H${r}`).value = Math.round(row.closing_debit);
      ws.getCell(`I${r}`).value = Math.round(row.closing_credit);
      ["D", "E", "F", "G", "H", "I"].forEach((col) => {
        ws.getCell(`${col}${r}`).numFmt = "#,##0;(#,##0);-";
      });
      r++;
    }

    ws.mergeCells(`A${r}:C${r}`);
    ws.getCell(`A${r}`).value = "Tổng cộng";
    ws.getCell(`D${r}`).value = Math.round(totals.opening_debit);
    ws.getCell(`E${r}`).value = Math.round(totals.opening_credit);
    ws.getCell(`F${r}`).value = Math.round(totals.debit);
    ws.getCell(`G${r}`).value = Math.round(totals.credit);
    ws.getCell(`H${r}`).value = Math.round(totals.closing_debit);
    ws.getCell(`I${r}`).value = Math.round(totals.closing_credit);
    ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" }, bottom: { style: "double" } };
      if (!["A", "B", "C"].includes(col)) cell.numFmt = "#,##0;(#,##0);-";
    });

    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 40;
    ws.getColumn(3).width = 8;
    for (let c = 4; c <= 9; c++) ws.getColumn(c).width = 16;

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return {
      filename: `BangTongHopCongNoPhaiTra_${data.from}_${data.to}.xlsx`,
      base64,
    };
  });
