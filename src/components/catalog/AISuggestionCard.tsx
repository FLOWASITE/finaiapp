import { Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { CatalogItem } from "@/types/catalog";
import { Button } from "@/components/ui/button";
import { ItemBadges } from "./ItemBadges";
import { useCatalogStore } from "@/stores/catalogStore";

export function AISuggestionCard({ item }: { item: CatalogItem }) {
  const addItemToMine = useCatalogStore((s) => s.addItemToMine);
  const openDrawer = useCatalogStore((s) => s.openDrawer);

  return (
    <div className="rounded-lg border border-[#0F6E56]/20 bg-gradient-to-br from-[#E1F5EE]/40 to-white p-3 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-[#1D9E75]" />
            <span className="text-[10px] uppercase tracking-wide text-[#0F6E56] font-semibold">
              Fin đề xuất
            </span>
          </div>
          <button
            onClick={() => openDrawer(item.code)}
            className="text-left font-medium text-[#04342C] hover:underline"
          >
            {item.name}
          </button>
          {item.aiSuggestionReason && (
            <div className="text-[11px] text-[#2C2C2A] mt-1 italic">
              "{item.aiSuggestionReason}"
            </div>
          )}
          <div className="mt-2">
            <ItemBadges item={item} />
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button
            size="sm"
            className="bg-[#0F6E56] hover:bg-[#085041] text-white h-7"
            onClick={() => {
              addItemToMine(item.code);
              toast.success(`Đã thêm "${item.name}" vào danh mục của bạn`);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Thêm
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-muted-foreground">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
