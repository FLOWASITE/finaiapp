import { useForm, type UseFormReturn, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, User, Landmark, Calculator, MapPin } from "lucide-react";

import { upsertCustomer } from "@/lib/customers.functions";
import { upsertSupplier } from "@/lib/purchases.functions";
import { listPartyGroups } from "@/lib/partyGroups.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";
import { AutoCodeInput } from "@/components/ui/auto-code-input";
import { cn } from "@/lib/utils";

/* ---------- Client schema (same rules as server) ---------- */
const partySchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().max(50).optional().default(""),
    name: z.string().trim().min(1, "Bắt buộc").max(255),
    party_type: z.enum(["company", "individual"]).default("company"),
    tax_id: z
      .string()
      .trim()
      .max(20)
      .default("")
      .refine((v) => !v || /^\d{10}$|^\d{13}$/.test(v.replace(/\D/g, "")), "MST phải 10 hoặc 13 số"),
    legal_rep: z.string().trim().max(255).default(""),
    contact_person: z.string().trim().max(255).default(""),
    email: z
      .string()
      .trim()
      .max(255)
      .default("")
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email không hợp lệ"),
    email_cc: z.string().trim().max(255).default(""),
    phone: z.string().trim().max(50).default(""),
    fax: z.string().trim().max(50).default(""),
    website: z.string().trim().max(255).default(""),
    address: z.string().trim().max(500).default(""),
    bank_account_no: z.string().trim().max(50).default(""),
    bank_name: z.string().trim().max(255).default(""),
    bank_branch: z.string().trim().max(255).default(""),
    currency: z.string().trim().min(3).max(8).default("VND"),
    payment_terms_days: z.number().int().min(0).max(365).default(30),
    counter_account: z.string().trim().min(3).max(20).default("131"),
    opening_balance_debit: z.number().min(0).default(0),
    opening_balance_credit: z.number().min(0).default(0),
    notes: z.string().trim().max(1000).default(""),
    group_id: z.string().default(""),
    roles: z
      .array(z.enum(["resale_source", "raw_material_source", "service_provider", "asset_vendor"]))
      .default([]),
    is_active: z.boolean().default(true),
  })
  .refine((d) => !(d.opening_balance_debit > 0 && d.opening_balance_credit > 0), {
    message: "Chỉ được nhập một bên Nợ hoặc Có",
    path: ["opening_balance_credit"],
  })
  .superRefine((d, ctx) => {
    if (d.party_type === "company" && !d.tax_id) {
      // không bắt buộc nhưng cảnh báo ngầm - bỏ qua
    }
  });

export type PartyFormValues = z.infer<typeof partySchema>;

export type PartyInitial = Partial<PartyFormValues> & { id?: string };

const blankCustomer: PartyFormValues = {
  code: "",
  name: "",
  party_type: "company",
  tax_id: "",
  legal_rep: "",
  contact_person: "",
  email: "",
  email_cc: "",
  phone: "",
  fax: "",
  website: "",
  address: "",
  bank_account_no: "",
  bank_name: "",
  bank_branch: "",
  currency: "VND",
  payment_terms_days: 30,
  counter_account: "131",
  opening_balance_debit: 0,
  opening_balance_credit: 0,
  notes: "",
  group_id: "",
  roles: [],
  is_active: true,
};

const CURRENCIES = ["VND", "USD", "EUR", "JPY", "CNY", "KRW", "GBP", "SGD"];

interface Props {
  mode: "customer" | "supplier";
  initial?: PartyInitial;
  onDone: (id?: string) => void;
  compact?: boolean;
}

export function PartyForm({ mode, initial, onDone, compact }: Props) {
  const qc = useQueryClient();
  const isCustomer = mode === "customer";
  const defaults: PartyFormValues = {
    ...blankCustomer,
    counter_account: isCustomer ? "131" : "331",
    ...initial,
  };

  const form = useForm<PartyFormValues>({
    resolver: zodResolver(partySchema) as any,
    defaultValues: defaults as any,
    mode: "onBlur",
  });

  const customerFn = useServerFn(upsertCustomer);
  const supplierFn = useServerFn(upsertSupplier);

  const m = useMutation({
    mutationFn: async (v: PartyFormValues) => {
      const base = {
        id: v.id,
        code: v.code || null,
        name: v.name,
        party_type: v.party_type,
        tax_id: v.tax_id || null,
        legal_rep: v.legal_rep || null,
        contact_person: v.contact_person || null,
        email: v.email || null,
        phone: v.phone || null,
        fax: v.fax || null,
        website: v.website || null,
        address: v.address || null,
        bank_account_no: v.bank_account_no || null,
        bank_name: v.bank_name || null,
        bank_branch: v.bank_branch || null,
        currency: v.currency,
        payment_terms_days: Number(v.payment_terms_days) || 0,
        opening_balance_debit: Number(v.opening_balance_debit) || 0,
        opening_balance_credit: Number(v.opening_balance_credit) || 0,
        notes: v.notes || null,
        group_id: v.group_id || null,
        is_active: v.is_active,
      };
      if (isCustomer) {
        return customerFn({
          data: {
            ...base,
            code: v.code, // KH yêu cầu code
            email_cc: v.email_cc || null,
            receivable_account: v.counter_account,
            opening_balance:
              (Number(v.opening_balance_debit) || 0) - (Number(v.opening_balance_credit) || 0),
          } as any,
        });
      }
      return supplierFn({
        data: { ...base, payable_account: v.counter_account, roles: v.roles ?? [] } as any,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: [isCustomer ? "customers" : "suppliers"] });
      toast.success(initial?.id ? "Đã cập nhật" : isCustomer ? "Đã tạo khách hàng" : "Đã tạo nhà cung cấp");
      onDone(r?.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  // KH bắt buộc code → thêm rule khi mode = customer
  const submit = form.handleSubmit((v: PartyFormValues) => {
    if (isCustomer && !v.code.trim()) {
      form.setError("code", { message: "Bắt buộc" });
      form.setFocus("code");
      return;
    }
    m.mutate(v);
  });

  const onMstResolved = (d: { taxId: string; name: string; address?: string | null; director?: string | null }) => {
    form.setValue("tax_id", d.taxId, { shouldValidate: true });
    if (!form.getValues("name")) form.setValue("name", d.name);
    if (!form.getValues("address") && d.address) form.setValue("address", d.address);
    if (!form.getValues("legal_rep") && d.director) form.setValue("legal_rep", d.director);
    form.setValue("party_type", "company");
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Header strip - type & active */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase text-muted-foreground">Loại</Label>
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => form.setValue("party_type", "company")}
              className={cn(
                "px-3 py-1 text-xs rounded flex items-center gap-1.5",
                form.watch("party_type") === "company" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Building2 className="h-3.5 w-3.5" /> Doanh nghiệp
            </button>
            <button
              type="button"
              onClick={() => form.setValue("party_type", "individual")}
              className={cn(
                "px-3 py-1 text-xs rounded flex items-center gap-1.5",
                form.watch("party_type") === "individual" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <User className="h-3.5 w-3.5" /> Cá nhân
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch
            id="is_active"
            checked={form.watch("is_active")}
            onCheckedChange={(c) => form.setValue("is_active", c)}
          />
          <Label htmlFor="is_active" className="text-xs text-muted-foreground">
            Đang hoạt động
          </Label>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Thông tin chung</span>
            <span className="sm:hidden">Chung</span>
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Liên hệ & Địa chỉ</span>
            <span className="sm:hidden">Liên hệ</span>
          </TabsTrigger>
          {!compact && (
            <TabsTrigger value="bank" className="gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ngân hàng</span>
              <span className="sm:hidden">NH</span>
            </TabsTrigger>
          )}
          {!compact && (
            <TabsTrigger value="acc" className="gap-1.5">
              <Calculator className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Kế toán</span>
              <span className="sm:hidden">KT</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* GENERAL */}
        <TabsContent value="general" className="space-y-3 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={isCustomer ? "Mã KH *" : "Mã NCC"} error={form.formState.errors.code?.message}>
              <AutoCodeInput
                entity={isCustomer ? "customer" : "supplier"}
                value={form.watch("code") ?? ""}
                onChange={(v: string) => form.setValue("code", v, { shouldDirty: true })}
                placeholder={isCustomer ? "KH00001" : "NCC00001"}
                autoFillOnMount={!initial?.id}
                error={!!form.formState.errors.code}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={form.watch("party_type") === "company" ? "Mã số thuế" : "CCCD/CMND"}
                error={form.formState.errors.tax_id?.message}
                hint={form.watch("party_type") === "company" ? "Bấm 🔍 để tra cứu & auto-fill" : undefined}
              >
                <TaxIdLookupInput
                  value={form.watch("tax_id") ?? ""}
                  onChange={(v) => form.setValue("tax_id", v, { shouldValidate: true })}
                  onResolved={onMstResolved}
                  placeholder={form.watch("party_type") === "company" ? "Nhập MST 10 hoặc 13 số" : "Số CCCD"}
                />
              </Field>
            </div>
          </div>

          <Field label={isCustomer ? "Tên khách hàng *" : "Tên nhà cung cấp *"} error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Người đại diện pháp luật" error={form.formState.errors.legal_rep?.message}>
              <Input {...form.register("legal_rep")} />
            </Field>
            <Field label="Người liên hệ" error={form.formState.errors.contact_person?.message}>
              <Input {...form.register("contact_person")} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Website" error={form.formState.errors.website?.message}>
              <Input placeholder="https://" {...form.register("website")} />
            </Field>
            <Field label={isCustomer ? "Nhóm khách hàng" : "Nhóm nhà cung cấp"}>
              <GroupSelect
                kind={isCustomer ? "customer" : "supplier"}
                value={form.watch("group_id") ?? ""}
                onChange={(v) => form.setValue("group_id", v, { shouldDirty: true })}
              />
            </Field>
          </div>

          {!isCustomer && (
            <RolesPicker
              value={form.watch("roles") ?? []}
              onChange={(next) => form.setValue("roles", next, { shouldDirty: true })}
            />
          )}
        </TabsContent>

        {/* CONTACT */}
        <TabsContent value="contact" className="space-y-3 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} />
            </Field>
            {isCustomer && (
              <Field label="Email CC" error={form.formState.errors.email_cc?.message}>
                <Input placeholder="ke.toan@kh.com,..." {...form.register("email_cc")} />
              </Field>
            )}
            <Field label="Điện thoại" error={form.formState.errors.phone?.message}>
              <Input {...form.register("phone")} />
            </Field>
            <Field label="Fax" error={form.formState.errors.fax?.message}>
              <Input {...form.register("fax")} />
            </Field>
          </div>
          <Field label="Địa chỉ" error={form.formState.errors.address?.message}>
            <Textarea rows={2} {...form.register("address")} />
          </Field>
        </TabsContent>

        {/* BANK */}
        {!compact && (
          <TabsContent value="bank" className="space-y-3 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Số tài khoản" error={form.formState.errors.bank_account_no?.message}>
                <Input {...form.register("bank_account_no")} />
              </Field>
              <Field label="Tên ngân hàng" error={form.formState.errors.bank_name?.message}>
                <Input placeholder="VD: Vietcombank" {...form.register("bank_name")} />
              </Field>
              <Field label="Chi nhánh" error={form.formState.errors.bank_branch?.message}>
                <Input {...form.register("bank_branch")} />
              </Field>
            </div>
          </TabsContent>
        )}

        {/* ACCOUNTING */}
        {!compact && (
          <TabsContent value="acc" className="space-y-3 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Tiền tệ" error={form.formState.errors.currency?.message}>
                <Select
                  value={form.watch("currency")}
                  onValueChange={(v) => form.setValue("currency", v, { shouldValidate: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Hạn thanh toán (ngày)" error={form.formState.errors.payment_terms_days?.message}>
                <Input
                  type="number"
                  min={0}
                  {...form.register("payment_terms_days", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label={isCustomer ? "TK công nợ (131)" : "TK công nợ (331)"}
                error={form.formState.errors.counter_account?.message}
              >
                <Input {...form.register("counter_account")} />
              </Field>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase">Số dư đầu kỳ</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field
                  label={isCustomer ? "Dư Nợ (Phải thu)" : "Dư Nợ (Trả trước cho NCC)"}
                  error={form.formState.errors.opening_balance_debit?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    {...form.register("opening_balance_debit", { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label={isCustomer ? "Dư Có (Khách trả trước)" : "Dư Có (Phải trả)"}
                  error={form.formState.errors.opening_balance_credit?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    {...form.register("opening_balance_credit", { valueAsNumber: true })}
                  />
                </Field>
              </div>
            </div>

            <Field label="Ghi chú" error={form.formState.errors.notes?.message}>
              <Textarea rows={2} {...form.register("notes")} />
            </Field>
          </TabsContent>
        )}
      </Tabs>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={() => onDone()}>Huỷ</Button>
        <Button type="submit" disabled={m.isPending}>
          {m.isPending ? "Đang lưu…" : "Lưu"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// helper for TS narrowing of typed names — unused export kept for future
export type _PartyField = FieldPath<PartyFormValues>;
export type _PartyFormReturn = UseFormReturn<PartyFormValues>;

function GroupSelect({
  kind,
  value,
  onChange,
}: {
  kind: "customer" | "supplier";
  value: string;
  onChange: (v: string) => void;
}) {
  const listFn = useServerFn(listPartyGroups);
  const { data: groups } = useQuery({
    queryKey: ["party-groups", kind],
    queryFn: () => listFn({ data: { kind } }),
    ...QUERY_PRESETS.REFERENCE,
  });
  return (
    <Select value={value || "none"} onValueChange={(v: string) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="(Không thuộc nhóm)" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">(Không thuộc nhóm)</SelectItem>
        {((groups ?? []) as any[]).map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.code ? `${g.code} — ${g.name}` : g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
