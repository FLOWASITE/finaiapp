import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listChartOfAccounts } from "@/lib/coa.functions";

export type AccountSuggestion = { code: string; name: string };

type Props = {
  value: string;
  onChange: (code: string) => void;
  suggestions?: AccountSuggestion[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If provided, only COA codes matching this filter (prefix or predicate) are listed. */
  filter?: (code: string) => boolean;
};

export function AccountCombobox({
  value,
  onChange,
  suggestions = [],
  placeholder = "Chọn tài khoản…",
  disabled,
  className,
  filter,
}: Props) {
  const fetchCoa = useServerFn(listChartOfAccounts);
  const { data: coa } = useQuery({
    queryKey: ["coa"],
    queryFn: () => fetchCoa({}),
    ...QUERY_PRESETS.REFERENCE,
  });

  const [open, setOpen] = useState(false);

  const all = useMemo(() => {
    const map = new Map<string, AccountSuggestion>();
    suggestions.forEach((s) => map.set(s.code, s));
    (coa ?? [])
      .filter((c: any) => c.is_active && (!filter || filter(c.code)))
      .forEach((c: any) => map.set(c.code, { code: c.code, name: c.name }));
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [coa, suggestions, filter]);

  const active = all.find((a) => a.code === value) ?? (coa ?? []).find((c: any) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {active ? (
            <span className="truncate">
              <span className="font-mono mr-2">{active.code}</span>
              <span className="text-muted-foreground">{active.name}</span>
            </span>
          ) : value ? (
            <span className="font-mono">{value}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm mã hoặc tên TK…" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>Không có TK phù hợp</CommandEmpty>
            {suggestions.length > 0 && (
              <CommandGroup heading="Gợi ý thường dùng">
                {suggestions.map((s) => (
                  <CommandItem
                    key={`s-${s.code}`}
                    value={`${s.code} ${s.name}`}
                    onSelect={() => {
                      onChange(s.code);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === s.code ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono mr-2">{s.code}</span>
                    <span className="text-muted-foreground text-sm">{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Hệ thống tài khoản">
              {all.map((a) => (
                <CommandItem
                  key={a.code}
                  value={`${a.code} ${a.name}`}
                  onSelect={() => {
                    onChange(a.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === a.code ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono mr-2">{a.code}</span>
                  <span className="text-muted-foreground text-sm">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
