import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useState } from "react";
import { toast } from "sonner";
import { finToast } from "@/lib/fin-toast";
import { Sparkles, Save, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { suggestJournalEntry, approveJournalEntry } from "@/lib/journal.functions";
import { getLinkedEInvoice } from "@/lib/einvoices.functions";
import { getResolvedInvoiceLines, setLineOverrideKind, type ResolvedLine } from "@/lib/items/line-override.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/invoices/$id")({
  component: InvoiceDetail,
});

type Suggestion = {
  debit_account: string;
  credit_account: string;
  amount: number;
  description: string;
  confidence: number;
  reasoning: string;
};

function InvoiceDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const suggest = useServerFn(suggestJournalEntry);
  const approve = useServerFn(approveJournalEntry);
  const linkedFn = useServerFn(getLinkedEInvoice);

  const { data: linked } = useQuery({
    queryKey: ["invoice-einvoice", id],
    queryFn: () => linkedFn({ data: { kind: "in", invoiceId: id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: invoice, refetch } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      const { data: signed } = await supabase.storage
        .from("invoices")
        .createSignedUrl(data.file_path, 600);
      return { ...data, signedUrl: signed?.signedUrl };
    },
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [editLines, setEditLines] = useState<Array<{ account_code: string; debit: number; credit: number }>>([]);

  const suggestMut = useMutation({
    mutationFn: async () => suggest({ data: { invoiceId: id } }),
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
      finToast.success("AI đã gợi ý 3 phương án");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi gợi ý"),
  });

  const pickSuggestion = (idx: number) => {
    if (!suggestions) return;
    const s = suggestions[idx];
    setChosenIdx(idx);
    // Tách: nếu có VAT, tạo 3 dòng (hàng + VAT / công nợ)
    const sub = Number(invoice?.subtotal ?? s.amount);
    const vat = Number(invoice?.vat_amount ?? 0);
    const total = Number(invoice?.total ?? s.amount);
    const lines = [{ account_code: s.debit_account, debit: sub, credit: 0 }];
    if (vat > 0) lines.push({ account_code: "1331", debit: vat, credit: 0 });
    lines.push({ account_code: s.credit_account, debit: 0, credit: total });
    setEditLines(lines);
  };

  const approveMut = useMutation({
    mutationFn: async () => {
      const s = suggestions?.[chosenIdx ?? 0];
      return approve({
        data: {
          invoiceId: id,
          description: s?.description ?? `HĐ ${invoice?.invoice_no ?? ""} - ${invoice?.supplier_name ?? ""}`,
          entry_date: invoice?.issue_date ?? new Date().toISOString().slice(0, 10),
          lines: editLines,
        },
      });
    },
    onSuccess: () => {
      toast.success("Đã ghi vào sổ nhật ký");
      refetch();
      router.navigate({ to: "/journal" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi ghi sổ"),
  });

  if (!invoice) return <div className="p-8">Đang tải...</div>;

  const totalDebit = editLines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = editLines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && editLines.length > 0;

  return (
    <div className="grid h-screen grid-cols-2 gap-0">
      {/* Left: file preview */}
      <div className="overflow-auto border-r border-border bg-secondary/30 p-4">
        {invoice.signedUrl && (
          invoice.file_path.toLowerCase().endsWith(".pdf") ? (
            <iframe src={invoice.signedUrl} className="h-full w-full rounded-lg border" title="Hóa đơn" />
          ) : (
            <img src={invoice.signedUrl} alt="Hóa đơn" className="w-full rounded-lg border border-border" />
          )
        )}
      </div>

      {/* Right: review + suggest */}
      <div className="overflow-auto p-8">
        <h1 className="text-xl font-bold tracking-tight">Review hóa đơn</h1>
        <p className="text-sm text-muted-foreground">Kiểm tra các trường AI bóc tách trước khi định khoản</p>

        {linked?.einvoice && (
          <Link
            to="/einvoices/$id"
            params={{ id: linked.einvoice.id }}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-500/10"
          >
            <FileText className="h-3 w-3" />
            Đã gắn HĐĐT: {linked.einvoice.invoice_series ?? ""}
            {linked.einvoice.invoice_no ?? ""}
            {linked.einvoice.tct_lookup_code && (
              <span className="font-mono opacity-70">
                · {linked.einvoice.tct_lookup_code}
              </span>
            )}
          </Link>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4">
          <Field label="Nhà cung cấp" value={invoice.supplier_name ?? ""} />
          <Field label="MST" value={invoice.supplier_tax_id ?? ""} />
          <Field label="Số HĐ" value={invoice.invoice_no ?? ""} />
          <Field label="Ngày HĐ" value={invoice.issue_date ?? ""} />
          <Field label="Tiền hàng" value={Number(invoice.subtotal).toLocaleString("vi-VN")} />
          <Field label="VAT" value={Number(invoice.vat_amount).toLocaleString("vi-VN")} />
          <Field label="Tổng" value={Number(invoice.total).toLocaleString("vi-VN")} />
        </div>

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Gợi ý định khoản AI</h2>
            <Button
              onClick={() => suggestMut.mutate()}
              disabled={suggestMut.isPending}
              variant={suggestions ? "outline" : "default"}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {suggestMut.isPending ? "AI đang nghĩ..." : suggestions ? "Gợi ý lại" : "Lấy gợi ý"}
            </Button>
          </div>

          {suggestions && (
            <div className="mt-4 space-y-3">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pickSuggestion(i)}
                  className={`w-full rounded-lg border p-4 text-left transition ${
                    chosenIdx === i
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">
                      Nợ <span className="font-semibold">{s.debit_account}</span> / Có{" "}
                      <span className="font-semibold">{s.credit_account}</span>
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 text-sm">{s.description}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.reasoning}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {chosenIdx !== null && (
          <div className="mt-8 rounded-lg border border-border bg-card p-5">
            <h3 className="font-semibold">Bút toán (có thể sửa)</h3>
            <div className="mt-3 space-y-2">
              {editLines.map((l, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Input
                    value={l.account_code}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[i] = { ...l, account_code: e.target.value };
                      setEditLines(next);
                    }}
                    placeholder="TK"
                  />
                  <Input
                    type="number"
                    value={l.debit}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[i] = { ...l, debit: Number(e.target.value) };
                      setEditLines(next);
                    }}
                    placeholder="Nợ"
                  />
                  <Input
                    type="number"
                    value={l.credit}
                    onChange={(e) => {
                      const next = [...editLines];
                      next[i] = { ...l, credit: Number(e.target.value) };
                      setEditLines(next);
                    }}
                    placeholder="Có"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Tổng Nợ: <strong>{totalDebit.toLocaleString("vi-VN")}</strong> · Tổng Có:{" "}
                <strong>{totalCredit.toLocaleString("vi-VN")}</strong>
              </span>
              {!balanced && <span className="text-destructive">Chưa cân</span>}
            </div>
            <Button
              className="mt-4 w-full"
              disabled={!balanced || approveMut.isPending}
              onClick={() => approveMut.mutate()}
            >
              <Save className="mr-2 h-4 w-4" />
              {approveMut.isPending ? "Đang ghi sổ..." : "Duyệt và ghi sổ"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
