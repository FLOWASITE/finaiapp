import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { VSIC } from "@/lib/vsic";
import { cn } from "@/lib/utils";

type Props = {
  code?: string | null;
  name?: string | null;
  disabled?: boolean;
  onChange: (code: string | null, name: string | null) => void;
};

export function IndustryCombobox({ code, name, disabled, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = VSIC.find((v) => v.code === code);
  const label = code
    ? `${code} — ${selected?.name ?? name ?? "(không có trong danh mục)"}`
    : "Chọn mã ngành VSIC…";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm mã hoặc tên ngành…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy. Nhập mã 4-6 số ở ô bên cạnh nếu cần.</CommandEmpty>
            <CommandGroup>
              {VSIC.map((v) => (
                <CommandItem
                  key={v.code}
                  value={`${v.code} ${v.name}`}
                  onSelect={() => { onChange(v.code, v.name); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", code === v.code ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs mr-2">{v.code}</span>
                  <span className="text-xs">{v.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
