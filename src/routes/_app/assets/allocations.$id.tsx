import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Ban, Calendar, Layers, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QUERY_PRESETS } from "@/lib/query-presets";
import {
  getAllocatedAsset,
  disposeAllocatedAsset,
} from "@/lib/allocated-assets.functions";

export const Route = createFileRoute("/_app/assets/allocations/$id")({
  component: AllocatedAssetDetailPage,
});

const fmt = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, string> = {
  active: "Đang phân bổ",
  suspended: "Tạm ngừng",
  disposed: "Đã thanh lý",
  finished: "Đã phân bổ hết",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-amber-100 text-amber-700",
  disposed: "bg-zinc-200 text-zinc-700",
  finished: "bg-blue-100 text-blue-700",
};

function AllocatedAssetDetailPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getAllocatedAsset);

  const { data, isLoading } = useQuery({
    queryKey: ["alloc-asset-detail", id],
    queryFn: () => getFn({ data: { id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Đang tải…</div>
    );
  }

  const a = data.asset;
  const remaining = Number(a.cost) - Number(a.allocated);
  const progress =
    Number(a.periods_total) > 0
      ? Math.min(100, (Number(a.periods_done) / Number(a.periods_total)) * 100)
      : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets/allocations">
            <ArrowLeft className="h-4 w-4 mr-1" /> Danh sách
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {a.name}
            </h1>
            <Badge className={STATUS_TONE[a.status] ?? ""}>
              {STATUS_LABEL[a.status] ?? a.status}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground font-mono mt-1">
            {a.code} · TK {a.prepaid_account} / {a.expense_account}
          </p>
        </div>
        {a.status !== "disposed" && <DisposeDialog assetId={a.id} />}
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat
          icon={<Layers className="h-4 w-4" />}
          label="Nguyên giá"
          value={fmt(a.cost)}
        />
        <Stat
          icon={<Wallet className="h-4 w-4" />}
          label="Đã phân bổ"
          value={fmt(a.allocated)}
          tone="text-emerald-600"
        />
        <Stat
          icon={<Wallet className="h-4 w-4" />}
          label="Còn lại"
          value={fmt(remaining)}
          tone="text-primary"
        />
        <Stat
          icon={<Calendar className="h-4 w-4" />}
          label="Kỳ đã PB"
          value={`${a.periods_done}/${a.periods_total}`}
          sub={a.period_unit === "month" ? "tháng" : a.period_unit === "quarter" ? "quý" : "năm"}
        />
      </div>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Loại" value={a.category} />
            <Field label="Bắt đầu" value={a.start_date} />
            <Field label="Phương pháp" value={a.method === "straight_line" ? "Đường thẳng" : "Tỉ lệ tuỳ chỉnh"} />
            <Field label="Số lượng" value={`${fmt(a.quantity)} ${a.unit ?? ""}`} />
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          {a.notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {a.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <div className="px-4 py-3 border-b text-sm font-semibold">
          Lịch sử phân bổ ({data.entries.length})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Kỳ</th>
              <th className="px-3 py-2 text-right">Số tiền</th>
              <th className="px-3 py-2 text-left">Bút toán</th>
              <th className="px-3 py-2 text-left">Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Chưa có bút toán phân bổ. Vào danh sách → "Phân bổ kỳ" để chạy.
                </td>
              </tr>
            )}
            {data.entries.map((e: any) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2 font-mono">
                  {String(e.period_month).slice(0, 7)}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmt(e.amount)}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {e.journal_entry_id ? e.journal_entry_id.slice(0, 8) : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {String(e.created_at).slice(0, 16).replace("T", " ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.adjustments.length > 0 && (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <div className="px-4 py-3 border-b text-sm font-semibold">
            Điều chỉnh / Thanh lý ({data.adjustments.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Ngày</th>
                <th className="px-3 py-2 text-left">Loại</th>
                <th className="px-3 py-2 text-right">Δ Giá trị</th>
                <th className="px-3 py-2 text-right">Δ Kỳ</th>
                <th className="px-3 py-2 text-left">Lý do</th>
              </tr>
            </thead>
            <tbody>
              {data.adjustments.map((adj: any) => (
                <tr key={adj.id} className="border-t">
                  <td className="px-3 py-2">{adj.adj_date}</td>
                  <td className="px-3 py-2">{adj.type}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(adj.delta_cost)}</td>
                  <td className="px-3 py-2 text-right font-mono">{adj.delta_periods}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{adj.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`mt-2 text-lg sm:text-xl font-bold font-mono ${tone ?? ""}`}>
          {value}
        </div>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function DisposeDialog({ assetId }: { assetId: string }) {
  const fn = useServerFn(disposeAllocatedAsset);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState("811");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: assetId,
          dispose_date: date,
          write_off_account: account,
          reason: reason || null,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        res.written_off > 0
          ? `Đã thanh lý — kết chuyển ${res.written_off.toLocaleString("vi-VN")} sang TK ${account}`
          : "Đã thanh lý",
      );
      qc.invalidateQueries({ queryKey: ["alloc-asset-detail", assetId] });
      qc.invalidateQueries({ queryKey: ["alloc-assets"] });
      qc.invalidateQueries({ queryKey: ["alloc-assets-summary"] });
      setOpen(false);
      nav({ to: "/assets/allocations" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Ban className="h-4 w-4" /> Thanh lý
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thanh lý tài sản phân bổ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ngày thanh lý</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>TK kết chuyển GTCL</Label>
            <Input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="811 / 642…"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Bút toán: Nợ {account} / Có {`{TK chờ phân bổ}`} — tự sinh khi còn giá trị.
            </p>
          </div>
          <div>
            <Label>Lý do</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: hư hỏng, bán, không sử dụng…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Đang xử lý…" : "Xác nhận thanh lý"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
