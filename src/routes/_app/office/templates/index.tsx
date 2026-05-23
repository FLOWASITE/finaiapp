import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listTemplates, upsertTemplate, deleteTemplate, runGenerateNow,
} from "@/lib/office/task-templates.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/office/templates/")({ component: TemplatesPage });

const CATEGORIES = [
  ["vat_filing", "Kê khai VAT"], ["pit", "Thuế TNCN"], ["cit", "Thuế TNDN"],
  ["social_insurance", "BHXH"], ["bookkeeping", "Sổ sách"],
  ["financial_report", "BCTC"], ["internal", "Nội bộ"], ["other", "Khác"],
] as const;

const RULES = [
  ["monthly_day", "Hàng tháng - ngày"],
  ["quarterly", "Hàng quý - ngày"],
  ["yearly", "Hàng năm - tháng/ngày"],
] as const;

const SCOPES = [
  ["all_clients", "Tất cả khách"],
  ["internal", "Nội bộ (không gắn khách)"],
  ["selected", "Khách chọn lọc"],
] as const;

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const delFn = useServerFn(deleteTemplate);
  const runFn = useServerFn(runGenerateNow);
  const { data } = useQuery({ queryKey: ["office", "templates"], queryFn: () => listFn() });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["office", "templates"] }); toast.success("Đã xoá"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["office"] }); toast.success("Đã sinh task cho kỳ hiện tại"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Mẫu công việc định kỳ ({data?.length ?? 0})</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
            <Play className="h-4 w-4 mr-1" />Sinh ngay
          </Button>
          <TemplateDialog />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tiêu đề</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead>Quy tắc</TableHead>
              <TableHead>Phạm vi</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.title}</TableCell>
                <TableCell>{CATEGORIES.find((c) => c[0] === t.category)?.[1] ?? t.category}</TableCell>
                <TableCell>
                  {t.rule_type === "monthly_day" && `Ngày ${t.rule_day} hàng tháng`}
                  {t.rule_type === "quarterly" && `Ngày ${t.rule_day} mỗi quý`}
                  {t.rule_type === "yearly" && `${t.rule_day}/${t.rule_month} hàng năm`}
                </TableCell>
                <TableCell>{SCOPES.find((s) => s[0] === t.scope)?.[1] ?? t.scope}</TableCell>
                <TableCell>
                  <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Bật" : "Tắt"}</Badge>
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!data?.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                  Chưa có mẫu nào
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TemplateDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(upsertTemplate);
  const [f, setF] = useState({
    title: "", category: "other" as any,
    rule_type: "monthly_day" as any, rule_day: 20, rule_month: 3,
    scope: "all_clients" as any, active: true,
  });
  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          title: f.title,
          category: f.category,
          rule_type: f.rule_type,
          rule_day: f.rule_day,
          rule_month: f.rule_type === "yearly" ? f.rule_month : null,
          lead_days: 0,
          scope: f.scope,
          scope_link_ids: [],
          active: f.active,
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu mẫu");
      qc.invalidateQueries({ queryKey: ["office", "templates"] });
      setOpen(false);
      setF({ title: "", category: "other", rule_type: "monthly_day", rule_day: 20, rule_month: 3, scope: "all_clients", active: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Mẫu mới</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo mẫu công việc định kỳ</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tiêu đề *</Label>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="VD: Nộp tờ khai VAT tháng" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Loại</Label>
              <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phạm vi</Label>
              <Select value={f.scope} onValueChange={(v) => setF({ ...f, scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chu kỳ</Label>
              <Select value={f.rule_type} onValueChange={(v) => setF({ ...f, rule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ngày</Label>
              <Input type="number" min={1} max={31} value={f.rule_day}
                onChange={(e) => setF({ ...f, rule_day: Number(e.target.value) })} />
            </div>
            {f.rule_type === "yearly" && (
              <div>
                <Label>Tháng</Label>
                <Input type="number" min={1} max={12} value={f.rule_month}
                  onChange={(e) => setF({ ...f, rule_month: Number(e.target.value) })} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!f.title.trim() || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
