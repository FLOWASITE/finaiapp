import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withTenant } from "@/integrations/supabase/with-tenant";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FIN_FORMAT_VERSION,
  YEAR_SCOPED_TABLES,
  CATALOG_TABLES,
  type FinExportFile,
  type FinExportTable,
} from "./fin-format";

const BUCKET = "tenant-exports";

async function assertRole(supabase: any, userId: string, tenantId: string, roles: string[]) {
  const { data, error } = await supabase.rpc("has_tenant_role", {
    _user_id: userId,
    _tenant_id: tenantId,
    _roles: roles,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Không có quyền thực hiện thao tác này");
}

// ============================================================
// EXPORT
// ============================================================
export const exportFinData = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        fiscal_year: z.number().int().min(1900).max(2200),
        tables: z.array(z.string()).min(1).max(40),
        include_catalogs: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);

    const selected = new Set(data.tables as FinExportTable[]);
    if (data.include_catalogs) CATALOG_TABLES.forEach((t) => selected.add(t));

    const tables: Partial<Record<FinExportTable, any[]>> = {};
    const row_counts: Partial<Record<FinExportTable, number>> = {};
    const yStart = `${data.fiscal_year}-01-01`;
    const yEnd = `${data.fiscal_year}-12-31`;

    // Năm-scoped (đơn giản theo cột date)
    for (const [t, dateCol] of Object.entries(YEAR_SCOPED_TABLES)) {
      if (!selected.has(t as FinExportTable)) continue;
      const { data: rows, error } = await (supabase as any)
        .from(t)
        .select("*")
        .eq("tenant_id", tenantId)
        .gte(dateCol, yStart)
        .lte(dateCol, yEnd);
      if (error) throw new Error(`${t}: ${error.message}`);
      tables[t as FinExportTable] = rows ?? [];
      row_counts[t as FinExportTable] = rows?.length ?? 0;
    }

    // journal_lines theo entry_id thuộc các entry vừa lấy
    if (selected.has("journal_lines") && tables.journal_entries?.length) {
      const ids = tables.journal_entries.map((e: any) => e.id);
      const { data: lines } = await (supabase as any)
        .from("journal_lines")
        .select("*")
        .in("entry_id", ids);
      tables.journal_lines = lines ?? [];
      row_counts.journal_lines = lines?.length ?? 0;
    }
    if (selected.has("invoice_lines") && tables.invoices?.length) {
      const ids = tables.invoices.map((e: any) => e.id);
      const { data: lines } = await (supabase as any)
        .from("invoice_lines")
        .select("*")
        .in("invoice_id", ids);
      tables.invoice_lines = lines ?? [];
      row_counts.invoice_lines = lines?.length ?? 0;
    }
    if (selected.has("sales_invoice_lines") && tables.sales_invoices?.length) {
      const ids = tables.sales_invoices.map((e: any) => e.id);
      const { data: lines } = await (supabase as any)
        .from("sales_invoice_lines")
        .select("*")
        .in("invoice_id", ids);
      tables.sales_invoice_lines = lines ?? [];
      row_counts.sales_invoice_lines = lines?.length ?? 0;
    }
    if (selected.has("payroll_lines") && tables.payroll_runs?.length) {
      const ids = tables.payroll_runs.map((e: any) => e.id);
      const { data: lines } = await (supabase as any)
        .from("payroll_lines")
        .select("*")
        .in("run_id", ids);
      tables.payroll_lines = lines ?? [];
      row_counts.payroll_lines = lines?.length ?? 0;
    }

    // fixed_assets — toàn bộ (không filter year vì là master), depreciation_entries lọc theo period
    if (selected.has("fixed_assets")) {
      const { data: rows } = await (supabase as any)
        .from("fixed_assets")
        .select("*")
        .eq("tenant_id", tenantId);
      tables.fixed_assets = rows ?? [];
      row_counts.fixed_assets = rows?.length ?? 0;
    }
    if (selected.has("depreciation_entries")) {
      const { data: rows } = await (supabase as any)
        .from("depreciation_entries")
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("period_start", yStart)
        .lte("period_start", yEnd);
      tables.depreciation_entries = rows ?? [];
      row_counts.depreciation_entries = rows?.length ?? 0;
    }

    // account_period_balances theo year
    if (selected.has("account_period_balances")) {
      const { data: rows } = await (supabase as any)
        .from("account_period_balances")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("year", data.fiscal_year);
      tables.account_period_balances = rows ?? [];
      row_counts.account_period_balances = rows?.length ?? 0;
    }

    // Catalogs (toàn bộ, không scope năm)
    if (data.include_catalogs) {
      for (const t of CATALOG_TABLES) {
        const { data: rows } = await (supabase as any)
          .from(t)
          .select("*")
          .eq("tenant_id", tenantId);
        tables[t] = rows ?? [];
        row_counts[t] = rows?.length ?? 0;
      }
    }

    // Tenant header
    const { data: tenant } = await (supabase as any)
      .from("tenants")
      .select("id, company_name, tax_id")
      .eq("id", tenantId)
      .maybeSingle();

    const file: FinExportFile = {
      format: "fin-export",
      version: FIN_FORMAT_VERSION,
      tenant: {
        id: tenantId,
        company_name: tenant?.company_name ?? null,
        tax_id: tenant?.tax_id ?? null,
      },
      fiscal_year: data.fiscal_year,
      exported_at: new Date().toISOString(),
      exported_by: userId,
      options: { include_catalogs: data.include_catalogs, selected_tables: Array.from(selected) },
      row_counts,
      tables,
    };

    // Upload lên Storage (admin để bỏ qua RLS, vì ta đã check role)
    const filename = `${data.fiscal_year}/fin-export-${data.fiscal_year}-${Date.now()}.json`;
    const path = `${tenantId}/${filename}`;
    const body = new Blob([JSON.stringify(file)], { type: "application/json" });
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, body, {
      contentType: "application/json",
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);

    const total = Object.values(row_counts).reduce<number>((s, n) => s + (n ?? 0), 0);

    // Ghi nhận lịch sử
    const { data: backup, error: bErr } = await supabaseAdmin
      .from("system_backups")
      .insert({
        tenant_id: tenantId,
        kind: "fin_export",
        fiscal_year: data.fiscal_year,
        file_path: path,
        row_counts,
        file_size_bytes: body.size,
        options: { include_catalogs: data.include_catalogs },
        status: "done",
        created_by: userId,
        finished_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    return { id: backup.id, path, total_rows: total, size_bytes: body.size };
  });

export const downloadFinExport = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);
    const { data: row, error } = await supabaseAdmin
      .from("system_backups")
      .select("file_path, tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !row) throw new Error("Không tìm thấy bản xuất");
    if (row.tenant_id !== tenantId) throw new Error("Không thuộc doanh nghiệp hiện tại");
    if (!row.file_path) throw new Error("Bản xuất không có tệp");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 600);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Không tạo được link tải");
    return { url: signed.signedUrl };
  });

export const deleteFinExport = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner"]);
    const { data: row } = await supabaseAdmin
      .from("system_backups")
      .select("file_path, tenant_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.tenant_id !== tenantId) throw new Error("Không tìm thấy");
    if (row.file_path) await supabaseAdmin.storage.from(BUCKET).remove([row.file_path]);
    await supabaseAdmin.from("system_backups").delete().eq("id", data.id);
    return { ok: true };
  });

// ============================================================
// IMPORT preview + commit
// ============================================================
const ImportPreviewSchema = z.object({
  file_b64: z.string().min(10).max(50_000_000),
});

export const previewFinImport = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ImportPreviewSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);
    let parsed: any;
    try {
      const buf = Buffer.from(data.file_b64, "base64");
      parsed = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      throw new Error("Tệp không phải JSON hợp lệ");
    }
    if (parsed?.format !== "fin-export") throw new Error("Tệp không đúng định dạng Fin");
    if (parsed?.version !== FIN_FORMAT_VERSION) {
      throw new Error(`Phiên bản tệp (${parsed?.version}) không tương thích (cần v${FIN_FORMAT_VERSION})`);
    }
    return {
      tenant: parsed.tenant,
      fiscal_year: parsed.fiscal_year,
      exported_at: parsed.exported_at,
      row_counts: parsed.row_counts ?? {},
      table_keys: Object.keys(parsed.tables ?? {}),
    };
  });

const ImportCommitSchema = z.object({
  file_b64: z.string().min(10).max(50_000_000),
  fiscal_year: z.number().int().min(1900).max(2200),
  mode: z.enum(["merge", "replace_year"]).default("merge"),
});

export const commitFinImport = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) => ImportCommitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);

    const buf = Buffer.from(data.file_b64, "base64");
    const parsed: FinExportFile = JSON.parse(buf.toString("utf8"));
    if (parsed.format !== "fin-export" || parsed.version !== FIN_FORMAT_VERSION) {
      throw new Error("Tệp không hợp lệ hoặc sai phiên bản");
    }

    // Ghi batch
    const { data: batch, error: bErr } = await supabaseAdmin
      .from("import_batches")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        kind: "fin_import",
        classification: [
          {
            fiscal_year: data.fiscal_year,
            mode: data.mode,
            source_tenant: parsed.tenant,
            source_year: parsed.fiscal_year,
            row_counts: parsed.row_counts,
          },
        ] as any,
        status: "running",
      } as any)
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    // Replace year nếu chọn
    if (data.mode === "replace_year") {
      await assertRole(supabase, userId, tenantId, ["owner"]);
      const { error: dErr } = await supabase.rpc("delete_year_data", {
        p_tenant: tenantId,
        p_year: data.fiscal_year,
      });
      if (dErr) throw new Error(`Không xoá được dữ liệu năm: ${dErr.message}`);
    }

    // Re-map tenant_id + xoá id để tránh xung đột PK chéo tenant
    const inserted: Record<string, number> = {};
    const errors: { table: string; error: string }[] = [];

    const order: FinExportTable[] = [
      // catalogs trước
      "chart_of_accounts",
      "units",
      "warehouses",
      "branches",
      "departments",
      "projects",
      "cost_centers",
      "customers",
      "suppliers",
      "products",
      // master
      "fixed_assets",
      "depreciation_entries",
      // headers
      "journal_entries",
      "invoices",
      "sales_invoices",
      "payroll_runs",
      // lines
      "journal_lines",
      "invoice_lines",
      "sales_invoice_lines",
      "payroll_lines",
      // operational
      "cash_vouchers",
      "customer_receipts",
      "supplier_payments",
      "bank_transactions",
      "account_period_balances",
    ];

    for (const t of order) {
      const rows = parsed.tables[t];
      if (!rows || rows.length === 0) continue;
      const payload = rows.map((r: any) => {
        const copy: any = { ...r };
        if ("tenant_id" in copy) copy.tenant_id = tenantId;
        // Giữ nguyên id để liên kết với line tables; nếu trùng sẽ báo lỗi & merge bỏ qua
        return copy;
      });
      const { error } = await (supabaseAdmin as any).from(t).upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: data.mode === "merge",
      });
      if (error) {
        errors.push({ table: t, error: error.message });
      } else {
        inserted[t] = payload.length;
      }
    }

    // Rebuild balances cho tenant (nếu không phải import balances trực tiếp)
    if (!parsed.tables.account_period_balances?.length) {
      await supabaseAdmin.rpc("rebuild_account_period_balances", { p_tenant: tenantId });
    }

    await supabaseAdmin
      .from("import_batches")
      .update({
        status: errors.length ? "partial" : "done",
        decisions: { inserted, errors } as any,
      } as any)
      .eq("id", batch.id);

    return { batch_id: batch.id, inserted, errors };
  });

// ============================================================
// CARRY-FORWARD
// ============================================================
export const previewCarryForward = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z.object({ from_year: z.number().int(), to_year: z.number().int() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);
    if (data.to_year <= data.from_year) throw new Error("Năm đích phải lớn hơn năm nguồn");

    const { data: rows, error } = await (supabase as any)
      .from("account_period_balances")
      .select("account_code, debit, credit")
      .eq("tenant_id", tenantId)
      .eq("year", data.from_year)
      .gte("period_no", 0)
      .lte("period_no", 12);
    if (error) throw new Error(error.message);

    const agg = new Map<string, { d: number; c: number }>();
    for (const r of rows ?? []) {
      const first = String(r.account_code).charAt(0);
      if (!["1", "2", "3", "4"].includes(first)) continue;
      const cur = agg.get(r.account_code) ?? { d: 0, c: 0 };
      cur.d += Number(r.debit ?? 0);
      cur.c += Number(r.credit ?? 0);
      agg.set(r.account_code, cur);
    }
    const preview = Array.from(agg.entries())
      .map(([account_code, v]) => ({
        account_code,
        debit: Math.max(v.d - v.c, 0),
        credit: Math.max(v.c - v.d, 0),
      }))
      .filter((r) => r.debit > 0.005 || r.credit > 0.005)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));

    // Đếm kỳ chưa khoá năm nguồn
    const { data: periods } = await (supabase as any)
      .from("fiscal_periods")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("year", data.from_year);
    const open_periods = (periods ?? []).filter((p: any) => p.status === "open").length;

    return { preview, open_periods, total_periods: periods?.length ?? 0 };
  });

export const runCarryForward = createServerFn({ method: "POST" })
  .middleware([withTenant])
  .inputValidator((i: unknown) =>
    z
      .object({
        from_year: z.number().int(),
        to_year: z.number().int(),
        force: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);

    if (!data.force) {
      const { data: periods } = await (supabase as any)
        .from("fiscal_periods")
        .select("status")
        .eq("tenant_id", tenantId)
        .eq("year", data.from_year);
      const allClosed =
        (periods ?? []).length === 12 &&
        (periods ?? []).every((p: any) => p.status !== "open");
      if (!allClosed) {
        throw new Error("Năm nguồn còn kỳ đang mở. Khoá mềm/cứng 12 tháng hoặc bật 'Vẫn tiếp tục'.");
      }
    }

    const { data: result, error } = await supabase.rpc("carry_forward_balances", {
      p_tenant: tenantId,
      p_from: data.from_year,
      p_to: data.to_year,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId,
      action: "carry_forward_balances",
      table_name: "account_period_balances",
      after: { from: data.from_year, to: data.to_year, rows: (result ?? []).length } as any,
    } as any);

    return { rows: result ?? [] };
  });

// ============================================================
// LIST history
// ============================================================
export const listDataHistory = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, userId, tenantId } = context;
    await assertRole(supabase, userId, tenantId, ["owner", "accountant"]);

    const [backups, imports, carry] = await Promise.all([
      (supabase as any)
        .from("system_backups")
        .select("id, kind, fiscal_year, file_path, row_counts, file_size_bytes, status, created_at, created_by, finished_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      (supabase as any)
        .from("import_batches")
        .select("id, kind, status, classification, decisions, created_at, user_id")
        .eq("tenant_id", tenantId)
        .eq("kind", "fin_import")
        .order("created_at", { ascending: false })
        .limit(50),
      (supabaseAdmin as any)
        .from("audit_logs")
        .select("id, action, after, created_at, user_id, actor_email")
        .eq("action", "carry_forward_balances")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      backups: backups.data ?? [],
      imports: imports.data ?? [],
      carry: carry.data ?? [],
    };
  });

export const listFiscalYearsForTenant = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const { data } = await (supabase as any)
      .from("fiscal_years")
      .select("year, status")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false });
    return { years: data ?? [] };
  });
