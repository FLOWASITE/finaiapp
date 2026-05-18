import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore, Users, FolderTree } from "lucide-react";
import { listCustomers, archiveCustomer } from "@/lib/customers.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartyForm, type PartyInitial } from "@/components/party-form";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/customers/")({ component: CustomersPage });

function CustomersPage() {
  const list = useServerFn(listCustomers);
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => list({}) });
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PartyInitial | null>(null);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return (customers ?? []).filter((c: any) => {
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
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Khách hàng
          </h1>
          <p className="text-sm text-muted-foreground">Mã KH, MST, ngân hàng, hạn TT, công nợ đầu kỳ</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/customers/groups"><FolderTree className="mr-2 h-4 w-4" />Nhóm KH</Link>
          </Button>
          <Button onClick={() => setEditing({})}>
            <Plus className="mr-2 h-4 w-4" />Khách hàng mới
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm theo mã, tên, MST, email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} id="archived" />
          <Label htmlFor="archived" className="text-muted-foreground">Hiện đã lưu trữ</Label>
        </div>
        <div className="sm:ml-auto text-sm text-muted-foreground">{filtered.length} khách hàng</div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Mã</th>
              <th className="px-3 py-2 text-left">Tên khách hàng</th>
              <th className="px-3 py-2 text-left hidden md:table-cell">MST</th>
              <th className="px-3 py-2 text-left hidden lg:table-cell">Liên hệ</th>
              <th className="px-3 py-2 text-right hidden md:table-cell">Hạn TT</th>
              <th className="px-3 py-2 text-right">Dư Nợ</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Dư Có</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className={"border-t border-border hover:bg-muted/30 " + (c.is_active === false ? "opacity-60" : "")}>
                <td className="px-3 py-2 font-mono text-xs">{c.code ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground md:hidden font-mono">{c.tax_id ?? ""}</div>
                  {c.contact_person && <div className="text-xs text-muted-foreground">{c.contact_person}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs hidden md:table-cell">{c.tax_id ?? "—"}</td>
                <td className="px-3 py-2 text-xs hidden lg:table-cell">
                  {c.email && <div>{c.email}</div>}
                  {c.phone && <div className="text-muted-foreground">{c.phone}</div>}
                </td>
                <td className="px-3 py-2 text-right hidden md:table-cell">{c.payment_terms_days ?? 30}d</td>
                <td className="px-3 py-2 text-right font-mono">
                  {Number(c.opening_balance_debit ?? Math.max(c.opening_balance ?? 0, 0)).toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">
                  {Number(c.opening_balance_credit ?? Math.max(-(c.opening_balance ?? 0), 0)).toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => setEditing({
                    id: c.id,
                    code: c.code ?? "",
                    name: c.name,
                    party_type: (c.party_type ?? "company") as "company" | "individual",
                    tax_id: c.tax_id ?? "",
                    legal_rep: c.legal_rep ?? "",
                    contact_person: c.contact_person ?? "",
                    email: c.email ?? "",
                    email_cc: c.email_cc ?? "",
                    phone: c.phone ?? "",
                    fax: c.fax ?? "",
                    website: c.website ?? "",
                    address: c.address ?? "",
                    bank_account_no: c.bank_account_no ?? "",
                    bank_name: c.bank_name ?? "",
                    bank_branch: c.bank_branch ?? "",
                    currency: c.currency ?? "VND",
                    payment_terms_days: c.payment_terms_days ?? 30,
                    counter_account: c.receivable_account ?? "131",
                    opening_balance_debit: Number(c.opening_balance_debit ?? Math.max(c.opening_balance ?? 0, 0)),
                    opening_balance_credit: Number(c.opening_balance_credit ?? Math.max(-(c.opening_balance ?? 0), 0)),
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa khách hàng" : "Khách hàng mới"}</DialogTitle>
          </DialogHeader>
          {editing && <PartyForm mode="customer" initial={editing} onDone={() => setEditing(null)} />}
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
