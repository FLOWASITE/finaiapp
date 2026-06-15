// Adapter: dữ liệu thật trong DB (products + tenant_product_catalog) -> CatalogItem (UI).
// Hàm pure, không phụ thuộc Supabase.
import type {
  CatalogItem,
  CategoryCode,
  ItemType,
} from "@/types/catalog";
import { CATEGORY_BY_CODE } from "@/data/categories";

export interface DbProductRow {
  id: string;
  code: string | null;
  name: string;
  unit?: string | null;
  unit_cost?: number | null;
  unit_price?: number | null;
  stock_account?: string | null;
  revenue_account?: string | null;
  cogs_account?: string | null;
  expense_account?: string | null;
  vat_rate?: number | string | null;
  on_hand?: number | null;
  is_active?: boolean | null;
  notes?: string | null;
  item_type?: string | null;
  aliases?: string[] | null;
  category_id?: string | null;
  product_categories?: { name: string | null } | null;
}

export interface DbTpcRow {
  id: string;
  sku: string | null;
  name: string;
  name_norm: string | null;
  aliases: string[] | null;
  note: string | null;
  category?: string | null;
  subcategory?: string | null;
  item_type?: string | null;
  default_account?: string | null;
  vat_rate?: number | string | null;
}

const ACC_TO_CATEGORY: Record<string, CategoryCode> = {
  "152": "MANUFACTURING",
  "153": "MANUFACTURING",
  "156": "RETAIL",
  "211": "VAN_PHONG",
  "213": "CNTT",
  "242": "TAI_CHINH",
};

function pickCategory(catName: string | null | undefined, account: string | null | undefined): CategoryCode {
  const n = (catName ?? "").toLowerCase();
  if (n.includes("nguyên") || n.includes("vật liệu")) return "MANUFACTURING";
  if (n.includes("công cụ") || n.includes("ccdc")) return "MANUFACTURING";
  if (n.includes("hàng") || n.includes("thương")) return "RETAIL";
  if (n.includes("dịch vụ")) return "CHUYEN_MON";
  if (n.includes("văn phòng")) return "VAN_PHONG";
  if (n.includes("phần mềm") || n.includes("cntt") || n.includes("it")) return "CNTT";
  if (account && ACC_TO_CATEGORY[account]) return ACC_TO_CATEGORY[account];
  return "VAN_PHONG";
}

function normItemType(t: string | null | undefined): ItemType {
  if (t === "service" || t === "goods" || t === "mixed") return t;
  return "goods";
}

export function productToCatalogItem(p: DbProductRow): CatalogItem {
  const itemType = normItemType(p.item_type);
  const account =
    (itemType === "service" ? p.expense_account : p.stock_account) ??
    p.expense_account ??
    p.stock_account ??
    (itemType === "service" ? "642" : "156");
  const altRaw = [p.revenue_account, p.cogs_account, p.expense_account, p.stock_account].filter(
    (x): x is string => !!x && x !== account,
  );
  const altAccounts = Array.from(new Set(altRaw));
  const vatRateRaw = p.vat_rate == null ? 0.1 : Number(p.vat_rate);
  const vatRate = Number.isFinite(vatRateRaw) ? (vatRateRaw > 1 ? vatRateRaw / 100 : vatRateRaw) : 0.1;
  const catName = p.product_categories?.name ?? null;
  return {
    id: p.id,
    code: p.code ?? `P-${p.id.slice(0, 8)}`,
    name: p.name,
    category: pickCategory(catName, account),
    subcategory: catName ?? undefined,
    itemType,
    defaultAccountTT99: account,
    defaultAccountTT133: account,
    altAccounts,
    vatRateStandard: Number.isFinite(vatRate) ? vatRate : 0.1,
    vatReductionEligible: false,
    deductible: true,
    aliases: p.aliases ?? [],
    typicalSuppliers: [],
    supplierCountry: "VN",
    frequency: "adhoc",
    amortization: account === "242" ? "prepaid_short" : account === "211" || account === "213" ? "prepaid_long" : "expense_immediately",
    allocationMethod: "single",
    industryRelevance: [],
    foreignSupplierTax: "none",
    fctVatRate: 0,
    fctCitRate: 0,
    notes: p.notes ?? undefined,
    isActive: p.is_active !== false,
    usageCount30Days: 0,
  };
}

export function tpcToCatalogItem(t: DbTpcRow): CatalogItem {
  const categoryRaw = (t.category ?? "").toUpperCase();
  const category: CategoryCode =
    categoryRaw && CATEGORY_BY_CODE[categoryRaw]
      ? (categoryRaw as CategoryCode)
      : "VAN_PHONG";
  const itemType = normItemType(t.item_type);
  const account =
    t.default_account ?? (itemType === "service" ? "642" : "156");
  const vatRate = t.vat_rate == null ? 0.1 : Number(t.vat_rate);
  return {
    id: t.id,
    code: t.sku ?? `TPC-${t.id.slice(0, 8)}`,
    name: t.name,
    category,
    subcategory: t.subcategory ?? undefined,
    itemType,
    defaultAccountTT99: account,
    defaultAccountTT133: account,
    altAccounts: [],
    vatRateStandard: Number.isFinite(vatRate) ? vatRate : 0.1,
    vatReductionEligible: false,
    deductible: true,
    aliases: t.aliases ?? [],
    typicalSuppliers: [],
    supplierCountry: "VN",
    frequency: "adhoc",
    amortization:
      account === "242"
        ? "prepaid_short"
        : account === "211" || account === "213"
          ? "prepaid_long"
          : "expense_immediately",
    allocationMethod: "single",
    industryRelevance: [],
    foreignSupplierTax: "none",
    fctVatRate: 0,
    fctCitRate: 0,
    notes: t.note ?? undefined,
    isActive: false,
    isAiSuggested: true,
    aiSuggestionReason: "Đã có trong danh mục AI nhưng chưa tạo mặt hàng tương ứng",
    usageCount30Days: 0,
  };
}

function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function mergeCatalog(products: DbProductRow[], tpc: DbTpcRow[]): CatalogItem[] {
  const items = products.map(productToCatalogItem);
  const known = new Set(items.map((i) => nameKey(i.name)));
  for (const t of tpc) {
    const key = nameKey(t.name_norm ?? t.name);
    if (known.has(key)) continue;
    items.push(tpcToCatalogItem(t));
    known.add(key);
  }
  return items;
}
