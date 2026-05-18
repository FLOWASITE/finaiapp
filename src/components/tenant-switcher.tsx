import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react";
import { listMyTenants, switchTenant, createTenant } from "@/lib/tenants.functions";
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

  const cached = React.useMemo(readCache, []);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => list(),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
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
    }) =>
      create({ data: { ...v, accounting_standard: "TT133", base_currency: "VND" } }),
    onSuccess: () => {
      toast.success("Đã tạo tổ chức");
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
          <Button variant="outline" size="sm" className="h-8 gap-1.5 max-w-[240px]">
            {showSpinner ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Building2 className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate text-xs">{displayName}</span>
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

function CreateTenantDialog({
  open, onOpenChange, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: {
    name: string;
    company_name?: string;
    tax_id?: string;
    address?: string;
    legal_rep_name?: string;
  }) => void;
  pending: boolean;
}) {
  const [taxId, setTaxId] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [legalRep, setLegalRep] = React.useState("");
  const [userEditedName, setUserEditedName] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setTaxId(""); setCompanyName(""); setName("");
      setAddress(""); setLegalRep(""); setUserEditedName(false);
    }
  }, [open]);

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
              onChange={(e) => setAddress(e.target.value)}
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
