import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { listBankAccounts, createBankVoucher } from "@/lib/bank.functions";
import { listCustomers } from "@/lib/customers.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { numberToVietnameseWords } from "@/lib/number-to-words-vi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { AutoCodeInput } from "@/components/ui/auto-code-input";

const fmtThousand = (n: number) => (n ? new Intl.NumberFormat("vi-VN").format(n) : "");
const parseAmt = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

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

export type BankVoucherPrefill = {
  partyId?: string | null;
  partyName?: string;
  amount?: number;
  reason?: string;
  counterAccount?: string;
};

export function BankVoucherFormDialog({
  open,
  type,
  onOpenChange,
  prefill,
  accounts: accountsProp,
  onSaved,
}: {
  open: boolean;
  type: "receipt" | "payment";
  onOpenChange: (o: boolean) => void;
  prefill?: BankVoucherPrefill;
  accounts?: any[];
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createBankVoucher);
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchCust = useServerFn(listCustomers);
  const fetchSupp = useServerFn(listSuppliers);

  const isReceipt = type === "receipt";

  const { data: fetchedAccounts = [] } = useQuery<any[]>({
    queryKey: ["bank-accounts"],
    queryFn: () => fetchAccounts({}) as any,
    enabled: open && !accountsProp,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });
  const accounts = accountsProp ?? fetchedAccounts;

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [date, setDate] = useState(today);
  const [voucherNo, setVoucherNo] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [counter, setCounter] = useState(isReceipt ? "131" : "331");
  const [partyId, setPartyId] = useState<string>("");
  const [partyName, setPartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const { data: parties = [] } = useQuery<any[]>({
    queryKey: [isReceipt ? "customers" : "suppliers"],
    queryFn: () => (isReceipt ? fetchCust({}) : fetchSupp({})) as any,
    enabled: open,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return;
    setDate(format(new Date(), "yyyy-MM-dd"));
    setVoucherNo("");
    setBankAccountId(accounts[0]?.id ?? "");
    setCounter(prefill?.counterAccount ?? (isReceipt ? "131" : "331"));
    setPartyId(prefill?.partyId ?? "");
    setPartyName(prefill?.partyName ?? "");
    setAmount(prefill?.amount ? String(Math.round(prefill.amount)) : "");
    setReason(prefill?.reason ?? (isReceipt ? "Thu tiền khách hàng qua NH" : "Chi thanh toán qua NH"));
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!bankAccountId && accounts[0]?.id) setBankAccountId(accounts[0].id);
  }, [accounts, bankAccountId]);

  const amt = parseAmt(amount);
  const words = useMemo(() => (amt > 0 ? numberToVietnameseWords(amt) : ""), [amt]);
  const acc = accounts.find((a: any) => a.id === bankAccountId);
  const bankGl = acc?.gl_account_code || "1121";
  const debit = isReceipt ? bankGl : counter;
  const credit = isReceipt ? counter : bankGl;

  const m = useMutation({
    mutationFn: () =>
      create({
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
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const canSave = voucherNo.trim() && bankAccountId && counter && amt > 0;
  const suggestions = isReceipt ? RECEIPT_ACCOUNTS : PAYMENT_ACCOUNTS;

  if (open && accounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chưa có tài khoản ngân hàng</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vui lòng tạo tài khoản ngân hàng trước khi lập phiếu.
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Đã hiểu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReceipt ? (
              <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
            ) : (
              <ArrowUpFromLine className="h-5 w-5 text-rose-600" />
            )}
            {isReceipt ? "Phiếu báo có (Thu qua NH)" : "Phiếu báo nợ (Chi qua NH)"}
          </DialogTitle>
          <DialogDescription>
            Tự sinh bút toán Nợ {debit} / Có {credit}
          </DialogDescription>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} ({a.gl_account_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{isReceipt ? "Khách hàng" : "Nhà cung cấp"}</Label>
              <Select
                value={partyId}
                onValueChange={(v) => {
                  setPartyId(v);
                  const p = (parties as any[]).find((x) => x.id === v);
                  if (p) setPartyName(p.name);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn từ danh mục..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {(parties as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code ? `${p.code} - ` : ""}
                      {p.name}
                    </SelectItem>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {suggestions.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </SelectItem>
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
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="font-mono"
            />
          </div>

          {amt > 0 && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs italic">Bằng chữ: {words}</div>
          )}

          <div className="rounded-md border bg-card p-3">
            <div className="text-[11px] uppercase text-muted-foreground mb-1">Bút toán tự sinh</div>
            <div className="flex justify-between font-mono text-sm">
              <span>
                <span className="text-emerald-600">Nợ {debit}</span> /{" "}
                <span className="text-rose-600">Có {credit}</span>
              </span>
              <span className="font-semibold">{fmtThousand(amt) || "0"} ₫</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={m.isPending}>
            Huỷ
          </Button>
          <Button disabled={!canSave || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Đang lưu…" : "Lưu và thoát"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
