/**
 * In-memory cache cho Agent Hạch toán — server-only, per Worker isolate.
 *
 * Mục đích: tránh N+1 query khi listInboxAi loop từng hoá đơn.
 * - TTL ngắn (5 phút) để không stale lâu sau khi user duyệt.
 * - Mọi mutation (approve/skip/autoPost/saveRule) phải gọi invalidate(tenantId).
 *
 * Cache scope theo (tenant_id) — không cross-tenant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineKind } from "@/lib/ai/classify-line";
import type { LineKindV2 } from "@/lib/ai/classify-line-v2";
import type { ProposalLine } from "./types";

const TTL_MS = 5 * 60 * 1000;
const TENANT_CAP = 50; // max tenants cùng lúc trong cache mỗi loại
const ROW_CAP = 5000; // max rows / tenant

type Entry<T> = { value: T; expiresAt: number };

// ---- Storages ----
type MemRow = {
  line_name_norm: string;
  kind: LineKind;
  account: string;
  hit_count: number;
  supplier_tax_id: string | null;
};
type TplRow = {
  id: string;
  display_name: string;
  template_lines: ProposalLine[];
  template_version: number | null;
  sample_count: number;
  default_account: string | null;
};

const memoryStore = new Map<string, Entry<MemRow[]>>();
const templateStore = new Map<string, Entry<TplRow[]>>();
const industryStore = new Map<string, Entry<{ kind: LineKind; label: string } | null>>();
const historyStore = new Map<string, Entry<Partial<Record<LineKind, number>> | null>>();

function evictOldest<T>(map: Map<string, Entry<T>>) {
  if (map.size <= TENANT_CAP) return;
  const firstKey = map.keys().next().value;
  if (firstKey) map.delete(firstKey);
}

function setEntry<T>(map: Map<string, Entry<T>>, key: string, value: T) {
  map.set(key, { value, expiresAt: Date.now() + TTL_MS });
  evictOldest(map);
}

function getEntry<T>(map: Map<string, Entry<T>>, key: string): T | undefined {
  const e = map.get(key);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    map.delete(key);
    return undefined;
  }
  return e.value;
}

// ============================================================
// Memory (ai_line_classifications) — toàn bộ tenant 1 lần
// ============================================================
export async function getTenantMemory(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<MemRow[]> {
  const cached = getEntry(memoryStore, tenantId);
  if (cached) return cached;
  const { data } = await supabase
    .from("ai_line_classifications")
    .select("line_name_norm, kind, account, hit_count, supplier_tax_id")
    .eq("tenant_id", tenantId)
    .order("hit_count", { ascending: false })
    .limit(ROW_CAP);
  const rows = ((data ?? []) as any[]) as MemRow[];
  setEntry(memoryStore, tenantId, rows);
  return rows;
}

/** Lọc memory theo line_norms + ưu tiên match supplier_tax_id. */
export function pickMemoryMap(
  rows: MemRow[],
  lineNorms: string[],
  supplierTaxId: string | null,
): Map<string, { kind: LineKind; account: string; hit_count: number }> {
  const wanted = new Set(lineNorms.filter(Boolean));
  if (wanted.size === 0) return new Map();
  const map = new Map<string, { kind: LineKind; account: string; hit_count: number }>();
  for (const r of rows) {
    if (!wanted.has(r.line_name_norm)) continue;
    const cur = map.get(r.line_name_norm);
    const sameVendor = supplierTaxId && r.supplier_tax_id === supplierTaxId;
    if (!cur || sameVendor) {
      map.set(r.line_name_norm, {
        kind: r.kind,
        account: r.account,
        hit_count: Number(r.hit_count ?? 1),
      });
    }
  }
  return map;
}

// ============================================================
// Vendor templates (ai_memory_partners)
// ============================================================
export async function getTenantVendorTemplates(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TplRow[]> {
  const cached = getEntry(templateStore, tenantId);
  if (cached) return cached;
  const { data } = await supabase
    .from("ai_memory_partners")
    .select("id, display_name, template_lines, template_version, sample_count, default_account")
    .eq("tenant_id", tenantId)
    .eq("party_kind", "supplier")
    .gte("sample_count", 3)
    .order("sample_count", { ascending: false })
    .limit(500);
  const rows = ((data ?? []) as any[])
    .filter((r) => Array.isArray(r.template_lines) && r.template_lines.length > 0) as TplRow[];
  setEntry(templateStore, tenantId, rows);
  return rows;
}

/** Trả về vendor template khớp tốt nhất với supplier_name (substring case-insensitive). */
export function pickVendorTemplate(rows: TplRow[], supplierName: string | null): TplRow | null {
  if (!supplierName) return null;
  const needle = supplierName.toLowerCase().slice(0, 30);
  if (!needle) return null;
  let best: TplRow | null = null;
  for (const r of rows) {
    const hay = (r.display_name ?? "").toLowerCase();
    if (hay.includes(needle) || needle.includes(hay)) {
      if (!best || r.sample_count > best.sample_count) best = r;
    }
  }
  return best;
}

// ============================================================
// Supplier industry (suppliers.vsic_code) — cache theo supplier_id
// ============================================================
export async function getSupplierIndustryCached(
  supabase: SupabaseClient,
  supplierId: string | null,
): Promise<{ kind: LineKind; label: string } | null> {
  if (!supplierId) return null;
  const cached = getEntry(industryStore, supplierId);
  if (cached !== undefined) return cached;
  const { data } = await supabase
    .from("suppliers")
    .select("vsic_code")
    .eq("id", supplierId)
    .maybeSingle();
  const { vsicToKindHint } = await import("@/lib/ai/classify-line");
  const hint = vsicToKindHint(data?.vsic_code);
  setEntry(industryStore, supplierId, hint);
  return hint;
}

// ============================================================
// History distribution per vendor — cache 5 phút
// ============================================================
export async function getVendorHistoryDistCached(
  supabase: SupabaseClient,
  tenantId: string,
  taxId: string | null,
  supplierId: string | null,
): Promise<Partial<Record<LineKind, number>> | null> {
  const key = `${tenantId}:${taxId ?? "_"}:${supplierId ?? "_"}`;
  const cached = getEntry(historyStore, key);
  if (cached !== undefined) return cached;
  if (!taxId && !supplierId) {
    setEntry(historyStore, key, null);
    return null;
  }
  const sinceISO = new Date(Date.now() - 365 * 86400000).toISOString();
  const q = taxId
    ? supabase
        .from("invoices")
        .select("expense_account, total")
        .eq("tenant_id", tenantId)
        .eq("supplier_tax_id", taxId)
        .gte("created_at", sinceISO)
        .limit(100)
    : supabase
        .from("invoices")
        .select("expense_account, total")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplierId!)
        .gte("created_at", sinceISO)
        .limit(100);
  const { data } = await q;
  const dist: Partial<Record<LineKind, number>> = {};
  for (const h of (data ?? []) as any[]) {
    const acc = String(h.expense_account ?? "");
    let k: LineKind | null = null;
    if (/^15[26]/.test(acc)) k = "goods";
    else if (/^153/.test(acc)) k = "ccdc";
    else if (/^21[1-8]/.test(acc)) k = "fixed_asset";
    else if (/^(62|63|64|66)/.test(acc)) k = "service";
    if (k) dist[k] = (dist[k] ?? 0) + Number(h.total ?? 0);
  }
  const value = Object.keys(dist).length > 0 ? dist : null;
  setEntry(historyStore, key, value);
  return value;
}

// ============================================================
// Prewarm + Invalidate
// ============================================================
export async function prewarmCategorizeCache(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<void> {
  await Promise.all([
    getTenantMemory(supabase, tenantId),
    getTenantVendorTemplates(supabase, tenantId),
  ]);
}

export function invalidateCategorizeCache(tenantId: string): void {
  memoryStore.delete(tenantId);
  templateStore.delete(tenantId);
  // industry/history keyed differently — quét xoá entry liên quan tenant
  for (const k of Array.from(historyStore.keys())) {
    if (k.startsWith(`${tenantId}:`)) historyStore.delete(k);
  }
  // industry keyed by supplier_id — không xoá vì không liên quan trực tiếp
  // vsic_code rất hiếm khi đổi
}
