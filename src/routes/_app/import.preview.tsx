import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, Plus, Trash2, Sparkles, CheckCircle2, AlertTriangle, UserCheck, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createManualInvoice } from "@/lib/purchases.functions";
import { lookupSupplierByTaxId, quickCreateSupplier } from "@/lib/import-preview.functions";

export const Route = createFileRoute("/_app/import/preview")({ component: ImportPreviewPage });

const normalizeTaxId = (s: string) => (s || "").replace(/\D+/g, "");

const fmt = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");

type InvoiceLine = {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  vat_rate: number;
};

type InvoiceDraft = {
  kind: "purchase_invoice";
  filename: string;
  supplier_id: string | null;
  supplier_code: string | null;
  supplier_name: string;
  supplier_tax_id: string;
  invoice_no: string;
  issue_date: string;
  notes: string;
  expense_account: string;   // TK Nợ chi phí/hàng hoá
  vat_account: string;       // TK Nợ thuế VAT đầu vào
  payable_account: string;   // TK Có (phải trả NCC)
  lines: InvoiceLine[];
  ai_upload_id: string | null;
  file_hash: string | null;
  status: "idle" | "sending" | "done" | "error";
  error?: string;
  created_id?: string;
  // lookup state
  lookup_state?: "idle" | "loading" | "found" | "missing" | "duplicate";
  lookup_msg?: string;
  expense_from_history?: boolean;
};

type VoucherDraft = {
  kind: "cash_voucher";
  filename: string;
  voucher_no: string;
  voucher_type: "receipt" | "payment";
  voucher_date: string;
  amount: number;
  counter_account: string;   // TK đối ứng
  party_name: string;
  reason: string;
  reference: string;
  bank_account_id: string;
  status: "idle" | "sending" | "done" | "error";
  error?: string;
};

type Draft = InvoiceDraft | VoucherDraft;

const COUNTER_OPTS = [
  "1111", "1121", "131", "133", "1331", "152", "153", "1561", "1562", "211",
  "242", "331", "334", "338", "511", "515", "621", "627",
  "635", "641", "642", "6421", "6422", "6427", "6428", "711", "811",
];

const EXPENSE_OPTS = ["1561", "152", "153", "211", "242", "621", "627", "641", "642", "6421", "6422", "6427", "6428", "811"];
const VAT_IN_OPTS = ["1331", "1332"];
const PAYABLE_OPTS = ["331", "3311", "3388"];

function readBatch(): { kind: string; items: Array<{ filename: string; kind: string; parsed: any }> } | null {
  if (typeof window === "undefined") return null;
  const fromWin = (window as any).__lastBatchImport;
  if (fromWin) return fromWin;
  try {
    const raw = sessionStorage.getItem("lastBatchImport");
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(s: any): string {
  if (!s) return todayISO();
  const str = String(s);
  // dd/mm/yyyy or dd-mm-yyyy
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}-${m2[3].padStart(2, "0")}`;
  return str.slice(0, 10);
}

function toInvoiceDraft(item: { filename: string; parsed: any }): InvoiceDraft {
  const p = item.parsed ?? {};
  const rawLines: any[] = Array.isArray(p.lines) ? p.lines : [];
  const lines: InvoiceLine[] = rawLines.length
    ? rawLines.map((l) => {
        const qty = Number(l.qty ?? l.quantity ?? 1) || 1;
        const unit_price = Number(l.unit_price ?? l.price ?? 0) || 0;
        const amount = Number(l.amount ?? qty * unit_price) || 0;
        return {
          description: String(l.description ?? l.name ?? "Hàng hoá/dịch vụ"),
          qty,
          unit_price,
          amount,
          vat_rate: Number(l.vat_rate ?? l.tax_rate ?? p.vat_rate ?? 0) || 0,
        };
      })
    : [{
        description: "Hàng hoá/dịch vụ",
        qty: 1,
        unit_price: Number(p.subtotal ?? p.total ?? 0) || 0,
        amount: Number(p.subtotal ?? p.total ?? 0) || 0,
        vat_rate: Number(p.vat_rate ?? 0) || 0,
      }];
  return {
    kind: "purchase_invoice",
    filename: item.filename,
    supplier_name: String(p.vendor_name ?? p.supplier_name ?? ""),
    supplier_tax_id: String(p.vendor_tax_id ?? p.supplier_tax_id ?? p.tax_id ?? p.mst ?? ""),
    invoice_no: String(p.invoice_no ?? p.invoice_number ?? ""),
    issue_date: normalizeDate(p.issue_date ?? p.date),
    notes: String(p.notes ?? ""),
    expense_account: String(p.expense_account ?? "1561"),
    vat_account: "1331",
    payable_account: "331",
    lines,
    status: "idle",
  };
}

function toVoucherDraft(item: { filename: string; parsed: any }): VoucherDraft {
  const p = item.parsed ?? {};
  const amount = Math.abs(Number(p.amount ?? 0)) || 0;
  const type: "receipt" | "payment" =
    String(p.type ?? p.voucher_type ?? "").toLowerCase().includes("receipt") ||
    String(p.type ?? "").toLowerCase().includes("thu")
      ? "receipt"
      : "payment";
  return {
    kind: "cash_voucher",
    filename: item.filename,
    voucher_no: String(p.voucher_no ?? p.no ?? ""),
    voucher_type: type,
    voucher_date: normalizeDate(p.date ?? p.voucher_date),
    amount,
    counter_account: String(p.counter_account ?? (type === "receipt" ? "131" : "331")),
    party_name: String(p.party_name ?? p.counterparty ?? ""),
    reason: String(p.reason ?? p.description ?? ""),
    reference: String(p.reference ?? ""),
    bank_account_id: "",
    status: "idle",
  };
}

function ImportPreviewPage() {
  const propose = useServerFn(proposeActionFn);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [source, setSource] = useState<string>("");

  useEffect(() => {
    const batch = readBatch();
    if (!batch) return;
    if (batch.kind === "bank_statement") {
      setSource("bank_statement");
      return;
    }
    const items = Array.isArray(batch.items) ? batch.items : [];
    const built: Draft[] = items.map((it) =>
      it.kind === "cash_voucher" ? toVoucherDraft(it) : toInvoiceDraft(it),
    );
    setDrafts(built);
    setSource(batch.kind);
  }, []);

  const patch = (idx: number, p: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === idx ? ({ ...d, ...p } as Draft) : d)));

  const patchLine = (idx: number, lineIdx: number, p: Partial<InvoiceLine>) =>
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== idx || d.kind !== "purchase_invoice") return d;
        const lines = d.lines.map((l, j) => {
          if (j !== lineIdx) return l;
          const merged = { ...l, ...p };
          // auto-recompute amount when qty/price changes (unless amount is explicitly patched)
          if (p.amount === undefined && (p.qty !== undefined || p.unit_price !== undefined)) {
            merged.amount = Number((merged.qty * merged.unit_price).toFixed(2));
          }
          return merged;
        });
        return { ...d, lines };
      }),
    );

  const addLine = (idx: number) =>
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === idx && d.kind === "purchase_invoice"
          ? { ...d, lines: [...d.lines, { description: "", qty: 1, unit_price: 0, amount: 0, vat_rate: d.lines[0]?.vat_rate ?? 0 }] }
          : d,
      ),
    );

  const removeLine = (idx: number, lineIdx: number) =>
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === idx && d.kind === "purchase_invoice"
          ? { ...d, lines: d.lines.filter((_, j) => j !== lineIdx) }
          : d,
      ),
    );

  const invoiceTotal = (d: InvoiceDraft) => {
    const sub = d.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const vat = d.lines.reduce((s, l) => s + (Number(l.amount) || 0) * ((Number(l.vat_rate) || 0) / 100), 0);
    return { sub, vat, total: sub + vat };
  };

  const validate = (d: Draft): string | null => {
    if (d.kind === "purchase_invoice") {
      if (!d.supplier_name.trim()) return "Thiếu tên NCC";
      if (!d.issue_date) return "Thiếu ngày HĐ";
      if (!d.lines.length) return "Cần ít nhất 1 dòng";
      if (d.lines.some((l) => !l.description.trim() || l.amount <= 0)) return "Dòng không hợp lệ";
    } else {
      if (!d.voucher_no.trim()) return "Thiếu số phiếu";
      if (!d.voucher_date) return "Thiếu ngày phiếu";
      if (d.amount <= 0) return "Số tiền > 0";
      if (!d.counter_account) return "Thiếu TK đối ứng";
      if (!d.bank_account_id) return "Cần ID tài khoản NH";
    }
    return null;
  };

  const submitOne = async (idx: number) => {
    const d = drafts[idx];
    const err = validate(d);
    if (err) {
      toast.error(`${d.filename}: ${err}`);
      patch(idx, { status: "error", error: err });
      return;
    }
    patch(idx, { status: "sending", error: undefined });
    try {
      if (d.kind === "purchase_invoice") {
        await propose({
          data: {
            tool_name: "createPurchaseInvoice",
            input: {
              supplier_name: d.supplier_name,
              supplier_tax_id: d.supplier_tax_id || undefined,
              invoice_no: d.invoice_no || undefined,
              issue_date: d.issue_date,
              notes: d.notes || undefined,
              expense_account: d.expense_account || undefined,
              lines: d.lines,
            },
          },
        });
      } else {
        await propose({
          data: {
            tool_name: "createBankVoucher",
            input: {
              voucher_no: d.voucher_no,
              voucher_type: d.voucher_type,
              voucher_date: d.voucher_date,
              bank_account_id: d.bank_account_id,
              amount: d.amount,
              counter_account: d.counter_account,
              party_name: d.party_name || undefined,
              reason: d.reason || undefined,
              reference: d.reference || undefined,
            },
          },
        });
      }
      patch(idx, { status: "done" });
      toast.success(`${d.filename}: đã đề xuất nháp`);
    } catch (e: any) {
      patch(idx, { status: "error", error: e?.message || "lỗi" });
      toast.error(`${d.filename}: ${e?.message || "lỗi"}`);
    }
  };

  const submitAll = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < drafts.length; i++) {
        if (drafts[i].status === "done") continue;
        await submitOne(i);
      }
    },
  });

  const pendingCount = useMemo(() => drafts.filter((d) => d.status !== "done").length, [drafts]);
  const doneCount = drafts.length - pendingCount;

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" />Dashboard</Link>
        </Button>
        <h1 className="text-xl font-semibold">Xem trước & chỉnh sửa trước khi tạo nháp</h1>
        <Badge variant="secondary" className="ml-auto">
          <Sparkles className="mr-1 h-3 w-3" />AI đã trích xuất, bạn có thể sửa
        </Badge>
      </div>

      {source === "bank_statement" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="inline h-4 w-4 mr-1 text-amber-600" />
          Phiên nhập gần nhất là <b>sao kê ngân hàng</b>. Hãy mở
          {" "}
          <Link to="/bank/import-statement" className="underline font-medium">/bank/import-statement</Link> để chỉnh sửa và hạch toán.
        </div>
      )}

      {drafts.length === 0 && source !== "bank_statement" && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Chưa có dữ liệu trích xuất. Mở trợ lý AI (Cmd/Ctrl+J) → đính kèm{" "}
          <b>Hoá đơn mua</b> hoặc <b>Phiếu thu/chi</b> để bắt đầu.
        </div>
      )}

      {drafts.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <div>
              <b>{drafts.length}</b> chứng từ • Đã đề xuất: <b className="text-emerald-600">{doneCount}</b> • Còn lại: <b>{pendingCount}</b>
            </div>
            <Button
              size="sm"
              disabled={!pendingCount || submitAll.isPending}
              onClick={() => submitAll.mutate()}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {submitAll.isPending ? "Đang gửi…" : `Tạo nháp ${pendingCount} chứng từ`}
            </Button>
          </div>

          <div className="space-y-4">
            {drafts.map((d, idx) => (
              <DraftCard
                key={idx}
                draft={d}
                index={idx}
                onPatch={(p) => patch(idx, p)}
                onPatchLine={(li, p) => patchLine(idx, li, p)}
                onAddLine={() => addLine(idx)}
                onRemoveLine={(li) => removeLine(idx, li)}
                onSubmit={() => submitOne(idx)}
                invoiceTotals={d.kind === "purchase_invoice" ? invoiceTotal(d) : null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, error }: { status: Draft["status"]; error?: string }) {
  if (status === "done") return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"><CheckCircle2 className="mr-1 h-3 w-3" />Đã đề xuất</Badge>;
  if (status === "sending") return <Badge variant="secondary">Đang gửi…</Badge>;
  if (status === "error") return <Badge variant="destructive" title={error}>Lỗi</Badge>;
  return <Badge variant="outline">Nháp</Badge>;
}

function DraftCard({
  draft, index, onPatch, onPatchLine, onAddLine, onRemoveLine, onSubmit, invoiceTotals,
}: {
  draft: Draft;
  index: number;
  onPatch: (p: Partial<Draft>) => void;
  onPatchLine: (li: number, p: Partial<InvoiceLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (li: number) => void;
  onSubmit: () => void;
  invoiceTotals: { sub: number; vat: number; total: number } | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">#{index + 1}</span>
          <span className="text-muted-foreground truncate max-w-[260px]">{draft.filename}</span>
          <Badge variant="outline" className="ml-2 text-[10px]">
            {draft.kind === "purchase_invoice" ? "Hoá đơn mua" : draft.voucher_type === "receipt" ? "Phiếu thu (NH)" : "Phiếu chi (NH)"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={draft.status} error={draft.error} />
          <Button size="sm" variant="outline" disabled={draft.status === "sending" || draft.status === "done"} onClick={onSubmit}>
            Tạo nháp
          </Button>
        </div>
      </div>

      {draft.kind === "purchase_invoice" ? (
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Tên NCC" className="md:col-span-2">
              <Input value={draft.supplier_name} onChange={(e) => onPatch({ supplier_name: e.target.value } as any)} />
            </Field>
            <Field label="MST">
              <Input value={draft.supplier_tax_id} onChange={(e) => onPatch({ supplier_tax_id: e.target.value } as any)} placeholder="0123456789" />
            </Field>
            <Field label="Số HĐ">
              <Input value={draft.invoice_no} onChange={(e) => onPatch({ invoice_no: e.target.value } as any)} />
            </Field>
            <Field label="Ngày HĐ">
              <Input type="date" value={draft.issue_date} onChange={(e) => onPatch({ issue_date: e.target.value } as any)} />
            </Field>
            <Field label="Ghi chú" className="md:col-span-3">
              <Input value={draft.notes} onChange={(e) => onPatch({ notes: e.target.value } as any)} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
            <Field label="Nợ — TK chi phí/HH">
              <AccountCombo value={draft.expense_account} options={EXPENSE_OPTS} onChange={(v) => onPatch({ expense_account: v } as any)} />
            </Field>
            <Field label="Nợ — TK thuế VAT đầu vào">
              <AccountCombo value={draft.vat_account} options={VAT_IN_OPTS} onChange={(v) => onPatch({ vat_account: v } as any)} />
            </Field>
            <Field label="Có — TK phải trả NCC">
              <AccountCombo value={draft.payable_account} options={PAYABLE_OPTS} onChange={(v) => onPatch({ payable_account: v } as any)} />
            </Field>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Diễn giải</TableHead>
                  <TableHead className="w-20 text-right">SL</TableHead>
                  <TableHead className="w-32 text-right">Đơn giá</TableHead>
                  <TableHead className="w-32 text-right">Thành tiền</TableHead>
                  <TableHead className="w-24 text-right">VAT %</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draft.lines.map((l, li) => (
                  <TableRow key={li}>
                    <TableCell>
                      <Input value={l.description} onChange={(e) => onPatchLine(li, { description: e.target.value })} className="h-8 text-xs" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={l.qty} onChange={(e) => onPatchLine(li, { qty: Number(e.target.value) || 0 })} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={l.unit_price} onChange={(e) => onPatchLine(li, { unit_price: Number(e.target.value) || 0 })} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={l.amount} onChange={(e) => onPatchLine(li, { amount: Number(e.target.value) || 0 })} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={l.vat_rate} onChange={(e) => onPatchLine(li, { vat_rate: Number(e.target.value) || 0 })} className="h-8 text-xs text-right" />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => onRemoveLine(li)} disabled={draft.lines.length === 1}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={onAddLine}>
              <Plus className="mr-1 h-3.5 w-3.5" />Thêm dòng
            </Button>
            {invoiceTotals && (
              <div className="text-sm">
                Subtotal <b>{fmt(invoiceTotals.sub)}</b> • VAT <b>{fmt(invoiceTotals.vat)}</b> •{" "}
                <span className="text-base">Tổng <b className="text-foreground">{fmt(invoiceTotals.total)}</b> ₫</span>
              </div>
            )}
          </div>

          {invoiceTotals && (
            <JournalPreview
              rows={[
                { dr: draft.expense_account || "1561", cr: draft.payable_account || "331", amount: invoiceTotals.sub, memo: `HH/CP — ${draft.supplier_name || "NCC"}` },
                ...(invoiceTotals.vat > 0
                  ? [{ dr: draft.vat_account || "1331", cr: draft.payable_account || "331", amount: invoiceTotals.vat, memo: "Thuế GTGT đầu vào" }]
                  : []),
              ]}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Số phiếu">
              <Input value={draft.voucher_no} onChange={(e) => onPatch({ voucher_no: e.target.value } as any)} />
            </Field>
            <Field label="Loại">
              <Select value={draft.voucher_type} onValueChange={(v) => onPatch({ voucher_type: v as any } as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Báo có (thu)</SelectItem>
                  <SelectItem value="payment">Báo nợ (chi)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ngày phiếu">
              <Input type="date" value={draft.voucher_date} onChange={(e) => onPatch({ voucher_date: e.target.value } as any)} />
            </Field>
            <Field label="Số tiền">
              <Input type="number" value={draft.amount} onChange={(e) => onPatch({ amount: Number(e.target.value) || 0 } as any)} />
            </Field>
            <Field label={draft.voucher_type === "receipt" ? "Có — TK đối ứng" : "Nợ — TK đối ứng"}>
              <AccountCombo value={draft.counter_account} options={COUNTER_OPTS} onChange={(v) => onPatch({ counter_account: v } as any)} />
            </Field>
            <Field label="Đối tác">
              <Input value={draft.party_name} onChange={(e) => onPatch({ party_name: e.target.value } as any)} />
            </Field>
            <Field label="Tham chiếu">
              <Input value={draft.reference} onChange={(e) => onPatch({ reference: e.target.value } as any)} />
            </Field>
            <Field label="ID TK ngân hàng">
              <Input value={draft.bank_account_id} onChange={(e) => onPatch({ bank_account_id: e.target.value } as any)} placeholder="UUID TK ngân hàng" />
            </Field>
            <Field label="Diễn giải" className="md:col-span-4">
              <Textarea value={draft.reason} onChange={(e) => onPatch({ reason: e.target.value } as any)} rows={2} />
            </Field>
          </div>

          {draft.amount > 0 && (
            <JournalPreview
              rows={[
                draft.voucher_type === "receipt"
                  ? { dr: "1121", cr: draft.counter_account || "131", amount: draft.amount, memo: draft.reason || draft.party_name }
                  : { dr: draft.counter_account || "331", cr: "1121", amount: draft.amount, memo: draft.reason || draft.party_name },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function AccountCombo({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const merged = Array.from(new Set([value, ...options].filter(Boolean)));
  return (
    <div className="flex gap-1">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {merged.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        className="h-9 w-20 text-xs"
        placeholder="khác"
      />
    </div>
  );
}

function JournalPreview({ rows }: { rows: Array<{ dr: string; cr: string; amount: number; memo?: string }> }) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Bút toán dự kiến
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Nợ</TableHead>
            <TableHead className="w-24">Có</TableHead>
            <TableHead className="text-right w-36">Số tiền</TableHead>
            <TableHead>Diễn giải</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">{r.dr}</TableCell>
              <TableCell className="font-mono text-xs">{r.cr}</TableCell>
              <TableCell className="text-right font-medium">{fmt(r.amount)}</TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-[280px]">{r.memo}</TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={2} className="text-right text-xs text-muted-foreground">Tổng</TableCell>
            <TableCell className="text-right font-semibold">{fmt(total)}</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
