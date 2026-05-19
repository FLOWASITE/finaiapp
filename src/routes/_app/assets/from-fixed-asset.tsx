import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRightLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AccountCombobox } from "@/components/ui/account-combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listFixedAssetsForConversion,
  convertFixedAssetToAllocated,
} from "@/lib/allocated-assets.functions";

export const Route = createFileRoute("/_app/assets/from-fixed-asset")({
  component: FromFixedAssetPage,
});

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");

const CATEGORIES = [
  { value: "ccdc", label: "CCDC" },
  { value: "rent", label: "Thuê" },
  { value: "insurance", label: "Bảo hiểm" },
  { value: "license", label: "License" },
  { value: "repair", label: "Sửa chữa lớn" },
  { value: "interest", label: "Lãi vay" },
  { value: "other", label: "Khác" },
];

type FA = {
  id: string;
  code: string;
  name: string;
  cost: number | string;
  accumulated: number;
  remaining: number;
  start_date: string;
  status: string;
};

function FromFixedAssetPage() {
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<FA | null>(null);

  const listFn = useServerFn(listFixedAssetsForConversion);
  const { data: assets = [], isLoading } = useQuery<FA[]>({
    queryKey: ["fa-conversion", "list", q],
    queryFn: () => listFn({ data: { q } }) as any,
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets/allocations">
            <ArrowLeft className="h-4 w-4 mr-1" /> Quay lại
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          Chuyển TSCĐ sang CCDC / Chi phí trả trước
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Ghi giảm TSCĐ và đưa giá trị còn lại sang TK 242 để phân bổ dần. Bút toán tự sinh:
          Nợ 214 / Nợ 242 / Có 211.
        </p>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo mã / tên TSCĐ..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <div className="overflow-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Mã</th>
                  <th className="px-3 py-2">Tên TSCĐ</th>
                  <th className="px-3 py-2">Ngày sử dụng</th>
                  <th className="px-3 py-2 text-right">Nguyên giá</th>
                  <th className="px-3 py-2 text-right">KH luỹ kế</th>
                  <th className="px-3 py-2 text-right">Giá trị còn lại</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Đang tải...</td></tr>
                )}
                {!isLoading && assets.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Không có TSCĐ đang hoạt động</td></tr>
                )}
                {assets.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.start_date}</td>
                    <td className="px-3 py-2 text-right">{fmt(a.cost)}</td>
                    <td className="px-3 py-2 text-right">{fmt(a.accumulated)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(a.remaining)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setTarget(a)} disabled={a.remaining <= 0}>
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Chuyển đổi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {target && <ConvertDialog asset={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function ConvertDialog({ asset, onClose }: { asset: FA; onClose: () => void }) {
  const qc = useQueryClient();
  const convertFn = useServerFn(convertFixedAssetToAllocated);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({
    convert_date: today,
    code: `CCDC-${asset.code}`,
    name: asset.name,
    category: "ccdc",
    periods_total: 12,
    start_date: today,
    prepaid_account: "242",
    expense_account: "6423",
    reason: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      convertFn({
        data: {
          fixed_asset_id: asset.id,
          convert_date: form.convert_date,
          code: form.code.trim(),
          name: form.name.trim(),
          category: form.category as any,
          periods_total: Number(form.periods_total) || 12,
          period_unit: "month",
          start_date: form.start_date,
          prepaid_account: form.prepaid_account,
          expense_account: form.expense_account,
          reason: form.reason || null,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Đã chuyển TSCĐ. GTCL ${fmt(res.remaining)} sang ${res.created?.code}`);
      qc.invalidateQueries({ queryKey: ["fa-conversion"] });
      qc.invalidateQueries({ queryKey: ["allocated-assets"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chuyển TSCĐ → CCDC/CPTT</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="bg-muted/40 rounded p-3 grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Mã TSCĐ:</span> <b>{asset.code}</b></div>
            <div><span className="text-muted-foreground">Tên:</span> {asset.name}</div>
            <div><span className="text-muted-foreground">Nguyên giá:</span> {fmt(asset.cost)}</div>
            <div><span className="text-muted-foreground">KH luỹ kế:</span> {fmt(asset.accumulated)}</div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Giá trị còn lại (sẽ chuyển):</span>{" "}
              <Badge className="ml-1">{fmt(asset.remaining)}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ngày chuyển đổi</Label>
              <Input type="date" value={form.convert_date} onChange={(e) => setForm({ ...form, convert_date: e.target.value })} />
            </div>
            <div>
              <Label>Ngày bắt đầu phân bổ</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>Mã CCDC mới</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <Label>Tên</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Loại</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Số kỳ phân bổ (tháng)</Label>
              <Input type="number" min={1} max={600} value={form.periods_total} onChange={(e) => setForm({ ...form, periods_total: Number(e.target.value) })} />
            </div>
            <div>
              <Label>TK 242 (trả trước)</Label>
              <Input value={form.prepaid_account} onChange={(e) => setForm({ ...form, prepaid_account: e.target.value })} />
            </div>
            <div>
              <Label>TK chi phí</Label>
              <Input value={form.expense_account} onChange={(e) => setForm({ ...form, expense_account: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Lý do</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>

          <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
            Bút toán sẽ ghi: Nợ {asset.accumulated > 0 ? "214" : ""}{asset.accumulated > 0 ? ` ${fmt(asset.accumulated)}, ` : ""}
            Nợ {form.prepaid_account} {fmt(asset.remaining)} / Có 211 {fmt(asset.cost)}. TSCĐ được đánh dấu đã thanh lý.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || asset.remaining <= 0}>
            {mutation.isPending ? "Đang chuyển..." : "Xác nhận chuyển"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
