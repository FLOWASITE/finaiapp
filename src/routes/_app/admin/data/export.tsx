import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { exportFinData, downloadFinExport, listFiscalYearsForTenant } from "@/lib/data-management.functions";
import { DEFAULT_EXPORT_GROUPS } from "@/lib/fin-format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Download, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data/export")({ component: ExportPage });

function ExportPage() {
  const exportFn = useServerFn(exportFinData);
  const dlFn = useServerFn(downloadFinExport);
  const yearsFn = useServerFn(listFiscalYearsForTenant);
  const { data: yearsData } = useQuery({ queryKey: ["tenant-fy"], queryFn: () => yearsFn() });
  const years = (yearsData?.years ?? []).map((y: any) => y.year);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_EXPORT_GROUPS.map((g) => [g.id, true])),
  );
  const [includeCatalogs, setIncludeCatalogs] = useState(true);

  const mut = useMutation({
    mutationFn: async () => {
      const tables = DEFAULT_EXPORT_GROUPS.filter((g) => selected[g.id]).flatMap((g) => g.tables);
      const res = await exportFn({ data: { fiscal_year: year, tables, include_catalogs: includeCatalogs } });
      const { url } = await dlFn({ data: { id: res.id } });
      window.open(url, "_blank");
      return res;
    },
    onSuccess: (r) => toast.success(`Đã xuất ${r.total_rows} dòng (${(r.size_bytes / 1024).toFixed(0)} KB)`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground">Năm tài chính</label>
          <Input
            type="number"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            list="fy-list"
          />
          <datalist id="fy-list">{years.map((y: number) => <option key={y} value={y} />)}</datalist>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {DEFAULT_EXPORT_GROUPS.map((g) => (
          <label key={g.id} className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
            <Checkbox
              checked={!!selected[g.id]}
              onCheckedChange={(v) => setSelected((s) => ({ ...s, [g.id]: !!v }))}
            />
            <div>
              <div className="font-medium">{g.label}</div>
              <div className="text-[10px] text-muted-foreground">{g.tables.join(", ")}</div>
            </div>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={includeCatalogs} onCheckedChange={(v) => setIncludeCatalogs(!!v)} />
        Kèm danh mục (KH, NCC, hàng hoá, COA, đơn vị, kho, 4 chiều)
      </label>
      <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        Xuất & tải về
      </Button>
    </Card>
  );
}
