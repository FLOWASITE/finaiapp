import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listBankAccounts, upsertBankAccount, deleteBankAccount } from "@/lib/bank.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/bank/accounts")({ component: AccountsPage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function AccountsPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listBankAccounts);
  const delFn = useServerFn(deleteBankAccount);
  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchFn({}) });
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá tài khoản");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{accounts.length} tài khoản</p>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Thêm tài khoản
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Tên tài khoản</th>
              <th className="px-4 py-2 text-left">Ngân hàng</th>
              <th className="px-4 py-2 text-left">Số TK</th>
              <th className="px-4 py-2 text-left">Tiền tệ</th>
              <th className="px-4 py-2 text-left">TK kế toán</th>
              <th className="px-4 py-2 text-right">Số dư đầu</th>
              <th className="px-4 py-2 text-right">Số dư hiện tại</th>
              <th className="px-4 py-2 text-right">GD</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a: any) => (
              <tr key={a.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.bank_name || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.account_no || "—"}</td>
                <td className="px-4 py-2">{a.currency}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.gl_account_code}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(Number(a.opening_balance ?? 0))}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(a.current_balance ?? 0)}</td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">{a.txn_count ?? 0}</td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => {
                      if (confirm(`Xoá tài khoản "${a.name}"?`)) del.mutate(a.id);
                    }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  Chưa có tài khoản ngân hàng. Bấm "Thêm tài khoản" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AccountDialog open={open} onOpenChange={setOpen} editing={editing} />
    </div>
  );
}

function AccountDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertBankAccount);
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [gl, setGl] = useState("1121");
  const [opening, setOpening] = useState("0");

  // Reset when opening
  useState(() => {
    if (open) {
      setName(editing?.name ?? "");
      setBankName(editing?.bank_name ?? "");
      setAccountNo(editing?.account_no ?? "");
      setCurrency(editing?.currency ?? "VND");
      setGl(editing?.gl_account_code ?? "1121");
      setOpening(String(editing?.opening_balance ?? 0));
    }
  });
  // Use effect via state initializer trick won't fire on prop change; use proper effect:
  // (Lightweight: keyed remount instead)
  if ((globalThis as any).__lastEditingId !== editing?.id || (globalThis as any).__lastOpen !== open) {
    (globalThis as any).__lastEditingId = editing?.id;
    (globalThis as any).__lastOpen = open;
  }

  const m = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: editing?.id,
          name: name.trim(),
          bank_name: bankName.trim() || null,
          account_no: accountNo.trim() || null,
          currency,
          gl_account_code: gl,
          opening_balance: Number(opening.replace(/[^\d.-]/g, "")) || 0,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Đã cập nhật" : "Đã tạo tài khoản");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa tài khoản ngân hàng" : "Thêm tài khoản ngân hàng"}</DialogTitle>
        </DialogHeader>
        <AccountForm
          key={editing?.id || "new"}
          initial={editing}
          onSubmit={(v) => {
            setName(v.name); setBankName(v.bank_name); setAccountNo(v.account_no);
            setCurrency(v.currency); setGl(v.gl); setOpening(v.opening);
            setTimeout(() => m.mutate(), 0);
          }}
          submitting={m.isPending}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  initial, onSubmit, submitting, onCancel,
}: {
  initial: any;
  onSubmit: (v: { name: string; bank_name: string; account_no: string; currency: string; gl: string; opening: string }) => void;
  submitting: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [bankName, setBankName] = useState(initial?.bank_name ?? "");
  const [accountNo, setAccountNo] = useState(initial?.account_no ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "VND");
  const [gl, setGl] = useState(initial?.gl_account_code ?? "1121");
  const [opening, setOpening] = useState(String(initial?.opening_balance ?? 0));

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Tên tài khoản *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: VCB - Tài khoản chính" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Ngân hàng</Label>
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Vietcombank" />
        </div>
        <div>
          <Label className="text-xs">Số tài khoản</Label>
          <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} placeholder="0123456789" className="font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Tiền tệ</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VND">VND</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="JPY">JPY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">TK kế toán</Label>
          <Select value={gl} onValueChange={setGl}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1121">1121 — TGNH VND</SelectItem>
              <SelectItem value="1122">1122 — TGNH ngoại tệ</SelectItem>
              <SelectItem value="1123">1123 — TGNH vàng bạc</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Số dư đầu kỳ</Label>
          <Input
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="text-right font-mono"
            inputMode="numeric"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Huỷ</Button>
        <Button
          disabled={!name.trim() || submitting}
          onClick={() => onSubmit({ name, bank_name: bankName, account_no: accountNo, currency, gl, opening })}
        >
          {submitting ? "Đang lưu…" : "Lưu"}
        </Button>
      </DialogFooter>
    </div>
  );
}
