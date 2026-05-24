import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listFeedbackEvents,
  listPenalties,
  restorePenalty,
} from "@/lib/feedback/feedback.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RotateCcw, AlertTriangle, Activity, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/settings/ai-feedback")({
  component: AiFeedbackPage,
});

const EVENT_LABEL: Record<string, string> = {
  wrong_account: "Sai TK",
  wrong_amount: "Sai số tiền",
  wrong_partner: "Sai đối tác",
  wrong_vat: "Sai VAT",
  duplicate: "Trùng",
  missed_entry: "Bỏ sót",
};

const SOURCE_LABEL: Record<string, string> = {
  reconcile: "Đối soát",
  review: "Soát xét",
  manual: "Thủ công",
};

function AiFeedbackPage() {
  const [tab, setTab] = React.useState("events");
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Phản hồi giữa các AI agent</h1>
        <p className="text-muted-foreground text-sm">
          Khi đối soát phát hiện bút toán lệch, hệ thống tự giảm độ tin cậy của quy tắc / bộ nhớ đã sai và auto-demote nếu sai nhiều lần.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events"><Activity className="w-4 h-4 mr-1" /> Sự kiện gần đây</TabsTrigger>
          <TabsTrigger value="penalties"><AlertTriangle className="w-4 h-4 mr-1" /> Quy tắc bị phạt</TabsTrigger>
          <TabsTrigger value="demoted"><ShieldAlert className="w-4 h-4 mr-1" /> Đã auto-demote</TabsTrigger>
        </TabsList>

        <TabsContent value="events"><EventsTab /></TabsContent>
        <TabsContent value="penalties"><PenaltiesTab onlyDemoted={false} /></TabsContent>
        <TabsContent value="demoted"><PenaltiesTab onlyDemoted={true} /></TabsContent>
      </Tabs>
    </div>
  );
}

function EventsTab() {
  const [source, setSource] = React.useState<"all"|"reconcile"|"review"|"manual">("all");
  const [days, setDays] = React.useState(30);
  const listFn = useServerFn(listFeedbackEvents);
  const { data, isLoading } = useQuery({
    queryKey: ["feedback-events", source, days],
    queryFn: () => listFn({ data: { source, days } }),
  });
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sự kiện phản hồi {days} ngày gần nhất</CardTitle>
        <div className="flex gap-2 mt-2">
          <Select value={source} onValueChange={(v) => setSource(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nguồn</SelectItem>
              <SelectItem value="reconcile">Đối soát</SelectItem>
              <SelectItem value="review">Soát xét</SelectItem>
              <SelectItem value="manual">Thủ công</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Đang tải…</div>
        : rows.length === 0 ? <div className="text-sm text-muted-foreground">Chưa có sự kiện phản hồi nào.</div>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Nguồn</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Mức</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("vi-VN")}</TableCell>
                  <TableCell><Badge variant="outline">{SOURCE_LABEL[r.source_agent] ?? r.source_agent}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={r.severity >= 0.6 ? "destructive" : "secondary"}>
                      {EVENT_LABEL[r.event_type] ?? r.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{Number(r.severity).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-md truncate">{r.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PenaltiesTab({ onlyDemoted }: { onlyDemoted: boolean }) {
  const listFn = useServerFn(listPenalties);
  const restoreFn = useServerFn(restorePenalty);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["penalties", onlyDemoted],
    queryFn: () => listFn({ data: { onlyDemoted } }),
  });
  const mut = useMutation({
    mutationFn: (penaltyId: string) => restoreFn({ data: { penaltyId } }),
    onSuccess: () => {
      toast.success("Đã khôi phục quy tắc");
      qc.invalidateQueries({ queryKey: ["penalties"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi khôi phục"),
  });
  const rows = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {onlyDemoted ? "Quy tắc đã bị auto-demote" : "Quy tắc / bộ nhớ đang bị phạt"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="text-sm text-muted-foreground">Đang tải…</div>
        : rows.length === 0 ? <div className="text-sm text-muted-foreground">Không có dữ liệu.</div>
        : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Đối tượng</TableHead>
                <TableHead>Tên / Mô tả</TableHead>
                <TableHead className="text-right">Điểm phạt</TableHead>
                <TableHead className="text-right">Số lần sai</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Gần nhất</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.target_kind}</Badge></TableCell>
                  <TableCell className="text-sm max-w-md truncate">
                    {r.target_info?.title ?? <span className="text-muted-foreground italic">#{String(r.target_id).slice(0,8)}</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{Number(r.penalty_score).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.wrong_count}</TableCell>
                  <TableCell>
                    {r.auto_demoted_at ? (
                      <Badge variant="destructive">demoted</Badge>
                    ) : r.target_info?.mode === "disabled" ? (
                      <Badge variant="outline">disabled</Badge>
                    ) : (
                      <Badge variant="secondary">{r.target_info?.mode ?? "—"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.last_penalty_at ? new Date(r.last_penalty_at).toLocaleString("vi-VN") : "—"}
                  </TableCell>
                  <TableCell>
                    {r.auto_demoted_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mut.mutate(r.id)}
                        disabled={mut.isPending}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Khôi phục
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
