import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { searchGlobal, type SearchHit } from "@/lib/search.functions";
import {
  BarChart3,
  Banknote,
  Boxes,
  Building2,
  CircleDollarSign,
  FileText,
  Inbox as InboxIcon,
  LayoutDashboard,
  Package,
  Plus,
  Receipt,
  Search as SearchIcon,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wallet,
  ArrowRight,
  HelpCircle,
  Landmark,
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
import { openAskAi } from "@/lib/open-ask-ai";

type GoItem = {
  label: string;
  to: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
};

const GO_ITEMS: GoItem[] = [
  {
    label: "Hộp việc",
    to: "/inbox",
    group: "Tổng quan",
    icon: InboxIcon,
    keywords: ["inbox", "home"],
  },
  {
    label: "Bảng điều khiển",
    to: "/dashboard",
    group: "Tổng quan",
    icon: LayoutDashboard,
    keywords: ["dashboard"],
  },
  { label: "Trợ lý AI", to: "/chat", group: "Tổng quan", icon: Sparkles, keywords: ["chat", "ai"] },

  {
    label: "Hóa đơn điện tử (HĐĐT)",
    to: "/einvoices",
    group: "HĐĐT",
    icon: FileText,
    keywords: ["hddt", "einvoice"],
  },
  {
    label: "Hóa đơn bán hàng",
    to: "/sales",
    group: "HĐĐT",
    icon: ShoppingCart,
    keywords: ["ban hang", "sales"],
  },
  {
    label: "Hóa đơn mua hàng",
    to: "/purchases",
    group: "HĐĐT",
    icon: Truck,
    keywords: ["mua hang", "purchase"],
  },

  {
    label: "Thuế GTGT",
    to: "/tax/gtgt",
    group: "Thuế",
    icon: Receipt,
    keywords: ["vat", "gtgt", "thue"],
  },
  {
    label: "Báo cáo",
    to: "/reports",
    group: "Báo cáo",
    icon: BarChart3,
    keywords: ["report", "bao cao"],
  },

  {
    label: "Phải thu",
    to: "/receivables",
    group: "Công nợ",
    icon: CircleDollarSign,
    keywords: ["ar"],
  },
  { label: "Phải trả", to: "/payables", group: "Công nợ", icon: Wallet, keywords: ["ap"] },

  {
    label: "Hàng hóa & Dịch vụ",
    to: "/items",
    group: "Kế toán",
    icon: Package,
    keywords: ["items", "products", "hang hoa", "dich vu", "khai bao mat hang"],
  },
  {
    label: "Kho — Tồn kho",
    to: "/inventory",
    group: "Kế toán",
    icon: Boxes,
    keywords: ["kho", "inventory"],
  },
  { label: "Ngân hàng", to: "/bank", group: "Kế toán", icon: Banknote, keywords: ["bank"] },
  {
    label: "Đối soát ngân hàng",
    to: "/bank/reconcile",
    group: "Kế toán",
    icon: Landmark,
    keywords: ["reconcile", "doi soat"],
  },
  { label: "Tiền mặt", to: "/cash", group: "Kế toán", icon: Wallet, keywords: ["cash"] },
  {
    label: "Tài sản",
    to: "/assets",
    group: "Kế toán",
    icon: Package,
    keywords: ["tsco", "assets"],
  },
  { label: "Lương", to: "/payroll", group: "Kế toán", icon: Users, keywords: ["payroll", "luong"] },
  { label: "Sổ nhật ký", to: "/journal", group: "Kế toán", icon: FileText, keywords: ["journal"] },
  { label: "Hệ thống tài khoản", to: "/coa", group: "Kế toán", icon: FileText, keywords: ["coa"] },

  {
    label: "Nhà cung cấp",
    to: "/suppliers",
    group: "Danh mục",
    icon: Truck,
    keywords: ["suppliers", "ncc"],
  },
  {
    label: "Khách hàng",
    to: "/customers",
    group: "Danh mục",
    icon: Users,
    keywords: ["customers", "kh"],
  },

  { label: "Cài đặt", to: "/settings", group: "Hệ thống", icon: Settings, keywords: ["settings"] },
  { label: "Quản trị", to: "/admin", group: "Hệ thống", icon: Building2, keywords: ["admin"] },
];

type ActionItem = {
  label: string;
  intent: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
};

const ACTIONS: ActionItem[] = [
  {
    label: "Tạo phiếu thu",
    intent: "Tạo phiếu thu: ",
    icon: Banknote,
    keywords: ["thu", "receipt"],
  },
  {
    label: "Tạo phiếu chi",
    intent: "Tạo phiếu chi: ",
    icon: Banknote,
    keywords: ["chi", "payment"],
  },
  {
    label: "Tạo hoá đơn bán",
    intent: "Tạo hoá đơn bán cho: ",
    icon: Receipt,
    keywords: ["ban", "sales"],
  },
  {
    label: "Ghi nhận hoá đơn mua",
    intent: "Ghi nhận hoá đơn mua từ: ",
    icon: ShoppingCart,
    keywords: ["mua", "purchase"],
  },
  { label: "Nhập file (PDF/ảnh)", intent: "", icon: Plus, keywords: ["upload", "tai len"] },
  {
    label: "Đối soát sao kê",
    intent: "Đối soát sao kê ngân hàng kỳ này",
    icon: Landmark,
    keywords: ["reconcile"],
  },
];

const QUESTIONS: string[] = [
  "Tháng này lãi bao nhiêu?",
  "Ai nợ tôi quá 30 ngày?",
  "So sánh chi phí tháng này với tháng trước",
  "Hàng tồn kho nào sắp hết?",
  "Doanh thu top 5 khách hàng tháng này",
];

const VERB_PREFIXES = [
  "thu",
  "chi",
  "mua",
  "ban",
  "bán",
  "nhập",
  "xuất",
  "tạo",
  "ghi",
  "thanh toán",
  "chuyển khoản",
];

function looksLikeAction(q: string): boolean {
  const lower = q.toLowerCase().trim();
  if (lower.startsWith("+")) return true;
  return VERB_PREFIXES.some((v) => lower.startsWith(v + " ") || lower === v);
}

function looksLikeQuestion(q: string): boolean {
  const lower = q.toLowerCase().trim();
  return (
    lower.startsWith("?") ||
    lower.endsWith("?") ||
    /^(tại sao|vì sao|bao nhiêu|khi nào|ai |có bao|gì đang|làm sao)/.test(lower)
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  const groups = useMemo(() => {
    return GO_ITEMS.reduce<Record<string, GoItem[]>>((acc, it) => {
      (acc[it.group] ||= []).push(it);
      return acc;
    }, {});
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const go = (to: string) => {
    close();
    navigate({ to });
  };
  const ask = (prefill: string) => {
    close();
    openAskAi(prefill);
  };

  const runSearch = useServerFn(searchGlobal);
  const { data: searchData, isFetching: searchLoading } = useQuery({
    queryKey: ["cmdk-search", trimmed],
    queryFn: () => runSearch({ data: { query: trimmed } }),
    enabled: open && trimmed.length >= 2,
    staleTime: 30_000,
  });
  const hits = (searchData?.hits ?? []) as SearchHit[];
  const suppliers = hits.filter((h) => h.kind === "supplier");
  const invoices = hits.filter((h) => h.kind === "invoice");

  return (
    <CommandDialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <CommandInput

  return (
    <CommandDialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <CommandInput
        placeholder="Gõ lệnh, câu hỏi, hoặc tìm trang… (thử: 'thu 5tr từ KH A' hoặc 'tháng này lãi bao nhiêu?')"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Không có gợi ý. Nhấn Enter để hỏi AI.</CommandEmpty>

        {showSmartAction && (
          <CommandGroup heading="✨ Hành động thông minh">
            <CommandItem value={`smart-action ${trimmed}`} onSelect={() => ask(trimmed)}>
              <Plus className="mr-2 h-4 w-4 text-primary" />
              <span>
                Tạo: <span className="font-medium">{trimmed}</span>
              </span>
              <CommandShortcut>↵ AI</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        {showSmartQuestion && (
          <CommandGroup heading="❔ Hỏi AI">
            <CommandItem value={`smart-ask ${trimmed}`} onSelect={() => ask(trimmed)}>
              <HelpCircle className="mr-2 h-4 w-4 text-primary" />
              <span>
                Hỏi: <span className="font-medium">{trimmed}</span>
              </span>
              <CommandShortcut>↵ AI</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup heading="Hành động">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <CommandItem
                key={a.label}
                value={`action ${a.label} ${(a.keywords ?? []).join(" ")}`}
                onSelect={() => ask(a.intent || a.label)}
              >
                <Icon className="mr-2 h-4 w-4 text-emerald-500" />
                <span>{a.label}</span>
                <CommandShortcut>AI</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Hỏi">
          {QUESTIONS.map((q) => (
            <CommandItem key={q} value={`q ${q}`} onSelect={() => ask(q)}>
              <Sparkles className="mr-2 h-4 w-4 text-violet-500" />
              <span>{q}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {Object.entries(groups).map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={`Đi đến · ${group}`}>
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <CommandItem
                    key={it.to}
                    value={`go ${it.label} ${(it.keywords ?? []).join(" ")} ${it.to}`}
                    onSelect={() => go(it.to)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{it.label}</span>
                    <CommandShortcut className="text-[10px] text-muted-foreground/60">
                      <ArrowRight className="inline h-3 w-3" /> {it.to}
                    </CommandShortcut>
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
