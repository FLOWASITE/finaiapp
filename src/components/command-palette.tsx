import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Banknote,
  Boxes,
  Building2,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type Item = {
  label: string;
  to: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
};

const ITEMS: Item[] = [
  { label: "Bảng điều khiển", to: "/dashboard", group: "Tổng quan", icon: LayoutDashboard, keywords: ["dashboard", "home"] },
  { label: "Trợ lý AI", to: "/chat", group: "Tổng quan", icon: Sparkles, keywords: ["chat", "ai"] },

  { label: "Hóa đơn điện tử (HĐĐT)", to: "/einvoices", group: "HĐĐT", icon: FileText, keywords: ["hddt", "einvoice", "e-invoice", "hoa don dien tu"] },
  { label: "Hóa đơn bán hàng", to: "/sales", group: "HĐĐT", icon: ShoppingCart, keywords: ["ban hang", "sales"] },
  { label: "Hóa đơn mua hàng", to: "/purchases", group: "HĐĐT", icon: Truck, keywords: ["mua hang", "purchase"] },

  { label: "Thuế GTGT", to: "/tax/gtgt", group: "Thuế", icon: Receipt, keywords: ["vat", "gtgt", "thue"] },
  { label: "Báo cáo", to: "/reports", group: "Báo cáo", icon: BarChart3, keywords: ["report", "bao cao"] },

  { label: "Phải thu", to: "/receivables", group: "Công nợ", icon: CircleDollarSign, keywords: ["ar", "phai thu"] },
  { label: "Phải trả", to: "/payables", group: "Công nợ", icon: Wallet, keywords: ["ap", "phai tra"] },

  { label: "Hàng hoá & Dịch vụ", to: "/items", group: "Kế toán", icon: Package, keywords: ["items", "products", "hhdv", "hang hoa", "dich vu"] },
  { label: "Kho — Tồn kho", to: "/inventory", group: "Kế toán", icon: Boxes, keywords: ["kho", "inventory", "ton kho"] },
  { label: "Kho — Phiếu nhập / xuất", to: "/inventory/movements", group: "Kế toán", icon: Boxes, keywords: ["nhap xuat", "movement"] },
  { label: "Kho — Thẻ kho", to: "/inventory/stock-card", group: "Kế toán", icon: Boxes, keywords: ["the kho", "stock card"] },
  { label: "Ngân hàng", to: "/bank", group: "Kế toán", icon: Banknote, keywords: ["bank", "ngan hang"] },
  { label: "Tiền mặt", to: "/cash", group: "Kế toán", icon: Wallet, keywords: ["cash", "tien mat"] },
  { label: "Tài sản", to: "/assets", group: "Kế toán", icon: Package, keywords: ["tsco", "assets", "tai san"] },
  { label: "Lương", to: "/payroll", group: "Kế toán", icon: Users, keywords: ["payroll", "luong"] },
  { label: "Sổ nhật ký", to: "/journal", group: "Kế toán", icon: FileText, keywords: ["journal", "nhat ky", "so"] },
  { label: "Hệ thống tài khoản", to: "/coa", group: "Kế toán", icon: FileText, keywords: ["coa", "tai khoan"] },

  { label: "Nhà cung cấp", to: "/suppliers", group: "Danh mục", icon: Truck, keywords: ["suppliers", "ncc"] },
  { label: "Khách hàng", to: "/customers", group: "Danh mục", icon: Users, keywords: ["customers", "kh"] },

  { label: "Cài đặt", to: "/settings", group: "Hệ thống", icon: Settings, keywords: ["settings"] },
  { label: "Quản trị", to: "/admin", group: "Hệ thống", icon: Building2, keywords: ["admin"] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    const openEvt = () => setOpen(true);
    window.addEventListener("app:open-command", openEvt);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("app:open-command", openEvt);
    };
  }, []);

  const groups = ITEMS.reduce<Record<string, Item[]>>((acc, it) => {
    (acc[it.group] ||= []).push(it);
    return acc;
  }, {});

  const go = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Tìm nhanh: HĐĐT, Thuế, Báo cáo…" />
      <CommandList>
        <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
        {Object.entries(groups).map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <CommandItem
                    key={it.to}
                    value={`${it.label} ${(it.keywords ?? []).join(" ")}`}
                    onSelect={() => go(it.to)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{it.label}</span>
                    <CommandShortcut className="text-[10px] text-muted-foreground/60">{it.to}</CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

export function openCommandPalette() {
  window.dispatchEvent(new Event("app:open-command"));
}
