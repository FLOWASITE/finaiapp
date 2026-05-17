import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupTaxId, type TaxLookupResult } from "@/lib/tax-lookup.functions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (data: TaxLookupResult) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TaxIdLookupInput({ value, onChange, onResolved, placeholder, disabled, className }: Props) {
  const fn = useServerFn(lookupTaxId);
  const m = useMutation({
    mutationFn: (taxCode: string) => fn({ data: { taxCode } }),
    onSuccess: (data) => {
      toast.success(`Đã lấy: ${data.name}`);
      onResolved?.(data);
    },
    onError: (e: Error) => toast.error(e.message || "Tra cứu thất bại"),
  });

  const cleaned = (value ?? "").replace(/[^0-9-]/g, "");
  const canLookup = cleaned.replace(/-/g, "").length >= 10 && !disabled && !m.isPending;

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Mã số thuế"}
        disabled={disabled}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => canLookup && m.mutate(cleaned)}
        disabled={!canLookup}
        title="Tra cứu MST"
      >
        {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}
