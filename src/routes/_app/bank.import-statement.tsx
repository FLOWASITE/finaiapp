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
  // ----- validation context -----
  stmt_balance?: number | null;     // running balance reported by statement on this row
  file_idx?: number;                // index in source files (0-based)
  source_file?: string;             // original filename
};

type StatementMeta = {
  filename: string;
  opening_balance: number | null;
  closing_balance: number | null;
  validation: { expected: number; actual: number; diff: number; ok: boolean } | null;
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
  const [stmtMeta, setStmtMeta] = useState<StatementMeta[]>([]);

  // Load parsed batch from ChatDock on mount
  useEffect(() => {
    const batch = (typeof window !== "undefined" ? (window as any).__lastBatchImport : null);
    if (!batch || batch.kind !== "bank_statement" || !Array.isArray(batch.items)) return;
    const all: Row[] = [];
    const metas: StatementMeta[] = [];
    batch.items.forEach((it: any, fileIdx: number) => {
      const parsed = it.parsed ?? {};
      metas.push({
        filename: it.filename,
        opening_balance: typeof parsed.opening_balance === "number" ? parsed.opening_balance : null,
        closing_balance: typeof parsed.closing_balance === "number" ? parsed.closing_balance : null,
        validation: parsed._validation ?? null,
      });
      const txnsRaw: any[] = Array.isArray(parsed.transactions) ? parsed.transactions : [];
      const normalized = normalizeStatementRows(parsed);
      // Re-zip normalized with raw to recover the balance field.
      normalized.forEach((n, i) => {
        const raw = txnsRaw[i] ?? {};
        const s: Suggestion = suggestCounterAccount(n);
        all.push({
          ...n,
          counter_account: s.counter_account,
          reason: s.reason,
          party_name: n.counterparty ?? undefined,
          confidence: s.confidence,
          skip: false,
          stmt_balance: typeof raw.balance === "number" ? raw.balance : null,
          file_idx: fileIdx,
          source_file: it.filename,
        });
      });
    });
    setRows(all);
    setStmtMeta(metas);
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

  // ----- Suspect detection: per-row reasons + per-file aggregated mismatch -----
  const suspectByIdx = useMemo(() => {
    const map = new Map<number, string[]>();
    const push = (idx: number, r: string) => {
      const arr = map.get(idx) ?? [];
      arr.push(r);
      map.set(idx, arr);
    };
    // duplicates (same date+amount+description, case-insensitive)
    const seen = new Map<string, number>();
    rows.forEach((r, i) => {
      const key = `${r.txn_date}|${r.amount}|${(r.description || "").toLowerCase().trim()}`;
      if (seen.has(key)) {
        push(i, `Trùng với dòng #${(seen.get(key) ?? 0) + 1}`);
        push(seen.get(key)!, `Trùng với dòng #${i + 1}`);
      } else seen.set(key, i);
    });
    // running balance check (per file, in order)
    const byFile = new Map<number, number[]>();
    rows.forEach((r, i) => {
      const fi = r.file_idx ?? 0;
      const arr = byFile.get(fi) ?? [];
      arr.push(i);
      byFile.set(fi, arr);
    });
    byFile.forEach((idxList, fi) => {
      const opening = stmtMeta[fi]?.opening_balance ?? null;
      let prev: number | null = opening;
      for (const i of idxList) {
        const r = rows[i];
        const bal = r.stmt_balance;
        if (prev != null && typeof bal === "number") {
          const expected = prev + r.amount;
          if (Math.abs(expected - bal) > 1) {
            push(i, `Số dư sau GD lệch ${fmt(Math.abs(expected - bal))}₫ (kỳ vọng ${fmt(expected)}, sao kê ${fmt(bal)})`);
          }
          prev = bal;
        } else if (typeof bal === "number") {
          prev = bal;
        } else if (prev != null) {
          prev = prev + r.amount;
        }
      }
    });
    // future date / invalid date
    const todayMs = Date.now() + 24 * 60 * 60 * 1000;
    rows.forEach((r, i) => {
      const d = new Date(r.txn_date);
      if (isNaN(d.getTime())) push(i, "Ngày không hợp lệ");
      else if (d.getTime() > todayMs) push(i, "Ngày trong tương lai");
    });
    // Zero amount but described as txn
    rows.forEach((r, i) => {
      if (!r.amount) push(i, "Số tiền = 0");
    });
    return map;
  }, [rows, stmtMeta]);

  const mismatchFiles = stmtMeta.filter((m) => m.validation && !m.validation.ok);
  const suspectCount = suspectByIdx.size;

  // Per-file aggregated stats + status (for individual "Tạo bút toán" buttons)
  const fileSummaries = useMemo(() => {
    return stmtMeta.map((m, fi) => {
      const fileRows = filtered.filter((r) => (r.file_idx ?? 0) === fi);
      const inP = fileRows.filter((r) => r.inPeriod && !r.skip);
      const credit = inP.filter((r) => r.amount >= 0).reduce((s, r) => s + r.amount, 0);
      const debit = inP.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
      const suspect = fileRows.filter((r) => suspectByIdx.has(r.idx)).length;
      const lowConf = inP.filter((r) => r.confidence < 0.5).length;
      const mismatch = !!(m.validation && !m.validation.ok);
      return {
        fileIdx: fi, meta: m, totalInPeriod: fileRows.filter((r) => r.inPeriod).length,
        active: inP.length, credit, debit, suspect, lowConf, mismatch,
      };
    });
  }, [stmtMeta, filtered, suspectByIdx]);

  const update = (idx: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const post = useMutation({
    mutationFn: async (opts?: { fileIdx?: number }) => {
      if (!bankAccountId) throw new Error("Chưa chọn tài khoản ngân hàng");
      const payload = filtered
        .filter((r) => r.inPeriod)
        .filter((r) => opts?.fileIdx == null || (r.file_idx ?? 0) === opts.fileIdx)
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
      const res = await postFn({ data: { bankAccountId, period: { year, month }, rows: payload } });
      return { res, fileIdx: opts?.fileIdx };
    },
    onSuccess: ({ res, fileIdx }) => {
      const label = fileIdx != null ? ` (${stmtMeta[fileIdx]?.filename ?? `file #${fileIdx + 1}`})` : "";
      toast.success(`Đã hạch toán ${res.posted} GD${label}, bỏ qua ${res.skipped}${res.errors.length ? `, lỗi ${res.errors.length}` : ""}`);
      invalidateLedgers(qc);
      if (res.errors.length) {
        toast.error(`Lỗi đầu tiên: ${res.errors[0].error}`);
      } else if (fileIdx != null) {
        // Remove only this file's rows
        setRows((prev) => prev.filter((r) => (r.file_idx ?? 0) !== fileIdx));
      } else {
        setRows([]);
      }
    },
    onError: (e: any) => toast.error(e.message || "Lỗi hạch toán"),
  });

  const [pendingFileIdx, setPendingFileIdx] = useState<number | null>(null);

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

          {(mismatchFiles.length > 0 || suspectCount > 0) && (
            <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="font-semibold text-destructive">
                    Phát hiện sao kê không khớp / có giao dịch nghi ngờ
                  </div>
                  {mismatchFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {mismatchFiles.map((m, i) => (
                        <div key={i} className="rounded-md border border-destructive/30 bg-background/60 p-2.5 text-xs">
                          <div className="font-medium mb-1 truncate">📄 {m.filename}</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                            <span>Số dư đầu kỳ: <b>{fmt(m.opening_balance ?? 0)}</b></span>
                            <span>Số dư cuối kỳ: <b>{fmt(m.closing_balance ?? 0)}</b></span>
                            <span>Kỳ vọng (closing − opening): <b>{fmt(m.validation!.expected)}</b></span>
                            <span>Thực tế (Σcredit − Σdebit): <b>{fmt(m.validation!.actual)}</b></span>
                            <span className="col-span-2 text-destructive font-semibold">
                              Chênh lệch: {fmt(m.validation!.diff)} ₫
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {suspectCount > 0 && (
                    <details className="text-xs" open={mismatchFiles.length === 0}>
                      <summary className="cursor-pointer font-medium text-amber-700 hover:text-amber-800">
                        🔍 {suspectCount} giao dịch nghi ngờ cần kiểm tra
                      </summary>
                      <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                        {Array.from(suspectByIdx.entries()).slice(0, 30).map(([idx, reasons]) => {
                          const r = rows[idx];
                          return (
                            <li key={idx} className="rounded border border-amber-500/30 bg-amber-500/5 p-1.5">
                              <button
                                type="button"
                                className="text-left w-full"
                                onClick={() => {
                                  const el = document.getElementById(`txn-${idx}`);
                                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                  el?.classList.add("ring-2", "ring-amber-500");
                                  setTimeout(() => el?.classList.remove("ring-2", "ring-amber-500"), 1800);
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-muted-foreground">#{idx + 1}</span>
                                  <span className="font-mono">{r.txn_date}</span>
                                  <span className={r.amount >= 0 ? "text-emerald-600" : "text-destructive"}>
                                    {r.amount >= 0 ? "+" : "−"}{fmt(Math.abs(r.amount))}
                                  </span>
                                  <span className="truncate text-muted-foreground flex-1">{r.description}</span>
                                </div>
                                <div className="ml-9 text-amber-700">• {reasons.join(" • ")}</div>
                              </button>
                            </li>
                          );
                        })}
                        {suspectCount > 30 && (
                          <li className="text-center text-muted-foreground">… và {suspectCount - 30} dòng khác</li>
                        )}
                      </ul>
                    </details>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Gợi ý: kiểm tra ngày tháng có bị OCR sai, số tiền âm/dương ngược chiều, hoặc trang sao kê bị thiếu/lặp. Sửa trực tiếp trong bảng dưới rồi mới hạch toán.
                  </div>
                </div>
              </div>
            </div>
          )}



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
                  const suspectReasons = suspectByIdx.get(r.idx);
                  const isSuspect = !!suspectReasons;
                  return (
                    <TableRow
                      key={r.idx}
                      id={`txn-${r.idx}`}
                      className={`${dim ? "opacity-40" : ""} ${isSuspect ? "bg-amber-500/5 border-l-2 border-l-amber-500" : ""} transition-shadow`}
                      title={isSuspect ? suspectReasons!.join(" • ") : undefined}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={!r.skip && r.inPeriod}
                          disabled={!r.inPeriod}
                          onChange={(e) => update(r.idx, { skip: !e.target.checked })}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1">
                          {isSuspect && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                          <span>{r.txn_date}</span>
                        </div>
                      </TableCell>
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
              onClick={() => post.mutate(undefined)}
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
