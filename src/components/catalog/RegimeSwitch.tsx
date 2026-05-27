import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCatalogStore } from "@/stores/catalogStore";
import { AccountingRegime } from "@/types/catalog";

const OPTIONS: { value: AccountingRegime; label: string; sub: string }[] = [
  {
    value: "TT99",
    label: "TT 99/2025",
    sub: "Áp dụng mặc định từ 01/01/2026 (thay TT 200/2014)",
  },
  {
    value: "TT133",
    label: "TT 133/2016",
    sub: "Áp dụng cho DN nhỏ và vừa",
  },
];

export function RegimeSwitch() {
  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const switchRegime = useCatalogStore((s) => s.switchRegime);
  const current = OPTIONS.find((o) => o.value === regime)!;

  const onPick = (v: AccountingRegime) => {
    if (v === regime) return;
    switchRegime(v);
    toast.success(
      `Đã chuyển sang Thông tư ${v === "TT99" ? "99" : "133"}. Các tài khoản mặc định đã được cập nhật.`,
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded-full border border-[#0F6E56]/20 bg-[#E1F5EE] px-2.5 py-0.5 text-xs font-medium text-[#0F6E56] transition-colors hover:bg-[#9FE1CB]">
        {current.label.replace("/", " · ").split(" · ")[0]}
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => onPick(o.value)}
            className="flex items-start gap-2 py-2"
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${o.value === regime ? "opacity-100 text-[#0F6E56]" : "opacity-0"}`}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-[11px] text-muted-foreground italic">{o.sub}</div>
            </div>
          </DropdownMenuItem>
        ))}
        <div className="border-t mt-1 px-2 py-2 text-[11px] italic text-muted-foreground">
          Ảnh hưởng đến TK mặc định hiển thị. Có thể đổi bất kỳ lúc nào.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
