import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Truck, Archive, ArchiveRestore, FolderTree } from "lucide-react";
import { listSuppliers, deleteSupplier, upsertSupplier } from "@/lib/purchases.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartyForm, type PartyInitial } from "@/components/party-form";

export const Route = createFileRoute("/_app/suppliers/")({
  component: SuppliersPage,
});

function SuppliersPage() {
  const list = useServerFn(listSuppliers);
  const del = useServerFn(deleteSupplier);
  const upsert = useServerFn(upsertSupplier);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["suppliers"], queryFn: () => list() });

  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PartyInitial | null>(null);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return ((data as any[]) ?? []).filter((s) => {
      if (!showArchived && s.is_active === false) return false;
      if (!lq) return true;
      return (
        (s.code ?? "").toLowerCase().includes(lq) ||
        s.name.toLowerCase().includes(lq) ||
        (s.tax_id ?? "").toLowerCase().includes(lq) ||
        (s.email ?? "").toLowerCase().includes(lq)
      );
    });
  }, [data, q, showArchived]);

  const archive = useMutation({
    mutationFn: (s: any) =>
      upsert({
        data: {
          id: s.id,
          name: s.name,
          tax_id: s.tax_id,
          payment_terms_days: s.payment_terms_days ?? 30,
          currency: s.currency ?? "VND",
          payable_account: s.payable_account ?? "331",
          is_active: !(s.is_active === false ? false : true),
        } as any,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("Đã cập nhật");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6" /> Nhà cung cấp
          </h1>
          <p className="text-sm text-muted-foreground">Mã NCC, MST, ngân hàng, hạn TT, công nợ đầu kỳ</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/suppliers/groups"><FolderTree className="mr-2 h-4 w-4" />Nhóm NCC</Link>
          </Button>
          <Button onClick={() => setEditing({})}>
            <Plus className="mr-2 h-4 w-4" /> Thêm NCC
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm theo mã, tên, MST, email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} id="archived-s" />
          <Label htmlFor="archived-s" className="text-muted-foreground">Hiện đã lưu trữ</Label>
        </div>
        <div className="sm:ml-auto text-sm text-muted-foreground">{filtered.length} NCC</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Mã</th>
              <th className="px-3 py-3">Tên NCC</th>
              <th className="px-3 py-3 hidden md:table-cell">MST</th>
              <th className="px-3 py-3 hidden lg:table-cell">Liên hệ</th>
              <th className="px-3 py-3 text-right hidden md:table-cell">Hạn TT</th>
              <th className="px-3 py-3 text-right">Dư Có (Phải trả)</th>
              <th className="px-3 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s: any) => (
              <tr
                key={s.id}
                className={"border-b border-border last:border-0 hover:bg-secondary/30 " + (s.is_active === false ? "opacity-60" : "")}
              >
                <td className="px-3 py-3 font-mono text-xs">{s.code ?? "—"}</td>
                <td className="px-3 py-3">
                  <Link to="/suppliers/$id" params={{ id: s.id }} className="font-medium text-accent">
                    {s.name}
                  </Link>
                  <div className="text-xs text-muted-foreground md:hidden font-mono">{s.tax_id ?? ""}</div>
                </td>
                <td className="px-3 py-3 font-mono text-xs hidden md:table-cell">{s.tax_id ?? "—"}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                  {s.email ?? "—"}{s.phone ? <><br />{s.phone}</> : null}
                </td>
                <td className="px-3 py-3 text-right hidden md:table-cell">{s.payment_terms_days ?? 30}d</td>
                <td className="px-3 py-3 text-right font-mono">
                  {Number(s.opening_balance_credit ?? 0).toLocaleString("vi-VN")}
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(mapSupplierToInitial(s))}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => archive.mutate(s)}
                    title={s.is_active === false ? "Khôi phục" : "Lưu trữ"}
                  >
                    {s.is_active === false ? (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Xoá ${s.name}?`)) return;
                      try {
                        await del({ data: { id: s.id } });
                        qc.invalidateQueries({ queryKey: ["suppliers"] });
                        toast.success("Đã xoá");
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  Chưa có nhà cung cấp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa nhà cung cấp" : "Nhà cung cấp mới"}</DialogTitle>
          </DialogHeader>
          {editing && <PartyForm mode="supplier" initial={editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mapSupplierToInitial(s: any): PartyInitial {
  return {
    id: s.id,
    code: s.code ?? "",
    name: s.name,
    party_type: (s.party_type ?? "company") as "company" | "individual",
    tax_id: s.tax_id ?? "",
    legal_rep: s.legal_rep ?? "",
    contact_person: s.contact_person ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    fax: s.fax ?? "",
    website: s.website ?? "",
    address: s.address ?? "",
    bank_account_no: s.bank_account_no ?? "",
    bank_name: s.bank_name ?? "",
    bank_branch: s.bank_branch ?? "",
    currency: s.currency ?? "VND",
    payment_terms_days: s.payment_terms_days ?? 30,
    counter_account: s.payable_account ?? "331",
    opening_balance_debit: Number(s.opening_balance_debit ?? 0),
    opening_balance_credit: Number(s.opening_balance_credit ?? 0),
    notes: s.notes ?? "",
    is_active: s.is_active !== false,
  };
}
