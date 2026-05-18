import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CodeEntity =
  | "sale_invoice"
  | "purchase_invoice"
  | "customer"
  | "supplier"
  | "product_goods"
  | "product_service"
  | "product_combo"
  | "warehouse"
  | "bank_receipt"
  | "bank_payment"
  | "bank_transfer";

type EntityConfig = {
  table: "sales_invoices" | "invoices" | "customers" | "suppliers" | "products" | "warehouses" | "bank_vouchers";
  column: "invoice_no" | "code" | "voucher_no";
  prefix: string;
  dateScoped: boolean;
  padLen: number;
  extraFilter?: { column: string; value: string };
};

const CONFIG: Record<CodeEntity, EntityConfig> = {
  sale_invoice: { table: "sales_invoices", column: "invoice_no", prefix: "HD", dateScoped: true, padLen: 5 },
  purchase_invoice: { table: "invoices", column: "invoice_no", prefix: "HDM", dateScoped: true, padLen: 5 },
  customer: { table: "customers", column: "code", prefix: "KH", dateScoped: false, padLen: 5 },
  supplier: { table: "suppliers", column: "code", prefix: "NCC", dateScoped: false, padLen: 5 },
  product_goods: {
    table: "products", column: "code", prefix: "HH", dateScoped: false, padLen: 4,
    extraFilter: { column: "item_type", value: "goods" },
  },
  product_service: {
    table: "products", column: "code", prefix: "DV", dateScoped: false, padLen: 4,
    extraFilter: { column: "item_type", value: "service" },
  },
  product_combo: {
    table: "products", column: "code", prefix: "CB", dateScoped: false, padLen: 4,
    extraFilter: { column: "item_type", value: "combo" },
  },
  warehouse: { table: "warehouses", column: "code", prefix: "KHO", dateScoped: false, padLen: 2 },
  bank_receipt: {
    table: "bank_vouchers", column: "voucher_no", prefix: "BC", dateScoped: true, padLen: 5,
    extraFilter: { column: "voucher_type", value: "receipt" },
  },
  bank_payment: {
    table: "bank_vouchers", column: "voucher_no", prefix: "BN", dateScoped: true, padLen: 5,
    extraFilter: { column: "voucher_type", value: "payment" },
  },
  bank_transfer: {
    table: "bank_vouchers", column: "voucher_no", prefix: "BT", dateScoped: true, padLen: 5,
    extraFilter: { column: "voucher_type", value: "transfer_out" },
  },
};

const InputSchema = z.object({
  entity: z.enum([
    "sale_invoice", "purchase_invoice", "customer", "supplier",
    "product_goods", "product_service", "product_combo", "warehouse",
    "bank_receipt", "bank_payment", "bank_transfer",
  ]),
  date: z.string().optional(),
});

function yyyymm(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

export const nextEntityCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cfg = CONFIG[data.entity as CodeEntity];

    const datePart = cfg.dateScoped ? yyyymm(data.date) : "";
    const fullPrefix = cfg.dateScoped ? `${cfg.prefix}${datePart}/` : cfg.prefix;
    const likePattern = cfg.dateScoped ? `${fullPrefix}%` : `${fullPrefix}%`;

    // Tenant-aware filter
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.active_tenant_id ?? null;

    let q = supabase.from(cfg.table).select(cfg.column).like(cfg.column, likePattern);
    if (tenantId) {
      q = q.eq("tenant_id", tenantId);
    } else {
      q = q.eq("user_id", userId);
    }
    if (cfg.extraFilter) {
      q = q.eq(cfg.extraFilter.column, cfg.extraFilter.value);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Parse trailing digits from each existing code
    const tailRegex = cfg.dateScoped ? /\/(\d+)$/ : new RegExp(`^${cfg.prefix}(\\d+)$`);
    let max = 0;
    for (const r of (rows as any[]) ?? []) {
      const v = r?.[cfg.column];
      if (typeof v !== "string") continue;
      const m = tailRegex.exec(v);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    const seq = String(max + 1).padStart(cfg.padLen, "0");
    return { code: `${fullPrefix}${seq}` };
  });
