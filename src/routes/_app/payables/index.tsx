import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getReceivables } from "@/lib/receivables.functions";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { DimensionFilterBar, type DimensionValue } from "@/components/dimension-filter-bar";
import { PurchaseTabs } from "@/components/purchases/PurchaseTabs";

export const Route = createFileRoute("/_app/payables/")({ component: PayablesPage });

function PayablesPage() {
  const fn = useServerFn(getReceivables);
  const [dims, setDims] = useState<DimensionValue>({});
  const { data } = useQuery({
    queryKey: ["payables", dims],
    queryFn: () => fn({ data: { kind: "AP", dims } }),
    ...QUERY_PRESETS.REPORT,
  });

  const totals = (data ?? []).reduce(
    (s, r) => ({
      balance: s.balance + r.balance,
      "0-30": s["0-30"] + r.aging["0-30"],
      "31-60": s["31-60"] + r.aging["31-60"],
      "61-90": s["61-90"] + r.aging["61-90"],
      "90+": s["90+"] + r.aging["90+"],
    }),
    { balance: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 },
  );

  return (
    <div>
      <PurchaseTabs />
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Công nợ phải trả</h1>
          <p className="text-sm text-muted-foreground">Phải trả người bán (TK 331), tuổi nợ</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <DimensionFilterBar value={dims} onChange={setDims} />
        </div>

        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Đối tượng</th>
                <th className="px-4 py-2 text-left">Phát sinh cuối</th>
                <th className="px-4 py-2 text-right">0–30 ngày</th>
                <th className="px-4 py-2 text-right">31–60</th>
                <th className="px-4 py-2 text-right">61–90</th>
                <th className="px-4 py-2 text-right text-rose-600">{">90"}</th>
                <th className="px-4 py-2 text-right">Tổng dư</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-2">{r.party}</td>
                  <td className="px-4 py-2 text-xs">{r.lastDate}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.aging["0-30"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.aging["31-60"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono">{r.aging["61-90"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono text-rose-600">{r.aging["90+"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{r.balance.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Không có công nợ</td></tr>
              )}
            </tbody>
            {(data ?? []).length > 0 && (
              <tfoot className="bg-muted/40 font-semibold">
                <tr>
                  <td className="px-4 py-2" colSpan={2}>TỔNG</td>
                  <td className="px-4 py-2 text-right font-mono">{totals["0-30"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono">{totals["31-60"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono">{totals["61-90"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono text-rose-600">{totals["90+"].toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-2 text-right font-mono">{totals.balance.toLocaleString("vi-VN")}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
