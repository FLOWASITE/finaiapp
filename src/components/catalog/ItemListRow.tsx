import { MoreHorizontal, Trash2, Eye, Copy } from "lucide-react";
import { CatalogItem } from "@/types/catalog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogStore } from "@/stores/catalogStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ItemListRow({ item }: { item: CatalogItem }) {
  const openDrawer = useCatalogStore((s) => s.openDrawer);
  const toggleItemSelection = useCatalogStore((s) => s.toggleItemSelection);
  const selectedItemCodes = useCatalogStore((s) => s.selectedItemCodes);
  const removeItemFromMine = useCatalogStore((s) => s.removeItemFromMine);
  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const selected = selectedItemCodes.has(item.code);
  const account =
    regime === "TT133" ? item.defaultAccountTT133 : item.defaultAccountTT99;
  const supplier = item.typicalSuppliers[0] ?? "—";

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-gray-50",
        selected && "bg-[#0F6E56]/5",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => toggleItemSelection(item.code)}
      />

      <button
        onClick={() => openDrawer(item.code)}
        className="flex flex-1 min-w-0 items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[#04342C]">{item.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            <span className="font-mono">{item.code}</span>
            <span className="mx-1">·</span>
            <span>{supplier}</span>
          </div>
        </div>

        <Badge
          variant="secondary"
          className="hidden md:inline-flex shrink-0 text-[10px]"
        >
          {item.itemType === "goods"
            ? "Hàng hóa"
            : item.itemType === "service"
              ? "Dịch vụ"
              : "Hỗn hợp"}
        </Badge>

        <div className="hidden sm:block shrink-0 w-16 text-right font-mono text-xs text-[#04342C]">
          {account}
        </div>

        <div className="hidden sm:block shrink-0 w-12 text-right text-xs text-muted-foreground">
          {item.vatRateStandard}%
        </div>

        <div className="hidden lg:block shrink-0 w-24 text-right text-[11px] text-muted-foreground">
          {(item.usageCount30Days ?? 0) > 0
            ? `${item.usageCount30Days} lần/30d`
            : "—"}
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-60 hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => openDrawer(item.code)}>
            <Eye className="h-4 w-4 mr-2" /> Xem chi tiết
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => toast("Đã sao chép mã: " + item.code)}
          >
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
  );
}
