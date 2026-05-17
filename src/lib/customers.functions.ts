import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const optStr = (max: number) =>
  z.string().trim().max(max).optional().nullable().or(z.literal("")).transform((v) => (v ? v : null));

const CustomerSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z
      .string()
      .trim()
      .min(1, "Bắt buộc")
      .max(50)
      .regex(/^[a-zA-Z0-9_\-./]+$/, "Mã chỉ chứa chữ/số/_-./"),
    name: z.string().trim().min(1, "Bắt buộc").max(255),
    party_type: z.enum(["company", "individual"]).default("company"),
    tax_id: z
      .string()
      .trim()
      .max(20)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v.replace(/\D/g, "") : null))
      .refine((v) => !v || v.length === 10 || v.length === 13, "MST phải 10 hoặc 13 số"),
    legal_rep: optStr(255),
    contact_person: optStr(255),
    email: z
      .string()
      .trim()
      .max(255)
      .optional()
      .nullable()
      .or(z.literal(""))
      .transform((v) => (v ? v : null))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email không hợp lệ"),
    email_cc: optStr(255),
    phone: optStr(50),
    fax: optStr(50),
    website: optStr(255),
    address: optStr(500),
    bank_account_no: optStr(50),
    bank_name: optStr(255),
    bank_branch: optStr(255),
    payment_terms_days: z.number().int().min(0).max(365).default(30),
    currency: z.string().trim().min(3).max(8).default("VND"),
    receivable_account: z.string().trim().min(3).max(20).default("131"),
    opening_balance: z.number().default(0),
    opening_balance_debit: z.number().min(0).default(0),
    opening_balance_credit: z.number().min(0).default(0),
    notes: optStr(1000),
    is_active: z.boolean().default(true),
  })
  .refine((d) => !(d.opening_balance_debit > 0 && d.opening_balance_credit > 0), {
    message: "Dư đầu kỳ chỉ được nhập một bên Nợ hoặc Có",
    path: ["opening_balance_credit"],
  });

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CustomerSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Lấy tenant hiện hành để gắn vào row mới
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .single();
    const tenant_id = profile?.active_tenant_id ?? null;

    const { id, ...rest } = data;
    // Đồng bộ opening_balance (cột cũ) = Nợ - Có để báo cáo cũ vẫn chạy
    const payload = {
      ...rest,
      opening_balance: (rest.opening_balance_debit ?? 0) - (rest.opening_balance_credit ?? 0),
    };

    if (id) {
      const { error } = await supabase.from("customers").update(payload).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new Error("Mã khách hàng đã tồn tại");
        throw new Error(error.message);
      }
      return { id };
    }
    const { data: row, error } = await supabase
      .from("customers")
      .insert({ ...payload, user_id: userId, tenant_id })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Mã khách hàng đã tồn tại");
      throw new Error(error.message);
    }
    return { id: row!.id };
  });

export const archiveCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; archived: boolean }) => i)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("customers")
      .update({ is_active: !data.archived })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
