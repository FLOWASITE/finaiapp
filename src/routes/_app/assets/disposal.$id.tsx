import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDisposalPrint } from "@/lib/fa-prints.functions";

export const Route = createFileRoute("/_app/assets/disposal/$id")({ component: DisposalPrintPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

const TYPE_LABEL: Record<string, string> = {
  liquidation: "Thanh lý",
  sale: "Nhượng bán",
  loss: "Mất / Hư hỏng",
  donation: "Biếu tặng",
  capital_contribution: "Góp vốn",
};

function DisposalPrintPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getDisposalPrint);
  const { data, isLoading } = useQuery({
    queryKey: ["fa_disposal_print", id],
    queryFn: () => fn({ data: { disposal_id: id } }),
  });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;
  const d = data.disposal;
  const a = d.asset;
  const t = data.tenant;
  const dt = new Date(d.disposal_date);

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/assets/disposal"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Biên bản thanh lý TSCĐ</h1>
        </div>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />In</Button>
      </div>

      <div className="bg-white p-10 print:p-0 max-w-4xl mx-auto text-[13px] leading-relaxed font-serif print:font-serif">
        <div className="flex justify-between text-xs">
          <div>
            <div className="font-bold uppercase">{t.name || "—"}</div>
            <div>Địa chỉ: {t.address || "—"}</div>
            <div>MST: {t.tax_id || "—"}</div>
          </div>
          <div className="text-right">
            <div>Mẫu số 02-TSCĐ</div>
            <div className="italic text-[11px]">(Ban hành theo TT 200/2014/TT-BTC)</div>
          </div>
        </div>

        <h1 className="text-center font-bold text-xl mt-6">BIÊN BẢN THANH LÝ TSCĐ</h1>
        <div className="text-center italic mt-1">
          Ngày {dt.getDate()} tháng {dt.getMonth() + 1} năm {dt.getFullYear()}
        </div>
        <div className="text-center mt-1">Số: <strong>{a.code}/TL</strong></div>

        <p className="mt-6">Căn cứ Quyết định số …………… ngày …… tháng …… năm …… về việc <strong>{TYPE_LABEL[d.disposal_type] || d.disposal_type}</strong> TSCĐ.</p>

        <p className="mt-3 font-bold">I. Ban thanh lý TSCĐ gồm:</p>
        <ul className="list-disc ml-8 mt-1 space-y-1">
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Trưởng ban</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Uỷ viên</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Uỷ viên</li>
        </ul>

        <p className="mt-3 font-bold">II. Tiến hành thanh lý TSCĐ:</p>
        <div className="ml-4 space-y-1">
          <div>- Tên, ký hiệu, quy cách: <strong>{a.name}</strong> {a.model ? `(Model: ${a.model})` : ""}</div>
          <div>- Số hiệu TSCĐ: <strong>{a.code}</strong></div>
          <div>- Nước sản xuất: {a.origin_country || "—"} — Năm SX: {a.mfg_year || "—"}</div>
          <div>- Năm đưa vào sử dụng: {(a.in_service_date || a.start_date || "").slice(0, 7)}</div>
          <div>- Nguyên giá: <strong>{fmt(d.cost_snapshot)} đ</strong></div>
          <div>- Giá trị hao mòn đã trích đến thời điểm thanh lý: <strong>{fmt(d.accumulated_snapshot)} đ</strong></div>
          <div>- Giá trị còn lại của TSCĐ: <strong>{fmt(d.residual_value)} đ</strong></div>
          <div>- Lý do thanh lý: <em>{d.reason || "……………………………………"}</em></div>
        </div>

        <p className="mt-3 font-bold">III. Kết luận của Ban thanh lý:</p>
        <div className="border border-foreground/40 min-h-[60px] p-2">
          {d.notes || "……………………………………………………………………………………"}
        </div>

        <p className="mt-3 font-bold">IV. Kết quả thanh lý:</p>
        <Table className="mt-2 border [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[12px]">
          <TableHeader>
            <TableRow>
              <TableHead>Khoản mục</TableHead>
              <TableHead className="text-right">Số tiền (đ)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow><TableCell>Thu từ thanh lý / nhượng bán</TableCell><TableCell className="text-right">{fmt(d.sale_amount)}</TableCell></TableRow>
            <TableRow><TableCell>Thuế GTGT đầu ra</TableCell><TableCell className="text-right">{fmt(d.sale_vat)}</TableCell></TableRow>
            <TableRow><TableCell>Chi phí thanh lý</TableCell><TableCell className="text-right">({fmt(d.disposal_cost)})</TableCell></TableRow>
            <TableRow><TableCell>Giá trị còn lại</TableCell><TableCell className="text-right">({fmt(d.residual_value)})</TableCell></TableRow>
            <TableRow className="font-bold">
              <TableCell>{Number(d.gain_loss) >= 0 ? "Lãi (Có 711)" : "Lỗ (Nợ 811)"}</TableCell>
              <TableCell className="text-right">{fmt(Math.abs(Number(d.gain_loss)))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {data.buyer ? (
          <div className="mt-3">
            <strong>Người mua:</strong> {data.buyer.name}
            {data.buyer.tax_id ? ` — MST: ${data.buyer.tax_id}` : ""}
            {data.buyer.address ? <div>Địa chỉ: {data.buyer.address}</div> : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-4 pt-12 text-center text-[12px]">
          <div><div className="font-bold">Giám đốc</div><div className="italic">(Ký, họ tên, đóng dấu)</div></div>
          <div><div className="font-bold">Kế toán trưởng</div><div className="italic">(Ký, họ tên)</div></div>
          <div><div className="font-bold">Trưởng ban thanh lý</div><div className="italic">(Ký, họ tên)</div></div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4; margin: 12mm; } body { background: white; } }`}</style>
    </div>
  );
}
