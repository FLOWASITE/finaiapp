import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { VSIC } from "@/lib/vsic";
import { cn } from "@/lib/utils";

export type IndustryItem = { code: string; name: string };

type SingleProps = {
  multi?: false;
  code?: string | null;
  name?: string | null;
  disabled?: boolean;
  onChange: (code: string | null, name: string | null) => void;
};

type MultiProps = {
  multi: true;
  items: IndustryItem[];
  disabled?: boolean;
  onChangeMulti: (items: IndustryItem[]) => void;
};

type Props = SingleProps | MultiProps;

export function IndustryCombobox(props: Props) {
  const [open, setOpen] = React.useState(false);

  if (props.multi) {
    const { items, disabled, onChangeMulti } = props;
    const selectedCodes = new Set(items.map((i) => i.code));

    const toggle = (v: { code: string; name: string }) => {
      if (selectedCodes.has(v.code)) {
        onChangeMulti(items.filter((i) => i.code !== v.code));
      } else {
        onChangeMulti([...items, v]);
      }
    };

    return (
      <div className="space-y-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              <span className="truncate text-left">
                {items.length === 0
                  ? "Chọn ngành nghề kinh doanh…"
                  : `Đã chọn ${items.length} ngành${items.length > 0 ? " — ngành chính: " + items[0].code : ""}`}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Tìm mã hoặc tên ngành…" />
              <CommandList>
                <CommandEmpty>Không tìm thấy.</CommandEmpty>
                <CommandGroup>
                  {VSIC.map((v) => {
                    const checked = selectedCodes.has(v.code);
                    return (
                      <CommandItem
                        key={v.code}
                        value={`${v.code} ${v.name}`}
                        onSelect={() => toggle(v)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                        <span className="font-mono text-xs mr-2">{v.code}</span>
                        <span className="text-xs">{v.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {items.map((it, idx) => (
              <Badge key={it.code} variant={idx === 0 ? "default" : "secondary"} className="gap-1 pr-1 font-normal">
                <span className="font-mono text-[10px] opacity-70">{it.code}</span>
                <span className="text-xs truncate max-w-[200px]">{it.name}</span>
                {idx === 0 && <span className="text-[9px] uppercase tracking-wider opacity-70">chính</span>}
                {!disabled && (
                  <button
                    type="button"
                    aria-label="Xoá"
                    onClick={() => onChangeMulti(items.filter((x) => x.code !== it.code))}
                    className="ml-0.5 rounded-sm hover:bg-foreground/10 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </Badge>
            ))}
            {items.length > 1 && !disabled && (
              <p className="w-full text-[10px] text-muted-foreground">
                Ngành đầu tiên được dùng làm ngành chính. Kéo / xoá để thay đổi.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const { code, name, disabled, onChange } = props;
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
