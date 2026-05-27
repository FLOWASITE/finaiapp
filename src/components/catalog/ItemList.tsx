import { CatalogItem } from "@/types/catalog";
import { useCatalogStore } from "@/stores/catalogStore";
import { ItemCard } from "./ItemCard";
import { ItemListRow, ItemListHeader } from "./ItemListRow";
import { AISuggestionCard } from "./AISuggestionCard";
import { EmptyState } from "./EmptyState";

const GRID_CLASSES =
  "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3";

export function ItemList({ items }: { items: CatalogItem[] }) {
  const activeTab = useCatalogStore((s) => s.activeTab);
  const viewMode = useCatalogStore((s) => s.viewMode);

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

  const renderGroup = (group: CatalogItem[]) => {
    if (viewMode === "list") {
      return (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white overflow-hidden">
          {group.map((it) => (
            <ItemListRow key={it.code} item={it} />
          ))}
        </div>
      );
    }
    return (
      <div className={GRID_CLASSES}>
        {group.map((it) => (
          <ItemCard key={it.code} item={it} />
        ))}
      </div>
    );
  };

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
            {renderGroup(recent)}
          </section>
        )}
        {others.length > 0 && (
          <section>
            <SectionLabel>Khác trong danh mục</SectionLabel>
            {renderGroup(others)}
          </section>
        )}
      </div>
    );
  }

  if (activeTab === "suggested") {
    // Gợi ý AI giữ card view riêng (CTA "Thêm vào danh mục" inline)
    return (
      <div className={GRID_CLASSES}>
        {items.map((it) => (
          <AISuggestionCard key={it.code} item={it} />
        ))}
      </div>
    );
  }

  // library
  return renderGroup(items);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
      {children}
    </div>
  );
}
