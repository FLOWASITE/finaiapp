import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { upsertCustomer } from "@/lib/customers.functions";
import { upsertSupplier } from "@/lib/purchases.functions";

type Kind = "customer" | "supplier";

interface Props {
  kind: Kind;
  party: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OpeningBalanceDialog({
  kind,
  party,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const qc = useQueryClient();
  const isCustomer = kind === "customer";
  const [debit, setDebit] = useState<number>(0);
  const [credit, setCredit] = useState<number>(0);
  const [error, setError] = useState<string>("");

  // Reset when party changes
  useEffect(() => {
    if (party) {
      setDebit(Number(party.opening_balance_debit ?? 0));
      setCredit(Number(party.opening_balance_credit ?? 0));
      setError("");
    }
  }, [party?.id, open]);

  const customerFn = useServerFn(upsertCustomer);
  const supplierFn = useServerFn(upsertSupplier);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (debit > 0 && credit > 0) {
        throw new Error("Chỉ được nhập một bên Nợ hoặc Có");
      }
      const base = {
        id: party.id,
        name: party.name,
        code: party.code ?? "",
        tax_id: party.tax_id ?? "",
        party_type: (party.party_type ?? "company") as "company" | "individual",
        legal_rep: party.legal_rep ?? "",
        contact_person: party.contact_person ?? "",
        email: party.email ?? "",
        email_cc: party.email_cc ?? "",
        phone: party.phone ?? "",
        fax: party.fax ?? "",
        website: party.website ?? "",
        address: party.address ?? "",
        bank_account_no: party.bank_account_no ?? "",
        bank_name: party.bank_name ?? "",
        bank_branch: party.bank_branch ?? "",
        currency: party.currency ?? "VND",
        payment_terms_days: Number(party.payment_terms_days ?? 30),
        opening_balance_debit: Number(debit || 0),
        opening_balance_credit: Number(credit || 0),
        notes: party.notes ?? "",
        group_id: party.group_id ?? null,
        is_active: party.is_active !== false,
      };
      if (isCustomer) {
        return customerFn({
          data: {
            ...base,
            receivable_account: party.receivable_account ?? "131",
            opening_balance: (Number(debit) || 0) - (Number(credit) || 0),
          } as any,
        });
      }
      return supplierFn({
        data: { ...base, payable_account: party.payable_account ?? "331" } as any,
      });
    },
    onSuccess: () => {
      toast.success("Đã cập nhật công nợ đầu kỳ");
      qc.invalidateQueries({ queryKey: [isCustomer ? "customers" : "suppliers"] });
      qc.invalidateQueries({ queryKey: [isCustomer ? "ar-summary" : "ap-summary"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => {
      setError(e?.message ?? "Lỗi lưu dữ liệu");
      toast.error(e?.message ?? "Lỗi lưu dữ liệu");
    },
  });

  if (!party) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saveMut.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Khai báo công nợ đầu kỳ — {isCustomer ? "Khách hàng" : "Nhà cung cấp"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Read-only party info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs text-muted-foreground uppercase font-medium">Thông tin đối tác</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Mã</span>
                <div className="font-mono font-medium">{party.code ?? "—"}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Tên</span>
                <div className="font-medium truncate">{party.name}</div>
              </div>
            </div>
            {party._groupName && (
              <div className="text-xs text-muted-foreground">
                Nhóm: {party._groupName}
              </div>
            )}
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {isCustomer ? "Dư Nợ đầu kỳ (Phải thu)" : "Dư Nợ đầu kỳ (Ứng trước cho NCC)"}
              </Label>
              <MoneyInput
                value={debit}
                onChange={(n) => { setDebit(n); if (n > 0) setCredit(0); setError(""); }}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {isCustomer ? "Dư Có đầu kỳ (Khách trả trước)" : "Dư Có đầu kỳ (Phải trả)"}
              </Label>
              <MoneyInput
                value={credit}
                onChange={(n) => { setCredit(n); if (n > 0) setDebit(0); setError(""); }}
                placeholder="0"
              />
            </div>
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMut.isPending}
            >
              Huỷ
            </Button>
            <Button
              disabled={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMut.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
