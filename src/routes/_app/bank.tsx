import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { importBankCsv, aiMatchTransactions } from "@/lib/bank.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Upload, Plus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/bank")({
  component: BankRecon,
});

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function BankRecon() {
  const qc = useQueryClient();
  const importFn = useServerFn(importBankCsv);
  const matchFn = useServerFn(aiMatchTransactions);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBank, setNewBank] = useState("");
  const [matching, setMatching] = useState(false);

  const accounts = useQuery({
    queryKey: ["bank_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("bank_accounts").select("*").order("created_at");
      return data ?? [];
    },
  });

  const txns = useQuery({
    queryKey: ["bank_txns", selectedAccount],
    enabled: !!selectedAccount,
    queryFn: async () => {
      const { data } = await supabase
        .from("bank_transactions")
        .select("*")
        .eq("bank_account_id", selectedAccount!)
        .order("txn_date", { ascending: false });
      return data ?? [];
    },
  });

  const createAccount = async () => {
    if (!newName) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("bank_accounts").insert({ name: newName, bank_name: newBank, user_id: u.user!.id });
    setNewName(""); setNewBank("");
    qc.invalidateQueries({ queryKey: ["bank_accounts"] });
  };

  const onCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAccount) return;
    const csv = await file.text();
    await importFn({ data: { bankAccountId: selectedAccount, csv } });
    qc.invalidateQueries({ queryKey: ["bank_txns"] });
  };

  const runMatch = async () => {
    if (!selectedAccount) return;
    setMatching(true);
    try {
      await matchFn({ data: { bankAccountId: selectedAccount } });
      qc.invalidateQueries({ queryKey: ["bank_txns"] });
    } finally { setMatching(false); }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold tracking-tight">Đối soát ngân hàng</h1>
      <p className="text-sm text-muted-foreground">Import sao kê CSV và để AI tự ghép với bút toán đã ghi sổ</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 font-semibold">Tài khoản ngân hàng</h3>
            <div className="space-y-1">
              {(accounts.data ?? []).map((a: any) => (
                <button key={a.id} onClick={() => setSelectedAccount(a.id)}
                  className={`block w-full rounded px-3 py-2 text-left text-sm ${selectedAccount === a.id ? "bg-primary text-primary-foreground" : "hover:bg-accent/10"}`}>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs opacity-70">{a.bank_name}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <Input placeholder="Tên tài khoản" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Ngân hàng" value={newBank} onChange={(e) => setNewBank(e.target.value)} />
              <Button size="sm" className="w-full" onClick={createAccount}><Plus className="mr-1 h-3 w-3" /> Thêm TK</Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          {!selectedAccount ? (
            <div className="text-center text-muted-foreground">Chọn một tài khoản ngân hàng để bắt đầu</div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <label className="inline-flex">
                  <Button variant="outline" asChild>
                    <span><Upload className="mr-2 h-4 w-4" />Import CSV</span>
                  </Button>
                  <input type="file" accept=".csv" className="hidden" onChange={onCsvUpload} />
                </label>
                <Button onClick={runMatch} disabled={matching}>
                  <Sparkles className="mr-2 h-4 w-4" />{matching ? "Đang ghép..." : "AI ghép giao dịch"}
                </Button>
                <div className="ml-auto text-xs text-muted-foreground">
                  CSV cần có cột: date, description, amount (+balance, counterparty tuỳ chọn)
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr><th className="py-2">Ngày</th><th>Diễn giải</th><th className="text-right">Số tiền</th><th>Trạng thái</th></tr>
                </thead>
                <tbody>
                  {(txns.data ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b border-border">
                      <td className="py-2">{t.txn_date}</td>
                      <td>{t.description}</td>
                      <td className={`text-right font-mono ${t.amount >= 0 ? "text-accent" : "text-destructive"}`}>{fmt(t.amount)}</td>
                      <td>
                        {t.status === "matched" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-accent"><CheckCircle2 className="h-3 w-3" />Đã khớp ({Math.round(t.match_confidence * 100)}%)</span>
                        ) : <span className="text-xs text-muted-foreground">Chưa khớp</span>}
                      </td>
                    </tr>
                  ))}
                  {(txns.data ?? []).length === 0 && (
                    <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">Chưa có giao dịch. Import CSV để bắt đầu.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
