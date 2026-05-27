import { CatalogItem } from "@/types/catalog";

export function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

export function matchesSearch(item: CatalogItem, query: string): boolean {
  const q = normalize(query.trim());
  if (!q) return true;
  const hay = [
    item.name,
    item.nameEn ?? "",
    item.code,
    item.subcategory ?? "",
    item.defaultAccountTT99,
    item.defaultAccountTT133,
    ...item.aliases,
    ...item.typicalSuppliers,
  ]
    .map(normalize)
    .join(" | ");
  return hay.includes(q);
}
