import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileCode2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { importEinvoicesToStore } from "@/lib/einvoices.functions";

type Result = {
  name: string;
  status: "created" | "duplicate" | "error";
  direction?: "in" | "out";
  einvoiceId?: string;
  invoiceNo?: string;
  total?: number;
  error?: string;
};

const vnd = (n: number | undefined) =>
  n == null ? "-" : n.toLocaleString("vi-VN");

export function ImportEinvoiceStoreDialog({
  triggerLabel = "Nhập XML vào kho HĐĐT",
  variant = "default",
}: {
  triggerLabel?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const router = useRouter();
  const importFn = useServerFn(importEinvoicesToStore);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (files.length > 50) {
      toast.error("Tối đa 50 file mỗi lần");
      return;
    }
    setBusy(true);
    setResults(null);
    try {
      const payload = await Promise.all(
        files.map(async (f) => ({ name: f.name, content: await f.text() })),
      );
      const { results } = await importFn({ data: { files: payload } });
      setResults(results);
      const created = results.filter((r) => r.status === "created").length;
      const dup = results.filter((r) => r.status === "duplicate").length;
      const err = results.filter((r) => r.status === "error").length;
      toast.success(
        `Đã xử lý ${results.length} file: ${created} mới, ${dup} trùng, ${err} lỗi`,
      );
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi khi nhập XML");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <FileCode2 className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nhập XML hoá đơn điện tử vào kho</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            File XML chuẩn TT78/TT32. Hệ thống tự nhận diện chiều ra/vào theo MST đơn vị.
            Lưu nguyên file XML & metadata vào kho HĐĐT (chưa ghi nhận vào sổ kế toán).
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 text-sm hover:bg-muted/50">
            {busy ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <FileCode2 className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="font-medium">
              {busy ? "Đang xử lý..." : "Chọn file XML (có thể chọn nhiều)"}
            </span>
            <span className="text-xs text-muted-foreground">Tối đa 50 file mỗi lần</span>
            <input
              type="file"
              accept=".xml,application/xml,text/xml"
              multiple
              hidden
              disabled={busy}
              onChange={onPick}
            />
          </label>

          {results && results.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">File</th>
                    <th className="px-3 py-2 text-left">Chiều</th>
                    <th className="px-3 py-2 text-left">Số HĐ</th>
                    <th className="px-3 py-2 text-right">Tổng</th>
                    <th className="px-3 py-2 text-left">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td
                        className="px-3 py-2 truncate max-w-[200px]"
                        title={r.name}
                      >
                        {r.name}
                      </td>
                      <td className="px-3 py-2">
                        {r.direction === "out" ? (
                          <Badge variant="default">Đầu ra</Badge>
                        ) : r.direction === "in" ? (
                          <Badge variant="secondary">Đầu vào</Badge>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.einvoiceId ? (
                          <Link
                            to="/einvoices/$id"
                            params={{ id: r.einvoiceId }}
                            className="underline"
                          >
                            {r.invoiceNo || "—"}
                          </Link>
                        ) : (
                          r.invoiceNo || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {vnd(r.total)}
                      </td>
                      <td className="px-3 py-2">
                        {r.status === "created" && (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Đã thêm
                          </span>
                        )}
                        {r.status === "duplicate" && (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Trùng
                          </span>
                        )}
                        {r.status === "error" && (
                          <span
                            className="inline-flex items-center gap-1 text-destructive"
                            title={r.error}
                          >
                            <AlertCircle className="h-3.5 w-3.5" /> Lỗi
                          </span>
                        )}
                        {r.status === "error" && r.error && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {r.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
