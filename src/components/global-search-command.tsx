import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Building2, FileText } from "lucide-react";
import { searchGlobal, type SearchHit } from "@/lib/search.functions";

export function GlobalSearchCommand() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const run = useServerFn(searchGlobal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search-global", q],
    queryFn: () => run({ data: { query: q } }),
    enabled: open && q.trim().length >= 2,
    staleTime: 30_000,
  });

  const hits = (data?.hits ?? []) as SearchHit[];
  const suppliers = hits.filter((h) => h.kind === "supplier");
  const invoices = hits.filter((h) => h.kind === "invoice");

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    navigate({ to: path });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Tìm nhà cung cấp, hóa đơn, MST… (Ctrl+K)"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        {q.trim().length < 2 ? (
          <CommandEmpty>Gõ ít nhất 2 ký tự để tìm kiếm.</CommandEmpty>
        ) : isFetching ? (
          <CommandEmpty>Đang tìm…</CommandEmpty>
        ) : hits.length === 0 ? (
          <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty>
        ) : null}

        {suppliers.length > 0 && (
          <CommandGroup heading="Nhà cung cấp">
            {suppliers.map((h) => (
              <CommandItem
                key={`s-${h.id}`}
                value={`supplier-${h.id}-${h.title}`}
                onSelect={() => go(`/suppliers/${h.id}`)}
              >
                <Building2 className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div className="text-sm">{h.title}</div>
                  {h.subtitle && (
                    <div className="text-xs text-muted-foreground">MST: {h.subtitle}</div>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {suppliers.length > 0 && invoices.length > 0 && <CommandSeparator />}

        {invoices.length > 0 && (
          <CommandGroup heading="Hóa đơn">
            {invoices.map((h) => (
              <CommandItem
                key={`i-${h.id}`}
                value={`invoice-${h.id}-${h.title}`}
                onSelect={() => go(`/invoices/${h.id}`)}
              >
                <FileText className="mr-2 h-4 w-4" />
                <div className="flex-1">
                  <div className="text-sm">
                    {h.title} — {h.subtitle}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.meta.issue_date as string} ·{" "}
                    {typeof h.meta.amount === "number"
                      ? h.meta.amount.toLocaleString("vi-VN") + " ₫"
                      : ""}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
