import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
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

const CLIENT_TTL = 24 * 60 * 60 * 1000; // 24h dedupe cùng phiên

export function TaxIdLookupInput({ value, onChange, onResolved, placeholder, disabled, className }: Props) {
  const qc = useQueryClient();
  const fn = useServerFn(lookupTaxId);
  const [loading, setLoading] = useState(false);

  // Chuẩn hóa: chỉ giữ chữ số. MST VN tối đa 13 số (10 chính + 3 chi nhánh).
  const normalize = (raw: string) => raw.replace(/\D/g, "").slice(0, 13);
  const cleaned = normalize(value ?? "");
  const canLookup = cleaned.length >= 10 && !disabled && !loading;

  const handleLookup = async () => {
    if (!canLookup) return;
    setLoading(true);
    try {
      const data = await qc.fetchQuery({
        queryKey: ["tax-lookup", cleaned],
        queryFn: () => fn({ data: { taxCode: cleaned } }),
        staleTime: CLIENT_TTL,
        gcTime: CLIENT_TTL,
      });
      toast.success(`Đã lấy: ${data.name}`);
      onResolved?.(data);
    } catch (e) {
      toast.error((e as Error).message || "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <Input
        value={cleaned}
        onChange={(e) => onChange(normalize(e.target.value))}
        placeholder={placeholder ?? "Mã số thuế"}
        disabled={disabled}
        inputMode="numeric"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleLookup}
        disabled={!canLookup}
        title="Tra cứu MST"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
    </div>
  );
}
