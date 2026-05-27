import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CoaCircular = "TT99" | "TT133";

export type CoaRow = {
  code: string;
  name: string;
  parent_code: string | null;
  type: string;
  level: number | null;
  is_active: boolean;
  used: boolean;
};

export type CoaListResult = {
  rows: CoaRow[];
  effective_circular: CoaCircular;
  raw_standard: string | null;
};

export const listChartOfAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoaListResult> => {
    const { supabase, userId } = context;

    // Lấy chế độ kế toán của tổ chức hiện tại
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .eq("id", userId)
      .maybeSingle();

    let rawStandard: string | null = null;
    if (profile?.active_tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("accounting_standard")
        .eq("id", profile.active_tenant_id)
        .maybeSingle();
      rawStandard = (tenant as any)?.accounting_standard ?? null;
    }

    // TT200 đã bị TT99 thay thế → quy về TT99
    const effective: CoaCircular = rawStandard === "TT133" ? "TT133" : "TT99";

    const table = effective === "TT133" ? "chart_of_accounts_tt133" : "chart_of_accounts";
    const { data: coa, error } = await supabase
      .from(table)
      .select("code, name, parent_code, type, level, is_active")
      .order("code");
    if (error) throw new Error(error.message);

    // "Đang dùng" chỉ có ý nghĩa với TT99 (TT133 là tham chiếu thuần)
    let usedSet = new Set<string>();
    if (effective === "TT99") {
      const { data: used } = await supabase.from("journal_lines").select("account_code");
      usedSet = new Set((used ?? []).map((r: any) => r.account_code));
    }

    const rows: CoaRow[] = (coa ?? []).map((r: any) => ({
      ...r,
      level: r.level ?? (r.code.length === 4 ? 2 : r.code.length === 5 ? 3 : 1),
      used: usedSet.has(r.code),
    }));

    return { rows, effective_circular: effective, raw_standard: rawStandard };
  });
