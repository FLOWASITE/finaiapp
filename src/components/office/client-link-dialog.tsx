import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  upsertClientLink, searchTenantsForLink,
} from "@/lib/office/client-links.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export function ClientLinkDialog() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [fee, setFee] = useState(0);
  const [displayName, setDisplayName] = useState("");

  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertClientLink);
  const searchFn = useServerFn(searchTenantsForLink);

  const search = useQuery({
    queryKey: ["office", "tenant-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: open && q.length >= 2,
  });

  const mut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          client_tenant_id: picked!.id,
          display_name: displayName || null,
          fee_per_month: Number(fee) || 0,
          status: "active",
        },
      }),
    onSuccess: () => {
      toast.success("Đã liên kết khách hàng");
      qc.invalidateQueries({ queryKey: ["office"] });
      setOpen(false);
      setQ(""); setPicked(null); setFee(0); setDisplayName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Liên kết khách FinAI</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Liên kết khách hàng FinAI</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!picked ? (
            <>
              <div>
                <Label>Tìm theo tên / MST</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="Nhập tên hoặc mã số thuế" />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                {(search.data ?? []).map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setPicked({ id: t.id, name: t.name }); setDisplayName(t.name); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.tax_id ?? "—"} {t.company_name ? `· ${t.company_name}` : ""}
                    </div>
                  </button>
                ))}
                {q.length >= 2 && !search.data?.length && !search.isLoading && (
                  <p className="text-center text-xs text-muted-foreground py-4">Không có kết quả</p>
                )}
                {q.length < 2 && (
                  <p className="text-center text-xs text-muted-foreground py-4">Nhập ≥ 2 ký tự</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border p-3 bg-muted/40 text-sm">
                <div className="text-xs text-muted-foreground">Đã chọn</div>
                <div className="font-semibold">{picked.name}</div>
                <button type="button" className="text-xs text-primary mt-1"
                  onClick={() => setPicked(null)}>Đổi khách khác</button>
              </div>
              <div>
                <Label>Tên hiển thị nội bộ</Label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div>
                <Label>Phí dịch vụ / tháng</Label>
                <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!picked || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Liên kết"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
