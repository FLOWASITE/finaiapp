import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAssetCard } from "@/lib/fa-reports.functions";

export const Route = createFileRoute("/_app/assets/$id/card")({ component: AssetCardPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

function AssetCardPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAssetCard);
  const { data, isLoading } = useQuery({ queryKey: ["asset_card", id], queryFn: () => fn({ data: { asset_id: id } }) });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;
  const a = data.asset;
  const qrPayload = JSON.stringify({ t: "fa", id: a.id, code: a.code, name: a.name });

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Thẻ Tài sản cố định</h1>
        </div>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />In thẻ</Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8 space-y-6">
          <div className="flex items-start justify-between border-b pb-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Mẫu S23-DN (TT200/2014)</div>
              <h1 className="text-2xl font-bold mt-1">THẺ TÀI SẢN CỐ ĐỊNH</h1>
              <div className="text-sm text-muted-foreground mt-1">Số thẻ: <strong>{a.code}</strong> · Lập ngày: {new Date().toLocaleDateString("vi-VN")}</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <QRCodeSVG value={qrPayload} size={96} />
              <div className="text-[10px] font-mono">{a.code}</div>
            </div>
          </div>

          <section>
            <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase">Thông tin chung</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Tên tài sản:</span> <strong>{a.name}</strong></div>
              <div><span className="text-muted-foreground">Phân loại:</span> {a.fa_categories?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">Nước SX:</span> {a.origin_country ?? "—"}</div>
              <div><span className="text-muted-foreground">Năm SX:</span> {a.mfg_year ?? "—"}</div>
              <div><span className="text-muted-foreground">Hãng SX:</span> {a.manufacturer ?? "—"}</div>
              <div><span className="text-muted-foreground">Model:</span> {a.model ?? "—"}</div>
              <div><span className="text-muted-foreground">Số seri:</span> {a.serial_no ?? "—"}</div>
              <div><span className="text-muted-foreground">Barcode:</span> {a.barcode ?? "—"}</div>
              <div><span className="text-muted-foreground">Nhà cung cấp:</span> {a.suppliers?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">Nguồn vốn:</span> {a.funding_source ?? "—"}</div>
              <div><span className="text-muted-foreground">Chi nhánh:</span> {a.branches?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">Bộ phận:</span> {a.departments?.name ?? "—"}</div>
              <div><span className="text-muted-foreground">Vị trí:</span> {a.location ?? "—"}</div>
              <div><span className="text-muted-foreground">Ngày đưa vào SD:</span> {a.in_service_date ?? a.start_date}</div>
              <div><span className="text-muted-foreground">Trạng thái:</span> <Badge variant="outline">{a.status}</Badge></div>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase">Khấu hao</h2>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Nguyên giá</div><div className="text-lg font-bold">{fmt(a.cost)}</div></div>
              <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Khấu hao luỹ kế</div><div className="text-lg font-bold">{fmt(data.accumulated)}</div></div>
              <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Giá trị còn lại</div><div className="text-lg font-bold text-emerald-700">{fmt(data.nbv)}</div></div>
              <div className="border rounded p-3"><div className="text-xs text-muted-foreground">Thời gian SD</div><div className="text-lg font-bold">{a.useful_life_months} tháng</div></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
              <div><span className="text-muted-foreground">Phương pháp:</span> {a.method}</div>
              <div><span className="text-muted-foreground">TK 211:</span> <code>{a.asset_account}</code></div>
              <div><span className="text-muted-foreground">TK 214/CP:</span> <code>{a.accumulated_account}</code> / <code>{a.expense_account}</code></div>
            </div>
          </section>

          {data.depreciation.length > 0 && (
            <section>
              <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase">Lịch sử khấu hao ({data.book?.name ?? "—"})</h2>
              <Table>
                <TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead className="text-right">Khấu hao</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.depreciation.map((d: any, i: number) => (
                    <TableRow key={i}><TableCell>{String(d.period_month).slice(0, 7)}</TableCell><TableCell className="text-right">{fmt(d.amount)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          {data.events.length > 0 && (
            <section>
              <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase">Biến động</h2>
              <Table>
                <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Loại</TableHead><TableHead>Mô tả</TableHead><TableHead className="text-right">Giá trị</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.events.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.event_date}</TableCell>
                      <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                      <TableCell className="text-sm">{e.description}</TableCell>
                      <TableCell className="text-right">{fmt(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          {(data.disposals.length > 0 || data.reclassifications.length > 0) && (
            <section>
              <h2 className="font-semibold text-sm mb-2 text-muted-foreground uppercase">Ghi giảm / Chuyển loại</h2>
              <Table>
                <TableBody>
                  {data.disposals.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.disposal_date}</TableCell>
                      <TableCell><Badge>{d.disposal_type}</Badge></TableCell>
                      <TableCell className="text-right">Giá trị: {fmt(d.cost_snapshot)} · Lãi/Lỗ: {fmt(d.gain_loss)}</TableCell>
                    </TableRow>
                  ))}
                  {data.reclassifications.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.reclass_date}</TableCell>
                      <TableCell><Badge variant="outline">{r.direction}</Badge></TableCell>
                      <TableCell className="text-right">TK đích: <code>{r.target_account}</code> · Còn lại: {fmt(r.residual_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          <div className="grid grid-cols-3 gap-8 pt-8 text-center text-sm">
            <div><div className="font-semibold">Người lập</div><div className="text-xs text-muted-foreground">(Ký, họ tên)</div></div>
            <div><div className="font-semibold">Kế toán trưởng</div><div className="text-xs text-muted-foreground">(Ký, họ tên)</div></div>
            <div><div className="font-semibold">Giám đốc</div><div className="text-xs text-muted-foreground">(Ký, họ tên, đóng dấu)</div></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
