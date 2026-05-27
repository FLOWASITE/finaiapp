import { useMemo } from "react";
import * as Icons from "lucide-react";
import { CATEGORIES } from "@/data/categories";
import { CatalogItem, CategoryCode } from "@/types/catalog";
import { useCatalogStore } from "@/stores/catalogStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function getIcon(name: string) {
  const I = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  return I ?? Icons.Tag;
}

export function CategorySidebar({ visibleItems }: { visibleItems: CatalogItem[] }) {
  const selectedCategory = useCatalogStore((s) => s.selectedCategory);
  const setSelectedCategory = useCatalogStore((s) => s.setSelectedCategory);

  const counts = useMemo(() => {
    const m = new Map<CategoryCode, number>();
    for (const it of visibleItems) m.set(it.category, (m.get(it.category) ?? 0) + 1);
    return m;
  }, [visibleItems]);

  const cats = CATEGORIES.filter((c) => counts.get(c.code));

  // Mobile dropdown
  const mobile = (
    <div className="md:hidden">
      <Select
        value={selectedCategory ?? "all"}
        onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}
      >
        <SelectTrigger className="bg-white">
          <SelectValue placeholder="Nhóm danh mục" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả nhóm ({visibleItems.length})</SelectItem>
          {cats.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.nameVi} ({counts.get(c.code)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const desktop = (
    <aside className="hidden md:block w-[240px] xl:w-[260px] shrink-0 border-r border-gray-200">
      <div className="p-3 space-y-0.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
            selectedCategory === null
              ? "bg-[#E1F5EE] text-[#0F6E56] font-medium"
              : "text-[#2C2C2A] hover:bg-gray-50"
          }`}
        >
          <span>Tất cả</span>
          <span className="text-xs text-muted-foreground">{visibleItems.length}</span>
        </button>
        {cats.map((c) => {
          const Icon = getIcon(c.icon);
          const active = selectedCategory === c.code;
          return (
            <button
              key={c.code}
              onClick={() => setSelectedCategory(c.code)}
              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-[#E1F5EE] text-[#0F6E56] font-medium"
                  : "text-[#2C2C2A] hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{c.nameVi}</span>
                {c.isIndustry && (
                  <span className="text-[9px] uppercase tracking-wide rounded bg-[#E1F5EE] text-[#0F6E56] px-1 py-0.5">
                    NGÀNH
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">{counts.get(c.code)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );

  return (
    <>
      {mobile}
      {desktop}
    </>
  );
}
