import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRightLeft,
  Wrench,
  RefreshCw,
  Scissors,
  Plus,
  Ban,
  FileText,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { listAssetEvents, createAssetEvent, voidAssetEvent } from "@/lib/fa-events.functions";
import { listFixedAssets } from "@/lib/assets.functions";

type EvType = "TRANSFER" | "REVALUATION" | "MAJOR_REPAIR" | "PARTIAL_DISPOSAL";

const TYPE_META: Record<EvType, { label: string; icon: any; color: string; help: string }> = {
  TRANSFER: { label: "Điều chuyển", icon: ArrowRightLeft, color: "bg-blue-500/10 text-blue-600", help: "Đổi bộ phận / chi nhánh / người sử dụng / vị trí. Không phát sinh bút toán." },
  REVALUATION: { label: "Đánh giá lại", icon: RefreshCw, color: "bg-amber-500/10 text-amber-600", help: "Cập nhật nguyên giá; chênh lệch hạch toán qua TK 412." },
  MAJOR_REPAIR: { label: "Sửa chữa lớn", icon: Wrench, color: "bg-emerald-500/10 text-emerald-600", help: "Ghi tăng nguyên giá. Nợ 211 / Có 241(3)." },
  PARTIAL_DISPOSAL: { label: "Ghi giảm 1 phần", icon: Scissors, color: "bg-rose-500/10 text-rose-600", help: "Thanh lý/nhượng bán theo tỉ lệ. Nợ 214/811 / Có 211; thu Nợ 111/Có 711." },
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("vi-VN").format(Math.round(Number(n)));
}

export const Route = createFileRoute("/_app/assets/events")({
  component: EventsPage,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

function EventsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAssetEvents);
  const listAssets = useServerFn(listFixedAssets);
  const create = useServerFn(createAssetEvent);
  const voidIt = useServerFn(voidAssetEvent);

  const [filterType, setFilterType] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EvType>("TRANSFER");
  const [assetId, setAssetId] = useState<string>("");
  const [eventDate, setEventDate] = useState<string>(todayISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [payload, setPayload] = useState<Record<string, any>>({});

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["fa-events", filterType],
    queryFn: () => list({ data: { eventType: filterType === "all" ? undefined : filterType } }),
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["fa-assets-min"],
    queryFn: () => listAssets({}),
  });

  const selectedAsset = useMemo(
    () => assets.find((a: any) => a.id === assetId),
    [assets, assetId]
  );

  const resetForm = () => {
    setType("TRANSFER");
    setAssetId("");
    setEventDate(todayISO());
    setDescription("");
    setAmount("");
    setPayload({});
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        asset_id: assetId,
        event_type: type,
        event_date: eventDate,
        description: description || null,
        amount: amount ? Number(amount) : null,
        payload,
      };
      return create({ data: body });
    },
    onSuccess: (res: any) => {
      toast.success(res.journal_entry_id ? "Đã ghi sổ và tạo bút toán" : "Đã ghi nhận biến động");
      setOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["fa-events"] });
      qc.invalidateQueries({ queryKey: ["fa-assets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      voidIt({ data: { id, reason } }),
    onSuccess: () => {
      toast.success("Đã huỷ biến động (chỉ đánh dấu, không đảo bút toán)");
      qc.invalidateQueries({ queryKey: ["fa-events"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Tài sản
          </Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRightLeft className="h-4 w-4" /> Biến động trong kỳ
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Biến động tài sản</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Điều chuyển, đánh giá lại, sửa chữa lớn ghi tăng nguyên giá, ghi giảm 1 phần.
            Hệ thống tự sinh bút toán theo TT200 và cập nhật nguyên giá trong mọi sổ khấu hao.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Tạo biến động
        </Button>
      </div>

      {/* Type cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(TYPE_META) as EvType[]).map((t) => {
          const M = TYPE_META[t];
          const Icon = M.icon;
          return (
            <Card
              key={t}
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={() => { resetForm(); setType(t); setOpen(true); }}
            >
              <CardContent className="p-4 space-y-2">
                <div className={`h-9 w-9 rounded-md flex items-center justify-center ${M.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-medium">{M.label}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{M.help}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter + list */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 p-3 border-b">
            <Label className="text-xs text-muted-foreground">Lọc loại:</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {(Object.keys(TYPE_META) as EvType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Tài sản</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Mô tả</TableHead>
                <TableHead>Bút toán</TableHead>
                <TableHead>TT</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Đang tải…</TableCell></TableRow>
              )}
              {!isLoading && events.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Chưa có biến động nào.</TableCell></TableRow>
              )}
              {events.map((ev: any) => {
                const M = TYPE_META[ev.event_type as EvType];
                const Icon = M?.icon ?? FileText;
                return (
                  <TableRow key={ev.id}>
                    <TableCell className="text-xs">{ev.event_date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{ev.asset?.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{ev.asset?.code}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${M?.color ?? ""}`}>
                        <Icon className="h-3 w-3" />
                        {M?.label ?? ev.event_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(ev.amount)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs">{ev.description}</TableCell>
                    <TableCell>
                      {ev.journal_entry_id
                        ? <Badge variant="default" className="text-xs">Đã hạch toán</Badge>
                        : <Badge variant="outline" className="text-xs">Không sinh JE</Badge>}
                    </TableCell>
                    <TableCell>
                      {ev.status === "void"
                        ? <Badge variant="destructive" className="text-xs">Đã huỷ</Badge>
                        : <Badge variant="secondary" className="text-xs">Đã ghi</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(ev.event_type === "MAJOR_REPAIR" || ev.event_type === "REVALUATION") && (
                          <Button asChild size="icon" variant="ghost" title="In chứng từ">
                            <Link to="/assets/event/$id/print" params={{ id: ev.id }}>
                              <Printer className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                        {ev.status !== "void" && (
                          <Button size="icon" variant="ghost" title="Huỷ biến động"
                            onClick={() => {
                              const reason = prompt("Lý do huỷ?");
                              if (reason !== null) voidMut.mutate({ id: ev.id, reason });
                            }}>
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Biến động tài sản — {TYPE_META[type].label}</DialogTitle>
            <DialogDescription>{TYPE_META[type].help}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label>Loại</Label>
                <Select value={type} onValueChange={(v) => { setType(v as EvType); setPayload({}); setAmount(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_META) as EvType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Ngày phát sinh</Label>
                <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="col-span-1">
                <Label>Tài sản *</Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger><SelectValue placeholder="Chọn tài sản" /></SelectTrigger>
                  <SelectContent>
                    {assets.filter((a: any) => a.status !== "disposed").map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedAsset && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div>Nguyên giá hiện tại: <span className="font-semibold tabular-nums">{fmt(selectedAsset.cost)} ₫</span></div>
                {selectedAsset.location && <div>Vị trí: {selectedAsset.location}</div>}
              </div>
            )}

            {/* Type-specific fields */}
            {type === "TRANSFER" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vị trí mới" value={payload.to_location ?? ""} onChange={(v) => setPayload({ ...payload, to_location: v })} placeholder="VD: Kho A, tầng 2" />
                <Field label="Mã bộ phận mới (UUID)" value={payload.to_department_id ?? ""} onChange={(v) => setPayload({ ...payload, to_department_id: v || null })} placeholder="Tuỳ chọn" />
                <Field label="Mã chi nhánh mới (UUID)" value={payload.to_branch_id ?? ""} onChange={(v) => setPayload({ ...payload, to_branch_id: v || null })} placeholder="Tuỳ chọn" />
                <Field label="Người sử dụng mới (UUID)" value={payload.to_assignee_id ?? ""} onChange={(v) => setPayload({ ...payload, to_assignee_id: v || null })} placeholder="Tuỳ chọn" />
              </div>
            )}

            {type === "REVALUATION" && (
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Nguyên giá cũ"
                  value={payload.old_cost ?? (selectedAsset?.cost ?? "")}
                  onChange={(v) => setPayload({ ...payload, old_cost: Number(v) })}
                  type="number"
                />
                <Field
                  label="Nguyên giá mới *"
                  value={payload.new_cost ?? ""}
                  onChange={(v) => setPayload({ ...payload, new_cost: Number(v) })}
                  type="number"
                />
                <Field
                  label="TK đánh giá lại"
                  value={payload.revaluation_account ?? "412"}
                  onChange={(v) => setPayload({ ...payload, revaluation_account: v })}
                />
              </div>
            )}

            {type === "MAJOR_REPAIR" && (
              <div className="grid grid-cols-3 gap-3">
                <Field
                  label="Số tiền ghi tăng *"
                  value={amount}
                  onChange={setAmount}
                  type="number"
                />
                <Field
                  label="TK tài sản"
                  value={payload.asset_account ?? selectedAsset?.asset_account ?? "211"}
                  onChange={(v) => setPayload({ ...payload, asset_account: v })}
                />
                <Field
                  label="TK nguồn (Có)"
                  value={payload.source_account ?? "2413"}
                  onChange={(v) => setPayload({ ...payload, source_account: v })}
                />
              </div>
            )}

            {type === "PARTIAL_DISPOSAL" && (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Tỉ lệ ghi giảm (%) *"
                  value={payload.disposal_ratio != null ? String(Number(payload.disposal_ratio) * 100) : ""}
                  onChange={(v) => setPayload({ ...payload, disposal_ratio: Number(v) / 100 })}
                  type="number"
                  placeholder="VD: 30"
                />
                <Field
                  label="Thu thanh lý"
                  value={payload.proceeds ?? "0"}
                  onChange={(v) => setPayload({ ...payload, proceeds: Number(v) })}
                  type="number"
                />
                <Field
                  label="TK thu (Nợ)"
                  value={payload.proceeds_account ?? "1111"}
                  onChange={(v) => setPayload({ ...payload, proceeds_account: v })}
                />
                <Field
                  label="TK thu nhập khác"
                  value={payload.other_income_account ?? "711"}
                  onChange={(v) => setPayload({ ...payload, other_income_account: v })}
                />
                <Field
                  label="TK chi phí khác"
                  value={payload.other_expense_account ?? "811"}
                  onChange={(v) => setPayload({ ...payload, other_expense_account: v })}
                />
              </div>
            )}

            <div>
              <Label>Mô tả</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ghi chú thêm…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button
              disabled={!assetId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Đang ghi…" : "Ghi nhận biến động"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
