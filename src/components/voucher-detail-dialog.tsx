import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { FileText, Paperclip, Link2 } from "lucide-react";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { getVoucherDetail } from "@/lib/voucher-detail.functions";

const fmt = (n: number) =>
  (n || 0).toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

type Props = {
  entryId: string | null;
  onClose: () => void;
};

const KIND_LABEL: Record<string, string> = {
  sales_invoice: "HĐ bán",
  customer_receipt: "Phiếu thu KH",
  purchase_invoice: "HĐ mua",
  supplier_payment: "Phiếu chi NCC",
};

export function VoucherDetailDialog({ entryId, onClose }: Props) {
  const fn = useServerFn(getVoucherDetail);
  const q = useQuery({
    enabled: !!entryId,
    queryKey: ["voucher-detail", entryId],
    queryFn: () => fn({ data: { entry_id: entryId! } }),
  });

  const data = q.data;

  return (
    <Dialog open={!!entryId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {data ? (
              <>
                <span>{data.entry.voucher_type}</span>
                <span className="font-mono text-sm text-muted-foreground">· {data.entry.voucher_no}</span>
              </>
            ) : "Chi tiết chứng từ"}
          </DialogTitle>
          <DialogDescription>
            {data ? `Ngày ${data.entry.entry_date}${data.entry.party_name ? ` · ${data.entry.party_name}` : ""}` : "Đang tải…"}
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Đang tải chi tiết…</div>
        ) : q.isError ? (
          <div className="py-10 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* Diễn giải + dimensions */}
            <section className="rounded-md border border-border bg-muted/20 p-3 text-sm">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Diễn giải</div>
              <div className="mt-1 whitespace-pre-wrap">{data.entry.description ?? "—"}</div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {data.entry.reference && (<><span>Tham chiếu</span><span className="text-foreground">{data.entry.reference}</span></>)}
                {data.entry.branch_name && (<><span>Chi nhánh</span><span className="text-foreground">{data.entry.branch_name}</span></>)}
                {data.entry.project_name && (<><span>Dự án</span><span className="text-foreground">{data.entry.project_name}</span></>)}
                {data.entry.cost_center_name && (<><span>TT chi phí</span><span className="text-foreground">{data.entry.cost_center_name}</span></>)}
              </div>
            </section>

            {/* Bút toán con */}
            <section>
              <div className="mb-2 text-sm font-semibold">Bút toán ({data.lines.length})</div>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 uppercase">
                    <tr>
                      <th className="px-2 py-2 text-left w-10">#</th>
                      <th className="px-2 py-2 text-left">TK</th>
                      <th className="px-2 py-2 text-left">Tên tài khoản</th>
                      <th className="px-2 py-2 text-right">Nợ</th>
                      <th className="px-2 py-2 text-right">Có</th>
                      <th className="px-2 py-2 text-left">Chiều phân tích</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l, i) => (
                      <tr key={l.id} className="border-t border-border/60 align-top">
                        <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono">{l.account_code}</td>
                        <td className="px-2 py-1.5">{l.account_name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{l.debit ? fmt(l.debit) : ""}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{l.credit ? fmt(l.credit) : ""}</td>
                        <td className="px-2 py-1.5 text-muted-foreground text-[11px]">
                          {[l.branch_name, l.department_name, l.project_name, l.cost_center_name]
                            .filter(Boolean).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/40 font-semibold">
                    <tr className="border-t-2 border-border">
                      <td colSpan={3} className="px-2 py-2 text-right">Tổng cộng</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(data.totals.debit)}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(data.totals.credit)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {Math.abs(data.totals.debit - data.totals.credit) > 0.01 && (
                <div className="mt-1 text-xs text-destructive">
                  ⚠ Nợ ≠ Có (chênh lệch {fmt(data.totals.debit - data.totals.credit)})
                </div>
              )}
            </section>

            {/* Đối chiếu liên quan */}
            <section>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                Đối chiếu liên quan ({data.related.length})
              </div>
              {data.related.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  Chứng từ này chưa có đối chiếu (hoá đơn ↔ phiếu thu/chi liên quan).
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 uppercase">
                      <tr>
                        <th className="px-2 py-2 text-left">Loại</th>
                        <th className="px-2 py-2 text-left">Số CT</th>
                        <th className="px-2 py-2 text-left">Ngày</th>
                        <th className="px-2 py-2 text-left">Đối tác</th>
                        <th className="px-2 py-2 text-right">Số tiền</th>
                        <th className="px-2 py-2 text-left">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.related.map((r) => (
                        <tr key={r.kind + r.id} className={"border-t border-border/60 " + (r.is_self ? "bg-primary/5" : "")}>
                          <td className="px-2 py-1.5">{KIND_LABEL[r.kind] ?? r.kind}{r.is_self && <span className="ml-1 text-[10px] text-primary">(này)</span>}</td>
                          <td className="px-2 py-1.5 font-mono">
                            {r.kind === "sales_invoice" ? (
                              <Link to="/sales/$id" params={{ id: r.id }} className="text-primary hover:underline" onClick={onClose}>
                                {r.doc_no ?? "—"}
                              </Link>
                            ) : (r.doc_no ?? "—")}
                          </td>
                          <td className="px-2 py-1.5">{r.date ?? "—"}</td>
                          <td className="px-2 py-1.5">{r.party_name ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{fmt(r.amount)}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {r.method ? `${r.method}${r.status ? ` · ${r.status}` : ""}` : (r.status ?? "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Tài liệu đính kèm */}
            {data.attachments.length > 0 && (
              <section>
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  Tài liệu đính kèm ({data.attachments.length})
                </div>
                <ul className="space-y-1 text-xs">
                  {data.attachments.map((a) => (
                    <li key={a.document_id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.file_name ?? a.document_id}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{a.link_type}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
