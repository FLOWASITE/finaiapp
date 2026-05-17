import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCustomers, upsertCustomer } from "@/lib/customers.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type CustomerLite = {
  id: string;
  code: string | null;
  name: string;
  tax_id: string | null;
  email: string | null;
  address: string | null;
  payment_terms_days: number;
  currency: string;
};

export function CustomerCombobox({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (c: CustomerLite | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = useServerFn(listCustomers);
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => list({}) });
  const active = useMemo(() => (customers ?? []).find((c) => c.id === value) ?? null, [customers, value]);

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
            {active ? (
              <span className="truncate">
                {active.code && <span className="font-mono text-muted-foreground mr-2">{active.code}</span>}
                {active.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Chọn khách hàng…</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm theo mã, tên, MST…" />
            <CommandList>
              <CommandEmpty>Không tìm thấy</CommandEmpty>
              <CommandGroup>
                {(customers ?? [])
                  .filter((c) => c.is_active !== false)
                  .map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.code ?? ""} ${c.name} ${c.tax_id ?? ""}`}
                      onSelect={() => {
                        onChange(c as CustomerLite);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {c.code && <span className="font-mono text-muted-foreground mr-2">{c.code}</span>}
                          {c.name}
                        </span>
                        {c.tax_id && <span className="text-xs text-muted-foreground">MST: {c.tax_id}</span>}
                      </div>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <QuickCreateButton onCreated={(c) => onChange(c)} />
    </div>
  );
}

function QuickCreateButton({ onCreated }: { onCreated: (c: CustomerLite) => void }) {
  const [open, setOpen] = useState(false);
  const upsert = useServerFn(upsertCustomer);
  const list = useServerFn(listCustomers);
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", tax_id: "", email: "", payment_terms_days: 30 });

  const create = async () => {
    try {
      const r = await upsert({
        data: {
          code: form.code.trim(),
          name: form.name.trim(),
          tax_id: form.tax_id,
          email: form.email,
          payment_terms_days: form.payment_terms_days,
          currency: "VND",
          opening_balance: 0,
          is_active: true,
        },
      });
      const data = await list({});
      qc.setQueryData(["customers"], data);
      const created = data.find((c) => c.id === r.id) as CustomerLite | undefined;
      if (created) onCreated(created);
      toast.success("Đã tạo khách hàng");
      setOpen(false);
      setForm({ code: "", name: "", tax_id: "", email: "", payment_terms_days: 30 });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Tạo khách mới">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo khách hàng nhanh</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mã khách *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="KH001" /></div>
            <div><Label>MST</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
          </div>
          <div><Label>Tên khách *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Hạn TT (ngày)</Label><Input type="number" value={form.payment_terms_days} onChange={(e) => setForm({ ...form, payment_terms_days: Number(e.target.value) })} /></div>
          </div>
          <Button className="w-full" onClick={create} disabled={!form.code.trim() || !form.name.trim()}>Tạo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
