import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Trash2 } from "lucide-react";
import { PostedBadge, AttachmentsCell, VoucherRowActions } from "@/components/voucher-row-actions";
import { format } from "date-fns";
import {
  listBankAccounts, listBankVouchers, createBankVoucher,
  createBankTransfer, deleteBankVoucher,
} from "@/lib/bank.functions";
import { listCustomers } from "@/lib/customers.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { DateRangeFilter } from "@/components/date-range-filter";
import { getPresetRange } from "@/lib/date-presets";
import { numberToVietnameseWords } from "@/lib/number-to-words-vi";

export const Route = createFileRoute("/_app/bank/vouchers")({ component: VouchersPage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtThousand = (n: number) => (n ? new Intl.NumberFormat("vi-VN").format(n) : "");
const parseAmt = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

type Mode = "receipt" | "payment" | "transfer" | null;

const RECEIPT_ACCOUNTS = [
  { code: "131", name: "Phải thu khách hàng" },
  { code: "511", name: "Doanh thu bán hàng" },
  { code: "515", name: "Doanh thu tài chính" },
  { code: "711", name: "Thu nhập khác" },
  { code: "1388", name: "Phải thu khác" },
  { code: "411", name: "Vốn góp" },
  { code: "1111", name: "Nộp tiền mặt vào NH" },
];
const PAYMENT_ACCOUNTS = [
  { code: "331", name: "Phải trả nhà cung cấp" },
  { code: "641", name: "Chi phí bán hàng" },
  { code: "642", name: "Chi phí QLDN" },
  { code: "6427", name: "Chi phí dịch vụ mua ngoài" },
  { code: "334", name: "Phải trả người lao động" },
  { code: "333", name: "Thuế phải nộp" },
  { code: "141", name: "Tạm ứng" },
  { code: "1111", name: "Rút tiền NH về quỹ" },
  { code: "635", name: "Chi phí tài chính (phí NH)" },
];

function VouchersPage() {
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchVouchers = useServerFn(listBankVouchers);
  const delFn = useServerFn(deleteBankVoucher);
  const defaultRange = useMemo(() => getPresetRange("thisMonth"), []);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [mode, setMode] = useState<Mode>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchAccounts({}),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data: vouchers = [] } = useQuery({
    queryKey: ["bank-vouchers", filterAccount, from, to],
    queryFn: () => fetchVouchers({ data: { ...(filterAccount === "all" ? {} : { bankAccountId: filterAccount }), from, to } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu (và bút toán liên quan)");
      qc.invalidateQueries({ queryKey: ["bank-vouchers"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả tài khoản NH</SelectItem>
            {accounts.map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.name} {a.bank_name ? `(${a.bank_name})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
        <div className="ml-auto flex items-center gap-2">
          <AddNew label="Báo có (Thu)" icon={ArrowDownToLine} onClick={() => setMode("receipt")} />
          <AddNew label="Báo nợ (Chi)" icon={ArrowUpFromLine} onClick={() => setMode("payment")} />
          <Button onClick={() => setMode("transfer")} variant="outline">
            <ArrowLeftRight className="mr-2 h-4 w-4" /> Chuyển khoản nội bộ
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Ngày</th>
              <th className="px-4 py-2 text-left">Số phiếu</th>
              <th className="px-4 py-2 text-left">Loại</th>
              <th className="px-4 py-2 text-left">TK ngân hàng</th>
              <th className="px-4 py-2 text-left">Đối tượng</th>
              <th className="px-4 py-2 text-left">TK đối ứng</th>
              <th className="px-4 py-2 text-left">Diễn giải</th>
              <th className="px-4 py-2 text-right">Số tiền</th>
              <th className="px-4 py-2 text-center">Trạng thái</th>
              <th className="px-4 py-2 text-center">Tài liệu</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((v: any) => {
              const isIn = v.voucher_type === "receipt" || v.voucher_type === "transfer_in";
              return (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-2">{v.voucher_date}</td>
                  <td className="px-4 py-2 font-mono">{v.voucher_no}</td>
                  <td className="px-4 py-2">
                    <TypeBadge type={v.voucher_type} />
                  </td>
                  <td className="px-4 py-2 text-xs">{v.bank_accounts?.name}</td>
                  <td className="px-4 py-2">{v.party_name || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{v.counter_account}</td>
                  <td className="px-4 py-2 max-w-[260px] truncate" title={v.reason || ""}>{v.reason || "—"}</td>
                  <td className={"px-4 py-2 text-right font-mono " + (isIn ? "text-emerald-600" : "text-rose-600")}>
                    {(isIn ? "+" : "−")}{fmt(Number(v.amount))}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <PostedBadge posted={!!v.journal_entry_id} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <AttachmentsCell
                      attachments={v.attachments ?? []}
                      entityTable="bank_vouchers"
                      entityId={v.id}
                      docKind="bank_voucher"
                      invalidateKeys={[["bank-vouchers"]]}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <VoucherRowActions
                      onView={() => toast.info("Xem chi tiết — đang phát triển")}
                      onEdit={() => toast.info("Chỉnh sửa — đang phát triển")}
                      onPrint={() => toast.info("In phiếu — đang phát triển")}
                      onDuplicate={() => toast.info("Nhân bản — đang phát triển")}
                      onDelete={() => {
                        if (confirm(`Xoá phiếu ${v.voucher_no}? Bút toán liên quan cũng sẽ bị xoá.`)) del.mutate(v.id);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
            {vouchers.length === 0 && (
              <tr><td colSpan={11} className="py-12 text-center text-muted-foreground">Chưa có phiếu nào</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {mode === "transfer" ? (
        <TransferDialog open onClose={() => setMode(null)} accounts={accounts} />
      ) : mode ? (
        <VoucherDialog open type={mode} onClose={() => setMode(null)} accounts={accounts} />
      ) : null}
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const m: Record<string, { l: string; c: string }> = {
    receipt: { l: "Báo có", c: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    payment: { l: "Báo nợ", c: "text-rose-600 bg-rose-50 dark:bg-rose-950/30" },
    transfer_in: { l: "CK đến", c: "text-sky-600 bg-sky-50 dark:bg-sky-950/30" },
    transfer_out: { l: "CK đi", c: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
  };
  const x = m[type] || { l: type, c: "" };
  return <span className={"rounded px-2 py-0.5 text-xs " + x.c}>{x.l}</span>;
}

function VoucherDialog({
  open, type, onClose, accounts,
}: { open: boolean; type: "receipt" | "payment"; onClose: () => void; accounts: any[] }) {
  const qc = useQueryClient();
  const create = useServerFn(createBankVoucher);
  const fetchCust = useServerFn(listCustomers);
  const fetchSupp = useServerFn(listSuppliers);

  const isReceipt = type === "receipt";
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [date, setDate] = useState(today);
  const [voucherNo, setVoucherNo] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [counter, setCounter] = useState(isReceipt ? "131" : "331");
  const [partyId, setPartyId] = useState<string>("");
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState(isReceipt ? "Thu tiền khách hàng qua NH" : "Chi thanh toán qua NH");
  const [reference, setReference] = useState("");

  const { data: parties = [] } = useQuery<any[]>({
    queryKey: [isReceipt ? "customers" : "suppliers"],
    queryFn: () => (isReceipt ? fetchCust({}) : fetchSupp({})) as any,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  useEffect(() => {
    if (!bankAccountId && accounts[0]?.id) setBankAccountId(accounts[0].id);
  }, [accounts, bankAccountId]);

  const amt = parseAmt(amount);
  const words = useMemo(() => (amt > 0 ? numberToVietnameseWords(amt) : ""), [amt]);
  const acc = accounts.find((a) => a.id === bankAccountId);
  const bankGl = acc?.gl_account_code || "1121";
  const debit = isReceipt ? bankGl : counter;
  const credit = isReceipt ? counter : bankGl;

  const m = useMutation({
    mutationFn: () => create({
      data: {
        voucher_no: voucherNo.trim(),
        voucher_type: type,
        voucher_date: date,
        bank_account_id: bankAccountId,
        amount: amt,
        counter_account: counter,
        party_id: partyId || undefined,
        party_name: partyName.trim() || undefined,
        reason: reason.trim() || undefined,
        reference: reference.trim() || undefined,
      },
    }),
    onSuccess: () => {
      toast.success(`Đã tạo ${isReceipt ? "phiếu báo có" : "phiếu báo nợ"} & bút toán`);
      qc.invalidateQueries({ queryKey: ["bank-vouchers"] });
      invalidateLedgers(qc);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const canSave = voucherNo.trim() && bankAccountId && counter && amt > 0;
  const suggestions = isReceipt ? RECEIPT_ACCOUNTS : PAYMENT_ACCOUNTS;

  if (accounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chưa có tài khoản ngân hàng</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Vui lòng tạo tài khoản ngân hàng trước khi lập phiếu.</p>
          <DialogFooter><Button onClick={onClose}>Đã hiểu</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReceipt ? <ArrowDownToLine className="h-5 w-5 text-emerald-600" /> : <ArrowUpFromLine className="h-5 w-5 text-rose-600" />}
            {isReceipt ? "Phiếu báo có (Thu qua NH)" : "Phiếu báo nợ (Chi qua NH)"}
          </DialogTitle>
          <DialogDescription>Tự sinh bút toán Nợ {debit} / Có {credit}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Số phiếu *</Label>
              <AutoCodeInput
                value={voucherNo}
                onChange={setVoucherNo}
                entity={isReceipt ? "bank_receipt" : "bank_payment"}
                date={date}
                autoFillOnMount
              />
            </div>
            <div>
              <Label className="text-xs">Ngày *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tài khoản ngân hàng *</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.gl_account_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{isReceipt ? "Khách hàng" : "Nhà cung cấp"}</Label>
              <Select value={partyId} onValueChange={(v) => {
                setPartyId(v);
                const p = (parties as any[]).find((x) => x.id === v);
                if (p) setPartyName(p.name);
              }}>
                <SelectTrigger><SelectValue placeholder="Chọn từ danh mục..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {(parties as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code ? `${p.code} - ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tên đối tượng</Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tài khoản đối ứng *</Label>
              <Select value={counter} onValueChange={setCounter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {suggestions.map((s) => (
                    <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Số tiền (VND) *</Label>
              <Input
                value={fmtThousand(amt)}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right font-mono text-base font-semibold"
                inputMode="numeric"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Diễn giải</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Số tham chiếu (UNC/Mã GD ngân hàng)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="font-mono" />
          </div>

          {amt > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs italic">Bằng chữ: {words}</div>
          )}

          <div className="rounded-md border bg-card p-3">
            <div className="text-[11px] uppercase text-muted-foreground mb-1">Bút toán tự sinh</div>
            <div className="flex justify-between font-mono text-sm">
              <span><span className="text-emerald-600">Nợ {debit}</span> / <span className="text-rose-600">Có {credit}</span></span>
              <span className="font-semibold">{fmtThousand(amt) || "0"} ₫</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Huỷ</Button>
          <Button disabled={!canSave || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Đang lưu…" : "Lưu và thoát"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  open, onClose, accounts,
}: { open: boolean; onClose: () => void; accounts: any[] }) {
  const qc = useQueryClient();
  const create = useServerFn(createBankTransfer);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [date, setDate] = useState(today);
  const [voucherNo, setVoucherNo] = useState("");
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("Chuyển khoản nội bộ");

  const amt = parseAmt(amount);
  const fromAcc = accounts.find((a) => a.id === fromId);
  const toAcc = accounts.find((a) => a.id === toId);

  const m = useMutation({
    mutationFn: () => create({
      data: {
        voucher_no: voucherNo.trim(),
        voucher_date: date,
        from_account_id: fromId,
        to_account_id: toId,
        amount: amt,
        reason: reason.trim() || undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Đã ghi chuyển khoản nội bộ");
      qc.invalidateQueries({ queryKey: ["bank-vouchers"] });
      invalidateLedgers(qc);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const canSave = voucherNo.trim() && fromId && toId && fromId !== toId && amt > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" /> Chuyển khoản nội bộ giữa các TK NH
          </DialogTitle>
          <DialogDescription>
            Tự sinh bút toán Nợ {toAcc?.gl_account_code || "1121"} / Có {fromAcc?.gl_account_code || "1121"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Số phiếu *</Label>
              <AutoCodeInput value={voucherNo} onChange={setVoucherNo} entity="bank_transfer" date={date} autoFillOnMount />
            </div>
            <div>
              <Label className="text-xs">Ngày *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Từ tài khoản *</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.gl_account_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Đến tài khoản *</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== fromId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.gl_account_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Số tiền (VND) *</Label>
            <Input
              value={fmtThousand(amt)}
              onChange={(e) => setAmount(e.target.value)}
              className="text-right font-mono text-base font-semibold"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label className="text-xs">Diễn giải</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Huỷ</Button>
          <Button disabled={!canSave || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Đang lưu…" : "Lưu và thoát"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
