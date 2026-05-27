import { CheckCircle2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCatalogStore } from "@/stores/catalogStore";

export function BulkActionBar() {
  const selected = useCatalogStore((s) => s.selectedItemCodes);
  const clear = useCatalogStore((s) => s.clearSelection);
  const removeItem = useCatalogStore((s) => s.removeItemFromMine);
  const addItem = useCatalogStore((s) => s.addItemToMine);
  const activeTab = useCatalogStore((s) => s.activeTab);

  if (selected.size === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-lg">
      <span className="text-sm font-medium text-[#04342C]">
        Đã chọn {selected.size} mục
      </span>
      <div className="h-4 w-px bg-gray-200" />
      {activeTab !== "mine" ? (
        <Button
          size="sm"
          className="bg-[#0F6E56] hover:bg-[#085041] text-white"
          onClick={() => {
            selected.forEach((c) => addItem(c));
            toast.success(`Đã thêm ${selected.size} mục vào danh mục`);
            clear();
          }}
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> Thêm vào của tôi
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => {
            selected.forEach((c) => removeItem(c));
            toast.success(`Đã gỡ ${selected.size} mục`);
            clear();
          }}
        >
          <Trash2 className="h-4 w-4 mr-1.5" /> Gỡ khỏi danh mục
        </Button>
      )}
      <button onClick={clear} className="p-1 rounded-md hover:bg-gray-100 text-muted-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
