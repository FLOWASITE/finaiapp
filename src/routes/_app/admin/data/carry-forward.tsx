import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  previewCarryForward,
  runCarryForward,
  listFiscalYearsForTenant,
} from "@/lib/data-management.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Loader2, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/admin/data/carry-forward")({
  component: CarryForwardPage,
});

function CarryForwardPage() {
  const yearsFn = useServerFn(listFiscalYearsForTenant);
  const previewFn = useServerFn(previewCarryForward);
  const runFn = useServerFn(runCarryForward);

  const { data: yd } = useQuery({ queryKey: ["tenant-fy"], queryFn: () => yearsFn() });
  const years = (yd?.years ?? []).map((y: any) => y.year as number);
  const thisYear = new Date().getFullYear();
  const [fromYear, setFromYear] = useState<number>(thisYear - 1);
  const [toYear, setToYear] = useState<number>(thisYear);
  const [force, setForce] = useState(false);

  const previewMut = useMutation({
    mutationFn: () => previewFn({ data: { from_year: fromYear, to_year: toYear } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const runMut = useMutation({
    mutationFn: () => runFn({ data: { from_year: fromYear, to_year: toYear, force } }),
    onSuccess: (r) => toast.success(`Đã kết chuyển ${r.rows.length} tài khoản`),
    onError: (e: Error) => toast.error(e.message),
  });

  const p = previewMut.data;
  const blocked = p && p.open_periods > 0;

  return (
    <Card className="p-5 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground">Năm nguồn</label>
          <Input
            type="number"
            value={fromYear}
            onChange={(e) => setFromYear(Number(e.target.value))}
            list="cf-from"
          />
          <datalist id="cf-from">{years.map((y) => <option key={y} value={y} />)}</datalist>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Năm đích</label>
          <Input
            type="number"
            value={toYear}
            onChange={(e) => setToYear(Number(e.target.value))}
            list="cf-to"
          />
          <datalist id="cf-to">{years.map((y) => <option key={y} value={y} />)}</datalist>
        </div>
        <div className="md:col-span-2 flex gap-2">
          <Button variant="outline" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
            {previewMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Xem trước
          </Button>
          <Button
            onClick={() => runMut.mutate()}
            disabled={!p || runMut.isPending || (blocked && !force)}
          >
            {runMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-4 w-4 mr-2" />
            )}
            Chạy kết chuyển
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Chỉ kết chuyển số dư các tài khoản loại 1–4 (tài sản, nợ phải trả, vốn chủ sở hữu). Các tài khoản 5–9 không được mang sang năm mới.
      </div>

      {p && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={blocked ? "destructive" : "secondary"}>
              {p.open_periods}/{p.total_periods} kỳ năm {fromYear} còn mở
            </Badge>
            <Badge variant="outline">{p.preview.length} tài khoản có số dư</Badge>
          </div>
          {blocked && (
            <label className="flex items-center gap-2 text-xs text-amber-600">
              <Checkbox checked={force} onCheckedChange={(v) => setForce(!!v)} />
              Vẫn tiếp tục dù năm nguồn chưa khoá hết
            </label>
          )}
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Tài khoản</th>
                  <th className="text-right p-2">Nợ</th>
                  <th className="text-right p-2">Có</th>
                </tr>
              </thead>
              <tbody>
                {p.preview.map((r) => (
                  <tr key={r.account_code} className="border-t">
                    <td className="p-2 font-mono">{r.account_code}</td>
                    <td className="p-2 text-right tabular-nums">
                      {r.debit ? r.debit.toLocaleString("vi-VN") : ""}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {r.credit ? r.credit.toLocaleString("vi-VN") : ""}
                    </td>
                  </tr>
                ))}
                {p.preview.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      Không có số dư để kết chuyển
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
