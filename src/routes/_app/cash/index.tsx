import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, TrendingDown, Receipt, FileText } from "lucide-react";
import { listCashVouchers, getCashBook, deleteCashVoucher } from "@/lib/cash.functions";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/date-range-filter";
import { VoucherFormDialog } from "@/components/voucher-form";
import { PostedBadge, AttachmentsCell, VoucherRowActions } from "@/components/voucher-row-actions";
import { usePagination, TablePagination } from "@/components/table-pagination";

export const Route = createFileRoute("/_app/cash/")({ component: CashPage });

const CASH_TABS = [
  { value: "vouchers", label: "Phiếu thu / chi" },
  { value: "book", label: "Sổ quỹ tiền mặt" },
] as const;
type CashTabValue = (typeof CASH_TABS)[number]["value"];

function CashPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCashVouchers);
  const book = useServerFn(getCashBook);
  const delFn = useServerFn(deleteCashVoucher);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [openType, setOpenType] = useState<"receipt" | "payment" | null>(null);
  const [tab, setTab] = useState<CashTabValue>("vouchers");

  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => list({}),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const { data: cashbook } = useQuery({ queryKey: ["cashbook", from, to], queryFn: () => book({ data: { from, to } }),
 ...QUERY_PRESETS.TRANSACTIONAL,
});
  const pagination = usePagination((vouchers ?? []) as any[], 20, vouchers);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá phiếu");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      invalidateLedgers(qc);
    },
    onError: (e: any) => toast.error(e?.message || "Lỗi xoá"),
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

      <KpiStrip vouchers={vouchers ?? []} cashbook={cashbook ?? []} />

      <VoucherFormDialog
        type={openType ?? "receipt"}
        open={openType !== null}
        onOpenChange={(o) => !o && setOpenType(null)}
      />


      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto">
          {CASH_TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={cn(
                  "group relative shrink-0 px-3 py-3 text-sm font-medium transition-colors whitespace-nowrap",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute left-2 right-2 -bottom-px h-[3px] rounded-full transition-all duration-300 ease-out",
                    active
                      ? "opacity-100 scale-x-100 bg-gradient-to-r from-primary/70 via-primary to-primary/70 shadow-[0_0_10px_hsl(var(--primary)/0.45)]"
                      : "opacity-0 scale-x-50 bg-muted-foreground/40 group-hover:opacity-60 group-hover:scale-x-90",
                  )}
                />
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "vouchers" && (
        <div className="rounded-lg border border-border bg-card">

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
                <th className="px-4 py-2 text-center">Trạng thái</th>
                <th className="px-4 py-2 text-center">Tài liệu</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageRows.map((v: any) => (
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
                  <td className="px-4 py-2 text-center">
                    <PostedBadge posted={!!v.journal_entry_id} />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <AttachmentsCell
                      attachments={v.attachments ?? []}
                      entityTable="cash_vouchers"
                      entityId={v.id}
                      docKind="cash_voucher"
                      invalidateKeys={[["vouchers"]]}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <VoucherRowActions
                      onView={() => toast.info("Xem chi tiết — đang phát triển")}
                      onEdit={() => toast.info("Chỉnh sửa — đang phát triển")}
                      onPrint={() => toast.info("In phiếu — đang phát triển")}
                      onDuplicate={() => toast.info("Nhân bản — đang phát triển")}
                      onDelete={() => {
                        if (confirm(`Xoá phiếu ${v.voucher_no}? Bút toán liên quan cũng sẽ bị xoá.`)) del.mutate(v.id);
                      }}
                    />
                  </td>
                </tr>
              ))}
              {(vouchers ?? []).length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Chưa có phiếu nào</td></tr>
              )}
            </tbody>
          </table>
          <TablePagination {...pagination} />
        </div>
      )}

      {tab === "book" && (
        <div className="rounded-lg border border-border bg-card">
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
        </div>
      )}
    </div>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function KpiStrip({ vouchers, cashbook }: { vouchers: any[]; cashbook: any[] }) {
  const receipts = vouchers.filter((v) => v.voucher_type === "receipt");
  const payments = vouchers.filter((v) => v.voucher_type === "payment");
  const totalIn = receipts.reduce((s, v) => s + Number(v.amount), 0);
  const totalOut = payments.reduce((s, v) => s + Number(v.amount), 0);
  const balance = cashbook.length > 0 ? cashbook[cashbook.length - 1].balance : 0;

  const cards = [
    { title: "Tồn quỹ hiện tại", value: fmt(balance) + " ₫", icon: Wallet, tone: "primary" },
    { title: "Tổng thu trong kỳ", value: fmt(totalIn) + " ₫", icon: TrendingUp, tone: "success" },
    { title: "Tổng chi trong kỳ", value: fmt(totalOut) + " ₫", icon: TrendingDown, tone: "danger" },
    { title: "Số phiếu thu", value: String(receipts.length), icon: Receipt, tone: "success" },
    { title: "Số phiếu chi", value: String(payments.length), icon: FileText, tone: "danger" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        const toneClass =
          c.tone === "primary" ? "text-primary"
          : c.tone === "success" ? "text-emerald-600"
          : c.tone === "danger" ? "text-rose-600"
          : "text-muted-foreground";
        return (
          <div key={c.title} className="rounded-lg border border-border bg-card p-4">
            <div className={"flex items-center gap-2 text-xs uppercase " + toneClass}>
              <Icon className="h-3.5 w-3.5" />
              {c.title}
            </div>
            <div className="mt-2 text-xl font-bold tabular-nums">{c.value}</div>
          </div>
        );
      })}
    </div>
  );
}


