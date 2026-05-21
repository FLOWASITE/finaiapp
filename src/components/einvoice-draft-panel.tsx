import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, CheckCircle2, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  generateDraftFromEinvoice,
  getDraftForEinvoice,
  updateDraft,
  postDraft,
  discardDraft,
} from "@/lib/einvoice-drafts.functions";

type Line = {
  id?: string;
  account_code: string;
  debit: number;
  credit: number;
  description?: string | null;
};

const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const vnd = (n: number) => n.toLocaleString("vi-VN");

export function EinvoiceDraftPanel({ einvoiceId }: { einvoiceId: string }) {
  const getFn = useServerFn(getDraftForEinvoice);
  const genFn = useServerFn(generateDraftFromEinvoice);
  const upFn = useServerFn(updateDraft);
  const postFn = useServerFn(postDraft);
  const discardFn = useServerFn(discardDraft);

  const q = useQuery({
    queryKey: ["einvoice-draft", einvoiceId],
    queryFn: () => getFn({ data: { einvoiceId } }),
  });

  const [lines, setLines] = React.useState<Line[]>([]);
  const [entryDate, setEntryDate] = React.useState<string>("");
  const [desc, setDesc] = React.useState<string>("");
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (q.data?.draft) {
      setEntryDate(q.data.draft.entry_date ?? "");
      setDesc(q.data.draft.description ?? "");
      setLines(
        (q.data.lines ?? []).map((l: any) => ({
          id: l.id,
          account_code: l.account_code,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description ?? "",
        })),
      );
      setDirty(false);
    }
  }, [q.data?.draft?.id, q.data?.lines]);

  const genMut = useMutation({
    mutationFn: (regenerate?: boolean) =>
      genFn({ data: { einvoiceId, regenerate: !!regenerate } }),
    onSuccess: () => {
      toast.success("Đã tạo nháp bút toán");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upFn({
        data: {
          id: q.data!.draft!.id,
          entry_date: entryDate,
          description: desc,
          lines: lines.map((l) => ({
            account_code: l.account_code,
            debit: l.debit,
            credit: l.credit,
            description: l.description ?? null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Đã lưu nháp");
      setDirty(false);
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const postMut = useMutation({
    mutationFn: () => postFn({ data: { id: q.data!.draft!.id } }),
    onSuccess: () => {
      toast.success("Đã duyệt & ghi sổ");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const discardMut = useMutation({
    mutationFn: () => discardFn({ data: { id: q.data!.draft!.id } }),
    onSuccess: () => {
      toast.success("Đã loại bỏ nháp");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const totalDr = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCr = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.5;

  const draft = q.data?.draft as any;

  if (q.isLoading) {
    return <div className="rounded-lg border p-4 text-sm text-muted-foreground">Đang tải nháp bút toán…</div>;
  }

  if (!draft) {
    return (
      <div className="rounded-lg border p-4 flex items-center justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Nháp bút toán
          </div>
          <div className="text-muted-foreground text-xs mt-1">
            Chưa có nháp. Tạo nháp từ thông tin HĐĐT để kế toán duyệt.
          </div>
        </div>
        <Button size="sm" onClick={() => genMut.mutate(false)} disabled={genMut.isPending}>
          <Plus className="mr-1 h-4 w-4" /> Tạo nháp bút toán
        </Button>
      </div>
    );
  }

  const isPosted = draft.status === "posted";

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          <span className="font-medium">Nháp bút toán</span>
          <Badge variant={isPosted ? "default" : "secondary"}>
            {isPosted ? "Đã ghi sổ" : "Draft"}
          </Badge>
        </div>
        <div className="flex gap-2">
          {!isPosted && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => genMut.mutate(true)}
                disabled={genMut.isPending}
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Tái tạo
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (confirm("Loại bỏ nháp này?")) discardMut.mutate();
                }}
              >
                <X className="mr-1 h-3 w-3" /> Loại bỏ
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Ngày ghi sổ</label>
          <Input
            type="date"
            value={entryDate}
            disabled={isPosted}
            onChange={(e) => {
              setEntryDate(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Diễn giải</label>
          <Input
            value={desc}
            disabled={isPosted}
            onChange={(e) => {
              setDesc(e.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs bg-muted/50">
            <tr>
              <th className="px-2 py-1 text-left">TK</th>
              <th className="px-2 py-1 text-left">Diễn giải</th>
              <th className="px-2 py-1 text-right">Nợ</th>
              <th className="px-2 py-1 text-right">Có</th>
              {!isPosted && <th className="w-8"></th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1 w-24">
                  <Input
                    value={l.account_code}
                    disabled={isPosted}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], account_code: e.target.value };
                      setLines(next);
                      setDirty(true);
                    }}
                    className="h-8"
                  />
                </td>
                <td className="px-2 py-1">
                  <Input
                    value={l.description ?? ""}
                    disabled={isPosted}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], description: e.target.value };
                      setLines(next);
                      setDirty(true);
                    }}
                    className="h-8"
                  />
                </td>
                <td className="px-2 py-1 w-32">
                  <Input
                    value={l.debit ? vnd(l.debit) : ""}
                    disabled={isPosted}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], debit: num(e.target.value) };
                      setLines(next);
                      setDirty(true);
                    }}
                    className="h-8 text-right tabular-nums"
                  />
                </td>
                <td className="px-2 py-1 w-32">
                  <Input
                    value={l.credit ? vnd(l.credit) : ""}
                    disabled={isPosted}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], credit: num(e.target.value) };
                      setLines(next);
                      setDirty(true);
                    }}
                    className="h-8 text-right tabular-nums"
                  />
                </td>
                {!isPosted && (
                  <td className="px-1 py-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setLines(lines.filter((_, k) => k !== i));
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm font-medium bg-muted/30">
            <tr>
              <td colSpan={2} className="px-2 py-1 text-right">Tổng</td>
              <td className="px-2 py-1 text-right tabular-nums">{vnd(totalDr)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{vnd(totalCr)}</td>
              {!isPosted && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {!balanced && (
        <div className="text-xs text-destructive">
          Bút toán không cân: chênh lệch {vnd(Math.abs(totalDr - totalCr))}
        </div>
      )}

      {!isPosted && (
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLines([
                ...lines,
                { account_code: "", debit: 0, credit: 0, description: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Thêm dòng
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Lưu nháp
            </Button>
            <Button
              size="sm"
              disabled={!balanced || dirty || postMut.isPending}
              onClick={() => {
                if (confirm("Duyệt và ghi sổ bút toán này?")) postMut.mutate();
              }}
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Duyệt & ghi sổ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
