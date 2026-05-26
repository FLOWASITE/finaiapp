import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bulkImportMappings } from "@/lib/items/mappings.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SAMPLE = `# Mẫu CSV: supplier_ref,product_code,raw_name,raw_unit,factor
# supplier_ref = tên NCC HOẶC MST. Bỏ qua dòng bắt đầu bằng #.
CTY TNHH ABC,SP-001,Cafe phin Robusta 500g,gói,1
0123456789,SP-002,Sữa tươi Vinamilk hộp 1L,hộp,1`;

type ParsedRow = {
  supplier_ref: string;
  product_code: string;
  raw_name: string;
  raw_unit?: string | null;
  unit_conversion_factor?: number;
};

function parseCsv(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith("#")) continue;
    // simple CSV split (no embedded commas in quotes for now)
    const cols = raw.split(",").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`Dòng ${i + 1}: cần tối thiểu 3 cột (supplier, product_code, raw_name)`);
      continue;
    }
    const factor = cols[4] ? Number(cols[4]) : undefined;
    if (cols[4] && (!isFinite(factor!) || factor! <= 0)) {
      errors.push(`Dòng ${i + 1}: factor "${cols[4]}" không hợp lệ`);
      continue;
    }
    rows.push({
      supplier_ref: cols[0],
      product_code: cols[1],
      raw_name: cols[2],
      raw_unit: cols[3] || null,
      unit_conversion_factor: factor,
    });
  }
  return { rows, errors };
}

export function BulkImportMappingsDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone?: () => void;
}) {
  const importFn = useServerFn(bulkImportMappings);
  const qc = useQueryClient();
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<null | {
    inserted: number;
    updated: number;
    errors: { row: number; reason: string }[];
    total: number;
  }>(null);

  const parsed = React.useMemo(() => parseCsv(text), [text]);

  const mut = useMutation({
    mutationFn: (rows: ParsedRow[]) => importFn({ data: { rows } }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["supplier-item-mappings"] });
      qc.invalidateQueries({ queryKey: ["mapping-conflicts"] });
      toast.success(`Đã nhập ${r.inserted + r.updated}/${r.total} dòng`);
      onDone?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Nhập thất bại"),
  });

  const onFile = async (f: File) => {
    setResult(null);
    const t = await f.text();
    setText(t);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nhập rule từ CSV</DialogTitle>
          <DialogDescription>
            Mỗi dòng: <code>supplier_ref, product_code, raw_name, raw_unit, factor</code>.
            <code>supplier_ref</code> = tên NCC hoặc MST. Có thể dùng tab/comma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".csv,.txt"
              id="bulk-file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById("bulk-file")?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1" /> Chọn file CSV
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setText(SAMPLE)}
            >
              Dán mẫu
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {parsed.rows.length} dòng hợp lệ
              {parsed.errors.length > 0 && (
                <span className="text-amber-600 ml-2">
                  · {parsed.errors.length} lỗi cú pháp
                </span>
              )}
            </span>
          </div>

          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setResult(null);
            }}
            placeholder={SAMPLE}
            className="font-mono text-xs h-56"
          />

          {parsed.errors.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs space-y-1 max-h-24 overflow-y-auto">
              {parsed.errors.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-start gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {e}
                </div>
              ))}
              {parsed.errors.length > 8 && (
                <div className="text-muted-foreground">…và {parsed.errors.length - 8} lỗi nữa</div>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-md border p-3 text-sm space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Thêm mới: <b>{result.inserted}</b> · Cập nhật: <b>{result.updated}</b> /{" "}
                  {result.total} dòng
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto pt-2 border-t">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-1 text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      Dòng {e.row}: {e.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            disabled={parsed.rows.length === 0 || mut.isPending}
            onClick={() => mut.mutate(parsed.rows)}
          >
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Nhập {parsed.rows.length} dòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
