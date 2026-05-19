import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getEventPrint } from "@/lib/fa-prints.functions";

export const Route = createFileRoute("/_app/assets/event/$id/print")({ component: EventPrintPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

function EventPrintPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getEventPrint);
  const { data, isLoading } = useQuery({
    queryKey: ["fa_event_print", id],
    queryFn: () => fn({ data: { event_id: id } }),
  });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;
  const ev = data.event;
  const a = ev.asset;
  const t = data.tenant;
  const dt = new Date(ev.event_date);
  const nbv = Math.max(0, Number(a.cost) - Number(data.accumulated ?? 0));

  const isMajorRepair = ev.event_type === "MAJOR_REPAIR";
  const isReval = ev.event_type === "REVALUATION";
  const isTransfer = ev.event_type === "TRANSFER";
  const formNo = isMajorRepair ? "03-TSCĐ" : isReval ? "04-TSCĐ" : "—";
  const formTitle = isMajorRepair
    ? "BIÊN BẢN GIAO NHẬN TSCĐ SỬA CHỮA LỚN HOÀN THÀNH"
    : isReval
    ? "BIÊN BẢN ĐÁNH GIÁ LẠI TSCĐ"
    : isTransfer
    ? "BIÊN BẢN ĐIỀU CHUYỂN TSCĐ"
    : "BIÊN BẢN GHI GIẢM 1 PHẦN TSCĐ";

  const p: any = ev.payload ?? {};

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/assets/events"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Chứng từ biến động TSCĐ — {formNo}</h1>
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
            <div>Mẫu số {formNo}</div>
            <div className="italic text-[11px]">(Ban hành theo TT 200/2014/TT-BTC)</div>
          </div>
        </div>

        <h1 className="text-center font-bold text-xl mt-6">{formTitle}</h1>
        <div className="text-center italic mt-1">
          Ngày {dt.getDate()} tháng {dt.getMonth() + 1} năm {dt.getFullYear()}
        </div>
        <div className="text-center mt-1">Số: <strong>{ev.id.slice(0, 8).toUpperCase()}</strong></div>

        <p className="mt-6">Căn cứ Quyết định số …………… ngày …… tháng …… năm …… của ……………</p>
        <p className="mt-2">Ban kiểm nghiệm/đánh giá gồm:</p>
        <ul className="list-disc ml-8 mt-1 space-y-1">
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Trưởng ban</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Uỷ viên</li>
          <li>Ông/Bà: …………………………………… Chức vụ: …………………… Uỷ viên</li>
        </ul>

        <div className="mt-4 space-y-1">
          <div><strong>Tên TSCĐ:</strong> {a.name}</div>
          <div><strong>Số hiệu TSCĐ:</strong> {a.code}</div>
          <div><strong>Phân loại:</strong> {a.fa_categories?.name || "—"}</div>
          <div><strong>Bộ phận sử dụng:</strong> {a.departments?.name || "—"} {a.branches?.name ? `(${a.branches.name})` : ""}</div>
        </div>

        {isMajorRepair && (
          <>
            <h3 className="font-bold mt-5">I. Kết quả kiểm nghiệm sửa chữa lớn</h3>
            <Table className="mt-2 border [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[12px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nội dung</TableHead>
                  <TableHead className="text-right">Dự toán</TableHead>
                  <TableHead className="text-right">Thực tế</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Giá trị sửa chữa lớn ghi tăng nguyên giá</TableCell>
                  <TableCell className="text-right">{fmt(ev.amount)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(ev.amount)}</TableCell>
                  <TableCell>{ev.description || ""}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="mt-3 space-y-1">
              <div><strong>Nguyên giá sau sửa chữa:</strong> {fmt(a.cost)} ₫</div>
              <div><strong>Tài khoản hạch toán:</strong> Nợ {p.asset_account || "211"} / Có {p.source_account || "2413"}</div>
              {p.extend_useful_life_months ? (
                <div><strong>Gia hạn thời gian khấu hao:</strong> +{p.extend_useful_life_months} tháng</div>
              ) : null}
            </div>
            <p className="mt-3 italic">
              Kết luận: Công trình sửa chữa lớn đã hoàn thành đúng thiết kế, đảm bảo chất lượng,
              đủ điều kiện đưa vào sử dụng và ghi tăng nguyên giá TSCĐ.
            </p>
          </>
        )}

        {isReval && (
          <>
            <h3 className="font-bold mt-5">I. Kết quả đánh giá lại</h3>
            <Table className="mt-2 border [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[12px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Chỉ tiêu</TableHead>
                  <TableHead className="text-right">Giá trị sổ sách</TableHead>
                  <TableHead className="text-right">Giá trị đánh giá lại</TableHead>
                  <TableHead className="text-right">Chênh lệch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Nguyên giá</TableCell>
                  <TableCell className="text-right">{fmt(p.old_cost)}</TableCell>
                  <TableCell className="text-right">{fmt(p.new_cost)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {Number(p.new_cost) >= Number(p.old_cost) ? "+" : "−"}{fmt(Math.abs(Number(p.new_cost) - Number(p.old_cost)))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Khấu hao luỹ kế tại thời điểm đánh giá</TableCell>
                  <TableCell className="text-right">{fmt(data.accumulated)}</TableCell>
                  <TableCell className="text-right">{fmt(data.accumulated)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Giá trị còn lại</TableCell>
                  <TableCell className="text-right">{fmt(Number(p.old_cost) - Number(data.accumulated))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(nbv)}</TableCell>
                  <TableCell className="text-right">—</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="mt-3 space-y-1">
              <div><strong>Tài khoản chênh lệch đánh giá lại:</strong> {p.revaluation_account || "412"}</div>
              <div><strong>Lý do đánh giá lại:</strong> {ev.description || "……………………………………"}</div>
            </div>
            <p className="mt-3 italic">
              Kết luận: Hội đồng nhất trí kết quả đánh giá lại nêu trên và đề nghị điều chỉnh
              nguyên giá TSCĐ trong sổ sách kế toán.
            </p>
          </>
        )}

        {!isMajorRepair && !isReval && (
          <div className="mt-4 whitespace-pre-line">
            {ev.description || "Chứng từ ghi nhận biến động TSCĐ."}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 pt-12 text-center text-[12px]">
          <div>
            <div className="font-bold">Trưởng ban</div>
            <div className="italic">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Kế toán trưởng</div>
            <div className="italic">(Ký, họ tên)</div>
          </div>
          <div>
            <div className="font-bold">Giám đốc</div>
            <div className="italic">(Ký, họ tên, đóng dấu)</div>
          </div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4; margin: 12mm; } body { background: white; } }`}</style>
    </div>
  );
}
