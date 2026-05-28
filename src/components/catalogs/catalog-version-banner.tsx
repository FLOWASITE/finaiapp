import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCatalogDiff, acknowledgeCatalogVersion } from "@/lib/catalogs/versioning.functions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

type Props = {
  catalog: "coa" | "tpc";
  /** Vietnamese label for the catalog (e.g. "Hệ thống tài khoản") */
  label: string;
};

export function CatalogVersionBanner({ catalog, label }: Props) {
  const diffFn = useServerFn(getCatalogDiff);
  const ackFn = useServerFn(acknowledgeCatalogVersion);
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const { data } = useQuery({
    queryKey: ["catalog-diff", catalog],
    queryFn: () => diffFn({ data: { catalog } }),
    staleTime: 60_000,
  });

  const ack = useMutation({
    mutationFn: () => ackFn({ data: { catalog } }),
    onSuccess: () => {
      toast.success(`Đã đồng bộ ${label} phiên bản mới`);
      qc.invalidateQueries({ queryKey: ["catalog-diff", catalog] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.has_updates) return null;

  const added = data.rows.filter((r) => r.kind === "added");
  const removed = data.rows.filter((r) => r.kind === "removed");

  return (
    <>
      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <Sparkles className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-sm">
          {label} có cập nhật mới (v{data.pinned_version} → v{data.current_version})
        </AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
          <span>
            {added.length} bổ sung · {removed.length} ngừng dùng
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
            Xem chi tiết
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {label} — cập nhật v{data.pinned_version} → v{data.current_version}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto text-sm">
            {added.length > 0 && (
              <section>
                <h4 className="font-medium text-emerald-700 dark:text-emerald-400 mb-2">
                  Bổ sung ({added.length})
                </h4>
                <ul className="space-y-1">
                  {added.map((r, i) => (
                    <li key={`a-${i}`} className="flex gap-2">
                      <Badge variant="outline" className="font-mono">{r.code}</Badge>
                      <span>{r.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {removed.length > 0 && (
              <section>
                <h4 className="font-medium text-destructive mb-2">
                  Ngừng sử dụng ({removed.length})
                </h4>
                <ul className="space-y-1">
                  {removed.map((r, i) => (
                    <li key={`r-${i}`} className="flex gap-2 line-through opacity-70">
                      <Badge variant="outline" className="font-mono">{r.code}</Badge>
                      <span>{r.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {added.length === 0 && removed.length === 0 && (
              <p className="text-muted-foreground">Chỉ thay đổi metadata, không có mã thêm/xoá.</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Để sau</Button>
            <Button onClick={() => ack.mutate()} disabled={ack.isPending}>
              {ack.isPending ? "Đang đồng bộ…" : "Đồng bộ phiên bản mới"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
