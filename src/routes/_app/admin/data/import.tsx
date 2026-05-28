import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { previewFinImport, commitFinImport } from "@/lib/data-management.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data/import")({ component: ImportPage });

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function ImportPage() {
  const previewFn = useServerFn(previewFinImport);
  const commitFn = useServerFn(commitFinImport);
  const [file, setFile] = useState<File | null>(null);
  const [fileB64, setFileB64] = useState<string>("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [mode, setMode] = useState<"merge" | "replace_year">("merge");
  const [confirmReplace, setConfirmReplace] = useState(false);

  const previewMut = useMutation({
    mutationFn: async (f: File) => {
      const b64 = await fileToBase64(f);
      setFileB64(b64);
      return previewFn({ data: { file_b64: b64 } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const commitMut = useMutation({
    mutationFn: async () =>
      commitFn({ data: { file_b64: fileB64, fiscal_year: year, mode } }),
    onSuccess: (r) => {
      const insTotal = Object.values(r.inserted).reduce<number>((s, n) => s + (n ?? 0), 0);
      if (r.errors.length) {
        toast.warning(`Đã nhập ${insTotal} dòng, ${r.errors.length} bảng lỗi`);
      } else {
        toast.success(`Đã nhập ${insTotal} dòng vào năm ${year}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = previewMut.data;
  const yearMismatch = preview && preview.fiscal_year !== year;

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Tệp Fin (.fin.json)</label>
            <Input
              type="file"
              accept=".json,.fin,application/json"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f) previewMut.mutate(f);
              }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Năm tài chính đích</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>

        {previewMut.isPending && (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang đọc tệp…
          </div>
        )}

        {preview && (
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Năm nguồn: {preview.fiscal_year}</Badge>
              <Badge variant="outline">
                Tenant: {preview.tenant?.company_name ?? preview.tenant?.id ?? "—"}
              </Badge>
              <span className="text-muted-foreground">
                Xuất lúc {new Date(preview.exported_at).toLocaleString("vi-VN")}
              </span>
            </div>
            {yearMismatch && (
              <div className="text-amber-600 inline-flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" /> Năm nguồn ({preview.fiscal_year}) khác năm đích ({year})
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
              {Object.entries(preview.row_counts).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tabular-nums">{v as number}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {preview && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Chế độ nhập</div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              <span>
                <b>Gộp (merge)</b> — bỏ qua dòng đã có cùng id
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={mode === "replace_year"}
                onChange={() => setMode("replace_year")}
              />
              <span>
                <b>Thay thế cả năm</b> — xoá toàn bộ dữ liệu năm {year} rồi nhập lại (chỉ chủ sở hữu)
              </span>
            </label>
            {mode === "replace_year" && (
              <label className="flex items-center gap-2 text-xs text-amber-600">
                <Checkbox
                  checked={confirmReplace}
                  onCheckedChange={(v) => setConfirmReplace(!!v)}
                />
                Tôi xác nhận xoá vĩnh viễn dữ liệu năm {year} trước khi nhập
              </label>
            )}
          </div>
        )}

        <Button
          disabled={
            !preview ||
            commitMut.isPending ||
            (mode === "replace_year" && !confirmReplace)
          }
          onClick={() => commitMut.mutate()}
        >
          {commitMut.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Nhập dữ liệu
        </Button>

        {commitMut.data?.errors?.length ? (
          <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-1">
            <div className="font-medium text-destructive">Lỗi theo bảng:</div>
            {commitMut.data.errors.map((e, i) => (
              <div key={i}>
                <b>{e.table}:</b> {e.error}
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
