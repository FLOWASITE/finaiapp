import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, FileText, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listPurchaseVouchers,
  createPurchaseVoucher,
  postPurchaseVoucher,
  voidPurchaseVoucher,
  deletePurchaseVoucher,
  suggestVoucherNo,
  listLinkablePurchaseInvoices,
} from "@/lib/purchase-vouchers.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/purchases/vouchers")({
  component: PurchaseVouchersPage,
});

function statusBadge(s: string) {
  const map: Record<string, string> = {
    uploaded: "Nháp",
    reviewed: "Đã duyệt",
    posted: "Đã ghi sổ",
    void: "Đã huỷ",
    rejected: "Bị từ chối",
    ai_read: "AI đọc",
  };
  return (
    <Badge variant={s === "posted" ? "default" : s === "void" ? "destructive" : "secondary"}>
      {map[s] ?? s}
    </Badge>
  );
}

function fmtMoney(n: number | string | null | undefined) {
  return new Intl.NumberFormat("vi-VN").format(Number(n ?? 0));
}

function PurchaseVouchersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPurchaseVouchers);
  const postFn = useServerFn(postPurchaseVoucher);
  const voidFn = useServerFn(voidPurchaseVoucher);
  const delFn = useServerFn(deletePurchaseVoucher);

  const [openCreate, setOpenCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data, refetch } = useQuery({
    queryKey: ["purchase-vouchers", search, status],
    queryFn: () =>
      listFn({ data: { search: search || undefined, status: status === "all" ? undefined : status } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const postMut = useMutation({
    mutationFn: (id: string) => postFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã ghi sổ");
      invalidateLedgers(qc);
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi ghi sổ"),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => voidFn({ data: { id, reason: "Huỷ thủ công" } }),
    onSuccess: () => {
      toast.success("Đã huỷ phiếu");
      invalidateLedgers(qc);
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi huỷ phiếu"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu");
      refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi xoá"),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu mua hàng</h1>
          <p className="text-sm text-muted-foreground">
            Chứng từ kế toán ghi nhận nghiệp vụ mua. Có thể link tới Hoá đơn mua, tự sinh bút toán, phiếu nhập kho và phiếu chi.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Tạo phiếu mới
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Tìm số phiếu, NCC, diễn giải…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                <SelectItem value="uploaded">Nháp</SelectItem>
                <SelectItem value="reviewed">Đã duyệt</SelectItem>
                <SelectItem value="posted">Đã ghi sổ</SelectItem>
                <SelectItem value="void">Đã huỷ</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Số phiếu</TableHead>
                <TableHead>Ngày</TableHead>
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>Diễn giải</TableHead>
                <TableHead className="text-right">Tổng tiền</TableHead>
                <TableHead>PT TT</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Chưa có phiếu</TableCell></TableRow>
              ) : rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.voucher_no}</TableCell>
                  <TableCell>{r.voucher_date}</TableCell>
                  <TableCell>{r.supplier_name ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.total)}</TableCell>
                  <TableCell>
                    {r.payment_method === "cash" ? "Tiền mặt"
                      : r.payment_method === "bank" ? "Ngân hàng"
                      : "Công nợ"}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right space-x-1">
                    {r.status !== "posted" && r.status !== "void" && (
                      <Button size="sm" variant="default" onClick={() => postMut.mutate(r.id)}>
                        <Check className="h-3 w-3 mr-1" /> Ghi sổ
                      </Button>
                    )}
                    {r.status === "posted" && (
                      <Button size="sm" variant="outline" onClick={() => voidMut.mutate(r.id)}>
                        <X className="h-3 w-3 mr-1" /> Huỷ
                      </Button>
                    )}
                    {r.status !== "posted" && (
                      <Button size="sm" variant="ghost" onClick={() => delMut.mutate(r.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    {r.journal_entry_id && (
                      <Link to="/journal" className="inline-flex">
                        <Button size="sm" variant="ghost"><FileText className="h-3 w-3" /></Button>
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateVoucherDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={() => {
          refetch();
          setOpenCreate(false);
        }}
      />
    </div>
  );
}

function CreateVoucherDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(createPurchaseVoucher);
  const suggestNoFn = useServerFn(suggestVoucherNo);
  const linkInvFn = useServerFn(listLinkablePurchaseInvoices);
  const suppliersFn = useServerFn(listSuppliers);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    voucher_no: "",
    voucher_date: today,
    supplier_id: "",
    supplier_name: "",
    invoice_id: "",
    reason: "",
    subtotal: 0,
    vat_rate: 10,
    vat_amount: 0,
    total: 0,
    debit_account: "156",
    credit_account: "331",
    vat_account: "1331",
    payment_method: "credit" as "credit" | "cash" | "bank",
    payment_account: "1111",
    pay_now: false,
    create_stock_voucher: false,
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: () => suppliersFn({ data: {} }),
    enabled: open,
  });
  const { data: invoices } = useQuery({
    queryKey: ["linkable-purchase-invoices", form.supplier_id],
    queryFn: () => linkInvFn({ data: { supplierId: form.supplier_id || undefined } }),
    enabled: open,
  });

  const { data: suggested } = useQuery({
    queryKey: ["pv-suggest-no", form.voucher_date],
    queryFn: () => suggestNoFn({ data: { voucher_date: form.voucher_date } }),
    enabled: open,
  });

  // Auto-fill voucher no when dialog opens
  if (open && !form.voucher_no && suggested?.voucher_no) {
    setForm((f) => ({ ...f, voucher_no: suggested.voucher_no }));
  }

  const recalc = (next: typeof form) => {
    const sub = Number(next.subtotal || 0);
    const rate = Number(next.vat_rate || 0);
    const vat = Math.round((sub * rate) / 100);
    return { ...next, vat_amount: vat, total: sub + vat };
  };

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        ...form,
        supplier_id: form.supplier_id || null,
        invoice_id: form.invoice_id || null,
        warehouse_id: null,
      };
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success("Đã tạo phiếu nháp");
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi tạo phiếu"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu mua hàng</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Số phiếu</Label>
            <Input value={form.voucher_no} onChange={(e) => setForm({ ...form, voucher_no: e.target.value })} />
          </div>
          <div>
            <Label>Ngày phiếu</Label>
            <Input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} />
          </div>
          <div>
            <Label>Nhà cung cấp</Label>
            <Select
              value={form.supplier_id || "none"}
              onValueChange={(v) => {
                const s = suppliers?.rows?.find((x: any) => x.id === v);
                setForm({
                  ...form,
                  supplier_id: v === "none" ? "" : v,
                  supplier_name: s?.name ?? "",
                });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Chọn NCC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không chọn —</SelectItem>
                {(suppliers?.rows ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-3">
            <Label>Link Hoá đơn mua (tuỳ chọn)</Label>
            <Select
              value={form.invoice_id || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  setForm({ ...form, invoice_id: "" });
                  return;
                }
                const inv = invoices?.rows?.find((x: any) => x.id === v);
                if (inv) {
                  setForm(
                    recalc({
                      ...form,
                      invoice_id: v,
                      supplier_id: inv.supplier_id ?? form.supplier_id,
                      supplier_name: inv.supplier_name ?? form.supplier_name,
                      subtotal: Number(inv.subtotal ?? 0),
                      vat_amount: Number(inv.vat_amount ?? 0),
                      total: Number(inv.total ?? 0),
                    }),
                  );
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Không link" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Không link —</SelectItem>
                {(invoices?.rows ?? []).map((i: any) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoice_no ?? "—"} · {i.supplier_name} · {fmtMoney(i.total)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-3">
            <Label>Diễn giải</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>

          <div>
            <Label>Thành tiền (chưa VAT)</Label>
            <Input type="number" value={form.subtotal}
              onChange={(e) => setForm(recalc({ ...form, subtotal: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>VAT %</Label>
            <Input type="number" value={form.vat_rate}
              onChange={(e) => setForm(recalc({ ...form, vat_rate: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>Tổng cộng</Label>
            <Input type="number" value={form.total} readOnly className="bg-muted" />
          </div>

          <div>
            <Label>TK Nợ</Label>
            <Input value={form.debit_account} onChange={(e) => setForm({ ...form, debit_account: e.target.value })} />
          </div>
          <div>
            <Label>TK Có</Label>
            <Input value={form.credit_account} onChange={(e) => setForm({ ...form, credit_account: e.target.value })} />
          </div>
          <div>
            <Label>TK VAT</Label>
            <Input value={form.vat_account} onChange={(e) => setForm({ ...form, vat_account: e.target.value })} />
          </div>

          <div>
            <Label>Phương thức TT</Label>
            <Select value={form.payment_method}
              onValueChange={(v: "credit" | "cash" | "bank") => setForm({ ...form, payment_method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Công nợ (331)</SelectItem>
                <SelectItem value="cash">Tiền mặt (111)</SelectItem>
                <SelectItem value="bank">Ngân hàng (112)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.payment_method !== "credit" && (
            <>
              <div>
                <Label>TK tiền</Label>
                <Input value={form.payment_account}
                  onChange={(e) => setForm({ ...form, payment_account: e.target.value })} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.pay_now}
                    onChange={(e) => setForm({ ...form, pay_now: e.target.checked })} />
                  Thanh toán ngay → sinh phiếu chi/UNC
                </label>
              </div>
            </>
          )}

          <div className="col-span-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.create_stock_voucher}
                onChange={(e) => setForm({ ...form, create_stock_voucher: e.target.checked })} />
              Sinh phiếu nhập kho khi ghi sổ (cần có dòng hàng hoá gắn mặt hàng từ HĐ link)
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.voucher_no}>
            Lưu phiếu nháp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
