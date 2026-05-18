import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, Check, ChevronsUpDown, ArrowDownToLine, ArrowUpFromLine, Paperclip, IdCard } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { DimensionPickers, type DimensionValue } from "@/components/dimension-pickers";
import { DocumentLinksManager } from "@/components/document-links-manager";

import { createCashVoucher, nextVoucherNo } from "@/lib/cash.functions";
import { listCustomers } from "@/lib/customers.functions";
import { listSuppliers } from "@/lib/purchases.functions";
import { listChartOfAccounts } from "@/lib/coa.functions";
import { numberToVietnameseWords } from "@/lib/number-to-words-vi";

type VoucherType = "receipt" | "payment";

const COMMON_RECEIPT_ACCOUNTS = [
  { code: "131", name: "Phải thu khách hàng" },
  { code: "511", name: "Doanh thu bán hàng" },
  { code: "515", name: "Doanh thu hoạt động tài chính" },
  { code: "711", name: "Thu nhập khác" },
  { code: "141", name: "Tạm ứng (hoàn ứng)" },
  { code: "1388", name: "Phải thu khác" },
  { code: "411", name: "Vốn góp" },
  { code: "112", name: "Rút TGNH về quỹ" },
];
const COMMON_PAYMENT_ACCOUNTS = [
  { code: "331", name: "Phải trả nhà cung cấp" },
  { code: "6421", name: "Chi phí nhân viên QL" },
  { code: "6422", name: "Chi phí QLDN" },
  { code: "6427", name: "Chi phí dịch vụ mua ngoài" },
  { code: "641", name: "Chi phí bán hàng" },
  { code: "334", name: "Phải trả người lao động" },
  { code: "141", name: "Tạm ứng" },
  { code: "333", name: "Thuế phải nộp" },
  { code: "112", name: "Nộp tiền vào TGNH" },
  { code: "642", name: "Chi phí quản lý DN" },
];

function pad(n: number, len = 5) {
  return String(n).padStart(len, "0");
}
function fallbackVoucherNo(type: VoucherType, date: Date) {
  const prefix = type === "receipt" ? "PT" : "PC";
  return `${prefix}${format(date, "yyyyMM")}/${pad(1)}`;
}
const fmtThousand = (n: number) =>
  n ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n) : "";
const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export function VoucherFormDialog({
  type,
  open,
  onOpenChange,
}: {
  type: VoucherType;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createCashVoucher);
  const fetchCustomers = useServerFn(listCustomers);
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchCoa = useServerFn(listChartOfAccounts);

  const { data: parties } = useQuery<any[]>({
    queryKey: [type === "receipt" ? "customers" : "suppliers"],
    queryFn: async () => (type === "receipt" ? await fetchCustomers({}) : await fetchSuppliers({})) as any[],
    enabled: open,
  });
  const { data: coa } = useQuery({
    queryKey: ["coa"],
    queryFn: () => fetchCoa({}),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const today = useMemo(() => new Date(), []);
  const [date, setDate] = useState<Date>(today);
  const [voucherNo, setVoucherNo] = useState(() => fallbackVoucherNo(type, today));
  const [voucherNoTouched, setVoucherNoTouched] = useState(false);
  const [cashAccount, setCashAccount] = useState("1111");
  const [counterAccount, setCounterAccount] = useState(type === "receipt" ? "131" : "331");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyName, setPartyName] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [reason, setReason] = useState(type === "receipt" ? "Thu tiền khách hàng" : "Chi thanh toán nhà cung cấp");
  const [amountStr, setAmountStr] = useState("");
  const [attachments, setAttachments] = useState("");
  const [dims, setDims] = useState<DimensionValue>({});
  const [createdId, setCreatedId] = useState<string | null>(null);

  const fetchNextNo = useServerFn(nextVoucherNo);

  useEffect(() => {
    if (!open) return;
    const d = new Date();
    setDate(d);
    setVoucherNo(fallbackVoucherNo(type, d));
    setVoucherNoTouched(false);
    setCashAccount("1111");
    setCounterAccount(type === "receipt" ? "131" : "331");
    setPartyId(null);
    setPartyName("");
    setAddress("");
    setIdNumber("");
    setReason(type === "receipt" ? "Thu tiền khách hàng" : "Chi thanh toán nhà cung cấp");
    setAmountStr("");
    setAttachments("");
    setDims({});
    setCreatedId(null);
  }, [open, type]);

  useEffect(() => {
    if (!open || voucherNoTouched) return;
    let cancelled = false;
    const ym = format(date, "yyyyMM");
    fetchNextNo({ data: { voucher_type: type, year_month: ym } })
      .then((r) => {
        if (!cancelled && !voucherNoTouched) setVoucherNo(r.voucher_no);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, type, date, voucherNoTouched, fetchNextNo]);

  const amount = parseAmount(amountStr);
  const amountWords = useMemo(() => (amount > 0 ? numberToVietnameseWords(amount) : ""), [amount]);

  const partyOptions = (parties ?? []) as any[];
  const selectedParty = partyOptions.find((p) => p.id === partyId);

  // Auto-fill from party
  useEffect(() => {
    if (!selectedParty) return;
    setPartyName(selectedParty.name ?? "");
    setAddress(selectedParty.address ?? "");
  }, [selectedParty]);

  const debitAccount = type === "receipt" ? cashAccount : counterAccount;
  const creditAccount = type === "receipt" ? counterAccount : cashAccount;

  const m = useMutation({
    mutationFn: () =>
      create({
        data: {
          voucher_no: voucherNo.trim(),
          voucher_type: type,
          voucher_date: format(date, "yyyy-MM-dd"),
          amount,
          cash_account: cashAccount,
          counter_account: counterAccount,
          party_name: partyName.trim() || undefined,
          reason: [reason.trim(), idNumber && `CMND/CCCD: ${idNumber}`, attachments && `Kèm theo: ${attachments} chứng từ`]
            .filter(Boolean)
            .join(" — ") || undefined,
          branch_id: dims.branch_id ?? null,
          project_id: dims.project_id ?? null,
          cost_center_id: dims.cost_center_id ?? null,
        },
      }),
    onSuccess: () => {
      toast.success(`Đã tạo ${type === "receipt" ? "phiếu thu" : "phiếu chi"} & bút toán`);
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi khi lưu"),
  });

  const canSubmit = amount > 0 && voucherNo.trim() && cashAccount && counterAccount;
  const isReceipt = type === "receipt";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader
          className={cn(
            "px-6 py-4 border-b",
            isReceipt ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-rose-50 dark:bg-rose-950/20",
          )}
        >
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isReceipt ? (
              <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
            ) : (
              <ArrowUpFromLine className="h-5 w-5 text-rose-600" />
            )}
            {isReceipt ? "Phiếu thu" : "Phiếu chi"}
            <span className="font-mono text-sm font-normal text-muted-foreground">· {voucherNo}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Mẫu số 01-TT (TT133/TT200) — tự động sinh bút toán {debitAccount}/{creditAccount}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Header: Số / Ngày / TK tiền */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Số phiếu" required>
              <Input
                value={voucherNo}
                onChange={(e) => {
                  setVoucherNo(e.target.value);
                  setVoucherNoTouched(true);
                }}
                className="font-mono"
              />
            </Field>
            <Field label="Ngày lập">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "dd/MM/yyyy", { locale: vi })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus locale={vi} />
                </PopoverContent>
              </Popover>
            </Field>
            <Field label="Tài khoản tiền">
              <Select value={cashAccount} onValueChange={setCashAccount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1111">1111 — Tiền Việt Nam</SelectItem>
                  <SelectItem value="1112">1112 — Ngoại tệ</SelectItem>
                  <SelectItem value="1113">1113 — Vàng bạc, đá quý</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Separator />

          {/* Party */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {isReceipt ? "Người nộp tiền" : "Người nhận tiền"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={isReceipt ? "Khách hàng" : "Nhà cung cấp"}>
                <PartyCombobox
                  options={partyOptions}
                  value={partyId}
                  onChange={(id, name) => {
                    setPartyId(id);
                    if (!id && name) setPartyName(name);
                  }}
                />
              </Field>
              <Field label="Họ và tên">
                <Input
                  value={partyName}
                  onChange={(e) => setPartyName(e.target.value)}
                  placeholder="Nhập họ tên người nộp/nhận"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Field label="Địa chỉ">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </Field>
              </div>
              <Field label={<span className="inline-flex items-center gap-1.5"><IdCard className="h-3.5 w-3.5" />CMND/CCCD</span>}>
                <Input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Tuỳ chọn" />
              </Field>
            </div>
          </div>

          <Separator />

          {/* Reason + Counter account + Amount */}
          <div className="space-y-3">
            <Field label="Lý do" required>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isReceipt ? "Thu tiền khách hàng theo hóa đơn..." : "Chi thanh toán nhà cung cấp..."}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label={`Tài khoản đối ứng (${isReceipt ? "TK Có" : "TK Nợ"})`} required>
                <AccountCombobox
                  value={counterAccount}
                  onChange={setCounterAccount}
                  coa={coa ?? []}
                  suggestions={isReceipt ? COMMON_RECEIPT_ACCOUNTS : COMMON_PAYMENT_ACCOUNTS}
                />
              </Field>
              <Field label="Số tiền (VND)" required>
                <Input
                  value={fmtThousand(amount)}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="text-right font-mono text-base font-semibold"
                  placeholder="0"
                  inputMode="numeric"
                />
              </Field>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-[11px] uppercase text-muted-foreground">Bằng chữ</div>
              <div className="text-sm italic min-h-[1.25rem]">{amountWords || "—"}</div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Phân tích quản trị</h3>
            <DimensionPickers value={dims} onChange={setDims} show={["branch","project","cost_center"]} layout="row" />
          </div>

          <Separator />

          {/* Footer: Attachments + Journal preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label={<span className="inline-flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />Kèm theo (số chứng từ gốc)</span>}>
              <Input
                value={attachments}
                onChange={(e) => setAttachments(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                inputMode="numeric"
              />
            </Field>
            <div className="rounded-md border p-3 bg-card">
              <div className="text-[11px] uppercase text-muted-foreground mb-1.5">Định khoản tự động</div>
              <div className="flex items-center justify-between text-sm font-mono">
                <span>
                  <span className="text-emerald-600">Nợ {debitAccount}</span>
                  <span className="mx-2 text-muted-foreground">/</span>
                  <span className="text-rose-600">Có {creditAccount}</span>
                </span>
                <span className="font-semibold tabular-nums">{fmtThousand(amount) || "0"} ₫</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={() => m.mutate()} disabled={!canSubmit || m.isPending}>
            {m.isPending ? "Đang lưu…" : "Lưu & sinh bút toán"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function PartyCombobox({
  options,
  value,
  onChange,
}: {
  options: any[];
  value: string | null;
  onChange: (id: string | null, name?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {active ? (
            <span className="truncate">
              {active.code && <span className="font-mono text-muted-foreground mr-2">{active.code}</span>}
              {active.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Chọn từ danh mục…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm mã, tên, MST…" />
          <CommandList>
            <CommandEmpty>Không tìm thấy</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                <span className="text-muted-foreground">Không chọn (nhập tay)</span>
              </CommandItem>
              {options
                .filter((o) => o.is_active !== false)
                .map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.code ?? ""} ${o.name} ${o.tax_id ?? ""}`}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">
                        {o.code && <span className="font-mono text-muted-foreground mr-2">{o.code}</span>}
                        {o.name}
                      </span>
                      {o.tax_id && <span className="text-xs text-muted-foreground">MST: {o.tax_id}</span>}
                    </div>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AccountCombobox({
  value,
  onChange,
  coa,
  suggestions,
}: {
  value: string;
  onChange: (code: string) => void;
  coa: { code: string; name: string; is_active: boolean }[];
  suggestions: { code: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    suggestions.forEach((s) => map.set(s.code, s));
    coa.filter((c) => c.is_active).forEach((c) => map.set(c.code, { code: c.code, name: c.name }));
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [coa, suggestions]);
  const active = all.find((a) => a.code === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {active ? (
            <span className="truncate">
              <span className="font-mono mr-2">{active.code}</span>
              <span className="text-muted-foreground">{active.name}</span>
            </span>
          ) : value ? (
            <span className="font-mono">{value}</span>
          ) : (
            <span className="text-muted-foreground">Chọn tài khoản…</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Tìm mã hoặc tên TK…" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Không có TK phù hợp</CommandEmpty>
            <CommandGroup heading="Gợi ý thường dùng">
              {suggestions.map((s) => (
                <CommandItem
                  key={`s-${s.code}`}
                  value={`${s.code} ${s.name}`}
                  onSelect={() => {
                    onChange(s.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.code ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono mr-2">{s.code}</span>
                  <span className="text-muted-foreground text-sm">{s.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Toàn bộ hệ thống tài khoản">
              {all.map((a) => (
                <CommandItem
                  key={a.code}
                  value={`${a.code} ${a.name}`}
                  onSelect={() => {
                    onChange(a.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === a.code ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono mr-2">{a.code}</span>
                  <span className="text-muted-foreground text-sm">{a.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
