import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Plus, Ban, TrendingDown, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { listFixedAssets } from "@/lib/assets.functions";
import { listDisposals, createDisposal, voidDisposal, previewDisposal } from "@/lib/fa-disposals.functions";
import { AccountCombobox } from "@/components/ui/account-combobox";

export const Route = createFileRoute("/_app/assets/disposal")({ component: DisposalPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

const TYPES: Record<string, string> = {
  liquidation: "Thanh lý",
  sale: "Nhượng bán",
  loss: "Mất / Hỏng",
  donation: "Biếu tặng",
  capital_contribution: "Góp vốn",
};

function DisposalPage() {
  const qc = useQueryClient();
  const listAssetsFn = useServerFn(listFixedAssets);
  const listFn = useServerFn(listDisposals);
  const createFn = useServerFn(createDisposal);
  const voidFn = useServerFn(voidDisposal);
  const previewFn = useServerFn(previewDisposal);

  const assets = useQuery({ queryKey: ["fixed_assets_list"], queryFn: () => listAssetsFn() });
  const rows = useQuery({ queryKey: ["fa_disposals"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    asset_id: "",
    disposal_date: new Date().toISOString().slice(0, 10),
    disposal_type: "liquidation" as keyof typeof TYPES,
    reason: "",
    sale_amount: 0, sale_vat: 0,
    proceeds_account: "1111", vat_output_account: "33311",
    disposal_cost: 0, disposal_cost_account: "1111",
    other_income_account: "711", other_expense_account: "811",
    notes: "",
  });

  const preview = useQuery({
    queryKey: ["disposal_preview", form.asset_id, form.sale_amount, form.disposal_cost],
    queryFn: () => previewFn({ data: { asset_id: form.asset_id, sale_amount: Number(form.sale_amount), disposal_cost: Number(form.disposal_cost) } }),
    enabled: !!form.asset_id && step >= 2,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: { ...form, sale_amount: Number(form.sale_amount), sale_vat: Number(form.sale_vat), disposal_cost: Number(form.disposal_cost) } as any }),
    onSuccess: (r: any) => {
      toast.success(`Đã ghi giảm tài sản. Lãi/lỗ: ${fmt(r.gain_loss)} ₫`);
      qc.invalidateQueries({ queryKey: ["fa_disposals"] });
      qc.invalidateQueries({ queryKey: ["fixed_assets"] });
      qc.invalidateQueries({ queryKey: ["fixed_assets_list"] });
      setOpen(false); setStep(1);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reset = () => { setStep(1); setForm({ ...form, asset_id: "", sale_amount: 0, sale_vat: 0, disposal_cost: 0, reason: "", notes: "" }); };

  const activeAssets = useMemo(() => (assets.data ?? []).filter((a: any) => a.status !== "disposed"), [assets.data]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><TrendingDown className="h-7 w-7 text-rose-500" />Thanh lý / Nhượng bán TSCĐ</h1>
            <p className="text-sm text-muted-foreground">Ghi giảm toàn bộ tài sản — tự động hạch toán bút toán theo TT200.</p>
          </div>
        </div>
        <Button onClick={() => { reset(); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Lập phiếu ghi giảm</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Tài sản</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Nguyên giá</TableHead>
                <TableHead className="text-right">KH luỹ kế</TableHead>
                <TableHead className="text-right">GT còn lại</TableHead>
                <TableHead className="text-right">Thu</TableHead>
                <TableHead className="text-right">Lãi/Lỗ</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows.data ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Calendar className="h-3 w-3 inline mr-1" />{r.disposal_date}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.asset?.name}</div>
                    <div className="text-xs text-muted-foreground">{r.asset?.code}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{TYPES[r.disposal_type] || r.disposal_type}</Badge></TableCell>
                  <TableCell className="text-right">{fmt(r.cost_snapshot)}</TableCell>
                  <TableCell className="text-right">{fmt(r.accumulated_snapshot)}</TableCell>
                  <TableCell className="text-right">{fmt(r.residual_value)}</TableCell>
                  <TableCell className="text-right">{fmt(r.sale_amount)}</TableCell>
                  <TableCell className={`text-right ${Number(r.gain_loss) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(r.gain_loss)}</TableCell>
                  <TableCell>
                    {r.status === "void" ? <Badge variant="destructive">Đã huỷ</Badge> : <Badge>Đã ghi</Badge>}
                    {r.journal_entry_id && <Badge variant="outline" className="ml-1"><FileText className="h-3 w-3 mr-1" />JE</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button asChild variant="ghost" size="icon" title="In biên bản (02-TSCĐ)">
                      <Link to="/assets/disposal/$id" params={{ id: r.id }}><FileText className="h-4 w-4" /></Link>
                    </Button>
                    {r.status !== "void" && (
                      <Button variant="ghost" size="icon" onClick={() => {
                        const reason = prompt("Lý do huỷ?");
                        if (reason !== null) voidFn({ data: { id: r.id, reason } }).then(() => { toast.success("Đã huỷ"); qc.invalidateQueries({ queryKey: ["fa_disposals"] }); });
                      }}><Ban className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(rows.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Chưa có phiếu ghi giảm</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Wizard ghi giảm TSCĐ — Bước {step}/4</DialogTitle>
            <DialogDescription>
              {step === 1 && "Chọn tài sản và loại nghiệp vụ"}
              {step === 2 && "Số tiền thu & chi phí thanh lý"}
              {step === 3 && "Tài khoản hạch toán"}
              {step === 4 && "Xem trước bút toán & xác nhận"}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Tài sản</Label>
                <Select value={form.asset_id} onValueChange={v => setForm(f => ({ ...f, asset_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Chọn tài sản…" /></SelectTrigger>
                  <SelectContent>
                    {activeAssets.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ngày ghi giảm</Label>
                  <Input type="date" value={form.disposal_date} onChange={e => setForm(f => ({ ...f, disposal_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Loại</Label>
                  <Select value={form.disposal_type} onValueChange={v => setForm(f => ({ ...f, disposal_type: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Lý do</Label>
                <Textarea rows={2} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Hết khấu hao, hư hỏng, không còn nhu cầu sử dụng…" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {preview.data && (
                <Card className="bg-muted/30">
                  <CardContent className="grid grid-cols-3 gap-3 py-3 text-sm">
                    <div><div className="text-muted-foreground">Nguyên giá</div><div className="font-semibold">{fmt(preview.data.cost)}</div></div>
                    <div><div className="text-muted-foreground">KH luỹ kế</div><div className="font-semibold">{fmt(preview.data.accumulated)}</div></div>
                    <div><div className="text-muted-foreground">GT còn lại</div><div className="font-semibold">{fmt(preview.data.residual)}</div></div>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Giá bán (chưa VAT)</Label><Input type="number" value={form.sale_amount} onChange={e => setForm(f => ({ ...f, sale_amount: Number(e.target.value) }))} /></div>
                <div><Label>VAT đầu ra</Label><Input type="number" value={form.sale_vat} onChange={e => setForm(f => ({ ...f, sale_vat: Number(e.target.value) }))} /></div>
                <div><Label>Chi phí thanh lý</Label><Input type="number" value={form.disposal_cost} onChange={e => setForm(f => ({ ...f, disposal_cost: Number(e.target.value) }))} /></div>
                <div><Label>Ghi chú</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              </div>
              {preview.data && (
                <div className={`text-sm font-medium ${preview.data.gain_loss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  Lãi/Lỗ dự kiến: {fmt(preview.data.gain_loss)} ₫
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>TK thu tiền</Label>
                <AccountCombobox value={form.proceeds_account} onChange={v => setForm(f => ({ ...f, proceeds_account: v }))}
                  suggestions={[{code:"1111",name:"Tiền mặt VND"},{code:"1121",name:"TGNH VND"},{code:"131",name:"Phải thu khách hàng"},{code:"1388",name:"Phải thu khác"}]} />
              </div>
              <div><Label>TK VAT đầu ra</Label>
                <AccountCombobox value={form.vat_output_account} onChange={v => setForm(f => ({ ...f, vat_output_account: v }))}
                  suggestions={[{code:"33311",name:"Thuế GTGT đầu ra"},{code:"3331",name:"Thuế GTGT phải nộp"}]} />
              </div>
              <div><Label>TK thu nhập khác (711)</Label>
                <AccountCombobox value={form.other_income_account} onChange={v => setForm(f => ({ ...f, other_income_account: v }))}
                  suggestions={[{code:"711",name:"Thu nhập khác"},{code:"515",name:"DT hoạt động tài chính"}]} />
              </div>
              <div><Label>TK chi phí khác (811)</Label>
                <AccountCombobox value={form.other_expense_account} onChange={v => setForm(f => ({ ...f, other_expense_account: v }))}
                  suggestions={[{code:"811",name:"Chi phí khác"},{code:"635",name:"Chi phí tài chính"}]} />
              </div>
              <div><Label>TK trả chi phí thanh lý</Label>
                <AccountCombobox value={form.disposal_cost_account} onChange={v => setForm(f => ({ ...f, disposal_cost_account: v }))}
                  suggestions={[{code:"1111",name:"Tiền mặt VND"},{code:"1121",name:"TGNH VND"},{code:"331",name:"Phải trả NCC"}]} />
              </div>
            </div>
          )}

          {step === 4 && preview.data && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 space-y-1 font-mono">
                {Number(preview.data.accumulated) > 0 && <div>Nợ {form.other_expense_account === "811" ? "214" : "214"} : {fmt(preview.data.accumulated)}</div>}
                {Number(preview.data.residual) > 0 && <div>Nợ {form.other_expense_account} : {fmt(preview.data.residual)}</div>}
                <div className="text-rose-600">Có 211 : {fmt(preview.data.cost)}</div>
                {Number(form.sale_amount) + Number(form.sale_vat) > 0 && (
                  <>
                    <div className="border-t pt-1 mt-1">Nợ {form.proceeds_account} : {fmt(Number(form.sale_amount) + Number(form.sale_vat))}</div>
                    {Number(form.sale_amount) > 0 && <div className="text-emerald-600">Có {form.other_income_account} : {fmt(form.sale_amount)}</div>}
                    {Number(form.sale_vat) > 0 && <div className="text-emerald-600">Có {form.vat_output_account} : {fmt(form.sale_vat)}</div>}
                  </>
                )}
                {Number(form.disposal_cost) > 0 && (
                  <>
                    <div className="border-t pt-1 mt-1">Nợ {form.other_expense_account} : {fmt(form.disposal_cost)}</div>
                    <div className="text-emerald-600">Có {form.disposal_cost_account} : {fmt(form.disposal_cost)}</div>
                  </>
                )}
              </div>
              <div className={`text-sm font-semibold ${preview.data.gain_loss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                Kết quả: {preview.data.gain_loss >= 0 ? "Lãi" : "Lỗ"} {fmt(Math.abs(preview.data.gain_loss))} ₫
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <div>
              {step > 1 && <Button variant="ghost" onClick={() => setStep(step - 1)}>← Quay lại</Button>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
              {step < 4 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !form.asset_id}>Tiếp →</Button>
              ) : (
                <Button onClick={() => create.mutate()} disabled={create.isPending}>Ghi nhận</Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
