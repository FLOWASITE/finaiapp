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
  vat_account: z.string().max(20).nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().max(64).nullable().optional(),
  line_type: z.enum(["goods", "service", "expense", "asset"]).default("goods"),
  note: z.string().max(500).nullable().optional(),
});

const VoucherUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  voucher_no: z.string().trim().min(1).max(64),
  voucher_date: z.string(),
  supplier_id: z.string().uuid().nullable().optional(),
  supplier_name: z.string().max(255).nullable().optional(),
  supplier_tax_id: z.string().max(20).nullable().optional(),
  supplier_address: z.string().max(500).nullable().optional(),
  customer_group: z.string().max(128).nullable().optional(),
  invoice_id: z.string().uuid().nullable().optional(),
  invoice_no: z.string().max(64).nullable().optional(),
  invoice_date: z.string().nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  currency: z.string().max(8).default("VND"),
  exchange_rate: z.number().positive().default(1),
  due_date: z.string().nullable().optional(),
  subtotal: z.number().nonnegative().default(0),
  vat_rate: z.number().min(0).max(100).default(0),
  vat_amount: z.number().nonnegative().default(0),
  discount_pct: z.number().min(0).max(100).default(0),
  discount_amount: z.number().nonnegative().default(0),
  total: z.number().nonnegative().default(0),
  debit_account: z.string().trim().min(1).max(20).default("156"),
  credit_account: z.string().trim().min(1).max(20).default("331"),
  vat_account: z.string().trim().max(20).nullable().optional(),
  payment_method: z.enum(["credit", "cash", "bank"]).default("credit"),
  payment_account: z.string().max(20).nullable().optional(),
  payment_status: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
  invoice_receipt_type: z.enum(["with_invoice", "without_invoice", "invoice_only"]).default("with_invoice"),
  is_purchase_cost: z.boolean().default(false),
  is_non_deductible: z.boolean().default(false),
  auto_allocate_cost: z.boolean().default(false),
  pay_now: z.boolean().default(false),
  create_stock_voucher: z.boolean().default(false),
  warehouse_id: z.string().uuid().nullable().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  department_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  lines: z.array(LineSchema).optional(),
});

// ============ LIST ============

export const listPurchaseVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    supplierId?: string;
  }) =>
    z
      .object({
        search: z.string().optional(),
        status: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        supplierId: z.string().uuid().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("purchase_vouchers")
      .select(
        "id, voucher_no, voucher_date, supplier_id, supplier_name, reason, total, payment_method, status, invoice_id, journal_entry_id, stock_voucher_id, cash_voucher_id, bank_voucher_id, created_at",
      )
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status) q = q.eq("status", data.status);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    if (data.from) q = q.gte("voucher_date", data.from);
    if (data.to) q = q.lte("voucher_date", data.to);
    if (data.search && data.search.trim()) {
      const s = `%${data.search.trim()}%`;
      q = q.or(`voucher_no.ilike.${s},supplier_name.ilike.${s},reason.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============ GET ============

export const getPurchaseVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: voucher, error } = await supabase
      .from("purchase_vouchers")
      .select("*, purchase_voucher_lines(*)")
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
    return { voucher, journal };
  });

// ============ AUTO VOUCHER NO ============

async function nextVoucherNo(supabase: any, tenantId: string, voucherDate: string) {
  const d = new Date(voucherDate);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `PMH-${ym}-`;
  const { data: last } = await supabase
    .from("purchase_vouchers")
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
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export const suggestVoucherNo = createServerFn({ method: "POST" })
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

export const createPurchaseVoucher = createServerFn({ method: "POST" })
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

    const { lines, id: _ignore, ...header } = data;

    const { data: row, error } = await supabase
      .from("purchase_vouchers")
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
      const { error: e2 } = await supabase.from("purchase_voucher_lines").insert(ins);
      if (e2) throw new Error(e2.message);
    }

    return { id: row.id };
  });

// ============ UPDATE ============

export const updatePurchaseVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    VoucherUpsertSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, lines, ...header } = data;

    const { data: cur } = await supabase
      .from("purchase_vouchers")
      .select("status")
      .eq("id", id)
      .single();
    if (!cur) throw new Error("Không tìm thấy phiếu");
    if (!["uploaded", "ai_read", "reviewed"].includes(cur.status)) {
      throw new Error("Phiếu đã ghi sổ — không thể sửa");
    }

    const { error } = await supabase
      .from("purchase_vouchers")
      .update(header)
      .eq("id", id);
    if (error) throw new Error(error.message);

    if (lines) {
      await supabase.from("purchase_voucher_lines").delete().eq("voucher_id", id);
      if (lines.length > 0) {
        await supabase.from("purchase_voucher_lines").insert(
          lines.map((l, i) => ({ ...l, voucher_id: id, line_order: i })),
        );
      }
    }
    return { ok: true };
  });

// ============ DELETE ============

export const deletePurchaseVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cur } = await supabase
      .from("purchase_vouchers")
      .select("status")
      .eq("id", data.id)
      .single();
    if (!cur) throw new Error("Không tìm thấy phiếu");
    if (cur.status === "posted") {
      throw new Error("Phiếu đã ghi sổ — huỷ trước khi xoá");
    }
    const { error } = await supabase.from("purchase_vouchers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ POST (ghi sổ) ============

export const postPurchaseVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: v, error: e0 } = await supabase
      .from("purchase_vouchers")
      .select("*, purchase_voucher_lines(*)")
      .eq("id", data.id)
      .single();
    if (e0 || !v) throw new Error("Không tìm thấy phiếu");
    if (v.status === "posted") throw new Error("Phiếu đã ghi sổ");
    if (v.status === "void") throw new Error("Phiếu đã huỷ");

    // Kỳ khoá
    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: v.voucher_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    // 1) Tạo bút toán — mỗi line 1 dòng Nợ TK kho/CP + tổng VAT 1 dòng Nợ 133* + 1 dòng Có
    const allLines: any[] = v.purchase_voucher_lines ?? [];
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

    const creditAcc =
      v.payment_method === "credit"
        ? v.credit_account || "331"
        : v.payment_account ||
          (v.payment_method === "cash" ? "1111" : "1121");

    const jLines: Array<{ account_code: string; debit: number; credit: number }> = [];

    if (hasLines) {
      // gộp theo TK nợ
      const byDebit = new Map<string, number>();
      for (const l of allLines) {
        const acc = l.debit_account || v.debit_account;
        byDebit.set(acc, (byDebit.get(acc) || 0) + Number(l.amount || 0));
      }
      for (const [acc, amt] of byDebit) {
        if (amt > 0) jLines.push({ account_code: acc, debit: amt, credit: 0 });
      }
      // gộp VAT theo TK thuế
      const byVat = new Map<string, number>();
      for (const l of allLines) {
        const va = Number(l.vat_amount || 0);
        if (va <= 0) continue;
        const acc = l.vat_account || v.vat_account || "1331";
        byVat.set(acc, (byVat.get(acc) || 0) + va);
      }
      for (const [acc, amt] of byVat) {
        jLines.push({ account_code: acc, debit: amt, credit: 0 });
      }
    } else {
      jLines.push({ account_code: v.debit_account, debit: subtotal, credit: 0 });
      if (vat > 0 && v.vat_account) {
        jLines.push({ account_code: v.vat_account, debit: vat, credit: 0 });
      }
    }
    jLines.push({ account_code: creditAcc, debit: 0, credit: total });

    // Resolve TK: nếu mã không có trong Hệ thống TK, lùi về TK cha (cắt ký tự cuối)
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
        description: v.reason || `Phiếu mua ${v.voucher_no}`,
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

    // 2) Phiếu nhập kho (nếu chọn)
    let stockVoucherId: string | null = null;
    const goodsLines = (v.purchase_voucher_lines ?? []).filter(
      (l: any) => l.product_id && l.line_type === "goods",
    );
    if (v.create_stock_voucher && goodsLines.length > 0) {
      const { data: sv, error: e3 } = await supabase
        .from("stock_vouchers")
        .insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          voucher_no: `NK-${v.voucher_no}`,
          voucher_type: "in",
          voucher_date: v.voucher_date,
          warehouse_id: v.warehouse_id,
          counter_account: creditAcc,
          reason: `Nhập kho từ ${v.voucher_no}`,
          journal_entry_id: entry.id,
        })
        .select("id")
        .single();
      if (e3) throw new Error(e3.message);
      stockVoucherId = sv?.id ?? null;

      for (const line of goodsLines) {
        const productId = line.product_id as string;
        const qty = Number(line.qty || 0);
        const unitCost = qty > 0 ? Number(line.amount || 0) / qty : Number(line.unit_price || 0);
        await supabase.from("stock_movements").insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          product_id: productId,
          warehouse_id: v.warehouse_id,
          voucher_id: stockVoucherId,
          movement_type: "in",
          qty,
          unit_cost: unitCost,
          movement_date: v.voucher_date,
          ref_type: "purchase_voucher",
          ref_id: v.id,
          note: `Nhập từ phiếu ${v.voucher_no}`,
        });
        const { data: prod } = await supabase
          .from("products")
          .select("on_hand, unit_cost")
          .eq("id", productId)
          .single();
        if (prod) {
          const oldQty = Number(prod.on_hand || 0);
          const oldCost = Number(prod.unit_cost || 0);
          const newQty = oldQty + qty;
          const newCost = newQty > 0 ? (oldQty * oldCost + qty * unitCost) / newQty : unitCost;
          await supabase
            .from("products")
            .update({ on_hand: newQty, unit_cost: newCost })
            .eq("id", productId);
        }
      }
    }

    // 3) Phiếu chi / UNC (nếu trả ngay)
    let cashVoucherId: string | null = null;
    let bankVoucherId: string | null = null;
    if (v.pay_now && v.payment_method === "cash") {
      const { data: cv, error: e4 } = await supabase
        .from("cash_vouchers")
        .insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          voucher_no: `PC-${v.voucher_no}`,
          voucher_type: "payment",
          voucher_date: v.voucher_date,
          amount: total,
          cash_account: v.payment_account || "1111",
          counter_account: v.debit_account,
          party_name: v.supplier_name,
          reason: `Thanh toán phiếu ${v.voucher_no}`,
          journal_entry_id: entry.id,
          status: "posted",
          posted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (e4) throw new Error(e4.message);
      cashVoucherId = cv?.id ?? null;
    } else if (v.pay_now && v.payment_method === "bank" && v.tenant_id) {
      // Cần bank_account_id — lấy bank account đầu tiên của tenant
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
            voucher_no: `UNC-${v.voucher_no}`,
            voucher_type: "payment",
            voucher_date: v.voucher_date,
            amount: total,
            counter_account: v.debit_account,
            party_name: v.supplier_name,
            reason: `Thanh toán phiếu ${v.voucher_no}`,
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
      .from("purchase_vouchers")
      .update({
        journal_entry_id: entry.id,
        stock_voucher_id: stockVoucherId,
        cash_voucher_id: cashVoucherId,
        bank_voucher_id: bankVoucherId,
        status: "posted",
        posted_at: new Date().toISOString(),
      })
      .eq("id", v.id);
    if (e6) throw new Error(e6.message);

    return { ok: true, entryId: entry.id };
  });

// ============ VOID ============

export const voidPurchaseVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reason?: string }) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(500).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: v } = await supabase
      .from("purchase_vouchers")
      .select(
        "id, tenant_id, status, voucher_no, voucher_date, journal_entry_id, stock_voucher_id, cash_voucher_id, bank_voucher_id",
      )
      .eq("id", data.id)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");
    if (v.status === "void") throw new Error("Phiếu đã huỷ");

    // Kỳ khoá
    const { data: locked } = await supabase.rpc("is_period_locked", {
      _user_id: userId,
      _date: v.voucher_date,
    });
    if (locked === true) throw new Error("Kỳ kế toán đã khoá");

    // Bút toán đảo
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
          description: `Huỷ phiếu ${v.voucher_no}${data.reason ? " — " + data.reason : ""}`,
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

    // Đảo kho
    if (v.stock_voucher_id) {
      const { data: movs } = await supabase
        .from("stock_movements")
        .select("product_id, warehouse_id, qty, unit_cost")
        .eq("voucher_id", v.stock_voucher_id);
      for (const m of movs ?? []) {
        await supabase.from("stock_movements").insert({
          user_id: userId,
          tenant_id: v.tenant_id,
          product_id: m.product_id,
          warehouse_id: m.warehouse_id,
          movement_type: "out",
          qty: m.qty,
          unit_cost: m.unit_cost,
          movement_date: new Date().toISOString().slice(0, 10),
          ref_type: "purchase_voucher_void",
          ref_id: v.id,
          note: `Huỷ phiếu ${v.voucher_no}`,
        });
        const { data: prod } = await supabase
          .from("products")
          .select("on_hand")
          .eq("id", m.product_id)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ on_hand: Number(prod.on_hand || 0) - Number(m.qty || 0) })
            .eq("id", m.product_id);
        }
      }
    }

    // Đánh dấu phiếu chi / UNC void
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
      .from("purchase_vouchers")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        void_reason: data.reason,
      })
      .eq("id", v.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ STICK STOCK (sinh phiếu nhập kho sau) ============

export const stickStockVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; warehouseId: string }) =>
    z
      .object({ id: z.string().uuid(), warehouseId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("purchase_vouchers")
      .select("*, purchase_voucher_lines(*)")
      .eq("id", data.id)
      .single();
    if (!v) throw new Error("Không tìm thấy phiếu");
    if (v.stock_voucher_id) throw new Error("Phiếu đã có phiếu nhập kho");
    const goodsLines = (v.purchase_voucher_lines ?? []).filter(
      (l: any) => l.product_id && l.line_type === "goods",
    );
    if (goodsLines.length === 0) throw new Error("Phiếu không có dòng hàng hoá");

    const { data: sv, error } = await supabase
      .from("stock_vouchers")
      .insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        voucher_no: `NK-${v.voucher_no}`,
        voucher_type: "in",
        voucher_date: v.voucher_date,
        warehouse_id: data.warehouseId,
        counter_account: v.credit_account,
        reason: `Nhập kho bổ sung từ ${v.voucher_no}`,
        journal_entry_id: v.journal_entry_id,
      })
      .select("id")
      .single();
    if (error || !sv) throw new Error(error?.message || "Không tạo được phiếu nhập kho");

    for (const line of goodsLines) {
      const productId = line.product_id as string;
      const qty = Number(line.qty || 0);
      const unitCost = qty > 0 ? Number(line.amount || 0) / qty : Number(line.unit_price || 0);
      await supabase.from("stock_movements").insert({
        user_id: userId,
        tenant_id: v.tenant_id,
        product_id: productId,
        warehouse_id: data.warehouseId,
        voucher_id: sv.id,
        movement_type: "in",
        qty,
        unit_cost: unitCost,
        movement_date: v.voucher_date,
        ref_type: "purchase_voucher",
        ref_id: v.id,
        note: `Nhập từ phiếu ${v.voucher_no}`,
      });
      const { data: prod } = await supabase
        .from("products")
        .select("on_hand, unit_cost")
        .eq("id", productId)
        .single();
      if (prod) {
        const oldQty = Number(prod.on_hand || 0);
        const oldCost = Number(prod.unit_cost || 0);
        const newQty = oldQty + qty;
        const newCost = newQty > 0 ? (oldQty * oldCost + qty * unitCost) / newQty : unitCost;
        await supabase
          .from("products")
          .update({ on_hand: newQty, unit_cost: newCost })
          .eq("id", productId);
      }
    }

    await supabase
      .from("purchase_vouchers")
      .update({ stock_voucher_id: sv.id, warehouse_id: data.warehouseId })
      .eq("id", v.id);

    return { ok: true, stockVoucherId: sv.id };
  });

// ============ List for autosuggest: invoices mua chưa có phiếu ============

export const listLinkablePurchaseInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { supplierId?: string }) =>
    z.object({ supplierId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("invoices")
      .select("id, invoice_no, issue_date, supplier_name, subtotal, vat_amount, total, supplier_id, file_path")
      .neq("status", "void")
      .order("issue_date", { ascending: false })
      .limit(50);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });
