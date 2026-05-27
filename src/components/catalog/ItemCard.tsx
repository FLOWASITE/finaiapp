import { MoreHorizontal, Trash2, Eye, Copy } from "lucide-react";
import { CatalogItem } from "@/types/catalog";
import { ItemBadges } from "./ItemBadges";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogStore } from "@/stores/catalogStore";
import { toast } from "sonner";

export function ItemCard({ item }: { item: CatalogItem }) {
  const openDrawer = useCatalogStore((s) => s.openDrawer);
  const toggleItemSelection = useCatalogStore((s) => s.toggleItemSelection);
  const selectedItemCodes = useCatalogStore((s) => s.selectedItemCodes);
  const removeItemFromMine = useCatalogStore((s) => s.removeItemFromMine);
  const selected = selectedItemCodes.has(item.code);
  const supplier = item.typicalSuppliers[0] ?? "—";

  return (
    <div
      className={`group rounded-lg border bg-white p-3 transition-all hover:shadow-sm ${
        selected ? "border-[#0F6E56] ring-1 ring-[#0F6E56]/30" : "border-gray-200"
      }`}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={() => toggleItemSelection(item.code)}
          className="mt-1"
        />

        <button
          onClick={() => openDrawer(item.code)}
          className="flex-1 text-left min-w-0"
        >
          <div className="font-medium text-[#04342C] truncate">{item.name}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            <span className="font-mono">{item.code}</span>
            <span className="mx-1">·</span>
            <span>{supplier}</span>
            {(item.usageCount30Days ?? 0) > 0 && (
              <>
                <span className="mx-1">·</span>
                <span>dùng {item.usageCount30Days} lần tháng này</span>
              </>
            )}
          </div>
          <div className="mt-2">
            <ItemBadges item={item} />
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => openDrawer(item.code)}>
              <Eye className="h-4 w-4 mr-2" /> Xem chi tiết
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast("Đã sao chép mã: " + item.code)}>
              <Copy className="h-4 w-4 mr-2" /> Sao chép
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-700"
              onClick={() => {
                removeItemFromMine(item.code);
                toast.success(`Đã gỡ "${item.name}" khỏi danh mục của bạn`);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Gỡ khỏi danh mục
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
