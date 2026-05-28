import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { SalesTabs } from "@/components/sales/SalesTabs";
import { Upload, Plus, Search, Trash2, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoice } from "@/lib/invoices.functions";
import {
  listPurchaseInvoices, listSuppliers, createManualInvoice,
} from "@/lib/purchases.functions";
import { listProducts } from "@/lib/inventory.functions";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportEinvoiceXmlDialog } from "@/components/import-einvoice-xml-dialog";
import { ReceiptDocsSheet } from "@/components/receipt-docs-sheet";
import { DocStatusBadge } from "@/components/doc-status-badge";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesList,
});

type ManualLine = {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
  vat_rate: number;
  line_type: "goods" | "service" | "asset" | "ccdc";
  product_id?: string | null;
};

const emptyLine = (): ManualLine => ({
  description: "",
  qty: 1,
  unit_price: 0,
  amount: 0,
  vat_rate: 10,
  line_type: "service",
  product_id: null,
});

function vnd(n: number | string | null | undefined) {
  return Number(n ?? 0).toLocaleString("vi-VN");
}

function InvoicesList() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const extract = useServerFn(extractInvoice);
  const listFn = useServerFn(listPurchaseInvoices);
  const suppliersFn = useServerFn(listSuppliers);
  const productsFn = useServerFn(listProducts);
  const manualFn = useServerFn(createManualInvoice);

  const [filter, setFilter] = useState<{
    supplierId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
    paymentStatus?: string;
    search?: string;
  }>({});

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["purchase-invoices", filter],
    queryFn: () => listFn({ data: filter }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  // ---- Manual entry ----
  const [manualOpen, setManualOpen] = useState(false);
  const [docFor, setDocFor] = useState<{ id: string; status: string; invoice_no?: string | null } | null>(null);

  // Chỉ tải suppliers/products khi mở form nhập tay để giảm request
  // chạy song song lúc vào trang.
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => suppliersFn(),
    enabled: manualOpen,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsFn(),
    enabled: manualOpen,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  // ---- Upload OCR ----
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Chưa đăng nhập");
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;
      const { data: inv, error: insErr } = await supabase
        .from("invoices")
        .insert({ user_id: userId, file_path: path, status: "pending" })
        .select("id")
        .single();
      if (insErr || !inv) throw insErr || new Error("Không tạo được hóa đơn");
      toast.info("Đang bóc tách bằng AI...");
      await extract({ data: { invoiceId: inv.id } });
      toast.success("Bóc tách xong");
      await refetch();
      router.navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---- Manual entry state ----
  const [manual, setManual] = useState({
    supplier_id: "",
    invoice_no: "",
    issue_date: new Date().toISOString().slice(0, 10),
    notes: "",
    lines: [emptyLine()] as ManualLine[],
  });

  const updateLine = (i: number, patch: Partial<ManualLine>) => {
    setManual((m) => {
      const lines = [...m.lines];
      lines[i] = { ...lines[i], ...patch };
      if (patch.qty !== undefined || patch.unit_price !== undefined) {
        lines[i].amount = Number(lines[i].qty || 0) * Number(lines[i].unit_price || 0);
      }
      return { ...m, lines };
    });
  };

  const manualMut = useMutation({
    mutationFn: () =>
      manualFn({
        data: {
          supplier_id: manual.supplier_id || null,
          supplier_name:
            suppliers?.find((s) => s.id === manual.supplier_id)?.name ?? null,
          supplier_tax_id:
            suppliers?.find((s) => s.id === manual.supplier_id)?.tax_id ?? null,
          invoice_no: manual.invoice_no || null,
          issue_date: manual.issue_date,
          notes: manual.notes || null,
          expense_account: null,
          lines: manual.lines.map((l) => ({
            description: l.description,
            qty: Number(l.qty || 0),
            unit_price: Number(l.unit_price || 0),
            amount: Number(l.amount || 0),
            vat_rate: Number(l.vat_rate || 0),
            line_type: l.line_type,
            product_id: l.product_id || null,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success("Đã tạo hoá đơn");
      setManualOpen(false);
      setManual({
        supplier_id: "",
        invoice_no: "",
        issue_date: new Date().toISOString().slice(0, 10),
        notes: "",
        lines: [emptyLine()],
      });
      refetch();
      router.navigate({ to: "/invoices/$id", params: { id: r.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  const totals = data?.totals;

  return (
    <div>
      <SalesTabs />
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hoá đơn đầu vào</h1>
          <p className="text-sm text-muted-foreground">
            Upload ảnh/PDF để AI bóc tách, hoặc nhập tay
          </p>
        </div>
        <div className="flex gap-2">
          <ImportEinvoiceXmlDialog triggerLabel="Nhập XML hoá đơn" />
          <Button variant="outline" onClick={() => setManualOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nhập tay
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Đang xử lý..." : "Upload hoá đơn"}
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-6">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Số HĐ"
            className="pl-7"
            value={filter.search ?? ""}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          />
        </div>
        <Select
          value={filter.supplierId ?? "all"}
          onValueChange={(v) => setFilter({ ...filter, supplierId: v === "all" ? undefined : v })}
        >
          <SelectTrigger><SelectValue placeholder="NCC" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả NCC</SelectItem>
            {(suppliers ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter
          from={filter.fromDate ?? `${new Date().getFullYear()}-01-01`}
          to={filter.toDate ?? `${new Date().getFullYear()}-12-31`}
          onChange={(r) => setFilter({ ...filter, fromDate: r.from, toDate: r.to })}
        />
        <Select
          value={filter.status ?? "all"}
          onValueChange={(v) => setFilter({ ...filter, status: v === "all" ? undefined : v })}
        >
          <SelectTrigger><SelectValue placeholder="Trạng thái OCR" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="pending">Chờ OCR</SelectItem>
            <SelectItem value="extracted">Đã bóc tách</SelectItem>
            <SelectItem value="approved">Đã ghi sổ</SelectItem>
            <SelectItem value="failed">Lỗi</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filter.paymentStatus ?? "all"}
          onValueChange={(v) =>
            setFilter({ ...filter, paymentStatus: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger><SelectValue placeholder="Thanh toán" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi TT</SelectItem>
            <SelectItem value="unpaid">Chưa trả</SelectItem>
            <SelectItem value="partial">Trả 1 phần</SelectItem>
            <SelectItem value="paid">Đã trả</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Totals */}
      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      ) : totals ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Card label="Tiền hàng" value={vnd(totals.subtotal)} />
          <Card label="VAT" value={vnd(totals.vat)} />
          <Card label="Tổng" value={vnd(totals.total)} />
          <Card label="Đã trả" value={vnd(totals.paid)} tone="emerald" />
          <Card label="Còn nợ" value={vnd(totals.remaining)} tone="rose" />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Ngày</th>
              <th className="px-4 py-3">Số HĐ</th>
              <th className="px-4 py-3">Nhà cung cấp</th>
              <th className="px-4 py-3 text-right">Tổng</th>
              <th className="px-4 py-3 text-right">Còn nợ</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">TT</th>
              <th className="px-4 py-3 text-center">Tài liệu</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-14 rounded-full" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-6 w-16 mx-auto" /></td>
                  </tr>
                ))
              : (data?.rows ?? []).map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <Link to="/invoices/$id" params={{ id: i.id }} className="text-accent">
                        {i.issue_date ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{i.invoice_no ?? "—"}</td>
                    <td className="px-4 py-3">{i.supplier_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">{vnd(i.total)}</td>
                    <td className="px-4 py-3 text-right font-mono">{vnd(i.remaining)}</td>
                    <td className="px-4 py-3"><DocStatusBadge status={i.status} /></td>
                    <td className="px-4 py-3"><PayBadge status={i.payment_status} /></td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        onClick={() =>
                          setDocFor({ id: i.id, status: i.status, invoice_no: i.invoice_no })
                        }
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
            {!isLoading && (data?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8">
                  <EmptyState size="sm" bordered={false} title="Không có hoá đơn theo bộ lọc" description="Thử đổi từ khoá hoặc khoảng thời gian." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manual entry dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nhập hoá đơn thủ công</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Nhà cung cấp</Label>
              <Select
                value={manual.supplier_id}
                onValueChange={(v) => setManual({ ...manual, supplier_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Số HĐ</Label>
              <Input
                value={manual.invoice_no}
                onChange={(e) => setManual({ ...manual, invoice_no: e.target.value })}
              />
            </div>
            <div>
              <Label>Ngày HĐ</Label>
              <Input
                type="date"
                value={manual.issue_date}
                onChange={(e) => setManual({ ...manual, issue_date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Dòng hàng / dịch vụ</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setManual((m) => ({ ...m, lines: [...m.lines, emptyLine()] }))
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Thêm dòng
              </Button>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {manual.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 rounded border border-border p-2">
                  <Select
                    value={l.line_type}
                    onValueChange={(v) => updateLine(i, { line_type: v as ManualLine["line_type"] })}
                  >
                    <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="goods">Hàng hoá</SelectItem>
                      <SelectItem value="service">Dịch vụ</SelectItem>
                      <SelectItem value="asset">Tài sản</SelectItem>
                    </SelectContent>
                  </Select>
                  {l.line_type === "goods" ? (
                    <Select
                      value={l.product_id ?? ""}
                      onValueChange={(v) => {
                        const p = products?.find((x) => x.id === v);
                        updateLine(i, {
                          product_id: v,
                          description: p?.name ?? l.description,
                          unit_price: Number(p?.unit_cost ?? l.unit_price),
                          vat_rate: Number(p?.vat_rate ?? l.vat_rate),
                        });
                      }}
                    >
                      <SelectTrigger className="col-span-4 h-8"><SelectValue placeholder="Chọn mặt hàng" /></SelectTrigger>
                      <SelectContent>
                        {(products ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className="col-span-4 h-8"
                      placeholder="Mô tả"
                      value={l.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                    />
                  )}
                  <Input
                    type="number"
                    className="col-span-1 h-8"
                    placeholder="SL"
                    value={l.qty}
                    onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 h-8"
                    placeholder="Đơn giá"
                    value={l.unit_price}
                    onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    className="col-span-2 h-8"
                    placeholder="Thành tiền"
                    value={l.amount}
                    onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
                  />
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <Input
                      type="number"
                      className="h-8 w-12 px-1 text-xs"
                      value={l.vat_rate}
                      onChange={(e) => updateLine(i, { vat_rate: Number(e.target.value) })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setManual((m) => ({
                          ...m,
                          lines: m.lines.filter((_, k) => k !== i),
                        }))
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end gap-4 text-sm text-muted-foreground">
              <span>
                Tiền hàng:{" "}
                <strong className="text-foreground">
                  {vnd(manual.lines.reduce((s, l) => s + Number(l.amount || 0), 0))}
                </strong>
              </span>
              <span>
                VAT:{" "}
                <strong className="text-foreground">
                  {vnd(
                    manual.lines.reduce(
                      (s, l) => s + (Number(l.amount || 0) * Number(l.vat_rate || 0)) / 100,
                      0,
                    ),
                  )}
                </strong>
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)} disabled={manualMut.isPending}>Huỷ</Button>
            <Button
              onClick={() => manualMut.mutate()}
              disabled={manualMut.isPending || manual.lines.some((l) => !l.description && !l.product_id)}
            >
              {manualMut.isPending ? "Đang lưu…" : "Lưu và thoát"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptDocsSheet
        open={!!docFor}
        onOpenChange={(o) => !o && setDocFor(null)}
        receiptId={docFor?.id ?? null}
        status={docFor?.status}
        hasJournalEntry={docFor?.status === "posted"}
        table="invoices"
        title={`Tài liệu hoá đơn ${docFor?.invoice_no ?? ""}`.trim()}
        description="Xem OCR, đổi trạng thái và quản lý đính kèm của hoá đơn."
        invalidateKeys={["purchase-invoices"]}
      />
    </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "rose" | "emerald" }) {
  const c = tone === "rose" ? "text-rose-600" : tone === "emerald" ? "text-emerald-600" : "";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-base font-semibold ${c}`}>{value}</div>
    </div>
  );
}


function PayBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    unpaid: { label: "Chưa trả", cls: "bg-rose-500/15 text-rose-600" },
    partial: { label: "Trả 1 phần", cls: "bg-amber-500/15 text-amber-700" },
    paid: { label: "Đã trả", cls: "bg-emerald-500/15 text-emerald-700" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
