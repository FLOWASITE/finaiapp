import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============ Schemas ============

const LineSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  product_code: z.string().max(64).nullable().optional(),
  product_name: z.string().max(255).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  unit: z.string().max(32).nullable().optional(),
  qty: z.number().nonnegative().default(1),
  unit_price: z.number().nonnegative().default(0),
  amount: z.number().nonnegative().default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  discount_amount: z.number().nonnegative().default(0),
  vat_rate: z.number().min(0).max(100).default(0),
  vat_amount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  debit_account: z.string().max(20).nullable().optional(),
  credit_account: z.string().max(20).nullable().optional(),
  vat_account: z.string().max(20).nullable().optional(),
  cost_amount: z.number().nonnegative().default(0),
  line_type: z.enum(["goods", "service"]).default("goods"),
  note: z.string().max(500).nullable().optional(),
});

const VoucherUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  voucher_no: z.string().trim().min(1).max(64),
  voucher_date: z.string(),
  due_date: z.string().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(255).nullable().optional(),
  customer_tax_id: z.string().max(20).nullable().optional(),
  customer_address: z.string().max(500).nullable().optional(),
  customer_group: z.string().max(128).nullable().optional(),
  buyer_name: z.string().max(255).nullable().optional(),
  salesperson_id: z.string().uuid().nullable().optional(),
  salesperson_name: z.string().max(255).nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  currency: z.string().max(8).default("VND"),
  exchange_rate: z.number().positive().default(1),
  subtotal: z.number().nonnegative().default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  discount_amount: z.number().nonnegative().default(0),
  vat_amount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  debit_account: z.string().trim().min(1).max(20).default("1311"),
  credit_account: z.string().trim().min(1).max(20).default("5111"),
  vat_account: z.string().trim().max(20).nullable().optional(),
  payment_method: z.enum(["credit", "cash", "bank"]).default("credit"),
  payment_account: z.string().max(20).nullable().optional(),
  payment_status: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  pay_now: z.boolean().default(false),
  issue_einvoice: z.boolean().default(false),
  create_stock_voucher: z.boolean().default(false),
  warehouse_id: z.string().uuid().nullable().optional(),
  sales_order_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(LineSchema).optional(),
  einvoice: z
    .object({
      invoice_template: z.string().max(64).nullable().optional(),
      invoice_series: z.string().max(64).nullable().optional(),
      invoice_no: z.string().max(64).nullable().optional(),
      issue_date: z.string().nullable().optional(),
      tct_lookup_code: z.string().max(128).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    })
    .nullable()
    .optional(),
});

// ============ EINVOICE UPSERT HELPER ============
async function upsertSalesEinvoice(
  supabase: any,
  userId: string,
  tenantId: string,
  voucherId: string,
  voucher: {
    voucher_date: string;
    customer_name?: string | null;
    customer_tax_id?: string | null;
    customer_address?: string | null;
    currency?: string | null;
    subtotal?: number;
    vat_amount?: number;
    total?: number;
    branch_id?: string | null;
    department_id?: string | null;
    project_id?: string | null;
    cost_center_id?: string | null;
  },
  einvoice: {
    invoice_template?: string | null;
    invoice_series?: string | null;
    invoice_no?: string | null;
    issue_date?: string | null;
    tct_lookup_code?: string | null;
    notes?: string | null;
  },
  existingEinvoiceId: string | null,
): Promise<string | null> {
  if (!einvoice.invoice_no || !einvoice.invoice_no.trim()) {
    throw new Error("Vui lòng nhập Số hoá đơn để xuất HĐ");
  }
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, company_name, tax_id, address")
    .eq("id", tenantId)
    .maybeSingle();

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    direction: "out" as const,
    source: "manual",
    seller_name: tenant?.company_name || tenant?.name || null,
    seller_tax_id: tenant?.tax_id || null,
    seller_address: tenant?.address || null,
    buyer_name: voucher.customer_name || null,
    buyer_tax_id: voucher.customer_tax_id || null,
    buyer_address: voucher.customer_address || null,
    invoice_template: einvoice.invoice_template || null,
    invoice_series: einvoice.invoice_series || null,
    invoice_no: einvoice.invoice_no.trim(),
    issue_date: einvoice.issue_date || voucher.voucher_date,
    currency: voucher.currency || "VND",
    exchange_rate: 1,
    subtotal: Number(voucher.subtotal || 0),
    vat_amount: Number(voucher.vat_amount || 0),
    total: Number(voucher.total || 0),
    tct_lookup_code: einvoice.tct_lookup_code || null,
    notes: einvoice.notes || null,
    branch_id: voucher.branch_id || null,
    department_id: voucher.department_id || null,
    project_id: voucher.project_id || null,
    cost_center_id: voucher.cost_center_id || null,
  };

  if (existingEinvoiceId) {
    const { error } = await supabase
      .from("einvoices")
      .update(payload)
      .eq("id", existingEinvoiceId);
    if (error) throw new Error("Lỗi cập nhật HĐĐT: " + error.message);
    return existingEinvoiceId;
  }
  const { data: row, error } = await supabase
    .from("einvoices")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    if ((error.message || "").toLowerCase().includes("duplicate"))
      throw new Error(`Số hoá đơn "${einvoice.invoice_no}" đã tồn tại`);
    throw new Error("Lỗi tạo HĐĐT: " + error.message);
  }
  return row?.id ?? null;
}

// ============ LIST ============

export const listSalesVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    customerId?: string;
  }) =>
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        customerId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("sales_vouchers")
      .select(
        `id, voucher_no, voucher_date, due_date, customer_id, customer_name, reason,
         subtotal, discount_amount, vat_amount, total, paid_amount,
         payment_method, payment_status, status, posted_at,
         journal_entry_id, einvoice_id, stock_voucher_id, cash_voucher_id, bank_voucher_id, created_at`,
      )
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.customerId) q = q.eq("customer_id", data.customerId);
    if (data.from) q = q.gte("voucher_date", data.from);
    if (data.to) q = q.lte("voucher_date", data.to);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`voucher_no.ilike.${s},customer_name.ilike.${s},reason.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    const einvoiceIds = Array.from(
      new Set(list.map((r) => r.einvoice_id).filter(Boolean) as string[]),
    );
    const stockIds = Array.from(
      new Set(list.map((r) => r.stock_voucher_id).filter(Boolean) as string[]),
    );

    const einvMap = new Map<string, string>();
    const stockMap = new Map<string, string>();
    if (einvoiceIds.length) {
      const { data: d } = await supabase
        .from("einvoices")
        .select("id, invoice_no")
        .in("id", einvoiceIds);
      for (const r of (d ?? []) as any[]) einvMap.set(r.id, r.invoice_no);
    }
    if (stockIds.length) {
      const { data: d } = await supabase
        .from("stock_vouchers")
        .select("id, voucher_no")
        .in("id", stockIds);
      for (const r of (d ?? []) as any[]) stockMap.set(r.id, r.voucher_no);
    }

    const enriched = list.map((r) => ({
      ...r,
      einvoice_no: r.einvoice_id ? einvMap.get(r.einvoice_id) ?? null : null,
      stock_voucher_no: r.stock_voucher_id
        ? stockMap.get(r.stock_voucher_id) ?? null
        : null,
    }));
    return { rows: enriched };
  });

// ============ GET ============

export const getSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: voucher, error } = await supabase
      .from("sales_vouchers")
      .select("*, sales_voucher_lines(*)")
      .eq("id", data.id)
      .single();
    if (error || !voucher) throw new Error("Không tìm thấy phiếu");

    let journal: {
      id: string;
      entry_date: string;
      description: string | null;
      journal_lines: Array<{ account_code: string; debit: number; credit: number; line_order: number }>;
    } | null = null;
    if (voucher.journal_entry_id) {
      const { data: je } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, journal_lines(account_code, debit, credit, line_order)")
        .eq("id", voucher.journal_entry_id)
        .single();
      journal = je as typeof journal;
    }

    let einvoice: any = null;
    if (voucher.einvoice_id) {
      const { data: e } = await supabase
        .from("einvoices")
        .select(
          "id, invoice_template, invoice_series, invoice_no, issue_date, tct_lookup_code, notes",
        )
        .eq("id", voucher.einvoice_id)
        .maybeSingle();
      einvoice = e ?? null;
    }
    return { voucher, journal, einvoice };
  });

// ============ AUTO VOUCHER NO ============

async function nextVoucherNo(supabase: any, tenantId: string, voucherDate: string) {
  const d = new Date(voucherDate);
  const yy = String(d.getFullYear()).slice(-2);
  const prefix = `BH${yy}-`;
  const { data: last } = await supabase
    .from("sales_vouchers")
    .select("voucher_no")
    .eq("tenant_id", tenantId)
    .ilike("voucher_no", `${prefix}%`)
    .order("voucher_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = 1;
  if (last?.voucher_no) {
    const m = /(\d+)$/.exec(last.voucher_no);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export const suggestSalesVoucherNo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { voucher_date: string }) =>
    z.object({ voucher_date: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .single();
    const tenantId = profile?.active_tenant_id;
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");
    const no = await nextVoucherNo(supabase, tenantId, data.voucher_date);
    return { voucher_no: no };
  });

// ============ CREATE ============

export const createSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => VoucherUpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .single();
    const tenantId = profile?.active_tenant_id;
    if (!tenantId) throw new Error("Chưa chọn doanh nghiệp hoạt động");

    const { lines, einvoice, id: _ignore, ...header } = data;

    const { data: row, error } = await supabase
      .from("sales_vouchers")
      .insert({
        ...header,
        user_id: userId,
        tenant_id: tenantId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message || "Không tạo được phiếu");

    if (lines && lines.length > 0) {
      const ins = lines.map((l, i) => ({ ...l, voucher_id: row.id, line_order: i }));
      const { error: e2 } = await supabase.from("sales_voucher_lines").insert(ins);
      if (e2) throw new Error(e2.message);
    }

    if (header.issue_einvoice && einvoice) {
      const einvId = await upsertSalesEinvoice(
        supabase,
        userId,
        tenantId,
        row.id,
        header,
        einvoice,
        null,
      );
      if (einvId) {
        await supabase
          .from("sales_vouchers")
          .update({ einvoice_id: einvId })
          .eq("id", row.id);
      }
    }

    return { id: row.id };
  });

// ============ UPDATE ============

export const updateSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    VoucherUpsertSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, lines, einvoice, ...header } = data;

    const { data: cur } = await supabase
      .from("sales_vouchers")
      .select("status, tenant_id, einvoice_id")
      .eq("id", id)
      .single();
    if (!cur) throw new Error("Không tìm thấy phiếu");
    if (!["uploaded", "ai_read", "reviewed"].includes(cur.status)) {
      throw new Error("Phiếu đã ghi sổ — không thể sửa");
    }

    const { error } = await supabase
      .from("sales_vouchers")
      .update(header)
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (lines) {
      await supabase.from("sales_voucher_lines").delete().eq("voucher_id", id);
      if (lines.length > 0) {
        const { error: e2 } = await supabase.from("sales_voucher_lines").insert(
          lines.map((l, i) => ({ ...l, voucher_id: id, line_order: i })),
        );
        if (e2) throw new Error(e2.message);
      }
    }

    if (header.issue_einvoice && einvoice) {
      const einvId = await upsertSalesEinvoice(
        supabase,
        userId,
        cur.tenant_id as string,
        id,
        header,
        einvoice,
        cur.einvoice_id ?? null,
      );
      if (einvId && einvId !== cur.einvoice_id) {
        await supabase
          .from("sales_vouchers")
          .update({ einvoice_id: einvId })
          .eq("id", id);
      }
    } else if (!header.issue_einvoice && cur.einvoice_id) {
      await supabase
        .from("sales_vouchers")
        .update({ einvoice_id: null })
        .eq("id", id);
    }
    return { ok: true };
  });

// ============ DELETE ============

export const deleteSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur } = await supabase
      .from("sales_vouchers")
      .select("status")
      .eq("id", data.id)
      .single();
    if (!cur) throw new Error("Không tìm thấy phiếu");
    if (cur.status === "posted") {
      throw new Error("Phiếu đã ghi sổ — huỷ trước khi xoá");
    }
    const { error } = await supabase.from("sales_vouchers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ POST (ghi sổ) ============

export const postSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: v, error: e0 } = await supabase
      .from("sales_vouchers")
      .select("*, sales_voucher_lines(*)")
      .eq("id", data.id)
      .single();
    if (e0 || !v) throw new Error("Không tìm thấy phiếu");
    if (v.status === "posted") throw new Error("Phiếu đã ghi sổ");
    if (v.status === "void") throw new Error("Phiếu đã huỷ");

    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: v.voucher_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    const allLines: any[] = v.sales_voucher_lines ?? [];
    const hasLines = allLines.length > 0;

    const subtotal = hasLines
      ? allLines.reduce((s, l) => s + Number(l.amount || 0), 0)
      : Number(v.subtotal || 0);
    const vat = hasLines
      ? allLines.reduce((s, l) => s + Number(l.vat_amount || 0), 0)
      : Number(v.vat_amount || 0);
    const total = hasLines
      ? allLines.reduce((s, l) => s + Number(l.total || 0), 0)
      : Number(v.total || subtotal + vat);

    // TK nợ: nếu thu ngay → TM/TGNH, ngược lại 131
    const debitAcc =
      v.pay_now && v.payment_method === "cash"
        ? v.payment_account || "1111"
        : v.pay_now && v.payment_method === "bank"
          ? v.payment_account || "1121"
          : v.debit_account || "131";

    const jLines: Array<{ account_code: string; debit: number; credit: number }> = [];

    // Nợ TK công nợ / tiền: tổng
    jLines.push({ account_code: debitAcc, debit: total, credit: 0 });

    if (hasLines) {
      // Có TK doanh thu (gộp theo TK)
      const byCredit = new Map<string, number>();
      for (const l of allLines) {
        const acc = l.credit_account || v.credit_account;
        byCredit.set(acc, (byCredit.get(acc) || 0) + Number(l.amount || 0));
      }
      for (const [acc, amt] of byCredit) {
        if (amt > 0) jLines.push({ account_code: acc, debit: 0, credit: amt });
      }
      // Có TK thuế GTGT đầu ra
      const byVat = new Map<string, number>();
      for (const l of allLines) {
        const va = Number(l.vat_amount || 0);
        if (va <= 0) continue;
        const acc = l.vat_account || v.vat_account || "33311";
        byVat.set(acc, (byVat.get(acc) || 0) + va);
      }
      for (const [acc, amt] of byVat) {
        jLines.push({ account_code: acc, debit: 0, credit: amt });
      }
    } else {
      jLines.push({ account_code: v.credit_account, debit: 0, credit: subtotal });
      if (vat > 0 && v.vat_account) {
        jLines.push({ account_code: v.vat_account, debit: 0, credit: vat });
      }
    }

    // Resolve TK: fallback lùi cha
    const uniqueCodes = Array.from(new Set(jLines.map((l) => l.account_code).filter(Boolean)));
    const { data: existing } = await supabase
      .from("chart_of_accounts")
      .select("code")
      .in("code", uniqueCodes);
    const existingSet = new Set((existing ?? []).map((r: any) => r.code));
    const missing = uniqueCodes.filter((c) => !existingSet.has(c));
    const resolveMap = new Map<string, string>();
    if (missing.length > 0) {
      const { data: allCoa } = await supabase.from("chart_of_accounts").select("code");
      const allSet = new Set((allCoa ?? []).map((r: any) => r.code));
      for (const code of missing) {
        let p = code;
        while (p.length > 1) {
          p = p.slice(0, -1);
          if (allSet.has(p)) {
            resolveMap.set(code, p);
            break;
          }
        }
        if (!resolveMap.has(code)) {
          throw new Error(
            `Tài khoản "${code}" chưa có trong Hệ thống tài khoản. Vui lòng thêm trước khi ghi sổ.`,
          );
        }
      }
    }

    const { data: entry, error: e1 } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        entry_date: v.voucher_date,
        description: v.reason || `Phiếu bán ${v.voucher_no}`,
        branch_id: v.branch_id,
        project_id: v.project_id,
        cost_center_id: v.cost_center_id,
      })
      .select("id")
      .single();
    if (e1 || !entry) throw new Error(e1?.message || "Không tạo được bút toán");

    const { error: e2 } = await supabase.from("journal_lines").insert(
      jLines.map((l, i) => ({
        entry_id: entry.id,
        account_code: resolveMap.get(l.account_code) ?? l.account_code,
        debit: l.debit,
        credit: l.credit,
        line_order: i,
      })),
    );
    if (e2) throw new Error(e2.message);

    // 2) Phiếu xuất kho + bút toán giá vốn (nếu chọn)
    let stockVoucherId: string | null = null;
    const goodsLines = allLines.filter(
      (l: any) => l.product_id && l.line_type === "goods",
    );
    if (v.create_stock_voucher && goodsLines.length > 0 && v.warehouse_id) {
      const { data: sv, error: e3 } = await supabase
        .from("stock_vouchers")
        .insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          voucher_no: `XK-${v.voucher_no}`,
          voucher_type: "out",
          voucher_date: v.voucher_date,
          warehouse_id: v.warehouse_id,
          counter_account: "632",
          reason: `Xuất kho bán hàng ${v.voucher_no}`,
          journal_entry_id: entry.id,
        })
        .select("id")
        .single();
      if (e3) throw new Error(e3.message);
      stockVoucherId = sv?.id ?? null;

      let totalCogs = 0;
      for (const line of goodsLines) {
        const productId = line.product_id as string;
        const qty = Number(line.qty || 0);
        const { data: prod } = await supabase
          .from("products")
          .select("on_hand, unit_cost")
          .eq("id", productId)
          .single();
        const unitCost = Number(prod?.unit_cost || 0);
        const cogs = qty * unitCost;
        totalCogs += cogs;

        await supabase.from("stock_movements").insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          product_id: productId,
          warehouse_id: v.warehouse_id,
          voucher_id: stockVoucherId,
          movement_type: "out",
          qty: -qty,
          unit_cost: unitCost,
          movement_date: v.voucher_date,
          ref_type: "sales_voucher",
          ref_id: v.id,
          note: `Xuất bán ${v.voucher_no}`,
        });
        if (prod) {
          await supabase
            .from("products")
            .update({ on_hand: Number(prod.on_hand || 0) - qty })
            .eq("id", productId);
        }
      }
      // Bút toán giá vốn: Nợ 632 / Có 156
      if (totalCogs > 0) {
        await supabase.from("journal_lines").insert([
          {
            entry_id: entry.id,
            account_code: resolveMap.get("632") ?? "632",
            debit: totalCogs,
            credit: 0,
            line_order: jLines.length,
          },
          {
            entry_id: entry.id,
            account_code: resolveMap.get("156") ?? "156",
            debit: 0,
            credit: totalCogs,
            line_order: jLines.length + 1,
          },
        ]);
      }
    }

    // 3) Phiếu thu / báo có (nếu thu ngay)
    let cashVoucherId: string | null = null;
    let bankVoucherId: string | null = null;
    if (v.pay_now && v.payment_method === "cash") {
      const { data: cv, error: e4 } = await supabase
        .from("cash_vouchers")
        .insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          voucher_no: `PT-${v.voucher_no}`,
          voucher_type: "receipt",
          voucher_date: v.voucher_date,
          amount: total,
          cash_account: v.payment_account || "1111",
          counter_account: v.credit_account,
          party_name: v.customer_name,
          reason: `Thu tiền phiếu bán ${v.voucher_no}`,
          journal_entry_id: entry.id,
          status: "posted",
          posted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e4) throw new Error(e4.message);
      cashVoucherId = cv?.id ?? null;
    } else if (v.pay_now && v.payment_method === "bank" && v.tenant_id) {
      const { data: ba } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("tenant_id", v.tenant_id)
        .limit(1)
        .maybeSingle();
      if (ba?.id) {
        const { data: bv, error: e5 } = await supabase
          .from("bank_vouchers")
          .insert({
            user_id: userId,
            tenant_id: v.tenant_id,
            bank_account_id: ba.id,
            voucher_no: `BC-${v.voucher_no}`,
            voucher_type: "receipt",
            voucher_date: v.voucher_date,
            amount: total,
            counter_account: v.credit_account,
            party_name: v.customer_name,
            reason: `Thu tiền phiếu bán ${v.voucher_no}`,
            journal_entry_id: entry.id,
            status: "posted",
            posted_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (e5) throw new Error(e5.message);
        bankVoucherId = bv?.id ?? null;
      }
    }

    // 4) Cập nhật phiếu → posted
    const { error: e6 } = await supabase
      .from("sales_vouchers")
      .update({
        journal_entry_id: entry.id,
        stock_voucher_id: stockVoucherId,
        cash_voucher_id: cashVoucherId,
        bank_voucher_id: bankVoucherId,
        status: "posted",
        posted_at: new Date().toISOString(),
        payment_status: v.pay_now ? "paid" : v.payment_status,
        paid_amount: v.pay_now ? total : Number(v.paid_amount || 0),
      })
      .eq("id", v.id);
    if (e6) throw new Error(e6.message);

    return { ok: true, entryId: entry.id };
  });

// ============ VOID ============

export const voidSalesVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: v } = await supabase
      .from("sales_vouchers")
      .select(
        "id, tenant_id, status, voucher_no, voucher_date, journal_entry_id, stock_voucher_id, cash_voucher_id, bank_voucher_id",
      )
      .eq("id", data.id)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");
    if (v.status === "void") throw new Error("Phiếu đã huỷ");

    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: v.voucher_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    if (v.journal_entry_id) {
      const { data: oldLines } = await supabase
        .from("journal_lines")
        .select("account_code, debit, credit, line_order")
        .eq("entry_id", v.journal_entry_id);
      const { data: rev } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          entry_date: new Date().toISOString().slice(0, 10),
          description: `Huỷ phiếu bán ${v.voucher_no}${data.reason ? " — " + data.reason : ""}`,
        })
        .select("id")
        .single();
      if (rev && oldLines) {
        await supabase.from("journal_lines").insert(
          oldLines.map((l) => ({
            entry_id: rev.id,
            account_code: l.account_code,
            debit: l.credit,
            credit: l.debit,
            line_order: l.line_order,
          })),
        );
      }
    }

    if (v.cash_voucher_id) {
      await supabase
        .from("cash_vouchers")
        .update({ status: "void", voided_at: new Date().toISOString(), void_reason: data.reason })
        .eq("id", v.cash_voucher_id);
    }
    if (v.bank_voucher_id) {
      await supabase
        .from("bank_vouchers")
        .update({ status: "void", voided_at: new Date().toISOString(), void_reason: data.reason })
        .eq("id", v.bank_voucher_id);
    }

    const { error } = await supabase
      .from("sales_vouchers")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        void_reason: data.reason,
      })
      .eq("id", v.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ RECORD PAYMENT (cash/bank) ============
// Tạo phiếu thu tiền mặt / báo có NH cho 1 phiếu bán hàng đã ghi sổ.
// Nợ 111/112 — Có 131 (theo voucher.credit_account/customer A/R).
export const recordSalesVoucherReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { voucher_id: string; method: "cash" | "bank"; amount: number; pay_date?: string; reference?: string }) =>
    z.object({
      voucher_id: z.string().uuid(),
      method: z.enum(["cash", "bank"]),
      amount: z.number().positive(),
      pay_date: z.string().optional(),
      reference: z.string().max(255).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v, error: e0 } = await supabase
      .from("sales_vouchers")
      .select("id, tenant_id, voucher_no, voucher_date, customer_name, status, total, paid_amount, credit_account")
      .eq("id", data.voucher_id)
      .single();
    if (e0 || !v) throw new Error("Không tìm thấy phiếu");
    if (v.status !== "posted") throw new Error("Phiếu chưa ghi sổ — không thu được tiền");

    const total = Number(v.total || 0);
    const paid = Number(v.paid_amount || 0);
    const remain = Math.max(0, total - paid);
    if (data.amount > remain + 0.01)
      throw new Error(`Số tiền vượt công nợ còn lại (${remain.toLocaleString("vi-VN")})`);

    const payDate = data.pay_date || new Date().toISOString().slice(0, 10);
    const debitAcc = data.method === "cash" ? "1111" : "1121";
    const creditAcc = v.credit_account || "131";

    // 1) Journal entry
    const { data: entry, error: e1 } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        entry_date: payDate,
        description: `Thu tiền phiếu bán ${v.voucher_no} — ${v.customer_name ?? ""}`,
      })
      .select("id")
      .single();
    if (e1 || !entry) throw new Error(e1?.message || "Không tạo được bút toán");

    await supabase.from("journal_lines").insert([
      { entry_id: entry.id, account_code: debitAcc, debit: data.amount, credit: 0, line_order: 0 },
      { entry_id: entry.id, account_code: creditAcc, debit: 0, credit: data.amount, line_order: 1 },
    ]);

    // 2) Cash / bank voucher
    if (data.method === "cash") {
      await supabase.from("cash_vouchers").insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        voucher_no: `PT-${v.voucher_no}`,
        voucher_type: "receipt",
        voucher_date: payDate,
        amount: data.amount,
        cash_account: debitAcc,
        counter_account: creditAcc,
        party_name: v.customer_name,
        reason: `Thu tiền phiếu bán ${v.voucher_no}`,
        journal_entry_id: entry.id,
        status: "posted",
        posted_at: new Date().toISOString(),
      });
    } else {
      if (!v.tenant_id) throw new Error("Phiếu chưa gắn với chi nhánh/tenant");
      const { data: ba } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("tenant_id", v.tenant_id as string)
        .limit(1)
        .maybeSingle();
      if (!ba?.id) throw new Error("Chưa có tài khoản ngân hàng. Vui lòng thêm trong mục Ngân hàng.");
      await supabase.from("bank_vouchers").insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        bank_account_id: ba.id,
        voucher_no: `BC-${v.voucher_no}`,
        voucher_type: "receipt",
        voucher_date: payDate,
        amount: data.amount,
        counter_account: creditAcc,
        party_name: v.customer_name,
        reference: data.reference || null,
        reason: `Thu tiền phiếu bán ${v.voucher_no}`,
        journal_entry_id: entry.id,
        status: "posted",
        posted_at: new Date().toISOString(),
      });
    }

    // 3) Update paid_amount + payment_status
    const newPaid = paid + data.amount;
    const newStatus = newPaid >= total - 0.01 ? "paid" : "partial";
    const { error: e3 } = await supabase
      .from("sales_vouchers")
      .update({ paid_amount: newPaid, payment_status: newStatus })
      .eq("id", v.id);
    if (e3) throw new Error(e3.message);

    return { ok: true };
  });
