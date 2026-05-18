import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateLedgers } from "@/lib/query-invalidation";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { supabase } from "@/integrations/supabase/client";
import { runMonthlyDepreciation } from "@/lib/assets.functions";
import { Button } from "@/components/ui/button";
import { AddNew } from "@/components/add-new";
import { Input } from "@/components/ui/input";
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/assets")({
  component: Assets,
});

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function Assets() {
  const qc = useQueryClient();
  const runFn = useServerFn(runMonthlyDepreciation);
  const [form, setForm] = useState({
    code: "", name: "", cost: 0, salvage_value: 0,
    useful_life_months: 36, start_date: new Date().toISOString().slice(0, 10),
    asset_account: "211", accumulated_account: "214", expense_account: "6422",
  });
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [running, setRunning] = useState(false);

  const assets = useQuery({
    queryKey: ["fixed_assets"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fixed_assets")
        .select("*, depreciation_entries(period_month, amount)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const create = async () => {
    if (!form.code || !form.name || form.cost <= 0) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("fixed_assets").insert({ ...form, user_id: u.user!.id });
    if (error) return toast.error(error.message);
    setForm({ ...form, code: "", name: "", cost: 0 });
    qc.invalidateQueries({ queryKey: ["fixed_assets"] });
    invalidateLedgers(qc);
  };

  const runDepreciation = async () => {
    setRunning(true);
    try {
      const r = await runFn({ data: { upToMonth: period } });
      toast.success(`Đã tạo ${r.created} bút toán khấu hao`);
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      invalidateLedgers(qc);
    } catch (e: any) { toast.error(e.message); }
    finally { setRunning(false); }
  };

  return (
    <div className="p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khấu hao TSCĐ</h1>
          <p className="text-sm text-muted-foreground">Phương pháp đường thẳng — tự động sinh bút toán Nợ chi phí / Có hao mòn</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Trích đến tháng</label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <Button onClick={runDepreciation} disabled={running}>
            <Sparkles className="mr-2 h-4 w-4" />{running ? "Đang trích..." : "Chạy khấu hao tháng"}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Mã</th><th>Tên TSCĐ</th>
                <th className="text-right">Nguyên giá</th>
                <th className="text-right">KH/tháng</th>
                <th className="text-right">Đã trích</th>
                <th className="text-right">Còn lại</th>
              </tr>
            </thead>
            <tbody>
              {(assets.data ?? []).map((a: any) => {
                const monthly = (Number(a.cost) - Number(a.salvage_value)) / Number(a.useful_life_months);
                const totalDone = (a.depreciation_entries ?? []).reduce((s: number, d: any) => s + Number(d.amount), 0);
                const remaining = Number(a.cost) - Number(a.salvage_value) - totalDone;
                return (
                  <tr key={a.id} className="border-b border-border">
                    <td className="p-3 font-mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="text-right font-mono">{fmt(Number(a.cost))}</td>
                    <td className="text-right font-mono">{fmt(monthly)}</td>
                    <td className="text-right font-mono">{fmt(totalDone)}</td>
                    <td className="text-right font-mono">{fmt(remaining)}</td>
                  </tr>
                );
              })}
              {(assets.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">Chưa có TSCĐ. Thêm tài sản bên phải.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 font-semibold">Thêm TSCĐ</h3>
          <div className="space-y-2">
            <Input placeholder="Mã (TSCĐ-001)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Input placeholder="Tên TSCĐ" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input type="number" placeholder="Nguyên giá" value={form.cost || ""} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            <Input type="number" placeholder="Giá trị thanh lý" value={form.salvage_value || ""} onChange={(e) => setForm({ ...form, salvage_value: Number(e.target.value) })} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Thời gian (tháng)</label>
                <Input type="number" value={form.useful_life_months} onChange={(e) => setForm({ ...form, useful_life_months: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Ngày bắt đầu</label>
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="TK TS" value={form.asset_account} onChange={(e) => setForm({ ...form, asset_account: e.target.value })} />
              <Input placeholder="TK HM" value={form.accumulated_account} onChange={(e) => setForm({ ...form, accumulated_account: e.target.value })} />
              <Input placeholder="TK CP" value={form.expense_account} onChange={(e) => setForm({ ...form, expense_account: e.target.value })} />
            </div>
            <AddNew className="w-full" onClick={create} label="Thêm" />
          </div>
        </div>
      </div>
    </div>
  );
}
