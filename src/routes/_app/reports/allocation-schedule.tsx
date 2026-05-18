import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  allocationSchedule,
  reconcile242,
} from "@/lib/allocated-assets.functions";

export const Route = createFileRoute("/_app/reports/allocation-schedule")({
  component: AllocationScheduleReport,
});

const fmt = (n: number | string | null | undefined) => {
  const x = Number(n ?? 0);
  if (!x) return "—";
  return Math.round(x).toLocaleString("vi-VN");
};

function thisYearRange() {
  const y = new Date().getFullYear();
  return { from: `${y}-01`, to: `${y}-12` };
}

function AllocationScheduleReport() {
  const def = thisYearRange();
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [status, setStatus] = useState("all");
  const [account, setAccount] = useState("242");

  const schedFn = useServerFn(allocationSchedule);
  const recFn = useServerFn(reconcile242);

  const { data: sched, isLoading: l1 } = useQuery({
    queryKey: ["alloc-schedule", from, to, status],
    queryFn: () => schedFn({ data: { fromMonth: from, toMonth: to, status } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const { data: rec, isLoading: l2 } = useQuery({
    queryKey: ["alloc-reconcile", from, to, account],
    queryFn: () =>
      recFn({ data: { fromMonth: from, toMonth: to, account } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const months = useMemo(() => {
    const m: string[] = [];
    const [fy, fm] = from.split("-").map(Number);
    const [ty, tm] = to.split("-").map(Number);
    const cur = new Date(fy, fm - 1, 1);
    const end = new Date(ty, tm - 1, 1);
    while (cur <= end) {
      m.push(
        `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
      );
      cur.setMonth(cur.getMonth() + 1);
    }
    return m;
  }, [from, to]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/reports">
            <ArrowLeft className="h-4 w-4 mr-1" /> Báo cáo
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Bảng phân bổ CCDC / Chi phí trả trước
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Theo dõi phân bổ TK 242 theo từng kỳ và đối chiếu với sổ cái
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid gap-3 grid-cols-2 md:grid-cols-4">
          <div>
            <Label className="text-xs">Từ tháng</Label>
            <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Đến tháng</Label>
            <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Trạng thái</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Đang phân bổ</SelectItem>
                <SelectItem value="finished">Đã phân bổ hết</SelectItem>
                <SelectItem value="disposed">Đã thanh lý</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">TK đối chiếu</Label>
            <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="242" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Bảng phân bổ</TabsTrigger>
          <TabsTrigger value="reconcile">Đối chiếu TK {account}</TabsTrigger>
        </TabsList>

        {/* SCHEDULE */}
        <TabsContent value="schedule">
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase">
                <tr>
                  <th className="px-2 py-2 text-left sticky left-0 bg-muted/60 z-10">Mã</th>
                  <th className="px-2 py-2 text-left sticky left-12 bg-muted/60 z-10">Tên</th>
                  <th className="px-2 py-2 text-right">Nguyên giá</th>
                  {months.map((m) => (
                    <th key={m} className="px-2 py-2 text-right whitespace-nowrap">
                      {m}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">Σ Kế hoạch</th>
                  <th className="px-2 py-2 text-right">Σ Đã PB</th>
                  <th className="px-2 py-2 text-right">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {l1 && (
                  <tr><td colSpan={months.length + 6} className="px-3 py-8 text-center text-muted-foreground">Đang tải…</td></tr>
                )}
                {!l1 && (sched?.rows.length ?? 0) === 0 && (
                  <tr><td colSpan={months.length + 6} className="px-3 py-8 text-center text-muted-foreground">Không có dữ liệu trong khoảng đã chọn</td></tr>
                )}
                {(sched?.rows ?? []).map((r) => {
                  const byPeriod = new Map(r.periods.map((p) => [p.period, p]));
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-2 py-2 font-mono text-xs sticky left-0 bg-card">{r.code}</td>
                      <td className="px-2 py-2 sticky left-12 bg-card">
                        <Link to="/assets/allocations/$id" params={{ id: r.id }} className="hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(r.cost)}</td>
                      {months.map((m) => {
                        const p = byPeriod.get(m);
                        if (!p) return <td key={m} className="px-2 py-2 text-right text-muted-foreground">—</td>;
                        const isPosted = p.posted > 0;
                        return (
                          <td key={m} className={`px-2 py-2 text-right font-mono ${isPosted ? "" : "text-muted-foreground"}`} title={`KH: ${fmt(p.planned)} · Đã PB: ${fmt(p.posted)}`}>
                            {fmt(isPosted ? p.posted : p.planned)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-mono">{fmt(r.sum_planned)}</td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-600">{fmt(r.sum_posted)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${Math.abs(r.diff) > 0.5 ? "text-destructive" : ""}`}>
                        {fmt(r.diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {(sched?.rows.length ?? 0) > 0 && (
                <tfoot className="bg-muted/40 font-semibold">
                  <tr>
                    <td colSpan={3 + months.length} className="px-2 py-2 text-right">Tổng</td>
                    <td className="px-2 py-2 text-right font-mono">{fmt(sched?.total_planned)}</td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-600">{fmt(sched?.total_posted)}</td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </TabsContent>

        {/* RECONCILE */}
        <TabsContent value="reconcile">
          <Card>
            <CardContent className="p-0">
              <div className="rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Tháng</th>
                      <th className="px-3 py-2 text-right">Sổ chi tiết (allocation_entries)</th>
                      <th className="px-3 py-2 text-right">Có TK {account} (sổ cái)</th>
                      <th className="px-3 py-2 text-right">Nợ TK {account} (sổ cái)</th>
                      <th className="px-3 py-2 text-right">Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l2 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Đang tải…</td></tr>
                    )}
                    {(rec?.rows ?? []).map((r) => (
                      <tr key={r.month} className="border-t">
                        <td className="px-3 py-2 font-mono">{r.month}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.sub_ledger)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.je_credit)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(r.je_debit)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${Math.abs(r.diff) > 0.5 ? "text-destructive" : "text-emerald-600"}`}>
                          {Math.abs(r.diff) > 0.5 ? fmt(r.diff) : "✓"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {(rec?.rows.length ?? 0) > 0 && (
                    <tfoot className="bg-muted/40 font-semibold">
                      <tr>
                        <td className="px-3 py-2 text-right">Tổng</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(rec?.total_sub)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(rec?.total_credit)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(rec?.total_debit)}</td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="p-4 text-xs text-muted-foreground border-t flex items-start gap-2">
                <FileSpreadsheet className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p><strong>Cách đọc:</strong> "Sổ chi tiết" là tổng số tiền phân bổ theo từng tài sản trong tháng (bảng <code>allocation_entries</code>). "Có TK {account}" là tổng phát sinh bên Có TK {account} từ sổ cái. Hai giá trị phải khớp nhau (✓). Nếu lệch — có bút toán thủ công vào TK {account} chưa được khớp với CCDC/CPTT nào.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
