import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  vat_rate: z.number().min(0).max(100).default(10),
  category_id: z.string().uuid().nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  min_stock: z.number().min(0).default(0),
  max_stock: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  notes: z.string().max(1000).nullable().optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name)")
      .order("code");
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
    const payload: any = { ...data, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
    if (data.id) {
      const { error } = await supabase.from("products").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase.from("products").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
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

function yyyymm(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function nextStockVoucherNo(
  supabase: any,
  tenantId: string | null,
  userId: string,
  type: "in" | "out",
  movementDate: string,
) {
  const prefix = `${type === "in" ? "PN" : "PX"}${yyyymm(movementDate)}/`;
  // Look in both stock_vouchers (new) and stock_movements.note (legacy single-line)
  let qv = supabase.from("stock_vouchers").select("voucher_no")
    .eq("voucher_type", type).ilike("voucher_no", `${prefix}%`);
  qv = tenantId ? qv.eq("tenant_id", tenantId) : qv.eq("user_id", userId);
  let qm = supabase.from("stock_movements").select("note")
    .eq("movement_type", type).ilike("note", `${prefix}%`);
  qm = tenantId ? qm.eq("tenant_id", tenantId) : qm.eq("user_id", userId);
  const [{ data: vs, error: vErr }, { data: ms, error: mErr }] = await Promise.all([qv, qm]);
  if (vErr) throw new Error(vErr.message);
  if (mErr) throw new Error(mErr.message);
  const re = new RegExp(`^${prefix.replace("/", "\\/")}(\\d+)`);
  let max = 0;
  for (const r of (vs as any[]) ?? []) {
    const m = re.exec(r?.voucher_no ?? "");
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  for (const r of (ms as any[]) ?? []) {
    const m = re.exec(r?.note ?? "");
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
    const code = await nextStockVoucherNo(
      supabase, profile?.active_tenant_id ?? null, userId, data.type, data.movement_date,
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
    const { supabase } = context;
    let q = supabase
      .from("stock_movements")
      .select("*, products(code, name, unit), warehouses(code, name)")
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
    const { supabase } = context;
    const today = new Date();
    const d30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [{ data: products = [] }, { data: movs30 = [] }] = await Promise.all([
      supabase
        .from("products")
        .select("id, code, name, unit, item_type, on_hand, unit_cost, min_stock, is_active")
        .eq("is_active", true),
      supabase
        .from("stock_movements")
        .select("movement_type, qty, unit_cost")
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
    const { supabase } = context;
    const { data, error } = await supabase.from("product_categories").select("*").order("name");
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
    const payload: any = { ...data, user_id: userId, tenant_id: profile?.active_tenant_id ?? null };
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
    const { supabase } = context;
    const [{ data: cats, error: cErr }, { data: prods, error: pErr }] = await Promise.all([
      supabase.from("product_categories").select("id, name, parent_id").order("name"),
      supabase.from("products").select("category_id"),
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

export const listProductsByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { category_id: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("products")
      .select("id, code, name, unit, item_type, on_hand, is_active")
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
});

const VoucherCreateSchema = z.object({
  voucher_type: z.enum(["in", "out"]),
  voucher_date: z.string(),
  voucher_no: z.string().max(50).optional(),
  warehouse_id: z.string().uuid().nullable().optional(),
  counter_account: z.string().min(2).max(20),
  reason: z.string().max(500).optional(),
  post_journal: z.boolean().optional().default(true),
  lines: z.array(VoucherLineSchema).min(1).max(200),
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
    .select("id, code, name, on_hand, unit_cost, item_type, stock_account")
    .in("id", ids);
  if (pErr) throw new Error(pErr.message);
  const prodMap = new Map<string, any>((prods ?? []).map((p: any) => [p.id, p]));

  // Validate each line and compute effective unit cost
  type Prepared = {
    line: z.infer<typeof VoucherLineSchema>;
    product: any;
    effectiveUnit: number;
    amount: number;
  };
  // Simulate per-product running on_hand for validation in same voucher (for "out")
  const sim = new Map<string, { qty: number; cost: number }>();
  const prepared: Prepared[] = [];
  for (const line of lines) {
    const p = prodMap.get(line.product_id);
    if (!p) throw new Error(`Không tìm thấy mặt hàng ${line.product_id}`);
    if (p.item_type === "service") throw new Error(`Dịch vụ "${p.name}" không quản lý tồn kho`);
    if (!(line.qty > 0)) throw new Error(`Số lượng phải > 0 (${p.code})`);
    let s = sim.get(p.id);
    if (!s) s = { qty: Number(p.on_hand), cost: Number(p.unit_cost) };
    let effective: number;
    if (header.voucher_type === "in") {
      if (!(line.unit_cost > 0)) throw new Error(`Đơn giá nhập phải > 0 (${p.code})`);
      effective = line.unit_cost;
      const total = s.qty + line.qty;
      s.cost = total > 0 ? (s.qty * s.cost + line.qty * effective) / total : effective;
      s.qty = total;
    } else {
      if (line.qty > s.qty + 1e-9) {
        throw new Error(`Tồn không đủ cho ${p.code} (còn ${s.qty})`);
      }
      effective = s.cost; // xuất theo giá bình quân hiện tại
      s.qty -= line.qty;
    }
    sim.set(p.id, s);
    prepared.push({
      line,
      product: p,
      effectiveUnit: effective,
      amount: +(line.qty * effective).toFixed(2),
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

  // Insert stock_movements
  const movements = prepared.map((pr) => ({
    user_id: userId,
    tenant_id: header.tenant_id,
    product_id: pr.product.id,
    movement_type: header.voucher_type,
    qty: pr.line.qty,
    unit_cost: pr.effectiveUnit,
    movement_date: header.voucher_date,
    note: pr.line.note?.trim()
      ? `${header.voucher_no} — ${pr.line.note.trim()}`
      : header.voucher_no,
    ref_type: header.voucher_type === "in" ? "stock_voucher_in" : "stock_voucher_out",
    ref_id: journalEntryId,
    warehouse_id: header.warehouse_id,
    voucher_id: header.id,
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
  .inputValidator((i: { type: "in" | "out"; from?: string; to?: string; warehouse_id?: string; status?: "all" | "posted" | "unposted" }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("stock_vouchers")
      .select("*, warehouses(code, name), stock_movements(qty, unit_cost, product_id, products(code, name, unit))")
      .eq("voucher_type", data.type)
      .order("voucher_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
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
      .select("*, warehouses(code, name)")
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
