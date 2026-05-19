#!/usr/bin/env bun
/**
 * Kiểm tra các quan hệ foreign key trong schema `public`.
 *
 * - Liệt kê toàn bộ FK hiện có.
 * - Quét các cột có tên kết thúc bằng `_id` (heuristic), suy ra bảng đích
 *   theo quy ước số nhiều / số ít, và cảnh báo khi thiếu FK thực sự.
 *
 * Chạy: bun run scripts/check-fk-relationships.ts
 * Cần biến môi trường SUPABASE_DB_URL.
 *
 * Exit code: 0 nếu không có cảnh báo, 1 nếu có.
 */

import { SQL } from "bun";

// Cột bỏ qua hoàn toàn (không suy luận FK).
const IGNORE_COLUMNS = new Set([
  "id",
  "user_id", // thường tham chiếu auth.users — guideline Supabase không tạo FK cứng
  "tenant_id", // đa số trường hợp tham chiếu tenants, đã có FK nhưng không nên cảnh báo nếu không
  "created_by",
  "updated_by",
  "changed_by",
  "actor_id",
  "owner_id",
  "uploaded_by",
  "posted_by",
  "voided_by",
  "reviewed_by",
]);

// Cặp tên cột → bảng đích đặc biệt khi heuristic số nhiều không đúng.
const COLUMN_TARGET_OVERRIDES: Record<string, string> = {
  salesperson_id: "employees",
  customer_id: "customers",
  supplier_id: "suppliers",
  product_id: "products",
  warehouse_id: "warehouses",
  invoice_id: "invoices",
  entry_id: "journal_entries",
  asset_id: "fixed_assets",
  book_id: "fa_depreciation_books",
  order_id: "sales_orders",
  sales_order_line_id: "sales_order_lines",
  branch_id: "branches",
  department_id: "departments",
  project_id: "projects",
  cost_center_id: "cost_centers",
  parent_id: "", // self-reference, bỏ qua
  fiscal_year_id: "fiscal_years",
};

type FkRow = {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
};

type ColRow = { table_name: string; column_name: string };

function candidateTargets(col: string): string[] {
  if (col in COLUMN_TARGET_OVERRIDES) {
    const t = COLUMN_TARGET_OVERRIDES[col];
    return t ? [t] : [];
  }
  const base = col.replace(/_id$/, "");
  if (!base) return [];
  const cands = new Set<string>();
  cands.add(base + "s");
  cands.add(base);
  if (base.endsWith("y")) cands.add(base.slice(0, -1) + "ies");
  if (base.endsWith("s")) cands.add(base + "es");
  return [...cands];
}

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(`${C.red}✗ Thiếu SUPABASE_DB_URL${C.reset}`);
    process.exit(2);
  }

  const sql = new SQL(url);

  console.log(`${C.bold}Đang kiểm tra FK trong schema public...${C.reset}\n`);

  const fks = (await sql`
    SELECT
      cl.relname              AS table_name,
      att.attname             AS column_name,
      fcl.relname             AS foreign_table_name,
      fatt.attname            AS foreign_column_name
    FROM pg_constraint c
    JOIN pg_class cl   ON cl.oid  = c.conrelid
    JOIN pg_namespace n ON n.oid  = cl.relnamespace
    JOIN pg_class fcl  ON fcl.oid = c.confrelid
    JOIN pg_namespace fn ON fn.oid = fcl.relnamespace
    JOIN unnest(c.conkey)  WITH ORDINALITY AS ck(attnum, ord)  ON true
    JOIN unnest(c.confkey) WITH ORDINALITY AS fck(attnum, ord) ON fck.ord = ck.ord
    JOIN pg_attribute att  ON att.attrelid  = cl.oid  AND att.attnum  = ck.attnum
    JOIN pg_attribute fatt ON fatt.attrelid = fcl.oid AND fatt.attnum = fck.attnum
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
    ORDER BY cl.relname, att.attname;
  `) as FkRow[];

  const fkSet = new Set(fks.map((f) => `${f.table_name}.${f.column_name}`));

  const cols = (await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name LIKE '%\\_id' ESCAPE '\\'
    ORDER BY table_name, column_name;
  `) as ColRow[];

  const tables = (await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE';
  `) as { table_name: string }[];
  const tableSet = new Set(tables.map((t) => t.table_name));

  // In FK hợp lệ
  for (const f of fks) {
    console.log(
      `${C.green}✓${C.reset} ${f.table_name}.${f.column_name} ${C.dim}→${C.reset} ${f.foreign_table_name}.${f.foreign_column_name}`,
    );
  }

  // Quét cột nghi ngờ thiếu FK
  const warnings: string[] = [];
  for (const c of cols) {
    if (IGNORE_COLUMNS.has(c.column_name)) continue;
    const key = `${c.table_name}.${c.column_name}`;
    if (fkSet.has(key)) continue;
    const targets = candidateTargets(c.column_name);
    const hit = targets.find((t) => tableSet.has(t));
    if (hit && hit !== c.table_name) {
      warnings.push(
        `${C.yellow}⚠ THIẾU FK:${C.reset} ${c.table_name}.${c.column_name} ${C.dim}(nghi tham chiếu ${hit}.id)${C.reset}`,
      );
    }
  }

  if (warnings.length) {
    console.log("");
    warnings.forEach((w) => console.log(w));
  }

  console.log(
    `\n${C.bold}Tổng:${C.reset} ${fks.length} FK hợp lệ, ${warnings.length} cảnh báo`,
  );

  await sql.end();
  process.exit(warnings.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`${C.red}✗ Lỗi:${C.reset}`, e);
  process.exit(2);
});
