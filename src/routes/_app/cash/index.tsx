import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { listCashVouchers, createCashVoucher, getCashBook } from "@/lib/cash.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/date-range-filter";

export const Route = createFileRoute("/_app/cash/")({ component: CashPage });

function CashPage() {
  const list = useServerFn(listCashVouchers);
  const book = useServerFn(getCashBook);
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: vouchers } = useQuery({ queryKey: ["vouchers"], queryFn: () => list({}) });
  const { data: cashbook } = useQuery({ queryKey: ["cashbook", from, to], queryFn: () => book({ data: { from, to } }) });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quỹ tiền mặt</h1>
          <p className="text-sm text-muted-foreground">Phiếu thu, phiếu chi & sổ quỹ</p>
        </div>
        <VoucherDialog />
      </div>

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

function VoucherDialog() {
  const create = useServerFn(createCashVoucher);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    voucher_no: `PT-${Date.now().toString().slice(-6)}`,
    voucher_type: "receipt" as "receipt" | "payment",
    voucher_date: new Date().toISOString().slice(0, 10),
    amount: 0, cash_account: "1111", counter_account: "131",
    party_name: "", reason: "",
  });
  const m = useMutation({
    mutationFn: () => create({ data: form }),
    onSuccess: () => {
      toast.success("Đã tạo phiếu + bút toán");
      qc.invalidateQueries({ queryKey: ["vouchers"] });
      qc.invalidateQueries({ queryKey: ["cashbook"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Phiếu mới</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle><Wallet className="mr-2 inline h-4 w-4" />Tạo phiếu thu / chi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại</Label>
              <Select value={form.voucher_type} onValueChange={(v: "receipt" | "payment") => {
                setForm({ ...form, voucher_type: v, voucher_no: `${v === "receipt" ? "PT" : "PC"}-${Date.now().toString().slice(-6)}` });
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">Phiếu thu</SelectItem>
                  <SelectItem value="payment">Phiếu chi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Số phiếu</Label><Input value={form.voucher_no} onChange={(e) => setForm({ ...form, voucher_no: e.target.value })} /></div>
            <div><Label>Ngày</Label><Input type="date" value={form.voucher_date} onChange={(e) => setForm({ ...form, voucher_date: e.target.value })} /></div>
            <div><Label>Số tiền</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div><Label>TK tiền</Label><Input value={form.cash_account} onChange={(e) => setForm({ ...form, cash_account: e.target.value })} /></div>
            <div><Label>TK đối ứng</Label><Input value={form.counter_account} onChange={(e) => setForm({ ...form, counter_account: e.target.value })} /></div>
          </div>
          <div><Label>Người nộp / nhận</Label><Input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} /></div>
          <div><Label>Lý do</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending || form.amount <= 0}>Lưu & sinh bút toán</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
