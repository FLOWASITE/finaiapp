import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Link2, Unlink, Sparkles, ArrowLeftRight, FileText, CheckCircle2 } from "lucide-react";
import { listBankAccounts } from "@/lib/bank.functions";
import {
  listReconcileTxns,
  importStatementTxns,
  suggestMatches,
  matchTxn,
  unmatchTxn,
  autoPostTxn,
  detectInternalTransfers,
} from "@/lib/bank-reconcile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { invalidateLedgers } from "@/lib/query-invalidation";

export const Route = createFileRoute("/_app/bank/reconcile")({ component: ReconcilePage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const RECEIPT_ACCOUNTS = [
  { code: "131", name: "Phải thu khách hàng" },
  { code: "511", name: "Doanh thu bán hàng" },
  { code: "515", name: "Doanh thu tài chính" },
  { code: "711", name: "Thu nhập khác" },
  { code: "1388", name: "Phải thu khác" },
  { code: "411", name: "Vốn góp" },
];
const PAYMENT_ACCOUNTS = [
  { code: "331", name: "Phải trả NCC" },
  { code: "641", name: "Chi phí bán hàng" },
  { code: "642", name: "Chi phí QLDN" },
  { code: "334", name: "Lương NV" },
  { code: "333", name: "Thuế phải nộp" },
  { code: "141", name: "Tạm ứng" },
  { code: "635", name: "Phí ngân hàng" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// CSV parser: cột date, description, amount, counterparty
// chấp nhận dấu , hoặc ; ; amount có thể có dấu chấm/phẩy/khoảng trắng; số âm = báo nợ
function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // bỏ header nếu có chữ "date" hoặc "ngay"
  const first = lines[0].toLowerCase();
  const start = /date|ngay|ngày/.test(first) ? 1 : 0;
  const rows: { txn_date: string; description: string; amount: number; counterparty: string }[] = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) continue;
    const [dateRaw, desc, amtRaw, cp] = parts;
    // parse date dd/mm/yyyy hoặc yyyy-mm-dd
    let date = dateRaw;
    const m = dateRaw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      date = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    const amt = Number(String(amtRaw).replace(/[^\d\-]/g, ""));
    if (!date || !amt) continue;
    rows.push({ txn_date: date, description: desc || "", amount: amt, counterparty: cp || "" });
  }
  return rows;
}

function ReconcilePage() {
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchTxns = useServerFn(listReconcileTxns);
  const importFn = useServerFn(importStatementTxns);
  const suggestFn = useServerFn(suggestMatches);
  const matchFn = useServerFn(matchTxn);
  const unmatchFn = useServerFn(unmatchTxn);
  const postFn = useServerFn(autoPostTxn);
  const detectFn = useServerFn(detectInternalTransfers);

  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(todayStr());
  const [status, setStatus] = useState<"all" | "unmatched" | "matched">("all");

  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const [postOpen, setPostOpen] = useState(false);
  const [postTxn, setPostTxn] = useState<any>(null);
  const [counterAcc, setCounterAcc] = useState("131");
  const [partyName, setPartyName] = useState("");
  const [reason, setReason] = useState("");

  const [matchOpen, setMatchOpen] = useState(false);
  const [matchTxnRow, setMatchTxnRow] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  const { data: accounts = [] } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => fetchAccounts({}),
  });

  // Tự chọn tài khoản đầu tiên
  useEffect(() => {
    if (!accountId && (accounts as any[]).length > 0) {
      setAccountId((accounts as any[])[0].id);
    }
  }, [accounts, accountId]);

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["reconcile", accountId, from, to, status],
    queryFn: () =>
      fetchTxns({ data: { bankAccountId: accountId, from, to, status } }),
    enabled: !!accountId,
  });

  const stats = useMemo(() => {
    const list = (txns as any[]) ?? [];
    return {
      total: list.length,
      matched: list.filter((t) => t.status === "matched").length,
      unmatched: list.filter((t) => t.status === "unmatched").length,
      credit: list.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0),
      debit: list.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0),
    };
  }, [txns]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reconcile"] });
    invalidateLedgers(qc);
  };

  const importMut = useMutation({
    mutationFn: () => {
      const rows = parseCsv(csv);
      if (rows.length === 0) throw new Error("Không tìm thấy dòng hợp lệ. Định dạng: ngày, mô tả, số tiền, đối tác");
      return importFn({ data: { bankAccountId: accountId, rows } });
    },
    onSuccess: (r: any) => {
      toast.success(`Đã nhập ${r.inserted} giao dịch (bỏ qua ${r.skipped} trùng)`);
      setImportOpen(false);
      setCsv("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi nhập sao kê"),
  });

  const detectMut = useMutation({
    mutationFn: () => detectFn({ data: { from, to } }),
    onSuccess: (r: any) => {
      toast.success(`Phát hiện ${r.pairsFound} cặp chuyển khoản, tạo ${r.created} bút toán`);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi phát hiện"),
  });

  const postMut = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          txnId: postTxn.id,
          counterAccount: counterAcc,
          partyName: partyName || null,
          reason: reason || null,
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo phiếu và bút toán");
      setPostOpen(false);
      setPostTxn(null);
      setReason("");
      setPartyName("");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi tạo bút toán"),
  });

  const matchMut = useMutation({
    mutationFn: (voucherId: string) =>
      matchFn({ data: { txnId: matchTxnRow.id, voucherId } }),
    onSuccess: () => {
      toast.success("Đã ghép");
      setMatchOpen(false);
      setMatchTxnRow(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi ghép"),
  });

  const unmatchMut = useMutation({
    mutationFn: (id: string) => unmatchFn({ data: { txnId: id } }),
    onSuccess: () => {
      toast.success("Đã hủy ghép");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const openPost = (t: any) => {
    setPostTxn(t);
    setCounterAcc(Number(t.amount) >= 0 ? "131" : "331");
    setPartyName(t.counterparty || "");
    setReason("");
    setPostOpen(true);
  };

  const openMatch = async (t: any) => {
    setMatchTxnRow(t);
    setMatchOpen(true);
    setSuggestions([]);
    try {
      const s = await suggestFn({ data: { txnId: t.id } });
      setSuggestions(s as any[]);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi gợi ý");
    }
  };

  const counterOptions = postTxn
    ? Number(postTxn.amount) >= 0
      ? RECEIPT_ACCOUNTS
      : PAYMENT_ACCOUNTS
    : RECEIPT_ACCOUNTS;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tài khoản NH</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Chọn TK" /></SelectTrigger>
            <SelectContent>
              {(accounts as any[]).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} {a.account_no ? `— ${a.account_no}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trạng thái</Label>
          <Select value={status} onValueChange={(v: any) => setStatus(v)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              <SelectItem value="unmatched">Chưa ghép</SelectItem>
              <SelectItem value="matched">Đã ghép</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!accountId}>
            <Upload className="h-4 w-4 mr-2" /> Nhập sao kê
          </Button>
          <Button variant="outline" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            {detectMut.isPending ? "Đang quét..." : "Tự phát hiện CK nội bộ"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Tổng GD" value={stats.total.toString()} />
        <StatCard label="Đã ghép" value={stats.matched.toString()} tone="success" />
        <StatCard label="Chưa ghép" value={stats.unmatched.toString()} tone="warn" />
        <StatCard label="Tổng báo có" value={fmt(stats.credit)} tone="success" />
        <StatCard label="Tổng báo nợ" value={fmt(Math.abs(stats.debit))} tone="warn" />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Ngày</TableHead>
              <TableHead>Mô tả</TableHead>
              <TableHead>Đối tác</TableHead>
              <TableHead className="text-right w-[140px]">Số tiền</TableHead>
              <TableHead className="w-[120px]">Trạng thái</TableHead>
              <TableHead className="w-[260px] text-right">Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Đang tải...</TableCell></TableRow>
            ) : (txns as any[]).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Không có giao dịch. Nhập sao kê để bắt đầu.</TableCell></TableRow>
            ) : (
              (txns as any[]).map((t) => {
                const isCredit = Number(t.amount) >= 0;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{t.txn_date}</TableCell>
                    <TableCell className="text-sm">{t.description || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{t.counterparty || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className={`text-right font-mono ${isCredit ? "text-green-600" : "text-red-600"}`}>
                      {isCredit ? "+" : ""}{fmt(Number(t.amount))}
                    </TableCell>
                    <TableCell>
                      {t.status === "matched" ? (
                        <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Đã ghép</Badge>
                      ) : (
                        <Badge variant="secondary">Chưa ghép</Badge>
                      )}
                      {t.voucher?.voucher_no && (
                        <div className="text-[10px] text-muted-foreground mt-1">{t.voucher.voucher_no}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "matched" ? (
                        <Button size="sm" variant="ghost" onClick={() => unmatchMut.mutate(t.id)}>
                          <Unlink className="h-3 w-3 mr-1" />Hủy ghép
                        </Button>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openMatch(t)}>
                            <Link2 className="h-3 w-3 mr-1" />Ghép
                          </Button>
                          <Button size="sm" onClick={() => openPost(t)}>
                            <Sparkles className="h-3 w-3 mr-1" />Tạo bút toán
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* IMPORT DIALOG */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nhập sao kê (CSV / dán từ Excel)</DialogTitle>
            <DialogDescription>
              Mỗi dòng: <code>ngày, mô tả, số tiền, đối tác</code>. Số tiền dương = báo có, âm = báo nợ. Hệ thống tự loại trùng (cùng ngày + số tiền + mô tả).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={`15/05/2026, Thu tien KH ABC, 5000000, CTY ABC\n16/05/2026, Tra luong NV, -25000000, NV thang 5`}
            className="font-mono text-xs h-64"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Đóng</Button>
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending || !csv.trim()}>
              {importMut.isPending ? "Đang nhập..." : "Nhập"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POST DIALOG */}
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo bút toán tự động</DialogTitle>
            <DialogDescription>
              {postTxn && (
                <>
                  Giao dịch {postTxn.txn_date} — {" "}
                  <span className={Number(postTxn.amount) >= 0 ? "text-green-600" : "text-red-600"}>
                    {Number(postTxn.amount) >= 0 ? "+" : ""}{fmt(Number(postTxn.amount))} VND
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tài khoản đối ứng</Label>
              <Select value={counterAcc} onValueChange={setCounterAcc}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {counterOptions.map((a) => (
                    <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Đối tác (tùy chọn)</Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Lý do / ghi chú</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={postTxn?.description || ""} />
            </div>
            {postTxn && (
              <div className="text-xs bg-muted p-3 rounded font-mono">
                {Number(postTxn.amount) >= 0
                  ? `Nợ 1121 / Có ${counterAcc}: ${fmt(Math.abs(Number(postTxn.amount)))}`
                  : `Nợ ${counterAcc} / Có 1121: ${fmt(Math.abs(Number(postTxn.amount)))}`}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostOpen(false)}>Hủy</Button>
            <Button onClick={() => postMut.mutate()} disabled={postMut.isPending}>
              {postMut.isPending ? "Đang lưu..." : "Tạo bút toán & ghép"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MATCH DIALOG */}
      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ghép với phiếu có sẵn</DialogTitle>
            <DialogDescription>
              {matchTxnRow && `${matchTxnRow.txn_date} — ${fmt(Number(matchTxnRow.amount))} VND`}
            </DialogDescription>
          </DialogHeader>
          {suggestions.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Không tìm thấy phiếu nào khớp (cùng số tiền, ±5 ngày). Hãy dùng "Tạo bút toán".
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions
                .sort((a, b) => b.score - a.score)
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between border rounded p-3">
                    <div className="text-sm">
                      <div className="font-medium flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {s.voucher_no} <span className="text-xs text-muted-foreground">({s.voucher_type})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.voucher_date} · {fmt(Number(s.amount))} VND
                        {s.party_name ? ` · ${s.party_name}` : ""}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => matchMut.mutate(s.id)} disabled={matchMut.isPending}>
                      Ghép
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "warn" }) {
  return (
    <div className="rounded-md border p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${tone === "success" ? "text-green-600" : tone === "warn" ? "text-amber-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}
