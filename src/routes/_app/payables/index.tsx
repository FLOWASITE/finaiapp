import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listPayables, recordPayment } from "@/lib/payables.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/payables/")({ component: PayablesPage });

const fmt = (n: number) => n.toLocaleString("vi-VN");

function PayablesPage() {
  const list = useServerFn(listPayables);
  const pay = useServerFn(recordPayment);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({ queryKey: ["payables"], queryFn: () => list() });
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<any>(null);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "bank">("bank");

  const mutate = useMutation({
    mutationFn: (v: any) => pay({ data: v }),
    onSuccess: () => { toast.success("Đã ghi nhận thanh toán"); setOpen(false); qc.invalidateQueries({ queryKey: ["payables"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const buckets = data.reduce((acc: any, r: any) => {
    if (r.remaining > 0) acc[r.bucket] = (acc[r.bucket] ?? 0) + r.remaining;
    return acc;
  }, { "0-30": 0, "31-60": 0, "61-90": 0, ">90": 0 });

  const totalRemaining = data.reduce((s: number, r: any) => s + Math.max(0, r.remaining), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Công nợ phải trả</h1>
        <p className="text-sm text-muted-foreground">Theo dõi dư nợ nhà cung cấp và tuổi nợ</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Tổng phải trả</CardTitle></CardHeader>
          <CardContent className="text-xl font-semibold">{fmt(totalRemaining)}</CardContent></Card>
        {(["0-30", "31-60", "61-90", ">90"] as const).map((b) => (
          <Card key={b}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{b} ngày</CardTitle></CardHeader>
            <CardContent className={`text-xl font-semibold ${b === ">90" ? "text-destructive" : ""}`}>{fmt(buckets[b])}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Danh sách hoá đơn mua</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p>Đang tải…</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Số HĐ</TableHead><TableHead>NCC</TableHead><TableHead>Ngày</TableHead>
                <TableHead className="text-right">Tổng</TableHead><TableHead className="text-right">Đã trả</TableHead>
                <TableHead className="text-right">Còn nợ</TableHead><TableHead>Tuổi nợ</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.invoice_no ?? "—"}</TableCell>
                    <TableCell>{r.supplier_name ?? "—"}</TableCell>
                    <TableCell>{r.issue_date}</TableCell>
                    <TableCell className="text-right">{fmt(Number(r.total ?? 0))}</TableCell>
                    <TableCell className="text-right">{fmt(r.paid)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.remaining)}</TableCell>
                    <TableCell>
                      {r.remaining > 0 && (
                        <Badge variant={r.bucket === ">90" ? "destructive" : "secondary"}>{r.days}d</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.remaining > 0 && (
                        <Button size="sm" variant="outline"
                          onClick={() => { setSelected(r); setAmount(String(r.remaining)); setOpen(true); }}>
                          Thanh toán
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ghi nhận thanh toán</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nhà cung cấp</Label><div className="text-sm">{selected?.supplier_name}</div></div>
            <div><Label>HĐ</Label><div className="text-sm">{selected?.invoice_no} — còn nợ {fmt(selected?.remaining ?? 0)}</div></div>
            <div><Label>Số tiền</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Phương thức</Label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Chuyển khoản</SelectItem>
                  <SelectItem value="cash">Tiền mặt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={mutate.isPending} onClick={() => mutate.mutate({
              invoice_id: selected.id, supplier_id: selected.supplier_id,
              supplier_name: selected.supplier_name, amount: Number(amount),
              pay_date: new Date().toISOString().slice(0, 10), method,
            })}>Ghi nhận</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
