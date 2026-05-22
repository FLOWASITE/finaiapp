import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Brand colors + initials for VN banks. Colors approximated from official brand.
export type BankMeta = {
  name: string;
  short: string;
  color: string; // bg
  fg?: string; // text
  popular?: boolean;
};

export const VN_BANK_LIST: BankMeta[] = [
  { name: "Vietcombank", short: "VCB", color: "#007A4D", popular: true },
  { name: "VietinBank", short: "CTG", color: "#005BAC", popular: true },
  { name: "BIDV", short: "BIDV", color: "#00529B", popular: true },
  { name: "Agribank", short: "AGR", color: "#8B1F1F", popular: true },
  { name: "Techcombank", short: "TCB", color: "#E60012", popular: true },
  { name: "MB Bank", short: "MB", color: "#1E3A8A", popular: true },
  { name: "ACB", short: "ACB", color: "#0058A6", popular: true },
  { name: "VPBank", short: "VPB", color: "#00A04E", popular: true },
  { name: "Sacombank", short: "STB", color: "#0066B3", popular: true },
  { name: "TPBank", short: "TPB", color: "#5E1B7C", popular: true },
  { name: "HDBank", short: "HDB", color: "#D71F26" },
  { name: "SHB", short: "SHB", color: "#1B4F9C" },
  { name: "VIB", short: "VIB", color: "#005BAA" },
  { name: "OCB", short: "OCB", color: "#00733B" },
  { name: "SeABank", short: "SEA", color: "#E60012" },
  { name: "MSB", short: "MSB", color: "#E30613" },
  { name: "Eximbank", short: "EIB", color: "#003F87" },
  { name: "LienVietPostBank", short: "LPB", color: "#FFB81C", fg: "#0a1a3a" },
  { name: "PVcomBank", short: "PVC", color: "#003F87" },
  { name: "ABBank", short: "ABB", color: "#003F87" },
  { name: "Nam A Bank", short: "NAB", color: "#0072BC" },
  { name: "Bac A Bank", short: "BAB", color: "#0E4A87" },
  { name: "KienlongBank", short: "KLB", color: "#E30613" },
  { name: "Saigonbank", short: "SGB", color: "#005BAA" },
  { name: "BaoVietBank", short: "BVB", color: "#005BAA" },
  { name: "PG Bank", short: "PGB", color: "#003F87" },
  { name: "VietCapitalBank", short: "BVB", color: "#E30613" },
  { name: "DongA Bank", short: "DAB", color: "#E30613" },
  { name: "NCB", short: "NCB", color: "#003F87" },
  { name: "VietABank", short: "VAB", color: "#005BAA" },
  { name: "Public Bank Vietnam", short: "PBV", color: "#003F87" },
  { name: "Shinhan Bank", short: "SHN", color: "#0046AD" },
  { name: "Standard Chartered", short: "SCB", color: "#0473EA" },
  { name: "HSBC", short: "HSBC", color: "#DB0011" },
  { name: "Citibank", short: "CITI", color: "#003F87" },
  { name: "UOB", short: "UOB", color: "#005EB8" },
  { name: "ANZ", short: "ANZ", color: "#004A87" },
  { name: "Woori Bank", short: "WRI", color: "#0E4A87" },
];

export function BankLogo({ bank, size = 28 }: { bank: BankMeta; size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-md font-bold shrink-0 shadow-sm"
      style={{
        width: size,
        height: size,
        backgroundColor: bank.color,
        color: bank.fg ?? "#fff",
        fontSize: size <= 24 ? 9 : 10,
        letterSpacing: "-0.02em",
      }}
    >
      {bank.short}
    </div>
  );
}

function findBank(name: string): BankMeta | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return (
    VN_BANK_LIST.find((b) => b.name.toLowerCase() === n) ||
    VN_BANK_LIST.find((b) => b.name.toLowerCase().includes(n) || n.includes(b.name.toLowerCase())) ||
    null
  );
}

export function BankCombobox({
  value,
  onChange,
  placeholder = "Chọn ngân hàng…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => findBank(value), [value]);

  const popular = VN_BANK_LIST.filter((b) => b.popular);
  const others = VN_BANK_LIST.filter((b) => !b.popular);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-10 px-2.5"
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected ? (
              <BankLogo bank={selected} size={22} />
            ) : (
              <div className="h-[22px] w-[22px] rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                <Search className="h-3 w-3" />
              </div>
            )}
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || placeholder}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[340px]" align="start">
        <Command
          filter={(itemValue, search) => {
            const s = search.toLowerCase();
            if (itemValue.toLowerCase().includes(s)) return 1;
            const bank = VN_BANK_LIST.find((b) => b.name.toLowerCase() === itemValue.toLowerCase());
            if (bank && bank.short.toLowerCase().includes(s)) return 1;
            return 0;
          }}
        >
          <CommandInput
            placeholder="Tìm ngân hàng hoặc gõ tên tự do…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-3">
              <div className="px-3 space-y-2">
                <p className="text-xs text-muted-foreground">Không có trong danh sách</p>
                {query.trim() && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      onChange(query.trim());
                      setOpen(false);
                    }}
                  >
                    Dùng "{query.trim()}"
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup heading="Phổ biến">
              {popular.map((b) => (
                <BankRow key={b.name} bank={b} active={value === b.name} onSelect={() => { onChange(b.name); setOpen(false); }} />
              ))}
            </CommandGroup>
            <CommandGroup heading="Khác">
              {others.map((b) => (
                <BankRow key={b.name} bank={b} active={value === b.name} onSelect={() => { onChange(b.name); setOpen(false); }} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function BankRow({ bank, active, onSelect }: { bank: BankMeta; active: boolean; onSelect: () => void }) {
  return (
    <CommandItem value={bank.name} onSelect={onSelect} className="gap-2.5 py-2">
      <BankLogo bank={bank} size={26} />
      <span className="flex-1 text-sm">{bank.name}</span>
      {active && <Check className="h-4 w-4 text-primary" />}
    </CommandItem>
  );
}
