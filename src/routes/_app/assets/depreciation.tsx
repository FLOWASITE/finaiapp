import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TrendingDown, PlayCircle, Eye, ArrowLeft, BookOpen, Calendar, Wallet, FileText, Undo2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listDepBooks, runBookDepreciation, listBookEntries, voidDepEntry } from "@/lib/fa-books.functions";


type Search = { bookId?: string; period?: string };

export const Route = createFileRoute("/_app/assets/depreciation")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    bookId: typeof s.bookId === "string" ? s.bookId : undefined,
    period: typeof s.period === "string" ? s.period : undefined,
  }),
  component: DepreciationPage,
});

function currentYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(n));
}

function DepreciationPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const listBooks = useServerFn(listDepBooks);
  const run = useServerFn(runBookDepreciation);
  const listEntries = useServerFn(listBookEntries);

  const { data: books = [] } = useQuery({
    queryKey: ["fa-books"],
    queryFn: () => listBooks({}),
  });

  const bookId = search.bookId ?? books[0]?.id;
  const [upToMonth, setUpToMonth] = useState<string>(currentYM());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["fa-book-entries", bookId, search.period],
    queryFn: () => listEntries({ data: { bookId: bookId!, periodMonth: search.period } }),
    enabled: !!bookId,
  });

  const totals = useMemo(() => {
    const sum = entries.reduce((s: number, e: any) => s + Number(e.amount), 0);
    return { count: entries.length, sum };
  }, [entries]);

  const previewMut = useMutation({
    mutationFn: () => run({ data: { bookId: bookId!, upToMonth, preview: true } }),
    onSuccess: (res) => { setPreviewData(res); setPreviewOpen(true); },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const runMut = useMutation({
    mutationFn: () => run({ data: { bookId: bookId!, upToMonth } }),
    onSuccess: (res: any) => {
      toast.success(`Đã trích ${res.created} dòng, tổng ${fmt(res.total)} ₫`);
      setPreviewOpen(false);
      qc.invalidateQueries({ queryKey: ["fa-book-entries"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const currentBook = books.find((b: any) => b.id === bookId);

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets"><ArrowLeft className="h-4 w-4 mr-1" />Tài sản</Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingDown className="h-4 w-4" /> Trích khấu hao theo sổ
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Bảng tính khấu hao</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Chọn sổ và kỳ trích đến. Hệ thống áp dụng phương pháp riêng của từng tài sản trong sổ
            (đường thẳng, số dư giảm dần, tổng số năm sử dụng) và bỏ qua các kỳ tạm ngừng.
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4 grid md:grid-cols-[1fr_180px_auto_auto] gap-3 items-end">
          <div>
            <Label className="flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Sổ khấu hao</Label>
            <Select value={bookId ?? ""} onValueChange={(v) => navigate({ search: (s: any) => ({ ...s, bookId: v }), replace: true })}>
              <SelectTrigger><SelectValue placeholder="Chọn sổ" /></SelectTrigger>
              <SelectContent>
                {books.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code} — {b.name} {b.is_primary ? "★" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Trích đến (tháng)</Label>
            <Input type="month" value={upToMonth} onChange={(e) => setUpToMonth(e.target.value)} />
          </div>
          <Button variant="outline" disabled={!bookId || previewMut.isPending} onClick={() => previewMut.mutate()}>
            <Eye className="h-4 w-4 mr-1" /> Xem trước
          </Button>
          <Button disabled={!bookId || runMut.isPending} onClick={() => runMut.mutate()}>
            <PlayCircle className="h-4 w-4 mr-1" /> Chạy & ghi nhận
          </Button>
        </CardContent>
      </Card>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard icon={<BookOpen className="h-4 w-4" />} label="Sổ hiện tại" value={currentBook ? `${currentBook.code}` : "—"}
          hint={currentBook?.post_to_gl ? "Hạch toán vào sổ cái" : "Chỉ theo dõi, không hạch toán"} />
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Số bút toán đã ghi" value={String(totals.count)} hint="trong danh sách dưới" />
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Tổng khấu hao" value={`${fmt(totals.sum)} ₫`} hint="theo các dòng hiển thị" />
      </div>

      {/* Entries table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kỳ</TableHead>
                <TableHead>Mã TS</TableHead>
                <TableHead>Tài sản</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Bút toán</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entriesLoading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Đang tải…</TableCell></TableRow>
              )}
              {!entriesLoading && entries.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sổ này chưa có bút toán khấu hao nào.</TableCell></TableRow>
              )}
              {entries.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.period_month?.slice(0, 7)}</TableCell>
                  <TableCell className="font-mono text-xs">{e.asset?.code}</TableCell>
                  <TableCell>{e.asset?.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(Number(e.amount))} ₫</TableCell>
                  <TableCell>
                    {e.journal_entry_id
                      ? <Badge variant="default" className="text-xs">Đã hạch toán</Badge>
                      : <Badge variant="outline" className="text-xs">Theo dõi</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Xem trước khấu hao đến {upToMonth}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            {previewData?.rows?.length ?? 0} dòng sẽ được ghi, tổng <span className="font-semibold text-foreground">{fmt(previewData?.total ?? 0)} ₫</span>.
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kỳ</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tài sản</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(previewData?.rows ?? []).map((r: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.period.slice(0, 7)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.asset_code}</TableCell>
                    <TableCell>{r.asset_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.amount)} ₫</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Đóng</Button>
            <Button disabled={runMut.isPending || !previewData?.rows?.length} onClick={() => runMut.mutate()}>
              <PlayCircle className="h-4 w-4 mr-1" /> Ghi nhận {previewData?.rows?.length ?? 0} dòng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-semibold tracking-tight mt-1">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}
