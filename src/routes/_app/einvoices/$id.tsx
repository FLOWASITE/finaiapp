import * as React from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download, FilePlus2, Trash2, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getEInvoice,
  createPurchaseFromEInvoice,
  deleteEInvoice,
  linkEInvoice,
} from "@/lib/einvoices.functions";
import { LinkEInvoiceDialog } from "@/components/link-einvoice-dialog";
import { EinvoiceDraftPanel } from "@/components/einvoice-draft-panel";

export const Route = createFileRoute("/_app/einvoices/$id")({
  component: EInvoiceDetail,
});

const vnd = (n: number | string | null | undefined) =>
  n == null ? "-" : Number(n).toLocaleString("vi-VN");

function EInvoiceDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const getFn = useServerFn(getEInvoice);
  const createPurchase = useServerFn(createPurchaseFromEInvoice);
  const delFn = useServerFn(deleteEInvoice);
  const unlink = useServerFn(linkEInvoice);
  const [linkOpen, setLinkOpen] = React.useState(false);

  const q = useQuery({
    queryKey: ["einvoice", id],
    queryFn: () => getFn({ data: { id } }),
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const createMut = useMutation({
    mutationFn: () => createPurchase({ data: { einvoiceId: id } }),
    onSuccess: (r) => {
      toast.success("Đã tạo phiếu mua từ HĐĐT");
      q.refetch();
      router.navigate({ to: "/invoices/$id", params: { id: r.invoiceId } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const unlinkMut = useMutation({
    mutationFn: () => unlink({ data: { einvoiceId: id, targetId: null } }),
    onSuccess: () => {
      toast.success("Đã bỏ liên kết");
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Đã xoá");
      router.navigate({ to: "/einvoices", search: { tab: "in" } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  if (q.isLoading)
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (q.error || !q.data)
    return <div className="p-6 text-destructive">Không tải được dữ liệu</div>;

  const e = q.data.einvoice as any;
  const lines = q.data.lines as any[];
  const matched = q.data.matched as any;
  const isMatched = !!matched;
  const diff = isMatched
    ? Math.abs(Number(matched.total ?? 0) - Number(e.total ?? 0))
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/einvoices"
          search={{ tab: e.direction }}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Danh sách HĐĐT
        </Link>
        <div className="flex gap-2">
          {q.data.xmlUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={q.data.xmlUrl} target="_blank" rel="noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Tải XML
              </a>
            </Button>
          )}
          {!isMatched && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Liên kết HĐ có sẵn
            </Button>
          )}
          {e.direction === "in" && !isMatched && (
            <Button
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
            >
              <FilePlus2 className="mr-2 h-4 w-4" />
              Tạo phiếu mua mới
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              if (confirm("Xoá HĐĐT này?")) delMut.mutate();
            }}
            disabled={delMut.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant={e.direction === "out" ? "default" : "secondary"}>
            {e.direction === "out" ? "Đầu ra" : "Đầu vào"}
          </Badge>
          <Badge variant="outline">{e.source}</Badge>
          {e.tct_status && <Badge variant="outline">TCT: {e.tct_status}</Badge>}
        </div>
        <h1 className="text-xl font-semibold">
          {e.invoice_series ? `${e.invoice_series} · ` : ""}
          {e.invoice_no}
        </h1>
        <div className="text-sm text-muted-foreground">
          Ngày: {e.issue_date || "—"}
          {e.tct_lookup_code && (
            <> · Mã tra cứu: <span className="font-mono">{e.tct_lookup_code}</span></>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">
              Bên bán
            </div>
            <div className="font-medium">{e.seller_name || "—"}</div>
            <div className="font-mono text-xs">{e.seller_tax_id || "—"}</div>
            <div className="text-xs text-muted-foreground">
              {e.seller_address || ""}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">
              Bên mua
            </div>
            <div className="font-medium">{e.buyer_name || "—"}</div>
            <div className="font-mono text-xs">{e.buyer_tax_id || "—"}</div>
            <div className="text-xs text-muted-foreground">
              {e.buyer_address || ""}
            </div>
          </div>
        </div>
      </div>

      {isMatched && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-700" />
              <span>Đã liên kết với </span>
              <Link
                to={e.direction === "in" ? "/invoices/$id" : "/sales/$id"}
                params={{ id: matched.id }}
                className="font-medium text-primary hover:underline"
              >
                {matched.invoice_no || matched.id.slice(0, 8)}
              </Link>
              <span className="text-muted-foreground">
                · {matched.party_name || "—"} · {matched.issue_date || "—"} ·{" "}
                {vnd(matched.total)}
              </span>
            </div>
            {diff > 1 && (
              <div className="text-xs text-amber-700 mt-1">
                ⚠ Tổng tiền lệch {vnd(diff)} so với HĐĐT ({vnd(e.total)})
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => unlinkMut.mutate()}
            disabled={unlinkMut.isPending}
          >
            <Unlink className="mr-1 h-3 w-3" />
            Bỏ liên kết
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Mô tả</th>
              <th className="px-3 py-2 text-right">SL</th>
              <th className="px-3 py-2 text-left">ĐVT</th>
              <th className="px-3 py-2 text-right">Đơn giá</th>
              <th className="px-3 py-2 text-right">Thành tiền</th>
              <th className="px-3 py-2 text-right">%VAT</th>
              <th className="px-3 py-2 text-right">Thuế</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Không có dòng hàng
                </td>
              </tr>
            ) : (
              lines.map((l, i) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">{l.line_no ?? i + 1}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{vnd(l.qty)}</td>
                  <td className="px-3 py-2">{l.unit || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{vnd(l.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{vnd(l.amount)}</td>
                  <td className="px-3 py-2 text-right">{l.vat_rate ?? 0}%</td>
                  <td className="px-3 py-2 text-right tabular-nums">{vnd(l.vat_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-muted/30 text-sm font-medium">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right">Cộng tiền hàng</td>
              <td className="px-3 py-2 text-right tabular-nums">{vnd(e.subtotal)}</td>
              <td></td>
              <td className="px-3 py-2 text-right tabular-nums">{vnd(e.vat_amount)}</td>
            </tr>
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right">Tổng cộng</td>
              <td className="px-3 py-2 text-right tabular-nums">{vnd(e.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <LinkEInvoiceDialog
        einvoiceId={id}
        direction={e.direction}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLinked={() => q.refetch()}
      />
    </div>
  );
}
