import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listPeriodLocks, lockPeriod, unlockPeriod } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_app/admin/periods")({ component: PeriodsPage });

function PeriodsPage() {
  const list = useServerFn(listPeriodLocks);
  const lock = useServerFn(lockPeriod);
  const unlock = useServerFn(unlockPeriod);
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useQuery({ queryKey: ["period-locks"], queryFn: () => list() });

  const isLocked = (m: number) => (data?.locks ?? []).some((l: any) => l.year === year && l.month === m);
  const refresh = () => qc.invalidateQueries({ queryKey: ["period-locks"] });

  const toggle = async (m: number) => {
    try {
      if (isLocked(m)) await unlock({ data: { year, month: m } });
      else await lock({ data: { year, month: m, note: undefined } });
      toast.success("Đã cập nhật");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const months = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Khóa kỳ kế toán</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="w-20 text-center font-semibold">{year}</div>
          <Button size="icon" variant="outline" onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {months.map((label, idx) => {
          const m = idx + 1;
          const locked = isLocked(m);
          return (
            <Card key={m} onClick={() => toggle(m)} className={`cursor-pointer p-4 transition-colors ${locked ? "border-destructive/40 bg-destructive/5" : "hover:bg-muted/50"}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                {locked ? <Lock className="h-4 w-4 text-destructive" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {locked ? "Đã khóa" : "Đang mở"}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Khóa kỳ ngăn kế toán viên thêm/sửa bút toán trong tháng đã khóa.</p>
    </div>
  );
}
