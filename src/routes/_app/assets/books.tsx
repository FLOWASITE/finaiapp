import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Star, Database, TrendingDown, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDepBooks, upsertDepBook, deleteDepBook } from "@/lib/fa-books.functions";

export const Route = createFileRoute("/_app/assets/books")({
  component: BooksPage,
});

const empty = {
  id: undefined as string | undefined,
  code: "",
  name: "",
  is_primary: false,
  post_to_gl: false,
  currency: "VND",
  notes: "",
};

function BooksPage() {
  const qc = useQueryClient();
  const list = useServerFn(listDepBooks);
  const upsert = useServerFn(upsertDepBook);
  const remove = useServerFn(deleteDepBook);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ["fa-books"],
    queryFn: () => list({}),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const saveMut = useMutation({
    mutationFn: (payload: typeof empty) =>
      upsert({
        data: {
          ...payload,
          notes: payload.notes || null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Đã lưu sổ khấu hao");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["fa-books"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      qc.invalidateQueries({ queryKey: ["fa-books"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được"),
  });

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/assets"><ArrowLeft className="h-4 w-4 mr-1" />Tài sản</Link>
        </Button>
      </div>

      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" /> Quản trị khấu hao đa sổ
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">Sổ khấu hao</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Mỗi tài sản có thể được khấu hao đồng thời theo nhiều sổ (kế toán, thuế, IFRS…).
            Chỉ sổ chính có cờ <em>Hạch toán vào sổ cái</em> mới sinh bút toán 642/214.
          </p>
        </div>
        <Button onClick={() => { setForm(empty); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Sổ mới
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên sổ</TableHead>
                <TableHead>Tiền tệ</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Hạch toán GL</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Đang tải…</TableCell></TableRow>
              )}
              {!isLoading && books.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Chưa có sổ. Tạo sổ đầu tiên ở góc phải.</TableCell></TableRow>
              )}
              {books.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.code}</TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.currency}</TableCell>
                  <TableCell>
                    {b.is_primary
                      ? <Badge className="gap-1"><Star className="h-3 w-3" /> Sổ chính</Badge>
                      : <Badge variant="secondary">Phụ</Badge>}
                  </TableCell>
                  <TableCell>
                    {b.post_to_gl
                      ? <Badge variant="default" className="gap-1"><Database className="h-3 w-3" /> Có</Badge>
                      : <Badge variant="outline">Không</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button asChild size="icon" variant="ghost" title="Bảng tính khấu hao">
                      <Link to="/assets/depreciation" search={{ bookId: b.id } as any}>
                        <TrendingDown className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setForm({ ...b, notes: b.notes ?? "" }); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm(`Xoá sổ ${b.code}?`)) delMut.mutate(b.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Sửa sổ khấu hao" : "Sổ khấu hao mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mã sổ *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="ACCOUNTING" />
              </div>
              <div>
                <Label>Tiền tệ</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
            </div>
            <div>
              <Label>Tên sổ *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sổ kế toán" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Sổ chính</div>
                <div className="text-xs text-muted-foreground">Tenant chỉ có một sổ chính. Dùng cho báo cáo TT200.</div>
              </div>
              <Switch checked={form.is_primary} onCheckedChange={(v) => setForm({ ...form, is_primary: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Hạch toán vào sổ cái</div>
                <div className="text-xs text-muted-foreground">Khi chạy khấu hao sẽ tạo bút toán Nợ 642/Có 214.</div>
              </div>
              <Switch checked={form.post_to_gl} onCheckedChange={(v) => setForm({ ...form, post_to_gl: v })} />
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button disabled={!form.code || !form.name || saveMut.isPending} onClick={() => saveMut.mutate(form)}>
              {saveMut.isPending ? "Đang lưu…" : "Lưu sổ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
