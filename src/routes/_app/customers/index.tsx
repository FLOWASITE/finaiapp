import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, Users } from "lucide-react";
import { listCustomers, upsertCustomer, archiveCustomer } from "@/lib/customers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/customers/")({ component: CustomersPage });

const blank = {
  id: undefined as string | undefined,
  code: "",
  name: "",
  tax_id: "",
  email: "",
  email_cc: "",
  phone: "",
  address: "",
  contact_person: "",
  payment_terms_days: 30,
  currency: "VND",
  opening_balance: 0,
  notes: "",
  is_active: true,
};

function CustomersPage() {
  const list = useServerFn(listCustomers);
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => list({}) });
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<typeof blank | null>(null);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return (customers ?? []).filter((c) => {
      if (!showArchived && c.is_active === false) return false;
      if (!lq) return true;
      return (
        (c.code ?? "").toLowerCase().includes(lq) ||
        c.name.toLowerCase().includes(lq) ||
        (c.tax_id ?? "").toLowerCase().includes(lq) ||
        (c.email ?? "").toLowerCase().includes(lq)
      );
    });
  }, [customers, q, showArchived]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Khách hàng
          </h1>
          <p className="text-sm text-muted-foreground">Danh bạ khách hàng, mã KH duy nhất, hạn thanh toán, tiền tệ</p>
        </div>
        <Button onClick={() => setEditing({ ...blank })}><Plus className="mr-2 h-4 w-4" />Khách hàng mới</Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm theo mã, tên, MST, email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} id="archived" />
          <Label htmlFor="archived" className="text-muted-foreground">Hiện đã lưu trữ</Label>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">{filtered.length} khách hàng</div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Mã</th>
              <th className="px-4 py-2 text-left">Tên khách hàng</th>
              <th className="px-4 py-2 text-left">MST</th>
              <th className="px-4 py-2 text-left">Liên hệ</th>
              <th className="px-4 py-2 text-right">Hạn TT</th>
              <th className="px-4 py-2 text-right">Tiền tệ</th>
              <th className="px-4 py-2 text-right">Dư đầu kỳ</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={"border-t border-border hover:bg-muted/30 " + (c.is_active === false ? "opacity-60" : "")}>
                <td className="px-4 py-2 font-mono text-xs">{c.code ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="font-medium">{c.name}</div>
                  {c.contact_person && <div className="text-xs text-muted-foreground">{c.contact_person}</div>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{c.tax_id ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
                </td>
                <td className="px-4 py-2 text-right">{c.payment_terms_days ?? 30} ngày</td>
                <td className="px-4 py-2 text-right">{c.currency ?? "VND"}</td>
                <td className="px-4 py-2 text-right font-mono">{Number(c.opening_balance ?? 0).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing({
                    id: c.id,
                    code: c.code ?? "",
                    name: c.name,
                    tax_id: c.tax_id ?? "",
                    email: c.email ?? "",
                    email_cc: c.email_cc ?? "",
                    phone: c.phone ?? "",
                    address: c.address ?? "",
                    contact_person: c.contact_person ?? "",
                    payment_terms_days: c.payment_terms_days ?? 30,
                    currency: c.currency ?? "VND",
                    opening_balance: Number(c.opening_balance ?? 0),
                    notes: c.notes ?? "",
                    is_active: c.is_active !== false,
                  })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <ArchiveButton id={c.id} archived={c.is_active === false} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Chưa có khách hàng</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          {editing && <CustomerForm initial={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const arch = useServerFn(archiveCustomer);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => arch({ data: { id, archived: !archived } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(archived ? "Đã khôi phục" : "Đã lưu trữ");
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Button variant="ghost" size="icon" onClick={() => m.mutate()} title={archived ? "Khôi phục" : "Lưu trữ"}>
      {archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
    </Button>
  );
}

function CustomerForm({ initial, onDone }: { initial: typeof blank; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const upsert = useServerFn(upsertCustomer);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          ...f,
          payment_terms_days: Number(f.payment_terms_days) || 0,
          opening_balance: Number(f.opening_balance) || 0,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      toast.success(initial.id ? "Đã cập nhật" : "Đã tạo khách hàng");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader><DialogTitle>{initial.id ? "Sửa khách hàng" : "Khách hàng mới"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Mã KH *</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="KH001" /></div>
          <div className="col-span-2">
            <Label>MST (auto-fill tên)</Label>
            <TaxIdLookupInput
              value={f.tax_id}
              onChange={(v) => setF({ ...f, tax_id: v })}
              onResolved={(d) => setF((p) => ({ ...p, tax_id: d.taxId, name: p.name || d.name, address: p.address || d.address || "" }))}
            />
          </div>
        </div>
        <div><Label>Tên khách *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Người liên hệ</Label><Input value={f.contact_person} onChange={(e) => setF({ ...f, contact_person: e.target.value })} /></div>
          <div><Label>Điện thoại</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Email CC</Label><Input value={f.email_cc} onChange={(e) => setF({ ...f, email_cc: e.target.value })} placeholder="ke.toan@kh.com,..." /></div>
        </div>
        <div><Label>Địa chỉ</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Hạn TT (ngày)</Label><Input type="number" value={f.payment_terms_days} onChange={(e) => setF({ ...f, payment_terms_days: Number(e.target.value) })} /></div>
          <div><Label>Tiền tệ</Label><Input value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></div>
          <div><Label>Dư đầu kỳ</Label><Input type="number" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: Number(e.target.value) })} /></div>
        </div>
        <div><Label>Ghi chú</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onDone}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!f.code.trim() || !f.name.trim() || m.isPending}>Lưu</Button>
        </div>
      </div>
    </>
  );
}
