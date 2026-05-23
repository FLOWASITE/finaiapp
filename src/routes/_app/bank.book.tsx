import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listBankAccounts, getBankBook } from "@/lib/bank.functions";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFilter } from "@/components/date-range-filter";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_app/bank/book")({ component: BookPage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function BookPage() {
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchBook = useServerFn(getBankBook);
  const today = new Date();
  const firstOfMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), []);
  const todayStr = useMemo(() => today.toISOString().slice(0, 10), []);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(todayStr);
  const [acc, setAcc] = useState<string>("");

  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchAccounts({}),
 ...QUERY_PRESETS.REPORT,
});
  if (!acc && accounts[0]?.id) setAcc(accounts[0].id);

  const { data: book } = useQuery({
    queryKey: ["bank-book", acc, from, to],
    enabled: !!acc,
    queryFn: () => fetchBook({ data: { bankAccountId: acc, from, to } }),
    ...QUERY_PRESETS.REPORT,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Tài khoản</Label>
          <Select value={acc} onValueChange={setAcc}>
            <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />

      </div>

      {book && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Stat label="Số dư đầu kỳ" value={fmt(book.opening)} />
            <Stat label="Tổng phát sinh Nợ (Thu)" value={fmt(book.total_in)} tone="success" />
            <Stat label="Tổng phát sinh Có (Chi)" value={fmt(book.total_out)} tone="danger" />
            <Stat label="Số dư cuối kỳ" value={fmt(book.closing)} tone="primary" />
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Ngày</th>
                  <th className="px-3 py-2 text-left">Số phiếu</th>
                  <th className="px-3 py-2 text-left">Diễn giải</th>
                  <th className="px-3 py-2 text-left">TK đối ứng</th>
                  <th className="px-3 py-2 text-right">Thu (Nợ)</th>
                  <th className="px-3 py-2 text-right">Chi (Có)</th>
                  <th className="px-3 py-2 text-right">Số dư</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={6} className="px-3 py-1.5 font-medium text-xs">Số dư đầu kỳ</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmt(book.opening)}</td>
                </tr>
                {book.entries.map((e: any) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2">{e.voucher_date}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.voucher_no}</td>
                    <td className="px-3 py-2">{e.reason || e.party_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{e.counter_account}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600">{e.debit ? fmt(e.debit) : ""}</td>
                    <td className="px-3 py-2 text-right font-mono text-rose-600">{e.credit ? fmt(e.credit) : ""}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(e.balance)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td colSpan={4} className="px-3 py-2">Cộng phát sinh</td>
                  <td className="px-3 py-2 text-right font-mono text-emerald-600">{fmt(book.total_in)}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-600">{fmt(book.total_out)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(book.closing)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
      {!acc && <EmptyState title="Chưa chọn tài khoản ngân hàng" description="Chọn một tài khoản để xem sổ chi tiết." />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const cls = tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={"mt-1 text-lg font-bold tabular-nums " + cls}>{value} ₫</div>
    </div>
  );
}
