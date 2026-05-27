import { MoreHorizontal, Trash2, Eye, Copy } from "lucide-react";
import { CatalogItem } from "@/types/catalog";
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
import { ItemBadges } from "./ItemBadges";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Cấu trúc cột (dùng chung header + row)
// [checkbox 28] | Tên & mã (flex) | Loại (110) | TK (72) | VAT (56) | Dùng/30d (88) | actions (32)
const ROW =
  "grid grid-cols-[28px_minmax(0,1fr)_32px] sm:grid-cols-[28px_minmax(0,1fr)_72px_56px_32px] md:grid-cols-[28px_minmax(0,1fr)_110px_72px_56px_32px] lg:grid-cols-[28px_minmax(0,1fr)_110px_72px_56px_88px_32px] items-center gap-3 px-3";

export function ItemListHeader() {
  return (
    <div
      className={cn(
        ROW,
        "h-9 border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold",
      )}
    >
      <span />
      <span>Mặt hàng</span>
      <span className="hidden md:block">Loại</span>
      <span className="hidden sm:block text-right">TK</span>
      <span className="hidden sm:block text-right">VAT</span>
      <span className="hidden lg:block text-right">Dùng/30d</span>
      <span />
    </div>
  );
}

export function ItemListRow({ item }: { item: CatalogItem }) {
  const openDrawer = useCatalogStore((s) => s.openDrawer);
  const toggleItemSelection = useCatalogStore((s) => s.toggleItemSelection);
  const selectedItemCodes = useCatalogStore((s) => s.selectedItemCodes);
  const removeItemFromMine = useCatalogStore((s) => s.removeItemFromMine);
  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const selected = selectedItemCodes.has(item.code);
  const account =
    regime === "TT99" ? item.defaultAccountTT99 : item.defaultAccountTT133;
  const supplier = item.typicalSuppliers[0] ?? "—";
  const typeLabel =
    item.itemType === "goods"
      ? "Hàng hóa"
      : item.itemType === "service"
        ? "Dịch vụ"
        : "Hỗn hợp";
  const typeClass =
    item.itemType === "goods"
      ? "bg-[#E6F1FB] text-[#042C53]"
      : item.itemType === "service"
        ? "bg-[#E1F5EE] text-[#0F6E56]"
        : "bg-[#F1EFE8] text-[#2C2C2A]";

  return (
    <div
      className={cn(
        ROW,
        "group h-12 transition-colors hover:bg-gray-50",
        selected && "bg-[#0F6E56]/5 hover:bg-[#0F6E56]/10",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => toggleItemSelection(item.code)}
      />

      <button
        onClick={() => openDrawer(item.code)}
        className="min-w-0 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[#04342C]">{item.name}</span>
          {(item.usageCount30Days ?? 0) > 0 && (
            <span className="hidden xl:inline shrink-0 rounded bg-[#E1F5EE] px-1.5 py-0.5 text-[10px] font-medium text-[#0F6E56]">
              hot
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
          <span className="font-mono">{item.code}</span>
          <span>·</span>
          <span className="truncate">{supplier}</span>
          <span className="hidden md:flex items-center gap-1.5 truncate">
            <span>·</span>
            <span className="truncate">
              <span className="md:hidden xl:hidden 2xl:inline">
                <ItemBadgesInline item={item} />
              </span>
            </span>
          </span>
        </div>
      </button>

      <div className="hidden md:flex justify-start">
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            typeClass,
          )}
        >
          {typeLabel}
        </span>
      </div>

      <div className="hidden sm:block text-right font-mono text-xs text-[#04342C]">
        {account}
      </div>

      <div className="hidden sm:block text-right text-xs tabular-nums text-muted-foreground">
        {item.vatRateStandard}%
      </div>

      <div className="hidden lg:block text-right text-[11px] tabular-nums text-muted-foreground">
        {(item.usageCount30Days ?? 0) > 0 ? `${item.usageCount30Days} lần` : "—"}
      </div>

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
        <DropdownMenuContent align="end" className="w-44">
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

// Phụ trợ: hiển thị badges gọn inline ở meta line (chỉ hiện ở màn rộng)
function ItemBadgesInline({ item }: { item: CatalogItem }) {
  // tránh import vòng — chỉ hiện cờ cảnh báo quan trọng
  const flags: string[] = [];
  if (item.foreignSupplierTax === "fct_applicable") flags.push("FCT");
  if (item.amortization !== "expense_immediately") flags.push("Trả trước");
  if (item.allocationMethod === "manual_split") flags.push("Chia tay");
  if (flags.length === 0) return null;
  return <span>{flags.join(" · ")}</span>;
}

// Keep ItemBadges import resolved (avoid unused warning on bundlers)
void ItemBadges;
