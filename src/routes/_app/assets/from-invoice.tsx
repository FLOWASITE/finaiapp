import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FileText, CheckCircle2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  listInvoicesForAllocation,
  getInvoiceLinesForAllocation,
  createAllocatedAssetsFromInvoice,
} from "@/lib/allocated-assets.functions";

export const Route = createFileRoute("/_app/assets/from-invoice")({
  component: FromInvoicePage,
});

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");

const CATEGORIES = [
  { value: "ccdc", label: "CCDC" },
  { value: "rent", label: "Thuê" },
  { value: "insurance", label: "Bảo hiểm" },
  { value: "license", label: "License" },
  { value: "repair", label: "Sửa chữa lớn" },
  { value: "interest", label: "Lãi vay" },
  { value: "other", label: "Khác" },
];

type LineRow = {
  id: string;
  description: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  amount: number | string | null;
  line_type: string;
};

type LineForm = {
  selected: boolean;
  code: string;
  name: string;
  category: string;
  quantity: number;
  cost: number;
  periods_total: number;
  start_date: string;
  expense_account: string;
  prepaid_account: string;
};

function FromInvoicePage() {
  const [q, setQ] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const listFn = useServerFn(listInvoicesForAllocation);
  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ["alloc-from-invoice", "list", q],
    queryFn: () => listFn({ data: { q } }) as any,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets/allocations">
            <ArrowLeft className="h-4 w-4 mr-1" /> Quay lại
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Tạo CCDC/CPTT từ hoá đơn mua hàng
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Chọn hoá đơn đã ghi sổ (hoặc đã duyệt) rồi chọn các dòng để khai báo phân bổ TK 242.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm số hoá đơn / nhà cung cấp..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Số HĐ</th>
                  <th className="px-3 py-2">Nhà cung cấp</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2 text-right">Tổng tiền</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Đang tải...</td></tr>
                )}
                {!isLoading && invoices.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Không có hoá đơn phù hợp</td></tr>
                )}
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{inv.invoice_no ?? "—"}</td>
                    <td className="px-3 py-2">{inv.supplier_name ?? "—"}</td>
                    <td className="px-3 py-2">{inv.issue_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{fmt(inv.total)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={inv.status === "posted" ? "default" : "secondary"}>{inv.status}</Badge>
                      {inv.has_allocation && (
                        <Badge variant="outline" className="ml-1 text-xs">Đã tạo</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedInvoice(inv.id)}>
                        <FileText className="h-3.5 w-3.5 mr-1" /> Chọn dòng
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedInvoice && (
        <InvoiceLinesPanel
          invoiceId={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}

function InvoiceLinesPanel({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getInvoiceLinesForAllocation);
  const createFn = useServerFn(createAllocatedAssetsFromInvoice);

  const { data, isLoading } = useQuery({
    queryKey: ["alloc-from-invoice", "lines", invoiceId],
    queryFn: () => getFn({ data: { invoice_id: invoiceId } }),
  });

  const invoice = data?.invoice as any;
  const lines: LineRow[] = (data?.lines as any) ?? [];
  const existing = (data?.existing_assets as any[]) ?? [];

  const defaultStartDate = useMemo(() => {
    if (invoice?.issue_date) return invoice.issue_date as string;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [invoice?.issue_date]);

  const [forms, setForms] = useState<Record<string, LineForm>>({});

  const ensureForm = (l: LineRow): LineForm => {
    if (forms[l.id]) return forms[l.id];
    const amount = Number(l.amount ?? 0);
    const qty = Number(l.qty ?? 1) || 1;
    const baseCode = `HĐ-${invoice?.invoice_no ?? invoiceId.slice(0, 6)}-${l.id.slice(0, 4)}`;
    return {
      selected: false,
      code: baseCode.toUpperCase(),
      name: (l.description ?? "").slice(0, 200) || "Chi phí trả trước",
      category: "ccdc",
      quantity: qty,
      cost: amount,
      periods_total: 12,
      start_date: defaultStartDate,
      expense_account: invoice?.expense_account || "6423",
      prepaid_account: "242",
    };
  };

  const update = (id: string, patch: Partial<LineForm>) => {
    setForms((prev) => {
      const cur = prev[id] ?? ensureForm(lines.find((x) => x.id === id)!);
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const items = lines
        .map((l) => ({ line: l, f: forms[l.id] }))
        .filter((x) => x.f?.selected)
        .map(({ line, f }) => ({
          invoice_line_id: line.id,
          code: f!.code.trim(),
          name: f!.name.trim(),
          category: f!.category as any,
          quantity: Number(f!.quantity) || 1,
          cost: Number(f!.cost) || 0,
          periods_total: Number(f!.periods_total) || 12,
          period_unit: "month" as const,
          start_date: f!.start_date,
          expense_account: f!.expense_account,
          prepaid_account: f!.prepaid_account,
          unit: null,
        }));
      if (items.length === 0) throw new Error("Hãy chọn ít nhất một dòng");
      return createFn({ data: { invoice_id: invoiceId, items } });
    },
    onSuccess: (res) => {
      toast.success(`Đã tạo ${res.created.length} tài sản phân bổ`);
      qc.invalidateQueries({ queryKey: ["alloc-from-invoice"] });
      qc.invalidateQueries({ queryKey: ["allocated-assets"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  if (isLoading) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">Đang tải...</CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold">
              HĐ {invoice?.invoice_no ?? "—"} · {invoice?.supplier_name ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              Ngày {invoice?.issue_date ?? "—"} · Tổng {fmt(invoice?.total)}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
        </div>

        {existing.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Hoá đơn này đã có {existing.length} tài sản đã tạo: {existing.map((a) => a.code).join(", ")}
          </div>
        )}

        {lines.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">Hoá đơn không có dòng chi tiết.</div>
        ) : (
          <div className="overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-2 py-2">Diễn giải</th>
                  <th className="px-2 py-2 text-right">SL</th>
                  <th className="px-2 py-2 text-right">Thành tiền</th>
                  <th className="px-2 py-2">Mã</th>
                  <th className="px-2 py-2">Tên tài sản</th>
                  <th className="px-2 py-2">Loại</th>
                  <th className="px-2 py-2 text-right">Kỳ</th>
                  <th className="px-2 py-2">Bắt đầu</th>
                  <th className="px-2 py-2">TK chi phí</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const f = forms[l.id] ?? ensureForm(l);
                  return (
                    <tr key={l.id} className="border-t align-top">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={f.selected}
                          onChange={(e) => update(l.id, { selected: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-2 max-w-[220px]">{l.description ?? "—"}</td>
                      <td className="px-2 py-2 text-right">{fmt(l.qty)}</td>
                      <td className="px-2 py-2 text-right font-medium">{fmt(l.amount)}</td>
                      <td className="px-2 py-2"><Input value={f.code} onChange={(e) => update(l.id, { code: e.target.value })} className="h-8 w-32" /></td>
                      <td className="px-2 py-2"><Input value={f.name} onChange={(e) => update(l.id, { name: e.target.value })} className="h-8 min-w-[180px]" /></td>
                      <td className="px-2 py-2">
                        <Select value={f.category} onValueChange={(v) => update(l.id, { category: v })}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input type="number" min={1} max={600} value={f.periods_total} onChange={(e) => update(l.id, { periods_total: Number(e.target.value) })} className="h-8 w-20 text-right" />
                      </td>
                      <td className="px-2 py-2"><Input type="date" value={f.start_date} onChange={(e) => update(l.id, { start_date: e.target.value })} className="h-8 w-36" /></td>
                      <td className="px-2 py-2"><Input value={f.expense_account} onChange={(e) => update(l.id, { expense_account: e.target.value })} className="h-8 w-20" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            Mặc định: 12 kỳ tháng, TK 242 / 6423. Có thể chỉnh từng dòng trước khi tạo.
          </div>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {mutation.isPending ? "Đang tạo..." : "Tạo tài sản phân bổ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
