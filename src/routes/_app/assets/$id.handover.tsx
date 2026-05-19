import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getHandoverPrint } from "@/lib/fa-prints.functions";

export const Route = createFileRoute("/_app/assets/$id/handover")({ component: HandoverPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

function HandoverPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getHandoverPrint);
  const { data, isLoading } = useQuery({
    queryKey: ["fa_handover_print", id],
    queryFn: () => fn({ data: { asset_id: id } }),
  });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;
  const a = data.asset;
  const t = data.tenant;
  const today = new Date();

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/assets"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Biên bản giao nhận TSCĐ</h1>
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
            <div>Mẫu số 01-TSCĐ</div>
            <div className="italic text-[11px]">(Ban hành theo TT 200/2014/TT-BTC)</div>
          </div>
        </div>

        <h1 className="text-center font-bold text-xl mt-6">BIÊN BẢN GIAO NHẬN TÀI SẢN CỐ ĐỊNH</h1>
        <div className="text-center italic mt-1">
          Ngày {today.getDate()} tháng {today.getMonth() + 1} năm {today.getFullYear()}
        </div>
        <div className="text-center mt-1">Số: <strong>{a.code}</strong></div>

        <p className="mt-6">Căn cứ Quyết định số …………… ngày …… tháng …… năm …… của …………… về việc bàn giao TSCĐ.</p>
        <p className="mt-2">Ban giao nhận TSCĐ gồm:</p>
        <ul className="list-disc ml-8 mt-1 space-y-1">
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Đại diện bên giao</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Đại diện bên nhận</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Đại diện ……………………</li>
        </ul>

        <p className="mt-4">
          Địa điểm giao nhận TSCĐ: <strong>{a.location || "……………………………………"}</strong>
        </p>
        <p>
          Xác nhận việc giao nhận TSCĐ như sau:
        </p>

        <Table className="mt-3 border [&_*]:border-foreground/60 [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[12px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">STT</TableHead>
              <TableHead>Tên, ký hiệu, quy cách</TableHead>
              <TableHead>Số hiệu TSCĐ</TableHead>
              <TableHead>Nước SX</TableHead>
              <TableHead>Năm SX</TableHead>
              <TableHead>Năm đưa vào SD</TableHead>
              <TableHead>Công suất</TableHead>
              <TableHead className="text-right">Nguyên giá</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="text-center">A</TableHead>
              <TableHead>B</TableHead>
              <TableHead>C</TableHead>
              <TableHead>D</TableHead>
              <TableHead>1</TableHead>
              <TableHead>2</TableHead>
              <TableHead>3</TableHead>
              <TableHead className="text-right">4</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-center">1</TableCell>
              <TableCell>
                <strong>{a.name}</strong>
                {a.model ? <div className="text-xs">Model: {a.model}</div> : null}
                {a.serial_no ? <div className="text-xs">S/N: {a.serial_no}</div> : null}
              </TableCell>
              <TableCell>{a.code}</TableCell>
              <TableCell>{a.origin_country || "—"}</TableCell>
              <TableCell>{a.mfg_year || "—"}</TableCell>
              <TableCell>{(a.in_service_date || a.start_date || "").slice(0, 10)}</TableCell>
              <TableCell>{a.unit ? `${fmt(a.quantity)} ${a.unit}` : "—"}</TableCell>
              <TableCell className="text-right font-semibold">{fmt(a.cost)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-center font-bold">Cộng</TableCell>
              <TableCell colSpan={6}></TableCell>
              <TableCell className="text-right font-bold">{fmt(a.cost)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-4">
          <div><strong>Phân loại:</strong> {a.fa_categories?.name || "—"}</div>
          <div><strong>Nhà cung cấp:</strong> {a.suppliers?.name || "—"}</div>
          <div><strong>Nguồn vốn:</strong> {a.funding_source || "—"}</div>
          <div><strong>Bộ phận sử dụng:</strong> {a.departments?.name || "—"} {a.branches?.name ? `(${a.branches.name})` : ""}</div>
          <div><strong>Tài khoản:</strong> Nợ {a.asset_account} / KH {a.accumulated_account} / CP {a.expense_account}</div>
          <div><strong>Thời gian khấu hao:</strong> {a.useful_life_months} tháng</div>
        </div>

        <p className="mt-4"><strong>Dụng cụ, phụ tùng kèm theo:</strong></p>
        <Table className="mt-1 border [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[12px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">STT</TableHead>
              <TableHead>Tên, quy cách</TableHead>
              <TableHead>ĐVT</TableHead>
              <TableHead>Số lượng</TableHead>
              <TableHead className="text-right">Giá trị</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3].map(i => (
              <TableRow key={i}>
                <TableCell className="text-center">{i}</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
                <TableCell>&nbsp;</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="grid grid-cols-4 gap-4 pt-12 text-center text-[12px]">
          <div>
            <div className="font-bold">Giám đốc bên nhận</div>
            <div className="italic">(Ký, họ tên, đóng dấu)</div>
          </div>
          <div>
            <div className="font-bold">Kế toán trưởng bên nhận</div>
            <div className="italic">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Đại diện bên giao</div>
            <div className="italic">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Đại diện bên nhận</div>
            <div className="italic">(Ký, họ tên)</div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4; margin: 12mm; } body { background: white; } }`}</style>
    </div>
  );
}
