import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { listBankAccounts, listBankVouchers } from "@/lib/bank.functions";
import { Building2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Wallet, TrendingUp, TrendingDown, CalendarClock, Scale } from "lucide-react";

export const Route = createFileRoute("/_app/bank/")({ component: BankIndex });

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function BankIndex() {
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchVouchers = useServerFn(listBankVouchers);
  const { data: accounts = [] } = useQuery({ queryKey: ["bank-accounts"], queryFn: () => fetchAccounts({}),
 ...QUERY_PRESETS.REPORT,
});
  const { data: vouchers = [] } = useQuery({
    queryKey: ["bank-vouchers-all"],
    queryFn: () => fetchVouchers({ data: {} }),
    ...QUERY_PRESETS.REPORT,
  });

  const totalBalance = accounts.reduce((s: number, a: any) => s + (a.current_balance ?? 0), 0);
  const totalIn = vouchers
    .filter((v: any) => v.voucher_type === "receipt" || v.voucher_type === "transfer_in")
    .reduce((s: number, v: any) => s + Number(v.amount), 0);
  const totalOut = vouchers
    .filter((v: any) => v.voucher_type === "payment" || v.voucher_type === "transfer_out")
    .reduce((s: number, v: any) => s + Number(v.amount), 0);

  const now = new Date();
  const ym = (d: string) => d?.slice(0, 7);
  const curYm = now.toISOString().slice(0, 7);
  const monthVouchers = vouchers.filter((v: any) => ym(v.voucher_date) === curYm);
  const monthIn = monthVouchers
    .filter((v: any) => v.voucher_type === "receipt" || v.voucher_type === "transfer_in")
    .reduce((s: number, v: any) => s + Number(v.amount), 0);
  const monthOut = monthVouchers
    .filter((v: any) => v.voucher_type === "payment" || v.voucher_type === "transfer_out")
    .reduce((s: number, v: any) => s + Number(v.amount), 0);
  const transferCount = vouchers.filter((v: any) => v.voucher_type === "transfer_in" || v.voucher_type === "transfer_out").length;
  const activeAccounts = accounts.filter((a: any) => (a.current_balance ?? 0) > 0).length;
  const netFlow = totalIn - totalOut;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3">
        <Card title="Số dư tổng" value={fmt(totalBalance) + " ₫"} icon={Wallet} tone="primary" />
        <Card title="Số TK đang quản lý" value={String(accounts.length)} icon={Building2} />
        <Card title="Tổng báo có" value={fmt(totalIn) + " ₫"} icon={ArrowDownToLine} tone="success" />
      </div>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Card title="Tổng báo nợ" value={fmt(totalOut) + " ₫"} icon={ArrowUpFromLine} tone="danger" />
        <Card title="Dòng tiền ròng" value={fmt(netFlow) + " ₫"} icon={Scale} tone={netFlow >= 0 ? "success" : "danger"} />
        <Card title="Báo có tháng này" value={fmt(monthIn) + " ₫"} icon={TrendingUp} tone="success" />
        <Card title="Báo nợ tháng này" value={fmt(monthOut) + " ₫"} icon={TrendingDown} tone="danger" />
        <Card title="Số phiếu CK nội bộ" value={String(transferCount)} icon={ArrowLeftRight} />
        <Card title="TK có số dư" value={`${activeAccounts}/${accounts.length}`} icon={CalendarClock} />
      </div>


      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Tài khoản ngân hàng</h3>
          <Link to="/bank/accounts" className="text-sm text-primary hover:underline">
            Quản lý →
          </Link>
        </div>
        {accounts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chưa có tài khoản ngân hàng. <Link to="/bank/accounts" className="text-primary hover:underline">Tạo mới</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 text-left">Tên TK</th>
                <th className="text-left">Ngân hàng</th>
                <th className="text-left">Số TK</th>
                <th className="text-left">TK kế toán</th>
                <th className="text-right">Số dư hiện tại</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a: any) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="py-2 font-medium">{a.name}</td>
                  <td>{a.bank_name || "—"}</td>
                  <td className="font-mono text-xs">{a.account_no || "—"}</td>
                  <td className="font-mono text-xs">{a.gl_account_code}</td>
                  <td className="text-right font-mono">{fmt(a.current_balance ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Phiếu gần nhất</h3>
          <Link to="/bank/vouchers" className="text-sm text-primary hover:underline">Xem tất cả →</Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 text-left">Ngày</th>
              <th className="text-left">Số phiếu</th>
              <th className="text-left">Loại</th>
              <th className="text-left">Đối tượng</th>
              <th className="text-right">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.slice(0, 10).map((v: any) => (
              <tr key={v.id} className="border-b border-border/60">
                <td className="py-2">{v.voucher_date}</td>
                <td className="font-mono">{v.voucher_no}</td>
                <td>
                  <VoucherBadge type={v.voucher_type} />
                </td>
                <td>{v.party_name || "—"}</td>
                <td className="text-right font-mono">{fmt(Number(v.amount))}</td>
              </tr>
            ))}
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">Chưa có phiếu nào</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value, icon: Icon, tone }: { title: string; value: string; icon: any; tone?: string }) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-rose-600" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={"flex items-center gap-2 text-xs uppercase " + toneClass}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function VoucherBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    receipt: { label: "Báo có", cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30", Icon: ArrowDownToLine },
    payment: { label: "Báo nợ", cls: "text-rose-600 bg-rose-50 dark:bg-rose-950/30", Icon: ArrowUpFromLine },
    transfer_in: { label: "CK đến", cls: "text-sky-600 bg-sky-50 dark:bg-sky-950/30", Icon: ArrowLeftRight },
    transfer_out: { label: "CK đi", cls: "text-amber-600 bg-amber-50 dark:bg-amber-950/30", Icon: ArrowLeftRight },
  };
  const m = map[type] || { label: type, cls: "", Icon: ArrowDownToLine };
  const Icon = m.Icon;
  return (
    <span className={"inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs " + m.cls}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}
