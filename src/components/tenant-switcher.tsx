import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { listMyTenants, switchTenant, createTenant } from "@/lib/tenants.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TaxIdLookupInput } from "@/components/tax-id-lookup-input";
import type { TaxLookupResult } from "@/lib/tax-lookup.functions";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ sở hữu", admin: "Quản trị", accountant: "Kế toán", viewer: "Người xem",
};

type CachedTenant = {
  id: string;
  role: string;
  name: string;
  company_name: string | null;
  tax_id: string | null;
};
const CACHE_KEY = "tenant-switcher:last-active";

function readCache(): CachedTenant | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedTenant) : null;
  } catch {
    return null;
  }
}
function writeCache(t: CachedTenant | null) {
  if (typeof window === "undefined") return;
  try {
    if (t) localStorage.setItem(CACHE_KEY, JSON.stringify(t));
    else localStorage.removeItem(CACHE_KEY);
  } catch {}
}

export function TenantSwitcher() {
  const list = useServerFn(listMyTenants);
  const sw = useServerFn(switchTenant);
  const create = useServerFn(createTenant);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [cached, setCached] = React.useState<CachedTenant | null>(null);
  React.useEffect(() => { setCached(readCache()); }, []);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => list(),
    ...QUERY_PRESETS.TENANT_STATIC,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
  });
  const [openCreate, setOpenCreate] = React.useState(false);

  const switchMut = useMutation({
    mutationFn: (tenantId: string) => sw({ data: { tenantId } }),
    onSuccess: () => {
      toast.success("Đã chuyển tổ chức");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: (v: {
      name: string;
      company_name?: string;
      tax_id?: string;
      address?: string;
      legal_rep_name?: string;
      trade_name?: string;
      phone?: string;
      email?: string;
      tax_authority?: string;
      business_reg_no?: string;
      business_reg_date?: string;
      established_date?: string;
      legal_form?: "llc"|"jsc"|"partnership"|"sole_prop"|"household"|"branch"|"other";
      industry_code?: string;
      industry_name?: string;
    }) =>
      create({ data: { ...v, accounting_standard: "TT133", base_currency: "VND" } }),
    onSuccess: (_d, vars) => {
      const bonusKeys = ["trade_name","phone","email","tax_authority","business_reg_no","business_reg_date","established_date","legal_form","industry_code","industry_name"] as const;
      const n = bonusKeys.filter((k) => (vars as any)[k]).length;
      toast.success(n > 0 ? `Đã tạo tổ chức — tự điền ${n} trường từ MST` : "Đã tạo tổ chức");
      setOpenCreate(false);
      qc.invalidateQueries();
      navigate({ to: "/settings" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const active = data?.tenants?.find((t) => t.is_active);

  // Lưu/đồng bộ cache tổ chức active gần nhất
  React.useEffect(() => {
    if (active) {
      writeCache({
        id: active.id,
        role: active.role,
        name: active.name,
        company_name: active.company_name,
        tax_id: active.tax_id,
      });
    } else if (data && (data.tenants ?? []).length === 0) {
      writeCache(null);
    }
  }, [active, data]);

  // Tên hiển thị: ưu tiên dữ liệu thật, fallback cache để tránh "Đang tải…"
  const displayName =
    (active?.company_name || active?.name) ??
    (cached?.company_name || cached?.name) ??
    (isPending ? "Đang tải…" : "Chọn tổ chức");

  const showSpinner = isPending && !cached;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 max-w-[380px]">
            {showSpinner ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Building2 className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate text-xs" title={displayName}>{displayName}</span>
            {isFetching && !showSpinner ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-50" />
            ) : (
              <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Tổ chức của bạn
          </DropdownMenuLabel>
          {(data?.tenants ?? []).map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => !t.is_active && switchMut.mutate(t.id)}
              className="flex items-start gap-2 py-2"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold">
                {(t.company_name || t.name).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.company_name || t.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                    {ROLE_LABEL[t.role] ?? t.role}
                  </Badge>
                  {t.tax_id && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      MST {t.tax_id}
                    </span>
                  )}
                </div>
              </div>
              {t.is_active && <Check className="h-4 w-4 text-primary shrink-0 mt-1" />}
            </DropdownMenuItem>
          ))}
          {(data?.tenants ?? []).length === 0 && !isPending && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Chưa có tổ chức nào.
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpenCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo tổ chức mới
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateTenantDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onSubmit={(v) => createMut.mutate(v)}
        pending={createMut.isPending}
      />
    </>
  );
}

type CreateTenantPayload = {
  name: string;
  company_name?: string;
  tax_id?: string;
  address?: string;
  legal_rep_name?: string;
  trade_name?: string;
  phone?: string;
  email?: string;
  tax_authority?: string;
  business_reg_no?: string;
  business_reg_date?: string;
  established_date?: string;
  legal_form?: "llc"|"jsc"|"partnership"|"sole_prop"|"household"|"branch"|"other";
  industry_code?: string;
  industry_name?: string;
};

const LEGAL_FORM_LABEL: Record<string, string> = {
  llc: "TNHH", jsc: "Cổ phần", partnership: "Hợp danh",
  sole_prop: "DN tư nhân", household: "Hộ KD", branch: "Chi nhánh", other: "Khác",
};

function CreateTenantDialog({
  open, onOpenChange, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: CreateTenantPayload) => void;
  pending: boolean;
}) {
  const [taxId, setTaxId] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [legalRep, setLegalRep] = React.useState("");
  const [userEditedName, setUserEditedName] = React.useState(false);
  const [lookup, setLookup] = React.useState<TaxLookupResult | null>(null);

  React.useEffect(() => {
    if (!open) {
      setTaxId(""); setCompanyName(""); setName("");
      setAddress(""); setLegalRep(""); setUserEditedName(false);
      setLookup(null);
    }
  }, [open]);

  const bonus = lookup
    ? [
        lookup.legalForm && { label: "Loại hình", value: LEGAL_FORM_LABEL[lookup.legalForm] ?? lookup.legalForm },
        lookup.registrationNo && { label: "GPKD/MST", value: lookup.registrationNo },
        lookup.registrationDate && { label: "Ngày cấp", value: lookup.registrationDate },
        lookup.taxAuthority && { label: "Cơ quan thuế", value: lookup.taxAuthority },
        lookup.industryName && { label: "Ngành nghề", value: `${lookup.industryCode ? lookup.industryCode + " - " : ""}${lookup.industryName}` },
        lookup.phone && { label: "Điện thoại", value: lookup.phone },
        lookup.email && { label: "Email", value: lookup.email },
      ].filter(Boolean) as { label: string; value: string }[]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo tổ chức mới</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Mã số thuế</Label>
            <TaxIdLookupInput
              value={taxId}
              onChange={setTaxId}
              placeholder="Nhập MST rồi bấm tra cứu để tự điền"
              onResolved={(r: TaxLookupResult) => {
                setLookup(r);
                setCompanyName(r.name);
                if (!userEditedName) setName(r.shortName || r.name);
                if (r.address) setAddress(r.address);
                if (r.director) setLegalRep(r.director);
              }}
            />
          </div>
          <div>
            <Label>Tên pháp nhân</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="VD: Công ty TNHH ABC Việt Nam"
            />
          </div>
          <div>
            <Label>Tên hiển thị *</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setUserEditedName(true); }}
              placeholder="VD: ABC"
            />
          </div>
          <div>
            <Label>Địa chỉ trụ sở</Label>
            <Textarea
              value={address}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAddress(e.target.value)}
              placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP"
              rows={2}
            />
          </div>
          <div>
            <Label>Đại diện pháp luật</Label>
            <Input
              value={legalRep}
              onChange={(e) => setLegalRep(e.target.value)}
              placeholder="Họ và tên người đại diện"
            />
          </div>

          {bonus.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                Đã lấy từ MST ({bonus.length} trường sẽ tự lưu)
              </div>
              <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-xs">
                {bonus.map((b) => (
                  <React.Fragment key={b.label}>
                    <dt className="text-muted-foreground">{b.label}</dt>
                    <dd className="truncate" title={b.value}>{b.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
          <Button
            disabled={!name.trim() || !companyName.trim() || pending}
            onClick={() => onSubmit({
              name: name.trim(),
              company_name: companyName.trim() || undefined,
              tax_id: taxId.trim() || undefined,
              address: address.trim() || undefined,
              legal_rep_name: legalRep.trim() || undefined,
              trade_name: lookup?.tradeName ?? undefined,
              phone: lookup?.phone ?? undefined,
              email: lookup?.email ?? undefined,
              tax_authority: lookup?.taxAuthority ?? undefined,
              business_reg_no: lookup?.registrationNo ?? undefined,
              business_reg_date: lookup?.registrationDate ?? undefined,
              established_date: lookup?.establishedDate ?? undefined,
              legal_form: (lookup?.legalForm as any) ?? undefined,
              industry_code: lookup?.industryCode ?? undefined,
              industry_name: lookup?.industryName ?? undefined,
            })}
          >
            {pending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Tạo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
