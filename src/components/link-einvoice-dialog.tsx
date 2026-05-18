import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Link2, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { searchLinkableInvoices, linkEInvoice } from "@/lib/einvoices.functions";

const vnd = (n: number | string | null | undefined) =>
  n == null ? "-" : Number(n).toLocaleString("vi-VN");

export function LinkEInvoiceDialog({
  einvoiceId,
  direction,
  open,
  onOpenChange,
  onLinked,
}: {
  einvoiceId: string;
  direction: "in" | "out";
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLinked?: () => void;
}) {
  const [q, setQ] = React.useState("");
  const search = useServerFn(searchLinkableInvoices);
  const link = useServerFn(linkEInvoice);

  const list = useQuery({
    queryKey: ["linkable-invoices", einvoiceId, q],
    queryFn: () => search({ data: { einvoiceId, q } }),
    enabled: open,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const linkMut = useMutation({
    mutationFn: (targetId: string) =>
      link({ data: { einvoiceId, targetId } }),
    onSuccess: () => {
      toast.success("Đã liên kết hoá đơn");
      onLinked?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi liên kết"),
  });

  const rows = list.data?.rows ?? [];
  const eTotal = Number(list.data?.einvoiceTotal ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Liên kết với {direction === "in" ? "phiếu mua hàng" : "hoá đơn bán"}{" "}
            có sẵn
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo số HĐ hoặc tên đối tác"
            className="pl-8"
          />
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Số HĐ</th>
                <th className="px-3 py-2 text-left">Ngày</th>
                <th className="px-3 py-2 text-left">
                  {direction === "in" ? "Nhà cung cấp" : "Khách hàng"}
                </th>
                <th className="px-3 py-2 text-right">Tổng</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td colSpan={5} className="px-3 py-2">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-8 text-center text-muted-foreground"
                  >
                    Không có hoá đơn phù hợp. Thử đổi từ khoá tìm.
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => {
                  const diff = Math.abs(Number(r.total ?? 0) - eTotal);
                  const big = diff > 1;
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {r.invoice_no || "—"}
                        {r.exact_no && (
                          <CheckCircle2 className="inline ml-1 h-3 w-3 text-emerald-600" />
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.issue_date || "—"}
                      </td>
                      <td className="px-3 py-2 max-w-[220px] truncate">
                        {r.party_name || "—"}
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.party_tax_id || ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {vnd(r.total)}
                        {big && eTotal > 0 && (
                          <div className="text-[11px] text-amber-700 flex items-center justify-end gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            lệch {vnd(diff)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={linkMut.isPending}
                          onClick={() => linkMut.mutate(r.id)}
                        >
                          <Link2 className="mr-1 h-3 w-3" />
                          Chọn
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
