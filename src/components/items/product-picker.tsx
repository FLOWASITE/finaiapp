import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { searchProductsForMapping } from "@/lib/items/mappings.functions";

type ProductLite = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
};

type Props = {
  value?: { id: string; code?: string | null; name?: string | null } | null;
  onSelect: (p: ProductLite) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default";
};

export function ProductPicker({
  value,
  onSelect,
  placeholder = "Chọn mã hệ thống...",
  disabled,
  className,
  size = "sm",
}: Props) {
  const searchFn = useServerFn(searchProductsForMapping);
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const q = useQuery({
    queryKey: ["product-picker", debounced],
    enabled: open,
    queryFn: () => searchFn({ data: { search: debounced || null, limit: 30 } }),
  });
  const rows = (q.data?.rows ?? []) as ProductLite[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn(
            "justify-between font-normal",
            size === "sm" && "h-8 px-2 text-xs",
            className,
          )}
        >
          <span className="truncate">
            {value?.id ? (
              <>
                <span className="font-mono">{value.code ?? "—"}</span>
                <span className="ml-1 text-muted-foreground">
                  {value.name ?? ""}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Tìm theo mã hoặc tên..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {q.isLoading && (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Đang tải...
              </div>
            )}
            {!q.isLoading && rows.length === 0 && (
              <CommandEmpty>Không có mã hàng nào.</CommandEmpty>
            )}
            <CommandGroup>
              {rows.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onSelect(p);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check
                    className={cn(
                      "h-3 w-3",
                      value?.id === p.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-1 flex-col">
                    <span className="font-mono text-xs">{p.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.name}
                      {p.unit ? ` · ${p.unit}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
