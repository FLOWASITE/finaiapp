import { useState } from "react";
import { Plus, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalogStore } from "@/stores/catalogStore";
import { ItemCreateDialog } from "./ItemCreateDialog";
import { cn } from "@/lib/utils";

export function CatalogHeader() {
  const viewMode = useCatalogStore((s) => s.viewMode);
  const setViewMode = useCatalogStore((s) => s.setViewMode);
  const [open, setOpen] = useState(false);

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h1 className="text-lg font-semibold text-[#04342C]">
        Danh mục hàng hóa, dịch vụ
      </h1>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5">
          <button
            type="button"
            aria-label="Xem dạng lưới"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-[5px] transition-colors",
              viewMode === "grid"
                ? "bg-[#0F6E56] text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Xem dạng danh sách"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={cn(
              "inline-flex h-7 w-8 items-center justify-center rounded-[5px] transition-colors",
              viewMode === "list"
                ? "bg-[#0F6E56] text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <Button
          className="bg-[#0F6E56] hover:bg-[#085041] text-white"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" /> Tạo mới
        </Button>
      </div>
      <ItemCreateDialog open={open} onOpenChange={setOpen} />
    </header>
  );
}
