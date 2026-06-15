import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertTenantMember, resolveActiveTenantId } from "@/lib/auth/active-tenant.server";

const ProductSchema = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  item_type: z.enum(["goods", "service", "combo"]).default("goods"),
  unit: z.string().min(1).max(20).default("cái"),
  unit_cost: z.number().min(0).default(0),
  unit_price: z.number().min(0).default(0),
  stock_account: z.string().default("156"),
  revenue_account: z.string().default("511"),
  cogs_account: z.string().default("632"),
  expense_account: z.string().nullable().optional(),
  vat_rate: z.number().min(0).max(100).default(10),
  category_id: z.string().uuid().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  min_stock: z.number().min(0).default(0),
  max_stock: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  can_be_sold: z.boolean().default(true),
  can_be_purchased: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
}).refine((d) => d.can_be_sold || d.can_be_purchased, {
  message: "Mặt hàng phải có thể bán hoặc có thể mua",
  path: ["can_be_sold"],
}).refine((d) => !d.can_be_sold || !!d.revenue_account?.trim(), {
  message: "Cần khai báo TK doanh thu khi cho phép bán",
  path: ["revenue_account"],
}).refine(
  (d) => !(d.can_be_purchased && d.item_type === "service") || !!d.expense_account?.toString().trim(),
  { message: "Cần khai báo TK chi phí khi mua dịch vụ", path: ["expense_account"] },
);


export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    let q = supabase
      .from("products")
      .select("*, product_categories(name)")
      .eq("tenant_id", tenantId)
      .order("code");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  });

export const getProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: product, error: pErr }, { data: movements, error: mErr }] = await Promise.all([
      supabase.from("products").select("*, product_categories(name)").eq("id", data.id).maybeSingle(),
      supabase
        .from("stock_movements")
        .select("*")
        .eq("product_id", data.id)
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (!product) throw new Error("Không tìm thấy mặt hàng");
    if (mErr) throw new Error(mErr.message);
    // running balance
    let running = 0;
    const kardex = (movements ?? []).map((m: any) => {
      const qtyIn = m.movement_type === "in" ? Number(m.qty) : 0;
      const qtyOut = m.movement_type === "out" ? Number(m.qty) : 0;
      running += qtyIn - qtyOut;
      return { ...m, qty_in: qtyIn, qty_out: qtyOut, balance: running };
    });
    // reverse to show newest first
    return { product, kardex: kardex.reverse() };
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProductSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    let productId: string;
    if (data.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      productId = data.id;
    } else {
      const { data: row, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw new Error(error.message);
      productId = row!.id;
    }
    // Refresh embedding for semantic item resolution (best-effort)
    if (tenantId) {
      try {
        const { ensureProductEmbedding } = await import("@/lib/items/embeddings.server");
        await ensureProductEmbedding(supabase, tenantId, {
          id: productId,
          code: data.code,
          name: data.name,
          aliases: null,
        });
      } catch (e) {
        console.warn("[upsertProduct] embedding refresh failed", e);
      }
    }
    return { id: productId };
  });

const MovementSchema = z.object({
  product_id: z.string().uuid(),
  movement_type: z.enum(["in", "out"]),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
  movement_date: z.string(),
  note: z.string().max(255).optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  counter_account: z.string().min(2).max(20).optional(),
  voucher_no: z.string().max(50).optional(),
  post_journal: z.boolean().optional().default(true),
});

function yyyy(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return String(d.getFullYear());
}

export async function nextStockVoucherNo(
  supabase: any,
  tenantId: string | null,
  userId: string,
  type: "in" | "out",
  movementDate: string,
) {
  // New format: PNK{YYYY}-{00001} or PXK{YYYY}-{00001}
  const prefix = `${type === "in" ? "PNK" : "PXK"}${yyyy(movementDate)}-`;
  // Legacy formats also scanned to keep numbering monotonic
  const legacyPrefix = `${type === "in" ? "PN" : "PX"}${yyyy(movementDate)}${String(new Date(movementDate).getMonth() + 1).padStart(2, "0")}/`;
  let qv = supabase.from("stock_vouchers").select("voucher_no")
    .eq("voucher_type", type)
    .or(`voucher_no.ilike.${prefix}%,voucher_no.ilike.${legacyPrefix}%`);
  qv = tenantId ? qv.eq("tenant_id", tenantId) : qv.eq("user_id", userId);
  const { data: vs, error: vErr } = await qv;
  if (vErr) throw new Error(vErr.message);
  const reNew = new RegExp(`^${prefix.replace("-", "\\-")}(\\d+)`);
  const reLegacy = new RegExp(`^${legacyPrefix.replace("/", "\\/")}(\\d+)`);
  let max = 0;
  for (const r of (vs as any[]) ?? []) {
    const m = reNew.exec(r?.voucher_no ?? "") || reLegacy.exec(r?.voucher_no ?? "");
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}


export const previewStockVoucherNo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { type: "in" | "out"; movement_date: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);
    const code = await nextStockVoucherNo(
      supabase, tenantId, userId, data.type, data.movement_date,
    );
    return { code };
  });

export const recordMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MovementSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("on_hand, unit_cost, tenant_id, item_type, code, name, stock_account")
      .eq("id", data.product_id)
      .single();
    if (pErr || !product) throw new Error("Không tìm thấy mặt hàng");
    if ((product as any).item_type === "service") {
      throw new Error("Dịch vụ không quản lý tồn kho");
    }

    if (!(data.qty > 0)) throw new Error("Số lượng phải lớn hơn 0");
    if (data.movement_type === "in" && !(data.unit_cost > 0)) {
      throw new Error("Đơn giá nhập phải lớn hơn 0");
    }

    let newOnHand = Number(product.on_hand);
    let newCost = Number(product.unit_cost);
    let effectiveUnit = data.unit_cost;
    if (data.movement_type === "in") {
      const totalQty = newOnHand + data.qty;
      newCost = totalQty > 0
        ? (newOnHand * newCost + data.qty * data.unit_cost) / totalQty
        : data.unit_cost;
      newOnHand = totalQty;
    } else {
      if (data.qty > newOnHand) throw new Error(`Tồn không đủ. Hiện có ${newOnHand}`);
      newOnHand -= data.qty;
      effectiveUnit = Number(product.unit_cost); // xuất theo giá bình quân
    }

    const voucherNo = data.voucher_no?.trim() || (await nextStockVoucherNo(
      supabase, (product as any).tenant_id ?? null, userId, data.movement_type, data.movement_date,
    ));

    // Auto journal entry
    let journalEntryId: string | null = null;
    if (data.post_journal !== false) {
      const stockAcc = (product as any).stock_account || "156";
      const counter = data.counter_account || (data.movement_type === "in" ? "1111" : "632");
      const amount = +(data.qty * effectiveUnit).toFixed(2);
      const debit = data.movement_type === "in" ? stockAcc : counter;
      const credit = data.movement_type === "in" ? counter : stockAcc;
      const desc =
        `${data.movement_type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho"} ${voucherNo}` +
        ` — ${(product as any).code} ${(product as any).name}`;

      const { data: entry, error: eErr } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: (product as any).tenant_id ?? null,
          entry_date: data.movement_date,
          description: desc,
        })
        .select("id")
        .single();
      if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");
      journalEntryId = entry.id;
      const { error: lErr } = await supabase.from("journal_lines").insert([
        { entry_id: entry.id, account_code: debit, debit: amount, credit: 0, line_order: 0 },
        { entry_id: entry.id, account_code: credit, debit: 0, credit: amount, line_order: 1 },
      ]);
      if (lErr) throw new Error(lErr.message);
    }

    const noteWithVoucher = data.note?.trim() ? `${voucherNo} — ${data.note.trim()}` : voucherNo;

    await supabase.from("stock_movements").insert({
      user_id: userId,
      tenant_id: (product as any).tenant_id ?? null,
      product_id: data.product_id,
      movement_type: data.movement_type,
      qty: data.qty,
      unit_cost: effectiveUnit,
      movement_date: data.movement_date,
      note: noteWithVoucher,
      ref_type: data.movement_type === "in" ? "stock_voucher_in" : "stock_voucher_out",
      ref_id: journalEntryId,
      warehouse_id: data.warehouse_id ?? null,
    });

    await supabase
      .from("products")
      .update({ on_hand: newOnHand, unit_cost: newCost })
      .eq("id", data.product_id);

    return { ok: true, on_hand: newOnHand, unit_cost: newCost, voucher_no: voucherNo, journal_entry_id: journalEntryId };
  });

async function recomputeProductStock(supabase: any, productId: string) {
  const { data: movs, error } = await supabase
    .from("stock_movements")
    .select("movement_type, qty, unit_cost, movement_date, created_at")
    .eq("product_id", productId)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  let qty = 0;
  let cost = 0;
  for (const m of (movs ?? []) as any[]) {
    const q = Number(m.qty);
    const u = Number(m.unit_cost || 0);
    if (m.movement_type === "in") {
      const total = qty + q;
      cost = total > 0 ? (qty * cost + q * u) / total : u;
      qty = total;
    } else {
      if (q > qty + 1e-9) {
        throw new Error(`Không thể cập nhật: tồn kho sẽ âm tại ${m.movement_date}`);
      }
      qty -= q;
    }
  }
  const { error: uErr } = await supabase
    .from("products")
    .update({ on_hand: qty, unit_cost: cost })
    .eq("id", productId);
  if (uErr) throw new Error(uErr.message);
  return { on_hand: qty, unit_cost: cost };
}

async function deleteMovementInternal(supabase: any, id: string) {
  const { data: mv, error } = await supabase
    .from("stock_movements")
    .select("id, product_id, ref_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!mv) throw new Error("Không tìm thấy phiếu");

  if (mv.ref_id) {
    await supabase.from("journal_lines").delete().eq("entry_id", mv.ref_id);
    await supabase.from("journal_entries").delete().eq("id", mv.ref_id);
  }
  const { error: dErr } = await supabase.from("stock_movements").delete().eq("id", id);
  if (dErr) throw new Error(dErr.message);
  return mv as { id: string; product_id: string; ref_id: string | null };
}

export const cancelMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const mv = await deleteMovementInternal(supabase, data.id);
    const res = await recomputeProductStock(supabase, mv.product_id);
    return { ok: true, ...res };
  });

const UpdateMovementSchema = z.object({
  id: z.string().uuid(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0),
  movement_date: z.string(),
  note: z.string().max(255).optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  counter_account: z.string().min(2).max(20).optional(),
  post_journal: z.boolean().optional().default(true),
});

export const updateMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateMovementSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Load original to keep voucher_no, product_id, movement_type
    const { data: orig, error: oErr } = await supabase
      .from("stock_movements")
      .select("id, product_id, movement_type, note, ref_id, tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!orig) throw new Error("Không tìm thấy phiếu");

    const voucherNo = String(orig.note ?? "").split(" — ")[0] || undefined;

    // Load product
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("tenant_id, item_type, code, name, stock_account")
      .eq("id", orig.product_id)
      .single();
    if (pErr || !product) throw new Error("Không tìm thấy mặt hàng");

    // 1) Remove old movement + journal
    await deleteMovementInternal(supabase, data.id);

    // 2) Recompute product stock so we have correct AVCO before applying new movement
    let snapshot = await recomputeProductStock(supabase, orig.product_id);

    // 3) Validate & apply new movement (mirrors recordMovement)
    if (orig.movement_type === "in" && !(data.unit_cost > 0)) {
      throw new Error("Đơn giá nhập phải lớn hơn 0");
    }

    let newOnHand = snapshot.on_hand;
    let newCost = snapshot.unit_cost;
    let effectiveUnit = data.unit_cost;
    if (orig.movement_type === "in") {
      const total = newOnHand + data.qty;
      newCost = total > 0 ? (newOnHand * newCost + data.qty * data.unit_cost) / total : data.unit_cost;
      newOnHand = total;
    } else {
      if (data.qty > newOnHand) throw new Error(`Tồn không đủ. Hiện có ${newOnHand}`);
      newOnHand -= data.qty;
      effectiveUnit = newCost;
    }

    // 4) Recreate journal entry
    let journalEntryId: string | null = null;
    if (data.post_journal !== false) {
      const stockAcc = (product as any).stock_account || "156";
      const counter = data.counter_account || (orig.movement_type === "in" ? "1111" : "632");
      const amount = +(data.qty * effectiveUnit).toFixed(2);
      const debit = orig.movement_type === "in" ? stockAcc : counter;
      const credit = orig.movement_type === "in" ? counter : stockAcc;
      const desc =
        `${orig.movement_type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho"} ${voucherNo ?? ""}` +
        ` — ${(product as any).code} ${(product as any).name} (cập nhật)`;
      const { data: entry, error: eErr } = await supabase
        .from("journal_entries")
        .insert({
          user_id: userId,
          tenant_id: (product as any).tenant_id ?? null,
          entry_date: data.movement_date,
          description: desc,
        })
        .select("id")
        .single();
      if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");
      journalEntryId = entry.id;
      const { error: lErr } = await supabase.from("journal_lines").insert([
        { entry_id: entry.id, account_code: debit, debit: amount, credit: 0, line_order: 0 },
        { entry_id: entry.id, account_code: credit, debit: 0, credit: amount, line_order: 1 },
      ]);
      if (lErr) throw new Error(lErr.message);
    }

    const noteWithVoucher = data.note?.trim()
      ? `${voucherNo ?? ""} — ${data.note.trim()}`
      : (voucherNo ?? "");

    const { error: iErr } = await supabase.from("stock_movements").insert({
      user_id: userId,
      tenant_id: (product as any).tenant_id ?? null,
      product_id: orig.product_id,
      movement_type: orig.movement_type,
      qty: data.qty,
      unit_cost: effectiveUnit,
      movement_date: data.movement_date,
      note: noteWithVoucher,
      ref_type: orig.movement_type === "in" ? "stock_voucher_in" : "stock_voucher_out",
      ref_id: journalEntryId,
      warehouse_id: data.warehouse_id ?? null,
    });
    if (iErr) throw new Error(iErr.message);

    // 5) Final recompute (handles any intervening AVCO drift for later out movements)
    const final = await recomputeProductStock(supabase, orig.product_id);
    return { ok: true, voucher_no: voucherNo, journal_entry_id: journalEntryId, ...final };
  });

export const getStockReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("products")
      .select("id, code, name, unit, item_type, on_hand, unit_cost, min_stock, is_active, category_id, product_categories(name)")
      .order("code");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      value: p.item_type === "service" ? 0 : Number(p.on_hand) * Number(p.unit_cost),
      low_stock: p.item_type !== "service" && Number(p.min_stock) > 0 && Number(p.on_hand) <= Number(p.min_stock),
    }));
  });

export const listMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string; product_id?: string; type?: string; warehouse_id?: string; status?: "all" | "posted" | "unposted" }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    let q = supabase
      .from("stock_movements")
      .select("*, products(code, name, unit), warehouses(code, name)")
      .eq("tenant_id", tenantId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.from) q = q.gte("movement_date", data.from);
    if (data.to) q = q.lte("movement_date", data.to);
    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.type && data.type !== "all") q = q.eq("movement_type", data.type);
    if (data.warehouse_id && data.warehouse_id !== "all") {
      if (data.warehouse_id === "none") q = q.is("warehouse_id", null);
      else q = q.eq("warehouse_id", data.warehouse_id);
    }
    if (data.status === "posted") q = q.not("ref_id", "is", null);
    else if (data.status === "unposted") q = q.is("ref_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });

export const getMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: mv, error } = await supabase
      .from("stock_movements")
      .select("*, products(code, name, unit, stock_account), warehouses(code, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!mv) throw new Error("Không tìm thấy phiếu");
    let entry: any = null;
    let lines: any[] = [];
    if (mv.ref_id) {
      const [{ data: e }, { data: ls }] = await Promise.all([
        supabase.from("journal_entries").select("*").eq("id", mv.ref_id).maybeSingle(),
        supabase.from("journal_lines").select("*").eq("entry_id", mv.ref_id).order("line_order"),
      ]);
      entry = e;
      lines = ls ?? [];
    }
    return { movement: mv, journal_entry: entry, journal_lines: lines };
  });

export const inventoryDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) {
      return {
        total_value: 0, sku_count: 0, goods_count: 0, service_count: 0,
        low_stock_count: 0, movements_30d: 0, in_value_30d: 0, out_value_30d: 0,
        low_stock_items: [], top_value_items: [],
      };
    }
    const today = new Date();
    const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [{ data: products = [] }, { data: movs30 = [] }] = await Promise.all([
      supabase
        .from("products")
        .select("id, code, name, unit, item_type, on_hand, unit_cost, min_stock, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase
        .from("stock_movements")
        .select("movement_type, qty, unit_cost")
        .eq("tenant_id", tenantId)
        .gte("movement_date", d30),
    ]);

    const enriched = (products ?? []).map((p: any) => ({
      ...p,
      value: p.item_type === "service" ? 0 : Number(p.on_hand) * Number(p.unit_cost),
      low_stock: p.item_type !== "service" && Number(p.min_stock) > 0 && Number(p.on_hand) <= Number(p.min_stock),
    }));
    const goods = enriched.filter((p: any) => p.item_type !== "service");
    const services = enriched.filter((p: any) => p.item_type === "service");
    const totalValue = goods.reduce((s, p) => s + p.value, 0);
    const lowStock = goods.filter((p) => p.low_stock);
    const topValue = [...goods].sort((a, b) => b.value - a.value).slice(0, 8);

    const inValue = (movs30 ?? [])
      .filter((m: any) => m.movement_type === "in")
      .reduce((s: number, m: any) => s + Number(m.qty) * Number(m.unit_cost || 0), 0);
    const outValue = (movs30 ?? [])
      .filter((m: any) => m.movement_type === "out")
      .reduce((s: number, m: any) => s + Number(m.qty) * Number(m.unit_cost || 0), 0);

    return {
      total_value: totalValue,
      sku_count: enriched.length,
      goods_count: goods.length,
      service_count: services.length,
      low_stock_count: lowStock.length,
      movements_30d: (movs30 ?? []).length,
      in_value_30d: inValue,
      out_value_30d: outValue,
      low_stock_items: lowStock.slice(0, 20),
      top_value_items: topValue,
    };
  });

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("product_categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (error) throw new Error(error.message);
    return data;
  });

const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
});

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CategorySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);
    const payload: any = { ...data, user_id: userId, tenant_id: tenantId };
    if (data.id) {
      const { error } = await supabase.from("product_categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("product_categories").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Guard: chặn xoá nếu còn nhóm con hoặc còn SKU
    const [{ count: childCount }, { count: skuCount }] = await Promise.all([
      supabase.from("product_categories").select("id", { count: "exact", head: true }).eq("parent_id", data.id),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", data.id),
    ]);
    if ((childCount ?? 0) > 0) throw new Error("Nhóm còn nhóm con — hãy xoá/di chuyển nhóm con trước");
    if ((skuCount ?? 0) > 0) throw new Error(`Nhóm còn ${skuCount} mặt hàng — hãy chuyển nhóm trước`);
    const { error } = await supabase.from("product_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCategoriesTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    const [{ data: cats, error: cErr }, { data: prods, error: pErr }] = await Promise.all([
      supabase.from("product_categories").select("id, name, parent_id").eq("tenant_id", tenantId).order("name"),
      supabase.from("products").select("category_id").eq("tenant_id", tenantId),
    ]);
    if (cErr) throw new Error(cErr.message);
    if (pErr) throw new Error(pErr.message);
    const directCount = new Map<string, number>();
    for (const p of prods ?? []) {
      if (!p.category_id) continue;
      directCount.set(p.category_id, (directCount.get(p.category_id) ?? 0) + 1);
    }
    return (cats ?? []).map((c: any) => ({ ...c, sku_count: directCount.get(c.id) ?? 0 }));
  });

const BulkAssignSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(500),
  category_id: z.string().uuid().nullable(),
});

export const bulkAssignCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => BulkAssignSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("products")
      .update({ category_id: data.category_id })
      .in("id", data.product_ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.product_ids.length };
  });

// Tables tham chiếu product_id — dùng cho Xoá & Gộp
const PRODUCT_REF_TABLES = [
  "invoice_lines",
  "purchase_voucher_lines",
  "sales_invoice_lines",
  "sales_order_lines",
  "sales_voucher_lines",
  "stock_movements",
  "stock_reservations",
  "stock_take_lines",
  "product_unit_conversions",
] as const;

async function countProductUsage(supabase: any, productId: string) {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const t of PRODUCT_REF_TABLES) {
    const { count } = await supabase
      .from(t)
      .select("product_id", { count: "exact", head: true })
      .eq("product_id", productId);
    const n = count ?? 0;
    counts[t] = n;
    total += n;
  }
  return { counts, total };
}

export const getProductUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    return await countProductUsage(context.supabase, data.id);
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const usage = await countProductUsage(supabase, data.id);
    if (usage.total > 0) {
      const used = Object.entries(usage.counts)
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `${t}: ${n}`)
        .join(", ");
      throw new Error(
        `Không thể xoá: mặt hàng đang được sử dụng (${used}). Hãy dùng chức năng Gộp để chuyển sang mặt hàng khác.`,
      );
    }
    const { error } = await supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MergeSchema = z.object({
  target_id: z.string().uuid(),
  source_ids: z.array(z.string().uuid()).min(1).max(50),
});

export const mergeProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MergeSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const sources = data.source_ids.filter((id) => id !== data.target_id);
    if (sources.length === 0) throw new Error("Phải chọn ít nhất 1 mặt hàng nguồn khác mặt hàng đích");

    // Re-point references in all tables
    let moved = 0;
    for (const t of PRODUCT_REF_TABLES) {
      const { error, count } = await supabase
        .from(t)
        .update({ product_id: data.target_id }, { count: "exact" })
        .in("product_id", sources);
      if (error) throw new Error(`${t}: ${error.message}`);
      moved += count ?? 0;
    }

    // Recompute target stock from movements
    try {
      await recomputeProductStock(supabase, data.target_id);
    } catch {
      // ignore — nếu tồn âm thì giữ nguyên
    }

    // Delete source products
    const { error: dErr } = await supabase.from("products").delete().in("id", sources);
    if (dErr) throw new Error(dErr.message);

    return { ok: true, merged: sources.length, references_moved: moved };
  });

export const listProductsByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { category_id: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    let q = supabase
      .from("products")
      .select("id, code, name, unit, item_type, on_hand, is_active")
      .eq("tenant_id", tenantId)
      .order("code");
    if (data.category_id === null) q = q.is("category_id", null);
    else q = q.eq("category_id", data.category_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


// ============================================================
// Multi-line stock vouchers
// ============================================================

const VoucherLineSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().positive(),
  unit_cost: z.number().min(0).default(0),
  note: z.string().max(255).optional(),
  // Optional transaction-time unit. If omitted or equal to the product's base unit,
  // the factor defaults to 1 and qty/unit_cost are stored as-is.
  unit: z.string().max(20).optional(),
  costing_method: z.string().max(20).optional(),
});

const HeaderExtraSchema = {
  kind: z.string().max(40).nullish(),
  branch_id: z.string().uuid().nullish(),
  party_id: z.string().uuid().nullish(),
  party_name: z.string().max(255).nullish(),
  party_phone: z.string().max(50).nullish(),
  party_address: z.string().max(500).nullish(),
  deliverer_name: z.string().max(255).nullish(),
  receiver_name: z.string().max(255).nullish(),
  source_doc_no: z.string().max(100).nullish(),
  source_doc_date: z.string().nullish(),
  transfer_doc_no: z.string().max(100).nullish(),
  attachments_count: z.number().int().min(0).nullish(),
};

const VoucherCreateSchema = z.object({
  voucher_type: z.enum(["in", "out"]),
  voucher_date: z.string(),
  voucher_no: z.string().max(50).optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  counter_account: z.string().min(2).max(20),
  reason: z.string().max(500).optional(),
  post_journal: z.boolean().optional().default(true),
  lines: z.array(VoucherLineSchema).min(1).max(200),
  ...HeaderExtraSchema,
});

const VoucherUpdateSchema = VoucherCreateSchema.extend({
  id: z.string().uuid(),
}).omit({ voucher_type: true });


type Ctx = { supabase: any; userId: string };

async function applyVoucherLines(
  ctx: Ctx,
  header: {
    id: string;
    voucher_no: string;
    voucher_type: "in" | "out";
    voucher_date: string;
    warehouse_id: string | null;
    counter_account: string;
    tenant_id: string | null;
    post_journal: boolean;
  },
  lines: z.infer<typeof VoucherLineSchema>[],
) {
  const { supabase, userId } = ctx;

  // Preload products
  const ids = Array.from(new Set(lines.map((l) => l.product_id)));
  const { data: prods, error: pErr } = await supabase
    .from("products")
    .select("id, code, name, unit, on_hand, unit_cost, item_type, stock_account")
    .in("id", ids);
  if (pErr) throw new Error(pErr.message);
  const prodMap = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));

  // Preload unit conversions for these products
  const { data: convs } = await supabase
    .from("product_unit_conversions")
    .select("product_id, unit, factor")
    .in("product_id", ids);
  const convMap = new Map<string, { factor: number }>();
  for (const c of convs ?? []) {
    convMap.set(`${c.product_id}::${String(c.unit).toLowerCase()}`, { factor: Number(c.factor) });
  }

  function resolveFactor(productId: string, baseUnit: string, txnUnit?: string): number {
    if (!txnUnit || !txnUnit.trim()) return 1;
    if (txnUnit.toLowerCase() === String(baseUnit ?? "").toLowerCase()) return 1;
    const c = convMap.get(`${productId}::${txnUnit.toLowerCase()}`);
    if (!c) throw new Error(`Chưa khai báo quy đổi "${txnUnit}" cho mặt hàng`);
    return c.factor;
  }

  // Validate each line and compute effective unit cost (in base unit)
  type Prepared = {
    line: z.infer<typeof VoucherLineSchema>;
    product: any;
    effectiveUnit: number;     // base unit cost stored on stock_movements.unit_cost
    amount: number;            // line total (same regardless of unit)
    qtyBase: number;           // quantity in base unit
    txnUnit: string;           // transaction-time unit label
    txnQty: number;            // quantity as entered (in txnUnit)
    txnUnitCost: number;       // unit cost as entered (per txnUnit)
    factor: number;            // 1 txnUnit = factor × base unit
  };
  // Simulate per-product running on_hand for validation in same voucher (for "out")
  const sim = new Map<string, { qty: number; cost: number }>();
  const prepared: Prepared[] = [];
  for (const line of lines) {
    const p = prodMap.get(line.product_id);
    if (!p) throw new Error(`Không tìm thấy mặt hàng ${line.product_id}`);
    if (p.item_type === "service") throw new Error(`Dịch vụ "${p.name}" không quản lý tồn kho`);
    if (!(line.qty > 0)) throw new Error(`Số lượng phải > 0 (${p.code})`);

    const factor = resolveFactor(p.id, p.unit, line.unit);
    const txnUnit = line.unit?.trim() || p.unit;
    const qtyBase = line.qty * factor;
    let s = sim.get(p.id);
    if (!s) s = { qty: Number(p.on_hand), cost: Number(p.unit_cost) };
    let effective: number;
    let txnUnitCost = line.unit_cost;
    if (header.voucher_type === "in") {
      if (!(line.unit_cost > 0)) throw new Error(`Đơn giá nhập phải > 0 (${p.code})`);
      effective = line.unit_cost / factor; // base-unit cost
      const total = s.qty + qtyBase;
      s.cost = total > 0 ? (s.qty * s.cost + qtyBase * effective) / total : effective;
      s.qty = total;
    } else {
      if (qtyBase > s.qty + 1e-9) {
        throw new Error(`Tồn không đủ cho ${p.code} (còn ${s.qty} ${p.unit})`);
      }
      effective = s.cost; // xuất theo giá bình quân hiện tại (base)
      txnUnitCost = +(effective * factor).toFixed(4);
      s.qty -= qtyBase;
    }
    sim.set(p.id, s);
    prepared.push({
      line,
      product: p,
      effectiveUnit: effective,
      amount: +(qtyBase * effective).toFixed(2),
      qtyBase,
      txnUnit,
      txnQty: line.qty,
      txnUnitCost,
      factor,
    });
  }

  // Create journal entry (one entry, two lines per item: Dr/Cr pair)
  let journalEntryId: string | null = null;
  if (header.post_journal) {
    const desc =
      `${header.voucher_type === "in" ? "Phiếu nhập kho" : "Phiếu xuất kho"} ${header.voucher_no}` +
      ` (${prepared.length} dòng)`;
    const { data: entry, error: eErr } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        tenant_id: header.tenant_id,
        entry_date: header.voucher_date,
        description: desc,
      })
      .select("id")
      .single();
    if (eErr || !entry) throw new Error(eErr?.message || "Không tạo được bút toán");
    journalEntryId = entry.id;

    const jLines: any[] = [];
    let order = 0;
    for (const pr of prepared) {
      const stockAcc = pr.product.stock_account || "156";
      const debit = header.voucher_type === "in" ? stockAcc : header.counter_account;
      const credit = header.voucher_type === "in" ? header.counter_account : stockAcc;
      jLines.push(
        { entry_id: entry.id, account_code: debit, debit: pr.amount, credit: 0, line_order: order++ },
        { entry_id: entry.id, account_code: credit, debit: 0, credit: pr.amount, line_order: order++ },
      );
    }
    const { error: lErr } = await supabase.from("journal_lines").insert(jLines);
    if (lErr) throw new Error(lErr.message);

    await supabase.from("stock_vouchers").update({ journal_entry_id: journalEntryId }).eq("id", header.id);
  }

  // Insert stock_movements (qty/unit_cost in base unit; txn_* preserve the unit entered)
  const movements = prepared.map((pr) => ({
    user_id: userId,
    tenant_id: header.tenant_id,
    product_id: pr.product.id,
    movement_type: header.voucher_type,
    qty: pr.qtyBase,
    unit_cost: pr.effectiveUnit,
    movement_date: header.voucher_date,
    note: pr.line.note?.trim()
      ? `${header.voucher_no} — ${pr.line.note.trim()}`
      : header.voucher_no,
    ref_type: header.voucher_type === "in" ? "stock_voucher_in" : "stock_voucher_out",
    ref_id: journalEntryId,
    warehouse_id: header.warehouse_id,
    voucher_id: header.id,
    txn_unit: pr.txnUnit,
    txn_qty: pr.txnQty,
    txn_unit_cost: pr.txnUnitCost,
    conversion_factor: pr.factor,
  }));
  const { error: mErr } = await supabase.from("stock_movements").insert(movements);
  if (mErr) throw new Error(mErr.message);

  // Recompute on_hand + unit_cost from scratch for every affected product
  for (const productId of ids) {
    await recomputeProductStock(supabase, productId);
  }

  return { journal_entry_id: journalEntryId, line_count: prepared.length };
}

async function deleteVoucherInternal(supabase: any, voucherId: string) {
  const { data: v, error } = await supabase
    .from("stock_vouchers")
    .select("id, journal_entry_id")
    .eq("id", voucherId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) throw new Error("Không tìm thấy phiếu");

  // Collect affected products before delete
  const { data: movs } = await supabase
    .from("stock_movements")
    .select("product_id")
    .eq("voucher_id", voucherId);
  const productIds = Array.from(new Set((movs ?? []).map((m: any) => m.product_id)));

  // Delete movements (cascade by FK but be explicit so we can recompute after)
  await supabase.from("stock_movements").delete().eq("voucher_id", voucherId);

  if (v.journal_entry_id) {
    await supabase.from("journal_lines").delete().eq("entry_id", v.journal_entry_id);
    await supabase.from("journal_entries").delete().eq("id", v.journal_entry_id);
  }

  await supabase.from("stock_vouchers").delete().eq("id", voucherId);
  return { productIds };
}

export const createStockVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VoucherCreateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("active_tenant_id").eq("id", userId).maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;
    if (tenantId) await assertTenantMember(supabase, userId, tenantId);

    const voucherNo =
      data.voucher_no?.trim() ||
      (await nextStockVoucherNo(supabase, tenantId, userId, data.voucher_type, data.voucher_date));

    const { data: hdr, error: hErr } = await supabase
      .from("stock_vouchers")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        voucher_no: voucherNo,
        voucher_type: data.voucher_type,
        voucher_date: data.voucher_date,
        warehouse_id: data.warehouse_id ?? null,
        counter_account: data.counter_account,
        reason: data.reason ?? null,
        kind: data.kind ?? null,
        branch_id: data.branch_id ?? null,
        party_id: data.party_id ?? null,
        party_name: data.party_name ?? null,
        party_phone: data.party_phone ?? null,
        party_address: data.party_address ?? null,
        deliverer_name: data.deliverer_name ?? null,
        receiver_name: data.receiver_name ?? null,
        source_doc_no: data.source_doc_no ?? null,
        source_doc_date: data.source_doc_date || null,
        transfer_doc_no: data.transfer_doc_no ?? null,
        attachments_count: data.attachments_count ?? 0,
      })
      .select("id")
      .single();

    if (hErr || !hdr) throw new Error(hErr?.message || "Không tạo được phiếu");

    try {
      const res = await applyVoucherLines(
        { supabase, userId },
        {
          id: hdr.id,
          voucher_no: voucherNo,
          voucher_type: data.voucher_type,
          voucher_date: data.voucher_date,
          warehouse_id: data.warehouse_id ?? null,
          counter_account: data.counter_account,
          tenant_id: tenantId,
          post_journal: data.post_journal !== false,
        },
        data.lines,
      );
      return { ok: true, id: hdr.id, voucher_no: voucherNo, ...res };
    } catch (e) {
      // Rollback header on failure
      await supabase.from("stock_vouchers").delete().eq("id", hdr.id);
      throw e;
    }
  });

export const updateStockVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VoucherUpdateSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: orig, error: oErr } = await supabase
      .from("stock_vouchers")
      .select("id, voucher_no, voucher_type, tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!orig) throw new Error("Không tìm thấy phiếu");

    const { productIds: removedProducts } = await deleteVoucherInternal(supabase, data.id);
    // Recompute removed products' stock first
    for (const id of removedProducts as string[]) {
      await recomputeProductStock(supabase, id);
    }

    // Recreate header with same id-like fields (new id)
    const { data: hdr, error: hErr } = await supabase
      .from("stock_vouchers")
      .insert({
        user_id: userId,
        tenant_id: orig.tenant_id,
        voucher_no: orig.voucher_no,
        voucher_type: orig.voucher_type,
        voucher_date: data.voucher_date,
        warehouse_id: data.warehouse_id ?? null,
        counter_account: data.counter_account,
        reason: data.reason ?? null,
        kind: data.kind ?? null,
        branch_id: data.branch_id ?? null,
        party_id: data.party_id ?? null,
        party_name: data.party_name ?? null,
        party_phone: data.party_phone ?? null,
        party_address: data.party_address ?? null,
        deliverer_name: data.deliverer_name ?? null,
        receiver_name: data.receiver_name ?? null,
        source_doc_no: data.source_doc_no ?? null,
        source_doc_date: data.source_doc_date || null,
        transfer_doc_no: data.transfer_doc_no ?? null,
        attachments_count: data.attachments_count ?? 0,
      })
      .select("id")
      .single();

    if (hErr || !hdr) throw new Error(hErr?.message || "Không tạo lại được phiếu");

    const res = await applyVoucherLines(
      { supabase, userId },
      {
        id: hdr.id,
        voucher_no: orig.voucher_no,
        voucher_type: orig.voucher_type as "in" | "out",
        voucher_date: data.voucher_date,
        warehouse_id: data.warehouse_id ?? null,
        counter_account: data.counter_account,
        tenant_id: orig.tenant_id,
        post_journal: data.post_journal !== false,
      },
      data.lines,
    );
    return { ok: true, id: hdr.id, voucher_no: orig.voucher_no, ...res };
  });

export const cancelStockVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { productIds } = await deleteVoucherInternal(supabase, data.id);
    for (const id of productIds as string[]) {
      await recomputeProductStock(supabase, id);
    }
    return { ok: true };
  });

export const listStockVouchers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { type?: "in" | "out" | "transfer" | "all"; from?: string; to?: string; warehouse_id?: string; status?: "all" | "posted" | "unposted" }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    let q = supabase
      .from("stock_vouchers")
      .select("*, warehouses!stock_vouchers_warehouse_id_fkey(code, name), stock_movements(qty, unit_cost, product_id, products(code, name, unit))")
      .eq("tenant_id", tenantId)
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.type && data.type !== "all") q = q.eq("voucher_type", data.type);
    if (data.from) q = q.gte("voucher_date", data.from);
    if (data.to) q = q.lte("voucher_date", data.to);
    if (data.warehouse_id && data.warehouse_id !== "all") {
      if (data.warehouse_id === "none") q = q.is("warehouse_id", null);
      else q = q.eq("warehouse_id", data.warehouse_id);
    }
    if (data.status === "posted") q = q.not("journal_entry_id", "is", null);
    else if (data.status === "unposted") q = q.is("journal_entry_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((v: any) => {
      const lines = v.stock_movements ?? [];
      const total = lines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_cost || 0), 0);
      return {
        ...v,
        line_count: lines.length,
        total_qty: lines.reduce((s: number, l: any) => s + Number(l.qty || 0), 0),
        total_value: total,
      };
    });
  });

export const getStockVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: voucher, error } = await supabase
      .from("stock_vouchers")
      .select("*, warehouses!stock_vouchers_warehouse_id_fkey(code, name), branches(code, name, address)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!voucher) throw new Error("Không tìm thấy phiếu");

    const [{ data: movs }, { data: entry }, { data: jLines }] = await Promise.all([
      supabase
        .from("stock_movements")
        .select("*, products(code, name, unit, stock_account)")
        .eq("voucher_id", data.id)
        .order("created_at"),
      voucher.journal_entry_id
        ? supabase.from("journal_entries").select("*").eq("id", voucher.journal_entry_id).maybeSingle()
        : Promise.resolve({ data: null }),
      voucher.journal_entry_id
        ? supabase.from("journal_lines").select("*").eq("entry_id", voucher.journal_entry_id).order("line_order")
        : Promise.resolve({ data: [] }),
    ]);

    return {
      voucher,
      lines: movs ?? [],
      journal_entry: entry ?? null,
      journal_lines: jLines ?? [],
    };
  });

// ============ Báo cáo Nhập – Xuất – Tồn ============
export type StockIOSRow = {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  category_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  opening_qty: number;
  opening_value: number;
  in_qty: number;
  in_value: number;
  out_qty: number;
  out_value: number;
  closing_qty: number;
  closing_value: number;
};

async function buildStockIOSummary(
  supabase: any,
  data: { from: string; to: string; warehouse_id?: string | null; by_warehouse?: boolean },
): Promise<StockIOSRow[]> {
  let q = supabase
    .from("stock_movements")
    .select(
      "product_id, warehouse_id, movement_type, movement_date, qty, unit_cost, products(code, name, unit, item_type, product_categories(name)), warehouses(name)",
    )
    .lte("movement_date", data.to);
  if (data.warehouse_id && data.warehouse_id !== "all") {
    if (data.warehouse_id === "none") q = q.is("warehouse_id", null);
    else q = q.eq("warehouse_id", data.warehouse_id);
  }
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const keyOf = (m: any) =>
    data.by_warehouse ? `${m.product_id}|${m.warehouse_id ?? ""}` : m.product_id;

  const agg = new Map<string, StockIOSRow>();
  for (const m of (rows ?? []) as any[]) {
    if (m.products?.item_type === "service") continue;
    const k = keyOf(m);
    const cur =
      agg.get(k) ?? {
        product_id: m.product_id,
        code: m.products?.code ?? "",
        name: m.products?.name ?? "",
        unit: m.products?.unit ?? "",
        category_name: m.products?.product_categories?.name ?? null,
        warehouse_id: data.by_warehouse ? m.warehouse_id ?? null : null,
        warehouse_name: data.by_warehouse ? m.warehouses?.name ?? null : null,
        opening_qty: 0,
        opening_value: 0,
        in_qty: 0,
        in_value: 0,
        out_qty: 0,
        out_value: 0,
        closing_qty: 0,
        closing_value: 0,
      };
    const qty = Number(m.qty) || 0;
    const cost = Number(m.unit_cost) || 0;
    const value = qty * cost;
    const isIn = m.movement_type === "in";
    if (m.movement_date < data.from) {
      cur.opening_qty += isIn ? qty : -qty;
      cur.opening_value += isIn ? value : -value;
    } else {
      if (isIn) {
        cur.in_qty += qty;
        cur.in_value += value;
      } else {
        cur.out_qty += qty;
        cur.out_value += value;
      }
    }
    cur.closing_qty += isIn ? qty : -qty;
    cur.closing_value += isIn ? value : -value;
    agg.set(k, cur);
  }

  return Array.from(agg.values())
    .filter(
      (r) =>
        Math.abs(r.opening_qty) +
          Math.abs(r.in_qty) +
          Math.abs(r.out_qty) +
          Math.abs(r.closing_qty) >
        0.0001,
    )
    .sort((a, b) => a.code.localeCompare(b.code));
}

export const getStockIOSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from: string; to: string; warehouse_id?: string | null; by_warehouse?: boolean }) => i,
  )
  .handler(async ({ data, context }) => {
    return buildStockIOSummary(context.supabase, data);
  });

export const exportStockIOSummaryXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from: string; to: string; warehouse_id?: string | null; by_warehouse?: boolean }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = await buildStockIOSummary(supabase, data);

    const totals = rows.reduce(
      (s, r) => ({
        opening_value: s.opening_value + r.opening_value,
        in_value: s.in_value + r.in_value,
        out_value: s.out_value + r.out_value,
        closing_value: s.closing_value + r.closing_value,
      }),
      { opening_value: 0, in_value: 0, out_value: 0, closing_value: 0 },
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
    const ws = wb.addWorksheet("NXT");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    const lastCol = data.by_warehouse ? "L" : "K";
    ws.mergeCells(`A5:${lastCol}5`);
    ws.getCell("A5").value = "BÁO CÁO NHẬP – XUẤT – TỒN";
    ws.getCell("A5").font = { bold: true, size: 13 };
    ws.getCell("A5").alignment = { horizontal: "center" };

    ws.mergeCells(`A6:${lastCol}6`);
    ws.getCell("A6").value = `Kỳ từ ${data.from} đến ${data.to}`;
    ws.getCell("A6").alignment = { horizontal: "center" };

    const headers = data.by_warehouse
      ? ["Mã hàng", "Tên hàng", "ĐVT", "Kho", "Tồn đầu (SL)", "Tồn đầu (GT)", "Nhập (SL)", "Nhập (GT)", "Xuất (SL)", "Xuất (GT)", "Tồn cuối (SL)", "Tồn cuối (GT)"]
      : ["Mã hàng", "Tên hàng", "ĐVT", "Tồn đầu (SL)", "Tồn đầu (GT)", "Nhập (SL)", "Nhập (GT)", "Xuất (SL)", "Xuất (GT)", "Tồn cuối (SL)", "Tồn cuối (GT)"];
    headers.forEach((h, i) => {
      const cell = ws.getRow(8).getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    let r = 9;
    for (const row of rows) {
      const vals = data.by_warehouse
        ? [row.code, row.name, row.unit, row.warehouse_name ?? "—",
           row.opening_qty, Math.round(row.opening_value),
           row.in_qty, Math.round(row.in_value),
           row.out_qty, Math.round(row.out_value),
           row.closing_qty, Math.round(row.closing_value)]
        : [row.code, row.name, row.unit,
           row.opening_qty, Math.round(row.opening_value),
           row.in_qty, Math.round(row.in_value),
           row.out_qty, Math.round(row.out_value),
           row.closing_qty, Math.round(row.closing_value)];
      vals.forEach((v, i) => {
        const cell = ws.getRow(r).getCell(i + 1);
        cell.value = v as any;
        if (typeof v === "number") cell.numFmt = "#,##0.##;(#,##0.##);-";
      });
      r++;
    }

    const totalStartCol = data.by_warehouse ? "A" : "A";
    const mergeEnd = data.by_warehouse ? "D" : "C";
    ws.mergeCells(`${totalStartCol}${r}:${mergeEnd}${r}`);
    ws.getCell(`${totalStartCol}${r}`).value = "Tổng cộng";
    ws.getCell(`${totalStartCol}${r}`).font = { bold: true };
    const valCols = data.by_warehouse
      ? { open: "F", in: "H", out: "J", close: "L" }
      : { open: "E", in: "G", out: "I", close: "K" };
    ws.getCell(`${valCols.open}${r}`).value = Math.round(totals.opening_value);
    ws.getCell(`${valCols.in}${r}`).value = Math.round(totals.in_value);
    ws.getCell(`${valCols.out}${r}`).value = Math.round(totals.out_value);
    ws.getCell(`${valCols.close}${r}`).value = Math.round(totals.closing_value);
    for (const col of [valCols.open, valCols.in, valCols.out, valCols.close]) {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { bold: true };
      cell.numFmt = "#,##0;(#,##0);-";
    }

    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 32;
    ws.getColumn(3).width = 8;
    for (let c = 4; c <= (data.by_warehouse ? 12 : 11); c++) ws.getColumn(c).width = 14;

    const buf = await wb.xlsx.writeBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return {
      filename: `BaoCao_NXT_${data.from}_${data.to}.xlsx`,
      base64,
    };
  });

// ============ Inventory Report (2-level: warehouse → product, with cumulative) ============
export type InventoryReportProductRow = {
  product_id: string;
  code: string;
  name: string;
  unit: string;
  category_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string;
  opening_qty: number;
  opening_value: number;
  in_qty: number;
  in_value: number;
  out_qty: number;
  out_value: number;
  closing_qty: number;
  closing_value: number;
  cum_in_qty: number;
  cum_in_value: number;
  cum_out_qty: number;
  cum_out_value: number;
};

export type InventoryReportWarehouseRow = {
  warehouse_id: string | null;
  warehouse_name: string;
  opening_qty: number;
  opening_value: number;
  in_qty: number;
  in_value: number;
  out_qty: number;
  out_value: number;
  closing_qty: number;
  closing_value: number;
  cum_in_qty: number;
  cum_in_value: number;
  cum_out_qty: number;
  cum_out_value: number;
};

export const getInventoryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      from: string;
      to: string;
      warehouse_ids?: string[];
      unit?: string;
      only_with_activity?: boolean;
    }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    const yearStart = `${data.to.slice(0, 4)}-01-01`;

    let q = supabase
      .from("stock_movements")
      .select(
        "product_id, warehouse_id, movement_type, movement_date, qty, unit_cost, products(code, name, unit, item_type, product_categories(name)), warehouses(name)",
      )
      .lte("movement_date", data.to);
    q = tenantId ? q.eq("tenant_id", tenantId) : q.eq("user_id", userId);
    if (data.warehouse_ids && data.warehouse_ids.length > 0) {
      q = q.in("warehouse_id", data.warehouse_ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const products = new Map<string, InventoryReportProductRow>();
    const keyOf = (m: any) => `${m.product_id}|${m.warehouse_id ?? ""}`;

    for (const m of (rows ?? []) as any[]) {
      if (m.products?.item_type === "service") continue;
      if (data.unit && m.products?.unit !== data.unit) continue;
      const k = keyOf(m);
      const cur =
        products.get(k) ?? {
          product_id: m.product_id,
          code: m.products?.code ?? "",
          name: m.products?.name ?? "",
          unit: m.products?.unit ?? "",
          category_name: m.products?.product_categories?.name ?? null,
          warehouse_id: m.warehouse_id ?? null,
          warehouse_name: m.warehouses?.name ?? "(Không kho)",
          opening_qty: 0,
          opening_value: 0,
          in_qty: 0,
          in_value: 0,
          out_qty: 0,
          out_value: 0,
          closing_qty: 0,
          closing_value: 0,
          cum_in_qty: 0,
          cum_in_value: 0,
          cum_out_qty: 0,
          cum_out_value: 0,
        };
      const qty = Number(m.qty) || 0;
      const cost = Number(m.unit_cost) || 0;
      const value = qty * cost;
      const isIn = m.movement_type === "in";
      const dt = m.movement_date as string;

      if (dt < data.from) {
        cur.opening_qty += isIn ? qty : -qty;
        cur.opening_value += isIn ? value : -value;
      } else {
        if (isIn) {
          cur.in_qty += qty;
          cur.in_value += value;
        } else {
          cur.out_qty += qty;
          cur.out_value += value;
        }
      }
      cur.closing_qty += isIn ? qty : -qty;
      cur.closing_value += isIn ? value : -value;

      // Cumulative from start of year
      if (dt >= yearStart) {
        if (isIn) {
          cur.cum_in_qty += qty;
          cur.cum_in_value += value;
        } else {
          cur.cum_out_qty += qty;
          cur.cum_out_value += value;
        }
      }
      products.set(k, cur);
    }

    const productRows = Array.from(products.values())
      .filter((r) => {
        if (!data.only_with_activity) return true;
        return (
          Math.abs(r.opening_qty) +
            Math.abs(r.in_qty) +
            Math.abs(r.out_qty) +
            Math.abs(r.closing_qty) >
          0.0001
        );
      })
      .sort((a, b) => (a.warehouse_name || "").localeCompare(b.warehouse_name || "") || a.code.localeCompare(b.code));

    // Warehouse rollup
    const whMap = new Map<string, InventoryReportWarehouseRow>();
    for (const r of productRows) {
      const wk = r.warehouse_id ?? "__none__";
      const cur =
        whMap.get(wk) ?? {
          warehouse_id: r.warehouse_id,
          warehouse_name: r.warehouse_name,
          opening_qty: 0,
          opening_value: 0,
          in_qty: 0,
          in_value: 0,
          out_qty: 0,
          out_value: 0,
          closing_qty: 0,
          closing_value: 0,
          cum_in_qty: 0,
          cum_in_value: 0,
          cum_out_qty: 0,
          cum_out_value: 0,
        };
      cur.opening_qty += r.opening_qty;
      cur.opening_value += r.opening_value;
      cur.in_qty += r.in_qty;
      cur.in_value += r.in_value;
      cur.out_qty += r.out_qty;
      cur.out_value += r.out_value;
      cur.closing_qty += r.closing_qty;
      cur.closing_value += r.closing_value;
      cur.cum_in_qty += r.cum_in_qty;
      cur.cum_in_value += r.cum_in_value;
      cur.cum_out_qty += r.cum_out_qty;
      cur.cum_out_value += r.cum_out_value;
      whMap.set(wk, cur);
    }

    const warehouses = Array.from(whMap.values()).sort((a, b) =>
      a.warehouse_name.localeCompare(b.warehouse_name),
    );

    return { warehouses, products: productRows, from: data.from, to: data.to };
  });

export const recomputeInventoryValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: products, error } = await supabase
      .from("products")
      .select("id")
      .neq("item_type", "service");
    if (error) throw new Error(error.message);
    let count = 0;
    for (const p of (products ?? []) as { id: string }[]) {
      try {
        await recomputeProductStock(supabase, p.id);
        count++;
      } catch {
        // Skip products that would go negative
      }
    }
    return { ok: true, count };
  });

// ============ Pending stock docs: posted sales/purchase vouchers without stock voucher ============
export const listPendingStockDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from?: string; to?: string } = {}) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await resolveActiveTenantId(supabase, userId);
    if (!tenantId) return [];
    let pq = supabase
      .from("purchase_vouchers")
      .select("id, voucher_no, voucher_date, supplier_name, total, status, stock_voucher_id, purchase_voucher_lines(product_id, line_type)")
      .eq("tenant_id", tenantId)
      .is("stock_voucher_id", null)
      .order("voucher_date", { ascending: false })
      .limit(200);
    if (data.from) pq = pq.gte("voucher_date", data.from);
    if (data.to) pq = pq.lte("voucher_date", data.to);
    let sq = supabase
      .from("sales_vouchers")
      .select("id, voucher_no, voucher_date, customer_name, total, status, stock_voucher_id, sales_voucher_lines(product_id, line_type)")
      .eq("tenant_id", tenantId)
      .is("stock_voucher_id", null)
      .order("voucher_date", { ascending: false })
      .limit(200);
    if (data.from) sq = sq.gte("voucher_date", data.from);
    if (data.to) sq = sq.lte("voucher_date", data.to);
    const [{ data: pRows }, { data: sRows }] = await Promise.all([pq, sq]);
    const purchases = (pRows ?? [])
      .filter((r: any) => (r.purchase_voucher_lines ?? []).some((l: any) => l.product_id && l.line_type === "goods"))
      .map((r: any) => ({
        id: r.id,
        kind: "purchase" as const,
        voucher_no: r.voucher_no,
        voucher_date: r.voucher_date,
        party_name: r.supplier_name,
        total: Number(r.total || 0),
        status: r.status,
      }));
    const sales = (sRows ?? [])
      .filter((r: any) => (r.sales_voucher_lines ?? []).some((l: any) => l.product_id && l.line_type === "goods"))
      .map((r: any) => ({
        id: r.id,
        kind: "sales" as const,
        voucher_no: r.voucher_no,
        voucher_date: r.voucher_date,
        party_name: r.customer_name,
        total: Number(r.total || 0),
        status: r.status,
      }));
    return [...purchases, ...sales].sort((a, b) => (a.voucher_date < b.voucher_date ? 1 : -1));
  });
