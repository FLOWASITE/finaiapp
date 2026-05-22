import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Plus, Pencil, Trash2, Landmark, AlertCircle, Link2, CheckCircle2 } from "lucide-react";
import { listBankAccounts, upsertBankAccount, deleteBankAccount } from "@/lib/bank.functions";
import { MbBankConnectDialog } from "@/components/mbbank-connect-dialog";
import { BankCombobox, BankLogo, VN_BANK_LIST } from "@/components/bank-combobox";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumberInput } from "@/components/ui/number-input";

export const Route = createFileRoute("/_app/bank/accounts")({ component: AccountsPage });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Bank list moved to bank-combobox component

const GL_OPTIONS = [
  { code: "1121", label: "1121 — Tiền gửi NH (VND)" },
  { code: "1122", label: "1122 — Tiền gửi NH (ngoại tệ)" },
  { code: "1123", label: "1123 — Tiền gửi NH (vàng bạc, đá quý)" },
];

const CURRENCIES = ["VND", "USD", "EUR", "JPY", "GBP", "SGD", "CNY", "KRW", "AUD"];

const FormSchema = z.object({
  name: z.string().trim().min(1, "Tên tài khoản bắt buộc").max(120, "Tối đa 120 ký tự"),
  bank_name: z.string().trim().max(120).optional().nullable(),
  account_no: z
    .string()
    .trim()
    .max(40, "Tối đa 40 ký tự")
    .regex(/^[0-9 \-.]*$/, "Chỉ chứa số, dấu cách, gạch hoặc dấu chấm")
    .optional()
    .nullable(),
  currency: z.string().min(3).max(8),
  gl_account_code: z.string().min(3).max(20),
  opening_balance: z.number().min(0, "Không được âm"),
});
type FormValues = z.infer<typeof FormSchema>;

function AccountsPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(listBankAccounts);
  const delFn = useServerFn(deleteBankAccount);
  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchFn({}),
 ...QUERY_PRESETS.REFERENCE,
});
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [mbAccount, setMbAccount] = useState<any | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá tài khoản");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{accounts.length} tài khoản</p>
        <AddNew label="Thêm tài khoản" onClick={() => { setEditing(null); setOpen(true); }} />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-4 py-2 text-left">Tên tài khoản</th>
              <th className="px-4 py-2 text-left">Ngân hàng</th>
              <th className="px-4 py-2 text-left">Số TK</th>
              <th className="px-4 py-2 text-left">Tiền tệ</th>
              <th className="px-4 py-2 text-left">TK kế toán</th>
              <th className="px-4 py-2 text-right">Số dư đầu</th>
              <th className="px-4 py-2 text-right">Số dư hiện tại</th>
              <th className="px-4 py-2 text-right">GD</th>
              <th className="px-4 py-2 text-center">MB Bank</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a: any) => (
              <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-2 font-medium">{a.name}</td>
                <td className="px-4 py-2">{a.bank_name || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.account_no || "—"}</td>
                <td className="px-4 py-2">{a.currency}</td>
                <td className="px-4 py-2 font-mono text-xs">{a.gl_account_code}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(Number(a.opening_balance ?? 0))}</td>
                <td className="px-4 py-2 text-right font-mono font-semibold">{fmt(a.current_balance ?? 0)}</td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">{a.txn_count ?? 0}</td>
                <td className="px-4 py-2 text-center">
                  {(a.bank_name || "").toLowerCase().includes("mb") ? (
                    <Button
                      size="sm"
                      variant={a.mb_username ? "secondary" : "outline"}
                      onClick={() => setMbAccount(a)}
                      className="h-7 text-xs"
                    >
                      {a.mb_username ? (
                        <>
                          {a.sync_enabled ? (
                            <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                          ) : (
                            <Link2 className="h-3 w-3 mr-1" />
                          )}
                          {a.sync_enabled ? "Đang đồng bộ" : "Đã kết nối"}
                        </>
                      ) : (
                        <>
                          <Link2 className="h-3 w-3 mr-1" /> Kết nối
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={(a.txn_count ?? 0) > 0}
                    title={(a.txn_count ?? 0) > 0 ? "Đã có giao dịch — không thể xoá" : "Xoá"}
                    onClick={() => {
                      if (confirm(`Xoá tài khoản "${a.name}"?`)) del.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-muted-foreground">
                  Chưa có tài khoản ngân hàng. Bấm "Thêm tài khoản" để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AccountDialog open={open} onOpenChange={setOpen} editing={editing} />
      {mbAccount && (
        <MbBankConnectDialog
          open={!!mbAccount}
          onOpenChange={(o) => !o && setMbAccount(null)}
          account={{ id: mbAccount.id, name: mbAccount.name }}
        />
      )}
    </div>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: any;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            {editing ? "Sửa tài khoản ngân hàng" : "Thêm tài khoản ngân hàng"}
          </DialogTitle>
          <DialogDescription>
            Tài khoản dùng để ghi nhận thu/chi qua ngân hàng và đối soát sao kê.
          </DialogDescription>
        </DialogHeader>
        <AccountForm
          key={editing?.id ?? "new"}
          initial={editing}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertBankAccount);
  const isEdit = !!initial?.id;

  const [form, setForm] = useState<FormValues>({
    name: initial?.name ?? "",
    bank_name: initial?.bank_name ?? "",
    account_no: initial?.account_no ?? "",
    currency: initial?.currency ?? "VND",
    gl_account_code: initial?.gl_account_code ?? "1121",
    opening_balance: Number(initial?.opening_balance ?? 0),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  // Auto-suggest GL by currency: VND → 1121, ngoại tệ → 1122
  useEffect(() => {
    setForm((f) => {
      if (f.currency === "VND" && f.gl_account_code === "1122") return { ...f, gl_account_code: "1121" };
      if (f.currency !== "VND" && f.gl_account_code === "1121") return { ...f, gl_account_code: "1122" };
      return f;
    });
  }, [form.currency]);

  // Auto-fill account name from bank + last 4 digits if name is empty
  const autoSuggestedName = useMemo(() => {
    const bank = (form.bank_name ?? "").trim();
    const acc = (form.account_no ?? "").replace(/\D/g, "");
    if (!bank) return "";
    const tail = acc.length >= 4 ? ` - ${acc.slice(-4)}` : "";
    return `${bank}${tail}`;
  }, [form.bank_name, form.account_no]);

  const update = <K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const m = useMutation({
    mutationFn: (values: FormValues) =>
      upsert({
        data: {
          id: initial?.id,
          name: values.name,
          bank_name: values.bank_name || null,
          account_no: values.account_no || null,
          currency: values.currency,
          gl_account_code: values.gl_account_code,
          opening_balance: values.opening_balance,
        } as any,
      }),
    onSuccess: () => {
      toast.success(isEdit ? "Đã cập nhật tài khoản" : "Đã thêm tài khoản");
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      onDone();
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi"),
  });

  const submit = () => {
    const result = FormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error("Vui lòng kiểm tra lại các trường");
      return;
    }
    m.mutate(result.data);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ngân hàng" hint="Chọn hoặc gõ tự do">
          <Input
            list="vn-banks"
            value={form.bank_name ?? ""}
            onChange={(e) => update("bank_name", e.target.value)}
            placeholder="Vietcombank, BIDV, MB Bank..."
            maxLength={120}
          />
          <datalist id="vn-banks">
            {VN_BANKS.map((b) => <option key={b} value={b} />)}
          </datalist>
        </Field>
        <Field label="Số tài khoản" error={errors.account_no}>
          <Input
            value={form.account_no ?? ""}
            onChange={(e) => update("account_no", e.target.value.replace(/[^\d \-.]/g, ""))}
            placeholder="0123 4567 8910"
            className="font-mono"
            inputMode="numeric"
            maxLength={40}
          />
        </Field>
      </div>

      <Field
        label="Tên hiển thị *"
        error={errors.name}
        hint={!form.name && autoSuggestedName ? "Bấm để dùng gợi ý" : undefined}
      >
        <div className="flex gap-2">
          <Input
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="VD: VCB - Tài khoản chính"
            maxLength={120}
            autoFocus={!isEdit}
          />
          {!form.name && autoSuggestedName && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => update("name", autoSuggestedName)}
            >
              Dùng "{autoSuggestedName}"
            </Button>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Tiền tệ *">
          <Select value={form.currency} onValueChange={(v) => update("currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="TK kế toán *">
          <Select value={form.gl_account_code} onValueChange={(v) => update("gl_account_code", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {GL_OPTIONS.map((g) => <SelectItem key={g.code} value={g.code}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Số dư đầu kỳ" error={errors.opening_balance} hint={isEdit ? "Sửa cẩn thận — ảnh hưởng số dư hiện tại" : undefined}>
          <NumberInput
            value={form.opening_balance}
            onChange={(v) => update("opening_balance", Number(v) || 0)}
            min={0}
          />
        </Field>
      </div>

      {isEdit && (initial?.txn_count ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs p-2.5 border border-amber-200 dark:border-amber-900">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Tài khoản đã có {initial.txn_count} giao dịch. Việc thay đổi tiền tệ hoặc TK kế toán có thể ảnh hưởng báo cáo.</span>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={m.isPending}>Huỷ</Button>
        <Button onClick={submit} disabled={m.isPending}>
          {m.isPending ? "Đang lưu…" : isEdit ? "Cập nhật" : "Thêm tài khoản"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
