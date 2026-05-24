import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IndustryCombobox } from "@/components/industry-combobox";
import { updateSupplierIndustry } from "@/lib/ai-memory-supplier.functions";
import { toast } from "sonner";

export function EditIndustryDialog({
  open, onOpenChange, supplierId, supplierName, currentCode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId: string;
  supplierName: string;
  currentCode: string | null;
}) {
  const [code, setCode] = useState<string | null>(currentCode);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateSupplierIndustry);
  const mut = useMutation({
    mutationFn: (next: string | null) =>
      updateFn({ data: { supplier_id: supplierId, industry_code: next } }),
    onSuccess: () => {
      toast.success("Đã cập nhật ngành nghề NCC");
      qc.invalidateQueries({ queryKey: ["memory-graph"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gắn ngành nghề · {supplierName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <IndustryCombobox
            code={code}
            name={null}
            onChange={(c) => setCode(c)}
          />
          <p className="text-[11.5px] text-muted-foreground">
            Ngành VSIC giúp AI đoán Hàng hoá/TSCĐ/Dịch vụ chính xác hơn khi gặp lại
            cùng tên hàng từ NCC này.
          </p>
        </div>
        <DialogFooter className="gap-2">
          {currentCode && (
            <Button
              variant="ghost"
              onClick={() => mut.mutate(null)}
              disabled={mut.isPending}
            >
              Xoá ngành
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => mut.mutate(code)}
            disabled={mut.isPending || !code}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
