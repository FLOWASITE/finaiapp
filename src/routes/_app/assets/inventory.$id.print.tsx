import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInventoryPrint } from "@/lib/fa-prints.functions";

export const Route = createFileRoute("/_app/assets/inventory/$id/print")({ component: InventoryPrintPage });

const fmt = (n: any) => new Intl.NumberFormat("vi-VN").format(Math.round(Number(n ?? 0)));

const STATUS_LABEL: Record<string, string> = {
  pending: "Chưa kiểm",
  matched: "Khớp",
  missing: "Thiếu",
  extra: "Thừa",
  wrong_location: "Sai vị trí",
  damaged: "Hư hỏng",
};

function InventoryPrintPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getInventoryPrint);
  const { data, isLoading } = useQuery({
    queryKey: ["fa_inv_print", id],
    queryFn: () => fn({ data: { count_id: id } }),
  });

  if (isLoading || !data) return <div className="container py-8">Đang tải…</div>;
  const h = data.header;
  const t = data.tenant;
  const dt = new Date(h.count_date);
  const lines = data.lines as any[];

  const totals = lines.reduce(
    (s, l) => {
      const cost = Number(l.asset?.cost ?? 0);
      const accum = Number(l.accumulated ?? 0);
      s.cost += cost; s.accum += accum; s.nbv += Math.max(0, cost - accum);
      return s;
    },
    { cost: 0, accum: 0, nbv: 0 },
  );

  const counts = lines.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1; return acc;
  }, {});

  return (
    <div className="container mx-auto py-8 space-y-4 print:py-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to="/assets/inventory/$id" params={{ id }}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">Biên bản kiểm kê TSCĐ</h1>
        </div>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />In</Button>
      </div>

      <div className="bg-white p-10 print:p-0 max-w-5xl mx-auto text-[12px] leading-relaxed font-serif print:font-serif">
        <div className="flex justify-between text-xs">
          <div>
            <div className="font-bold uppercase">{t.name || "—"}</div>
            <div>Địa chỉ: {t.address || "—"}</div>
            <div>{h.branches?.name ? `Chi nhánh: ${h.branches.name}` : ""} {h.departments?.name ? ` — Bộ phận: ${h.departments.name}` : ""}</div>
          </div>
          <div className="text-right">
            <div>Mẫu số 05-TSCĐ</div>
            <div className="italic text-[11px]">(Ban hành theo TT 200/2014/TT-BTC)</div>
          </div>
        </div>

        <h1 className="text-center font-bold text-xl mt-6">BIÊN BẢN KIỂM KÊ TÀI SẢN CỐ ĐỊNH</h1>
        <div className="text-center italic mt-1">
          Ngày {dt.getDate()} tháng {dt.getMonth() + 1} năm {dt.getFullYear()}
        </div>
        <div className="text-center mt-1">
          Số: <strong>{h.code}</strong>
          {h.location ? <> — Địa điểm: <strong>{h.location}</strong></> : null}
        </div>

        <p className="mt-4 font-bold">Thời điểm kiểm kê: {dt.toLocaleDateString("vi-VN")} {h.posted_at ? `(đã chốt ${new Date(h.posted_at).toLocaleString("vi-VN")})` : ""}</p>
        <p className="mt-1">Ban kiểm kê gồm:</p>
        <ul className="list-disc ml-8 space-y-1">
          <li>Ông/Bà: …………………………………… Trưởng ban</li>
          <li>Ông/Bà: …………………………………… Uỷ viên</li>
          <li>Ông/Bà: …………………………………… Uỷ viên</li>
        </ul>

        <Table className="mt-3 border [&_td]:border [&_th]:border [&_th]:bg-muted/30 text-[11px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">STT</TableHead>
              <TableHead>Mã TSCĐ</TableHead>
              <TableHead>Tên TSCĐ</TableHead>
              <TableHead>Năm SD</TableHead>
              <TableHead>Vị trí dự kiến</TableHead>
              <TableHead>Vị trí thực tế</TableHead>
              <TableHead className="text-right">Nguyên giá</TableHead>
              <TableHead className="text-right">KH luỹ kế</TableHead>
              <TableHead className="text-right">GT còn lại</TableHead>
              <TableHead>Tình trạng</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="text-center">A</TableHead>
              <TableHead>B</TableHead>
              <TableHead>C</TableHead>
              <TableHead>D</TableHead>
              <TableHead>E</TableHead>
              <TableHead>F</TableHead>
              <TableHead className="text-right">1</TableHead>
              <TableHead className="text-right">2</TableHead>
              <TableHead className="text-right">3 = 1−2</TableHead>
              <TableHead>4</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const a = l.asset;
              const cost = Number(a?.cost ?? 0);
              const accum = Number(l.accumulated ?? 0);
              const nbv = Math.max(0, cost - accum);
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-center">{i + 1}</TableCell>
                  <TableCell>{a?.code ?? l.scanned_code ?? "—"}</TableCell>
                  <TableCell>{a?.name ?? <em className="text-rose-600">Mã lạ {l.scanned_code}</em>}</TableCell>
                  <TableCell>{a?.in_service_date ? String(a.in_service_date).slice(0, 7) : "—"}</TableCell>
                  <TableCell>{l.expected_location || "—"}</TableCell>
                  <TableCell>{l.found_location || "—"}</TableCell>
                  <TableCell className="text-right">{a ? fmt(cost) : ""}</TableCell>
                  <TableCell className="text-right">{a ? fmt(accum) : ""}</TableCell>
                  <TableCell className="text-right">{a ? fmt(nbv) : ""}</TableCell>
                  <TableCell>{STATUS_LABEL[l.status] || l.status}</TableCell>
                </TableRow>
              );
            })}
            {lines.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center italic">Chưa có dòng kiểm kê</TableCell></TableRow>
            )}
            <TableRow className="font-bold">
              <TableCell colSpan={6} className="text-right">Cộng</TableCell>
              <TableCell className="text-right">{fmt(totals.cost)}</TableCell>
              <TableCell className="text-right">{fmt(totals.accum)}</TableCell>
              <TableCell className="text-right">{fmt(totals.nbv)}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="mt-3 text-[12px]">
          <strong>Tổng hợp tình trạng:</strong>{" "}
          {Object.entries(counts).map(([k, v]) => `${STATUS_LABEL[k] || k}: ${v}`).join(" · ") || "—"}
        </div>

        <p className="mt-3"><strong>Kết luận của Ban kiểm kê:</strong></p>
        <div className="border border-foreground/40 min-h-[60px] p-2">
          {h.description || "……………………………………………………………………………………"}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-12 text-center text-[12px]">
          <div><div className="font-bold">Giám đốc</div><div className="italic">(Ký, họ tên, đóng dấu)</div></div>
          <div><div className="font-bold">Kế toán trưởng</div><div className="italic">(Ký, họ tên)</div></div>
          <div><div className="font-bold">Trưởng ban kiểm kê</div><div className="italic">(Ký, họ tên)</div></div>
        </div>
      </div>

      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } body { background: white; } }`}</style>
    </div>
  );
}
