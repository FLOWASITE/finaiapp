import { create } from "zustand";
import { toast } from "sonner";
import { AccountingRegime, CatalogItem, CompanyContext } from "@/types/catalog";

export type TabKey = "mine" | "suggested" | "library";

export interface CatalogMutator {
  upsert: (item: CatalogItem) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

interface CatalogState {
  items: CatalogItem[];
  company: CompanyContext;
  searchQuery: string;
  activeTab: TabKey;
  selectedCategory: string | null;
  activeFilters: Set<string>;
  selectedItemCodes: Set<string>;
  drawerItemCode: string | null;
  _mutator: CatalogMutator | null;

  setItems: (items: CatalogItem[]) => void;
  setMutator: (m: CatalogMutator | null) => void;
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

function persistErr(label: string) {
  return (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error(`${label}: ${msg}`);
  };
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  items: [],
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
  _mutator: null,

  setItems: (items) => set({ items }),
  setMutator: (m) => set({ _mutator: m }),
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

  addItemToMine: (code) => {
    const s = get();
    const it = s.items.find((i) => i.code === code);
    if (it && s._mutator) {
      // Với gợi ý AI (TPC): bỏ id để tạo bản ghi products mới
      const payload: CatalogItem = it.isAiSuggested
        ? { ...it, id: undefined, isActive: true, isAiSuggested: false }
        : { ...it, isActive: true };
      s._mutator.upsert(payload).catch(persistErr("Không lưu được"));
    }
    set({
      items: s.items.map((i) =>
        i.code === code ? { ...i, isActive: true, isAiSuggested: false } : i,
      ),
    });
  },

  removeItemFromMine: (code) => {
    const s = get();
    const it = s.items.find((i) => i.code === code);
    if (it?.id && s._mutator && !it.isAiSuggested) {
      s._mutator.remove(it.id).catch(persistErr("Không gỡ được"));
    }
    set({
      items: s.items.map((i) => (i.code === code ? { ...i, isActive: false } : i)),
    });
  },

  updateItem: (code, updates) => {
    const s = get();
    const it = s.items.find((i) => i.code === code);
    const next = it ? { ...it, ...updates } : null;
    if (next && s._mutator) {
      s._mutator.upsert(next).catch(persistErr("Không cập nhật được"));
    }
    set({
      items: s.items.map((i) => (i.code === code ? { ...i, ...updates } : i)),
    });
  },

  createItem: (item) => {
    const s = get();
    if (s._mutator) {
      s._mutator
        .upsert({ ...item, isActive: true })
        .catch(persistErr("Không lưu được"));
    }
    set({ items: [{ ...item, isActive: true }, ...s.items] });
  },

  switchRegime: (regime) =>
    set((s) => ({ company: { ...s.company, accountingRegime: regime } })),
}));
