import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, TrendingDown, Receipt, FileText } from "lucide-react";
import { listCashVouchers, getCashBook } from "@/lib/cash.functions";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangeFilter } from "@/components/date-range-filter";
import { VoucherFormDialog } from "@/components/voucher-form";

export const Route = createFileRoute("/_app/cash/")({ component: CashPage });

function CashPage() {
  const list = useServerFn(listCashVouchers);
  const book = useServerFn(getCashBook);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [openType, setOpenType] = useState<"receipt" | "payment" | null>(null);

  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => list({}),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data: cashbook } = useQuery({ queryKey: ["cashbook", from, to], queryFn: () => book({ data: { from, to } }),
 ...QUERY_PRESETS.TRANSACTIONAL,
});

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quỹ tiền mặt</h1>
          <p className="text-sm text-muted-foreground">Phiếu thu, phiếu chi & sổ quỹ</p>
        </div>
        <div className="flex items-center gap-2">
          <AddNew label="Phiếu thu" icon={ArrowDownToLine} onClick={() => setOpenType("receipt")} />
          <AddNew label="Phiếu chi" icon={ArrowUpFromLine} onClick={() => setOpenType("payment")} />
        </div>
      </div>

      <VoucherFormDialog
        type={openType ?? "receipt"}
        open={openType !== null}
        onOpenChange={(o) => !o && setOpenType(null)}
      />

      <Tabs defaultValue="vouchers">
        <TabsList>
          <TabsTrigger value="vouchers">Phiếu thu / chi</TabsTrigger>
          <TabsTrigger value="book">Sổ quỹ tiền mặt</TabsTrigger>
        </TabsList>

        <TabsContent value="vouchers" className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Ngày</th>
                <th className="px-4 py-2 text-left">Số phiếu</th>
                <th className="px-4 py-2 text-left">Loại</th>
                <th className="px-4 py-2 text-left">Đối tượng</th>
                <th className="px-4 py-2 text-left">Lý do</th>
                <th className="px-4 py-2 text-left">TK đối ứng</th>
                <th className="px-4 py-2 text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {(vouchers ?? []).map((v) => (
                <tr key={v.id} className="border-t border-border">
                  <td className="px-4 py-2">{v.voucher_date}</td>
                  <td className="px-4 py-2 font-mono">{v.voucher_no}</td>
                  <td className="px-4 py-2">
                    <span className={v.voucher_type === "receipt" ? "text-emerald-600" : "text-rose-600"}>
                      {v.voucher_type === "receipt" ? "Thu" : "Chi"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{v.party_name}</td>
                  <td className="px-4 py-2">{v.reason}</td>
                  <td className="px-4 py-2 font-mono">{v.counter_account}</td>
                  <td className="px-4 py-2 text-right font-mono">{Number(v.amount).toLocaleString("vi-VN")}</td>
                </tr>
              ))}
              {(vouchers ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Chưa có phiếu nào</td></tr>
              )}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="book" className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border p-3">
            <DateRangeFilter from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Ngày</th>
                <th className="px-4 py-2 text-left">Diễn giải</th>
                <th className="px-4 py-2 text-right">Thu</th>
                <th className="px-4 py-2 text-right">Chi</th>
                <th className="px-4 py-2 text-right">Tồn quỹ</th>
              </tr>
            </thead>
            <tbody>
              {(cashbook ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-2">{r.date}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2 text-right font-mono text-emerald-600">{r.debit > 0 ? r.debit.toLocaleString("vi-VN") : ""}</td>
                  <td className="px-4 py-2 text-right font-mono text-rose-600">{r.credit > 0 ? r.credit.toLocaleString("vi-VN") : ""}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{r.balance.toLocaleString("vi-VN")}</td>
                </tr>
              ))}
              {(cashbook ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Không có phát sinh trong kỳ</td></tr>
              )}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </div>
  );
}

