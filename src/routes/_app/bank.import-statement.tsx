import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Upload, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBankAccounts } from "@/lib/bank.functions";
import { importAndPostStatement } from "@/lib/bank-reconcile.functions";
import { suggestCounterAccount, normalizeStatementRows, type Suggestion } from "@/lib/ai/suggest-account";
import { invalidateLedgers } from "@/lib/query-invalidation";

export const Route = createFileRoute("/_app/bank/import-statement")({ component: ImportStatementPage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const RECEIPT_OPTS = [
  { code: "131", name: "Phải thu KH" }, { code: "511", name: "Doanh thu BH" },
  { code: "515", name: "Lãi tiền gửi" }, { code: "711", name: "Thu nhập khác" },
  { code: "341", name: "Vay" }, { code: "411", name: "Vốn góp" },
  { code: "141", name: "Tạm ứng" }, { code: "1111", name: "Tiền mặt" }, { code: "3331", name: "Thuế GTGT" },
];
const PAYMENT_OPTS = [
  { code: "331", name: "Phải trả NCC" }, { code: "641", name: "CP bán hàng" },
  { code: "642", name: "CP QLDN" }, { code: "6427", name: "Phí NH (QLDN)" },
  { code: "6428", name: "CP văn phòng" }, { code: "334", name: "Lương NV" },
  { code: "3331", name: "Thuế GTGT" }, { code: "3334", name: "Thuế TNDN" }, { code: "3335", name: "Thuế TNCN" },
  { code: "3383", name: "BHXH" }, { code: "211", name: "TSCĐ" }, { code: "152", name: "NVL" },
  { code: "141", name: "Tạm ứng NV" }, { code: "341", name: "Trả vay" }, { code: "635", name: "CP tài chính" },
];

type Row = {
  txn_date: string;
  description: string;
  amount: number;
  counterparty?: string;
  counter_account: string;
  party_name?: string;
  reason?: string;
  confidence: number;
  skip: boolean;
};

function ImportStatementPage() {
  const qc = useQueryClient();
  const accountsFn = useServerFn(listBankAccounts);
  const postFn = useServerFn(importAndPostStatement);
  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: accountsFn });

  const [bankAccountId, setBankAccountId] = useState<string>("");
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [rows, setRows] = useState<Row[]>([]);
  const [sourceLabel, setSourceLabel] = useState<string>("");

  // Load parsed batch from AskAiSheet on mount
  useEffect(() => {
    const batch = (typeof window !== "undefined" ? (window as any).__lastBatchImport : null);
    if (!batch || batch.kind !== "bank_statement" || !Array.isArray(batch.items)) return;
    const all: Row[] = [];
    for (const it of batch.items) {
      const normalized = normalizeStatementRows(it.parsed);
      for (const n of normalized) {
        const s: Suggestion = suggestCounterAccount(n);
        all.push({
          ...n,
          counter_account: s.counter_account,
          reason: s.reason,
          party_name: n.counterparty ?? undefined,
          confidence: s.confidence,
          skip: false,
        });
      }
    }
    setRows(all);
    setSourceLabel(`${batch.items.length} file đã trích xuất`);
    if (all.length) {
      const d = new Date(all[0].txn_date);
      if (!isNaN(d.getTime())) {
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
      }
    }
  }, []);

  const filtered = useMemo(
    () =>
      rows.map((r, idx) => {
        const d = new Date(r.txn_date);
        const inPeriod = d.getFullYear() === year && d.getMonth() + 1 === month;
        return { ...r, idx, inPeriod };
      }),
    [rows, year, month],
  );

  const stats = useMemo(() => {
    const inP = filtered.filter((r) => r.inPeriod && !r.skip);
    return {
      total: filtered.length,
      inPeriod: filtered.filter((r) => r.inPeriod).length,
      active: inP.length,
      credit: inP.filter((r) => r.amount >= 0).reduce((s, r) => s + r.amount, 0),
      debit: inP.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0),
      lowConfidence: inP.filter((r) => r.confidence < 0.5).length,
    };
  }, [filtered]);

  const update = (idx: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const post = useMutation({
    mutationFn: async () => {
      if (!bankAccountId) throw new Error("Chưa chọn tài khoản ngân hàng");
      const payload = filtered
        .filter((r) => r.inPeriod)
        .map((r) => ({
          txn_date: r.txn_date,
          description: r.description || null,
          amount: r.amount,
          counterparty: r.counterparty ?? null,
          counter_account: r.counter_account,
          party_name: r.party_name ?? null,
          reason: r.reason ?? null,
          skip: r.skip,
        }));
      if (!payload.length) throw new Error("Không có dòng nào trong kỳ");
      return postFn({ data: { bankAccountId, period: { year, month }, rows: payload } });
    },
    onSuccess: (res) => {
      toast.success(`Đã hạch toán ${res.posted} GD, bỏ qua ${res.skipped}${res.errors.length ? `, lỗi ${res.errors.length}` : ""}`);
      invalidateLedgers(qc);
      if (res.errors.length) {
        toast.error(`Lỗi đầu tiên: ${res.errors[0].error}`);
      } else {
        setRows([]);
      }
    },
    onError: (e: any) => toast.error(e.message || "Lỗi hạch toán"),
  });

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/bank/reconcile"><ArrowLeft className="mr-1 h-4 w-4" />Đối soát</Link>
        </Button>
        <h1 className="text-xl font-semibold">Nhập sao kê & hạch toán hàng loạt</h1>
        <Badge variant="secondary" className="ml-auto">
          <Sparkles className="mr-1 h-3 w-3" />Gợi ý bút toán bằng AI
        </Badge>
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <Upload className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Chưa có dữ liệu. Mở trợ lý AI (Cmd/Ctrl+J) → Upload → <b>Sao kê ngân hàng</b> để trích xuất, sau đó quay lại trang này.
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Tài khoản ngân hàng</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Chọn TK…" /></SelectTrigger>
                <SelectContent>
                  {(accounts as any[]).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} — {a.account_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kỳ kế toán</Label>
              <div className="flex gap-2">
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Nguồn dữ liệu</Label>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                {sourceLabel} • <b>{stats.inPeriod}</b>/{stats.total} GD trong kỳ • Thu <span className="text-emerald-600">{fmt(stats.credit)}</span> ₫ • Chi <span className="text-destructive">{fmt(stats.debit)}</span> ₫
                {stats.lowConfidence > 0 && (
                  <span className="ml-2 text-amber-600">
                    <AlertTriangle className="inline h-3.5 w-3.5" /> {stats.lowConfidence} dòng cần xem lại
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-28">Ngày</TableHead>
                  <TableHead>Diễn giải</TableHead>
                  <TableHead className="w-32 text-right">Số tiền</TableHead>
                  <TableHead className="w-40">Đối tác</TableHead>
                  <TableHead className="w-44">TK đối ứng</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const opts = r.amount >= 0 ? RECEIPT_OPTS : PAYMENT_OPTS;
                  const dim = !r.inPeriod || r.skip;
                  return (
                    <TableRow key={r.idx} className={dim ? "opacity-40" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={!r.skip && r.inPeriod}
                          disabled={!r.inPeriod}
                          onChange={(e) => update(r.idx, { skip: !e.target.checked })}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.txn_date}</TableCell>
                      <TableCell className="text-xs">
                        <div className="line-clamp-2">{r.description}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <Badge variant={r.confidence >= 0.7 ? "default" : r.confidence >= 0.5 ? "secondary" : "outline"} className="text-[10px]">
                            {Math.round(r.confidence * 100)}%
                          </Badge>
                          <span className="text-muted-foreground">{r.reason}</span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${r.amount >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {r.amount >= 0 ? "+" : "−"}{fmt(Math.abs(r.amount))}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.party_name ?? ""}
                          onChange={(e) => update(r.idx, { party_name: e.target.value })}
                          className="h-8 text-xs"
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Select value={r.counter_account} onValueChange={(v) => update(r.idx, { counter_account: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {opts.map((o) => (
                                <SelectItem key={o.code} value={o.code}>{o.code} — {o.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== r.idx))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Sẽ tạo <b className="text-foreground">{stats.active}</b> phiếu báo có/báo nợ + bút toán cho kỳ {String(month).padStart(2, "0")}/{year}.
            </div>
            <Button
              size="lg"
              disabled={!bankAccountId || !stats.active || post.isPending}
              onClick={() => post.mutate()}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {post.isPending ? "Đang hạch toán…" : `Hạch toán ${stats.active} giao dịch`}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
