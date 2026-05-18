import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listFiscalYears,
  generateFiscalYear,
  setPeriodStatus,
  closeFiscalYear,
} from "@/lib/fiscal-periods.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Lock, LockKeyhole, Unlock, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/settings/fiscal-periods")({
  component: FiscalPeriodsPage,
});

const MONTH_LABELS = ["T1","T2","T3","T4","T5","T6","T7","T8","T9","T10","T11","T12"];

function FiscalPeriodsPage() {
  const list = useServerFn(listFiscalYears);
  const gen = useServerFn(generateFiscalYear);
  const setStatus = useServerFn(setPeriodStatus);
  const closeYear = useServerFn(closeFiscalYear);
  const qc = useQueryClient();
  const [newYear, setNewYear] = useState<number>(new Date().getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["fiscal-periods"],
    queryFn: () => list(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["fiscal-periods"] });

  const genMut = useMutation({
    mutationFn: (year: number) => gen({ data: { year } }),
    onSuccess: () => { toast.success("Đã tạo năm tài chính"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: "open" | "soft_closed" | "closed" }) =>
      setStatus({ data: vars }),
    onSuccess: () => { toast.success("Đã cập nhật"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeYearMut = useMutation({
    mutationFn: (fiscal_year_id: string) => closeYear({ data: { fiscal_year_id } }),
    onSuccess: () => { toast.success("Đã khoá toàn bộ năm"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const periodsByYear = (yearId: string) =>
    (data?.periods ?? []).filter((p) => p.fiscal_year_id === yearId);

  const statusBadge = (s: string) => {
    if (s === "closed") return <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" />Khoá cứng</Badge>;
    if (s === "soft_closed") return <Badge variant="secondary" className="gap-1"><LockKeyhole className="h-3 w-3" />Khoá mềm</Badge>;
    return <Badge variant="outline" className="gap-1"><Unlock className="h-3 w-3" />Đang mở</Badge>;
  };

  const cycleStatus = (cur: string): "open" | "soft_closed" | "closed" => {
    if (cur === "open") return "soft_closed";
    if (cur === "soft_closed") return "closed";
    return "open";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Kỳ kế toán</h2>
          <p className="text-xs text-muted-foreground">
            Quản lý năm tài chính và khoá kỳ. Bấm vào tháng để chuyển trạng thái: Mở → Khoá mềm → Khoá cứng.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            value={newYear}
            onChange={(e) => setNewYear(Number(e.target.value))}
          />
          <Button onClick={() => genMut.mutate(newYear)} disabled={genMut.isPending}>
            <Plus className="h-4 w-4 mr-1" />Tạo năm tài chính
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải…</p>}
      {!isLoading && (data?.years ?? []).length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Chưa có năm tài chính nào. Hãy tạo năm đầu tiên ở trên.
        </Card>
      )}

      {(data?.years ?? []).map((y) => {
        const periods = periodsByYear(y.id);
        return (
          <Card key={y.id} className="p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold">Năm {y.year}</span>
                <span className="text-xs text-muted-foreground">
                  {y.start_date} → {y.end_date}
                </span>
                {y.status === "closed" ? (
                  <Badge variant="destructive">Đã khoá năm</Badge>
                ) : (
                  <Badge variant="outline">Đang mở</Badge>
                )}
              </div>
              {y.status !== "closed" && (
                <Button size="sm" variant="outline" onClick={() => closeYearMut.mutate(y.id)}>
                  <Lock className="h-3 w-3 mr-1" />Khoá toàn bộ năm
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12">
              {periods.map((p) => (
                <button
                  key={p.id}
                  onClick={() => statusMut.mutate({ id: p.id, status: cycleStatus(p.status) })}
                  className={`rounded border p-2 text-left transition-colors hover:bg-muted/50 ${
                    p.status === "closed"
                      ? "border-destructive/40 bg-destructive/5"
                      : p.status === "soft_closed"
                        ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20"
                        : "border-border"
                  }`}
                >
                  <div className="text-xs font-medium">{MONTH_LABELS[p.period_no - 1]}</div>
                  <div className="mt-1">{statusBadge(p.status)}</div>
                </button>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
