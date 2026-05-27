import { create } from "zustand";
import { AccountingRegime, CatalogItem, CompanyContext } from "@/types/catalog";
import { SAMPLE_ITEMS } from "@/data/sample-catalog";

export type TabKey = "mine" | "suggested" | "library";

interface CatalogState {
  items: CatalogItem[];
  company: CompanyContext;
  searchQuery: string;
  activeTab: TabKey;
  selectedCategory: string | null;
  activeFilters: Set<string>;
  selectedItemCodes: Set<string>;
  drawerItemCode: string | null;

  setSearchQuery: (q: string) => void;
  setActiveTab: (tab: TabKey) => void;
  setSelectedCategory: (cat: string | null) => void;
  toggleFilter: (f: string) => void;
  toggleItemSelection: (code: string) => void;
  clearSelection: () => void;
  openDrawer: (code: string | null) => void;
  addItemToMine: (code: string) => void;
  removeItemFromMine: (code: string) => void;
  updateItem: (code: string, updates: Partial<CatalogItem>) => void;
  createItem: (item: CatalogItem) => void;
  switchRegime: (regime: AccountingRegime) => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  items: SAMPLE_ITEMS,
  company: {
    name: "Cty TNHH Aurora F&B",
    accountingRegime: "TT99",
    industry: "FNB",
    industryNameVi: "F&B - Nhà hàng",
  },
  searchQuery: "",
  activeTab: "mine",
  selectedCategory: null,
  activeFilters: new Set(),
  selectedItemCodes: new Set(),
  drawerItemCode: null,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveTab: (tab) => set({ activeTab: tab, selectedCategory: null, selectedItemCodes: new Set() }),
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),
  toggleFilter: (f) =>
    set((s) => {
      const next = new Set(s.activeFilters);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return { activeFilters: next };
    }),
  toggleItemSelection: (code) =>
    set((s) => {
      const next = new Set(s.selectedItemCodes);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { selectedItemCodes: next };
    }),
  clearSelection: () => set({ selectedItemCodes: new Set() }),
  openDrawer: (code) => set({ drawerItemCode: code }),
  addItemToMine: (code) =>
    set((s) => ({
      items: s.items.map((it) =>
        it.code === code ? { ...it, isActive: true, isAiSuggested: false } : it,
      ),
    })),
  removeItemFromMine: (code) =>
    set((s) => ({
      items: s.items.map((it) => (it.code === code ? { ...it, isActive: false } : it)),
    })),
  updateItem: (code, updates) =>
    set((s) => ({ items: s.items.map((it) => (it.code === code ? { ...it, ...updates } : it)) })),
  switchRegime: (regime) =>
    set((s) => ({ company: { ...s.company, accountingRegime: regime } })),
}));
