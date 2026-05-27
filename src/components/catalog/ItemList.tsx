import { CatalogItem } from "@/types/catalog";
import { useCatalogStore } from "@/stores/catalogStore";
import { ItemCard } from "./ItemCard";
import { AISuggestionCard } from "./AISuggestionCard";
import { EmptyState } from "./EmptyState";

export function ItemList({ items }: { items: CatalogItem[] }) {
  const activeTab = useCatalogStore((s) => s.activeTab);

  if (items.length === 0) {
    return (
      <EmptyState
        title={
          activeTab === "mine"
            ? "Chưa có mặt hàng nào trong danh mục"
            : activeTab === "suggested"
              ? "Hiện chưa có đề xuất từ Fin"
              : "Không có kết quả phù hợp"
        }
        hint={
          activeTab === "mine"
            ? "Hãy sang tab \"Fin đề xuất\" hoặc \"Thư viện\" để thêm mặt hàng."
            : "Thử bỏ bớt bộ lọc hoặc đổi từ khoá tìm kiếm."
        }
      />
    );
  }

  if (activeTab === "mine") {
    const recent = items
      .filter((i) => (i.usageCount30Days ?? 0) > 0)
      .sort((a, b) => (b.usageCount30Days ?? 0) - (a.usageCount30Days ?? 0));
    const others = items.filter((i) => (i.usageCount30Days ?? 0) === 0);

    return (
      <div className="space-y-6">
        {recent.length > 0 && (
          <section>
            <SectionLabel>Dùng gần đây</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {recent.map((it) => (
                <ItemCard key={it.code} item={it} />
              ))}
            </div>
          </section>
        )}
        {others.length > 0 && (
          <section>
            <SectionLabel>Khác trong danh mục</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {others.map((it) => (
                <ItemCard key={it.code} item={it} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (activeTab === "suggested") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {items.map((it) => (
          <AISuggestionCard key={it.code} item={it} />
        ))}
      </div>
    );
  }

  // library
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
      {items.map((it) => (
        <ItemCard key={it.code} item={it} />
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
      {children}
    </div>
  );
}
