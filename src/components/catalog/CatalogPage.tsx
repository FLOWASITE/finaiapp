import { useEffect, useMemo, useRef } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCatalogStore } from "@/stores/catalogStore";
import { matchesSearch } from "@/lib/catalog-search";
import { catalogQueryOptions } from "@/lib/catalog/queries";
import {
  upsertCatalogItem,
  softDeleteCatalogItem,
} from "@/lib/catalog/catalog.functions";
import { CatalogHeader } from "./CatalogHeader";
import { CatalogSearchBar } from "./CatalogSearchBar";
import { CatalogTabs } from "./CatalogTabs";
import { QuickFilterChips, FILTER_KEYS } from "./QuickFilterChips";
import { CategorySidebar } from "./CategorySidebar";
import { ItemList } from "./ItemList";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { BulkActionBar } from "./BulkActionBar";


export function CatalogPage() {
  const { data } = useSuspenseQuery(catalogQueryOptions);
  const queryClient = useQueryClient();
  const upsertFn = useServerFn(upsertCatalogItem);
  const removeFn = useServerFn(softDeleteCatalogItem);

  const items = useCatalogStore((s) => s.items);
  const setItems = useCatalogStore((s) => s.setItems);
  const setMutator = useCatalogStore((s) => s.setMutator);
  const activeTab = useCatalogStore((s) => s.activeTab);
  const search = useCatalogStore((s) => s.searchQuery);
  const selectedCategory = useCatalogStore((s) => s.selectedCategory);
  const activeFilters = useCatalogStore((s) => s.activeFilters);
  const setSearch = useCatalogStore((s) => s.setSearchQuery);
  const clearSelection = useCatalogStore((s) => s.clearSelection);
  const openDrawer = useCatalogStore((s) => s.openDrawer);
  const drawerItemCode = useCatalogStore((s) => s.drawerItemCode);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync dữ liệu server -> store (giữ nguyên logic filter/search hiện có)
  useEffect(() => {
    setItems(data.items);
  }, [data.items, setItems]);

  // Wire mutator để store actions tự ghi DB + invalidate cache
  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.invalidateQueries({ queryKey: ["products-picker"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    };
    setMutator({
      upsert: async (item) => {
        const res = await upsertFn({ data: { item: item as any } });
        invalidate();
        return res;
      },
      remove: async (id) => {
        const res = await removeFn({ data: { id } });
        invalidate();
        return res;
      },
    });
    return () => setMutator(null);
  }, [setMutator, upsertFn, removeFn, queryClient]);

  // base list per tab — tất cả nguồn từ DB
  //  - mine: bản ghi `products` (đã có giao dịch hoặc đã copy thủ công từ thư viện)
  //  - library: 170 mặt hàng thư viện chuẩn từ `tenant_product_catalog` (is_global)
  //  - suggested: AI đề xuất
  const tabItems = useMemo(() => {
    if (activeTab === "mine") return items.filter((i) => i.isActive && !i.isAiSuggested);
    if (activeTab === "suggested") return items.filter((i) => !i.isActive && i.isAiSuggested);
    return items.filter((i) => i.isAiSuggested);
  }, [items, activeTab]);

  // search + filters (excluding category)
  const filteredNoCategory = useMemo(() => {
    return tabItems.filter((it) => {
      if (!matchesSearch(it, search)) return false;
      if (activeFilters.has(FILTER_KEYS.USED_THIS_MONTH) && (it.usageCount30Days ?? 0) === 0)
        return false;
      if (
        activeFilters.has(FILTER_KEYS.HAS_WARNING) &&
        !(
          it.foreignSupplierTax === "fct_applicable" ||
          it.allocationMethod === "manual_split" ||
          it.amortization !== "expense_immediately"
        )
      )
        return false;
      if (activeFilters.has(FILTER_KEYS.PREPAID) && it.amortization === "expense_immediately")
        return false;
      if (activeFilters.has(FILTER_KEYS.FOREIGN) && it.foreignSupplierTax !== "fct_applicable")
        return false;
      const goodsOn = activeFilters.has(FILTER_KEYS.GOODS);
      const servicesOn = activeFilters.has(FILTER_KEYS.SERVICES);
      if (goodsOn || servicesOn) {
        const okGoods = goodsOn && it.itemType === "goods";
        const okServices = servicesOn && it.itemType === "service";
        if (!okGoods && !okServices) return false;
      }
      return true;
    });
  }, [tabItems, search, activeFilters]);

  // apply category last
  const visibleItems = useMemo(() => {
    if (!selectedCategory) return filteredNoCategory;
    return filteredNoCategory.filter((i) => i.category === selectedCategory);
  }, [filteredNoCategory, selectedCategory]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable;
      if (e.key === "Escape") {
        if (drawerItemCode) openDrawer(null);
        else if (search) setSearch("");
        else clearSelection();
        return;
      }
      if ((e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerItemCode, search, openDrawer, setSearch, clearSelection]);

  return (
    <div className="min-h-full bg-background font-['Inter','Be_Vietnam_Pro',ui-sans-serif,system-ui,sans-serif]">
      <div className="w-full p-4 md:p-6 space-y-4">
        <CatalogHeader />
        <CatalogSearchBar ref={searchRef} />
        <CatalogTabs />
        <QuickFilterChips />

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex flex-col md:flex-row">
            <CategorySidebar visibleItems={filteredNoCategory} />
            <main className="flex-1 p-4 min-w-0">
              <ItemList items={visibleItems} />
            </main>
          </div>
        </div>
      </div>

      <BulkActionBar />
      <ItemDetailDrawer />
    </div>
  );
}
