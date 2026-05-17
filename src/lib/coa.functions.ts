import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CoaRow = {
  code: string;
  name: string;
  parent_code: string | null;
  type: string;
  level: number | null;
  is_active: boolean;
  used: boolean;
};

export const listChartOfAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoaRow[]> => {
    const { supabase } = context;
    const { data: coa, error } = await supabase
      .from("chart_of_accounts")
      .select("code, name, parent_code, type, level, is_active")
      .order("code");
    if (error) throw new Error(error.message);

    const { data: used } = await supabase
      .from("journal_lines")
      .select("account_code");
    const usedSet = new Set((used ?? []).map((r: any) => r.account_code));

    return (coa ?? []).map((r: any) => ({
      ...r,
      level: r.level ?? (r.code.length === 4 ? 2 : 1),
      used: usedSet.has(r.code),
    }));
  });
