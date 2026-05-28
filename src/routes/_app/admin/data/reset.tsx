import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { previewReset, runReset, listFiscalYearsForTenant } from "@/lib/data-management.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data/reset")({ component: ResetPage });

type Scope = "year" | "transactions" | "all";

const SCOPE_LABEL: Record<Scope, string> = {
  year: "Xoá theo năm tài chính",
  transactions: "Xoá toàn bộ giao dịch (giữ danh mục)",
  all: "Xoá toàn bộ dữ liệu (giao dịch + danh mục)",
};

function ResetPage() {
  const previewFn = useServerFn(previewReset);
  const runFn = useServerFn(runReset);
  const yearsFn = useServerFn(listFiscalYearsForTenant);

  const [scope, setScope] = useState<Scope>("year");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const yearsQ = useQuery({ queryKey: ["fy-list"], queryFn: () => yearsFn() });

  const previewMut = useMutation({
    mutationFn: () =>
      previewFn({ data: { scope, fiscal_year: scope === "year" ? year : undefined } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: () =>
      runFn({
        data: {
          scope,
          fiscal_year: scope === "year" ? year : undefined,
          confirm_text: confirmText,
        },
      }),
    onSuccess: (r) => {
      const total = Object.values(r.deleted).reduce<number>((s, n) => s + (n ?? 0), 0);
      if (r.errors.length) toast.warning(`Đã xoá, có ${r.errors.length} bảng lỗi`);
      else toast.success(`Đã xoá ${total} dòng`);
      setConfirmOpen(false);
      setConfirmText("");
      previewMut.reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expected =
    previewMut.data?.tenant?.tax_id ||
    previewMut.data?.tenant?.company_name ||
    "XOA-DU-LIEU";

  return (
    <div className="space-y-4">
      <Card className="p-4 border-destructive/40 bg-destructive/5">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-destructive">Thao tác nguy hiểm</div>
            <div className="text-muted-foreground">
              Xoá dữ liệu không thể hoàn tác. Hãy <b>Xuất dữ liệu (Fin)</b> trước khi reset. Chỉ chủ tài khoản (owner) mới được thực hiện.
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Phạm vi xoá</label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="year">{SCOPE_LABEL.year}</SelectItem>
                <SelectItem value="transactions">{SCOPE_LABEL.transactions}</SelectItem>
                <SelectItem value="all">{SCOPE_LABEL.all}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "year" && (
            <div>
              <label className="text-xs text-muted-foreground">Năm tài chính</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(yearsQ.data?.years ?? []).map((y: any) => (
                    <SelectItem key={y.year} value={String(y.year)}>
                      {y.year} {y.status ? `· ${y.status}` : ""}
                    </SelectItem>
                  ))}
                  {!yearsQ.data?.years?.length && (
                    <SelectItem value={String(year)}>{year}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
            {previewMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Xem trước số dòng sẽ xoá
          </Button>
          <Button
            variant="destructive"
            disabled={!previewMut.data || runMut.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Xoá dữ liệu
          </Button>
        </div>

        {previewMut.data && (
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Tổng: {previewMut.data.total} dòng</Badge>
              <Badge variant="outline">{SCOPE_LABEL[scope]}</Badge>
              {scope === "year" && <Badge variant="outline">Năm {year}</Badge>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs">
              {Object.entries(previewMut.data.counts).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b py-0.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="tabular-nums">{v as number}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {runMut.data?.errors?.length ? (
          <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs space-y-1">
            <div className="font-medium text-destructive">Lỗi theo bảng:</div>
            {runMut.data.errors.map((e, i) => (
              <div key={i}><b>{e.table}:</b> {e.error}</div>
            ))}
          </div>
        ) : null}
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive inline-flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Xác nhận xoá vĩnh viễn
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá <b>{previewMut.data?.total ?? 0}</b> dòng dữ liệu ({SCOPE_LABEL[scope]}
              {scope === "year" ? ` · năm ${year}` : ""}). Thao tác này <b>không thể hoàn tác</b>.
              <br />
              Gõ chính xác <code className="bg-muted px-1 rounded">{expected}</code> hoặc{" "}
              <code className="bg-muted px-1 rounded">XOA-DU-LIEU</code> để xác nhận:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Gõ chuỗi xác nhận"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runMut.isPending}>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              disabled={runMut.isPending || !confirmText.trim()}
              onClick={(e) => {
                e.preventDefault();
                runMut.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {runMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
