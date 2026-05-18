import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Helpers
function quarterRange(year: number, quarter: number): [string, string] {
  const startM = (quarter - 1) * 3 + 1;
  const endM = startM + 2;
  const start = `${year}-${String(startM).padStart(2, "0")}-01`;
  const endDate = new Date(year, endM, 0); // last day
  const end = `${year}-${String(endM).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return [start, end];
}

async function loadRunsWithLines(supabase: any, from: string, to: string) {
  const { data: runs, error: rErr } = await supabase
    .from("payroll_runs")
    .select("id, period_month, status")
    .gte("period_month", from)
    .lte("period_month", to)
    .in("status", ["approved", "posted"]);
  if (rErr) throw new Error(rErr.message);
  if (!runs?.length) return { runs: [], lines: [] as any[] };
  const runIds = runs.map((r: any) => r.id);
  const { data: lines, error: lErr } = await supabase
    .from("payroll_lines")
    .select("*, employees(id, code, full_name, tax_id, citizen_id, social_insurance_no, position, dependents, is_resident, contract_type, insurance_salary)")
    .in("run_id", runIds);
  if (lErr) throw new Error(lErr.message);
  return { runs, lines: lines ?? [] };
}

// ===== 05/KK-TNCN: PIT Quarterly Declaration =====
// Tổng hợp khấu trừ TNCN từ tiền lương, tiền công theo quý
export const reportPit05KK = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ year: z.number().int().min(2000).max(2100), quarter: z.number().int().min(1).max(4) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const [from, to] = quarterRange(data.year, data.quarter);
    const { runs, lines } = await loadRunsWithLines(context.supabase, from, to);

    let countResident = 0;
    let countNonResident = 0;
    let incomeResident = 0;
    let incomeNonResident = 0;
    let pitResident = 0;
    let pitNonResident = 0;
    const empIds = new Set<string>();

    for (const l of lines) {
      const isRes = l.employees?.is_resident !== false;
      empIds.add(l.employee_id);
      if (isRes) {
        incomeResident += Number(l.gross || 0);
        pitResident += Number(l.pit || 0);
      } else {
        incomeNonResident += Number(l.gross || 0);
        pitNonResident += Number(l.pit || 0);
      }
    }
    countResident = new Set(lines.filter((l: any) => l.employees?.is_resident !== false).map((l: any) => l.employee_id)).size;
    countNonResident = new Set(lines.filter((l: any) => l.employees?.is_resident === false).map((l: any) => l.employee_id)).size;

    return {
      period: { year: data.year, quarter: data.quarter, from, to },
      runs_count: runs.length,
      employees_count: empIds.size,
      // [21] Cá nhân cư trú có HĐ ≥ 3 tháng
      resident: { count: countResident, income: incomeResident, pit: pitResident },
      // [27] Cá nhân không cư trú
      non_resident: { count: countNonResident, income: incomeNonResident, pit: pitNonResident },
      total_pit: pitResident + pitNonResident,
    };
  });

// ===== 05/QTT-TNCN: PIT Annual Finalization (per-employee detail) =====
export const reportPit05QTT = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ year: z.number().int().min(2000).max(2100) }).parse(i))
  .handler(async ({ data, context }) => {
    const from = `${data.year}-01-01`;
    const to = `${data.year}-12-31`;
    const { lines } = await loadRunsWithLines(context.supabase, from, to);

    const byEmp = new Map<string, any>();
    for (const l of lines) {
      const id = l.employee_id;
      const e = l.employees ?? {};
      let row = byEmp.get(id);
      if (!row) {
        row = {
          employee_id: id,
          code: e.code, full_name: e.full_name, tax_id: e.tax_id,
          citizen_id: e.citizen_id, dependents: e.dependents ?? 0,
          is_resident: e.is_resident !== false,
          contract_type: e.contract_type,
          months: 0, gross: 0, taxable: 0, insurance_emp: 0, pit_withheld: 0,
        };
        byEmp.set(id, row);
      }
      row.months += 1;
      row.gross += Number(l.gross || 0);
      row.taxable += Number(l.taxable || 0);
      row.insurance_emp += Number(l.bhxh_emp || 0) + Number(l.bhyt_emp || 0) + Number(l.bhtn_emp || 0);
      row.pit_withheld += Number(l.pit || 0);
    }

    const rows = Array.from(byEmp.values()).map((r: any) => {
      // Annual finalization (simplified): tax payable per progressive scale annually
      const personalDed = 11_000_000 * 12;
      const depDed = 4_400_000 * 12 * (r.dependents || 0);
      const annualTaxable = Math.max(0, r.taxable - personalDed - depDed);
      // Annual brackets = monthly * 12
      const brackets: [number, number][] = [
        [60_000_000, 0.05], [120_000_000, 0.10], [216_000_000, 0.15],
        [384_000_000, 0.20], [624_000_000, 0.25], [960_000_000, 0.30],
        [Infinity, 0.35],
      ];
      let tax = 0, prev = 0;
      if (r.is_resident) {
        for (const [cap, rate] of brackets) {
          if (annualTaxable <= cap) { tax += (annualTaxable - prev) * rate; break; }
          tax += (cap - prev) * rate; prev = cap;
        }
        tax = Math.round(tax);
      } else {
        tax = Math.round(r.gross * 0.20);
      }
      const refund = r.pit_withheld - tax;
      return { ...r, annual_taxable: annualTaxable, pit_payable: tax, refund_or_payable: refund };
    });

    const totals = rows.reduce((a: any, r: any) => ({
      gross: a.gross + r.gross, taxable: a.taxable + r.taxable,
      insurance_emp: a.insurance_emp + r.insurance_emp,
      pit_withheld: a.pit_withheld + r.pit_withheld,
      pit_payable: a.pit_payable + r.pit_payable,
      refund: a.refund + r.refund_or_payable,
    }), { gross: 0, taxable: 0, insurance_emp: 0, pit_withheld: 0, pit_payable: 0, refund: 0 });

    return { year: data.year, rows, totals };
  });

// ===== C70a-HD (D02-LT): BHXH monthly report — danh sách lao động & quỹ lương =====
export const reportBhxhC70a = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ month: z.string() }).parse(i)) // YYYY-MM
  .handler(async ({ data, context }) => {
    const period = data.month.slice(0, 7);
    const periodDate = `${period}-01`;
    const { supabase } = context;

    const { data: run } = await supabase
      .from("payroll_runs").select("id")
      .eq("period_month", periodDate)
      .maybeSingle();

    if (!run) {
      return { month: period, rows: [], totals: emptyTotals() };
    }

    const { data: lines } = await supabase
      .from("payroll_lines")
      .select("*, employees(code, full_name, citizen_id, social_insurance_no, position, insurance_salary, is_resident)")
      .eq("run_id", run.id);

    const rows = (lines ?? []).map((l: any) => {
      const e = l.employees ?? {};
      const insSalary = Number(e.insurance_salary || 0);
      return {
        code: e.code, full_name: e.full_name,
        citizen_id: e.citizen_id, social_insurance_no: e.social_insurance_no,
        position: e.position, insurance_salary: insSalary,
        bhxh_emp: Number(l.bhxh_emp || 0), bhyt_emp: Number(l.bhyt_emp || 0), bhtn_emp: Number(l.bhtn_emp || 0),
        bhxh_co: Number(l.bhxh_co || 0), bhyt_co: Number(l.bhyt_co || 0), bhtn_co: Number(l.bhtn_co || 0),
        total_emp: Number(l.bhxh_emp || 0) + Number(l.bhyt_emp || 0) + Number(l.bhtn_emp || 0),
        total_co: Number(l.bhxh_co || 0) + Number(l.bhyt_co || 0) + Number(l.bhtn_co || 0),
      };
    });

    const totals = rows.reduce((a: any, r: any) => ({
      headcount: a.headcount + 1,
      insurance_salary: a.insurance_salary + r.insurance_salary,
      bhxh_emp: a.bhxh_emp + r.bhxh_emp, bhyt_emp: a.bhyt_emp + r.bhyt_emp, bhtn_emp: a.bhtn_emp + r.bhtn_emp,
      bhxh_co: a.bhxh_co + r.bhxh_co, bhyt_co: a.bhyt_co + r.bhyt_co, bhtn_co: a.bhtn_co + r.bhtn_co,
      total_emp: a.total_emp + r.total_emp, total_co: a.total_co + r.total_co,
    }), emptyTotals());

    return { month: period, rows, totals };
  });

function emptyTotals() {
  return {
    headcount: 0, insurance_salary: 0,
    bhxh_emp: 0, bhyt_emp: 0, bhtn_emp: 0,
    bhxh_co: 0, bhyt_co: 0, bhtn_co: 0,
    total_emp: 0, total_co: 0,
  };
}
