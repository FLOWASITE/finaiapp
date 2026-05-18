import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withLatency } from "@/lib/with-latency";

type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export type DimFilter = {
  branch_id?: string | null;
  department_id?: string | null;
  project_id?: string | null;
  cost_center_id?: string | null;
};

function bucket(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export const getReceivables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { kind: "AR" | "AP"; dims?: DimFilter }) => i)
  .handler(withLatency("getReceivables", async ({ data, context }) => {
    const { supabase, userId } = context;
    const account = data.kind === "AR" ? "131" : "331";
    const d = data.dims;

    let q = supabase
      .from("journal_lines")
      .select("debit, credit, branch_id, department_id, project_id, cost_center_id, journal_entries!inner(user_id, entry_date, description, invoice_id)")
      .eq("account_code", account)
      .eq("journal_entries.user_id", userId);
    if (d?.branch_id) q = q.eq("branch_id", d.branch_id);
    if (d?.department_id) q = q.eq("department_id", d.department_id);
    if (d?.project_id) q = q.eq("project_id", d.project_id);
    if (d?.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const today = new Date();
    const byParty = new Map<
      string,
      { party: string; balance: number; aging: Record<AgingBucket, number>; lastDate: string }
    >();

    for (const r of rows ?? []) {
      const e: any = r.journal_entries;
      const party = (e.description ?? "Không rõ").split("—")[0].trim().slice(0, 80) || "Không rõ";
      const signed = data.kind === "AR"
        ? Number(r.debit) - Number(r.credit)
        : Number(r.credit) - Number(r.debit);
      const days = Math.max(0, Math.floor((today.getTime() - new Date(e.entry_date).getTime()) / 86400000));
      const b = bucket(days);
      const cur = byParty.get(party) ?? {
        party,
        balance: 0,
        aging: { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
        lastDate: e.entry_date,
      };
      cur.balance += signed;
      cur.aging[b] += signed;
      if (e.entry_date > cur.lastDate) cur.lastDate = e.entry_date;
      byParty.set(party, cur);
    }

    return Array.from(byParty.values())
      .filter((r) => Math.abs(r.balance) > 0.5)
      .sort((a, b) => b.balance - a.balance);
  }));

// ============ Bảng tổng hợp công nợ phải thu (TK 131) ============
export type ArSummaryRow = {
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string;
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
};

async function buildArSummary(
  supabase: any,
  userId: string,
  data: { from: string; to: string; dims?: DimFilter; account?: string },
): Promise<ArSummaryRow[]> {
  const account = data.account ?? "131";
  let q = supabase
    .from("journal_lines")
    .select(
      "debit, credit, entry_id, branch_id, department_id, project_id, cost_center_id, journal_entries!inner(user_id, entry_date, description)",
    )
    .like("account_code", `${account}%`)
    .eq("journal_entries.user_id", userId)
    .lte("journal_entries.entry_date", data.to);

  const d = data.dims;
  if (d?.branch_id) q = q.eq("branch_id", d.branch_id);
  if (d?.department_id) q = q.eq("department_id", d.department_id);
  if (d?.project_id) q = q.eq("project_id", d.project_id);
  if (d?.cost_center_id) q = q.eq("cost_center_id", d.cost_center_id);

  const { data: lines, error } = await q;
  if (error) throw new Error(error.message);

  const entryIds = Array.from(new Set((lines ?? []).map((l: any) => l.entry_id)));
  const placeholder = ["00000000-0000-0000-0000-000000000000"];
  const ids = entryIds.length ? entryIds : placeholder;

  const [{ data: sInv }, { data: receipts }] = await Promise.all([
    supabase
      .from("sales_invoices")
      .select("journal_entry_id, customer_id, customer_name")
      .in("journal_entry_id", ids),
    supabase
      .from("customer_receipts")
      .select("journal_entry_id, customer_id, customer_name")
      .in("journal_entry_id", ids),
  ]);

  const entryToCustomer = new Map<string, { id: string | null; name: string }>();
  for (const r of (sInv ?? []) as any[]) {
    entryToCustomer.set(r.journal_entry_id, {
      id: r.customer_id ?? null,
      name: (r.customer_name ?? "").trim() || "Không rõ",
    });
  }
  for (const r of (receipts ?? []) as any[]) {
    if (!entryToCustomer.has(r.journal_entry_id)) {
      entryToCustomer.set(r.journal_entry_id, {
        id: r.customer_id ?? null,
        name: (r.customer_name ?? "").trim() || "Không rõ",
      });
    }
  }

  // Look up customer codes
  const custIds = Array.from(
    new Set(
      Array.from(entryToCustomer.values())
        .map((c) => c.id)
        .filter((x): x is string => !!x),
    ),
  );
  const codeMap = new Map<string, string>();
  if (custIds.length) {
    const { data: custs } = await supabase
      .from("customers")
      .select("id, code, name")
      .in("id", custIds);
    for (const c of (custs ?? []) as any[]) {
      if (c.code) codeMap.set(c.id, c.code);
    }
  }

  type Agg = {
    customer_id: string | null;
    customer_name: string;
    opening: number;
    debit: number;
    credit: number;
  };
  const byKey = new Map<string, Agg>();

  for (const l of (lines ?? []) as any[]) {
    const e = l.journal_entries;
    const c =
      entryToCustomer.get(l.entry_id) ?? {
        id: null,
        name:
          ((e.description ?? "Không rõ").split("—")[0].trim().slice(0, 80) ||
            "Không rõ") as string,
      };
    const key = c.id ?? `name:${c.name}`;
    const row =
      byKey.get(key) ?? {
        customer_id: c.id,
        customer_name: c.name,
        opening: 0,
        debit: 0,
        credit: 0,
      };
    const dr = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    if (e.entry_date < data.from) {
      row.opening += dr - cr;
    } else {
      row.debit += dr;
      row.credit += cr;
    }
    byKey.set(key, row);
  }

  const out: ArSummaryRow[] = Array.from(byKey.values()).map((r) => {
    const closing = r.opening + r.debit - r.credit;
    return {
      customer_id: r.customer_id,
      customer_code: r.customer_id ? codeMap.get(r.customer_id) ?? null : null,
      customer_name: r.customer_name,
      opening_debit: r.opening > 0 ? r.opening : 0,
      opening_credit: r.opening < 0 ? -r.opening : 0,
      debit: r.debit,
      credit: r.credit,
      closing_debit: closing > 0 ? closing : 0,
      closing_credit: closing < 0 ? -closing : 0,
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
    .sort((a, b) =>
      (a.customer_code ?? "zzz").localeCompare(b.customer_code ?? "zzz") ||
      a.customer_name.localeCompare(b.customer_name, "vi"),
    );
}

export const getArSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from: string; to: string; dims?: DimFilter; account?: string }) => i,
  )
  .handler(
    withLatency("getArSummary", async ({ data, context }) => {
      const { supabase, userId } = context;
      return buildArSummary(supabase, userId, data);
    }),
  );

export const exportArSummaryXlsx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: { from: string; to: string; dims?: DimFilter; account?: string }) => i,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = await buildArSummary(supabase, userId, data);

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
    const ws = wb.addWorksheet("CongNoPhaiThu");

    ws.getCell("A1").value = profile?.company_name ?? "DOANH NGHIỆP";
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.getCell("A2").value = `MST: ${profile?.tax_id ?? ""}`;
    ws.getCell("A3").value = profile?.address ?? "";

    ws.mergeCells("A5:I5");
    ws.getCell("A5").value = "BẢNG TỔNG HỢP CÔNG NỢ PHẢI THU (TK 131)";
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
    ws.getCell("A8").value = "Mã KH";
    ws.getCell("B8").value = "Tên khách hàng";
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

    const account = data.account ?? "131";
    let r = 10;
    for (const row of rows) {
      ws.getCell(`A${r}`).value = row.customer_code ?? "";
      ws.getCell(`B${r}`).value = row.customer_name;
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
      filename: `BangTongHopCongNoPhaiThu_${data.from}_${data.to}.xlsx`,
      base64,
    };
  });

