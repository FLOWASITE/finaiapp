import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listContracts, listRenewals } from "@/lib/office/contracts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { ContractRenewDialog } from "@/components/office/contract-renew-dialog";

export const Route = createFileRoute("/_app/office/contracts/$contractId")({ component: ContractDetail });

function ContractDetail() {
  const { contractId } = Route.useParams();
  const listFn = useServerFn(listContracts);
  const renewFn = useServerFn(listRenewals);

  const list = useQuery({ queryKey: ["office", "contracts"], queryFn: () => listFn() });
  const renewals = useQuery({
    queryKey: ["office", "renewals", contractId],
    queryFn: () => renewFn({ data: { contract_id: contractId } }),
  });

  const c = (list.data ?? []).find((x: { id: string }) => x.id === contractId) as
    | { id: string; contract_no: string; status: string; sign_date: string | null;
        start_date: string | null; end_date: string | null; fee_amount: number | null;
        billing_cycle: string; services: string[] | null; notes: string | null;
        link: { id: string; display_name: string | null; tenant: { name: string } | null } | null }
    | undefined;

  if (list.isLoading) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!c) return <p className="text-sm text-muted-foreground">Không tìm thấy hợp đồng</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/office/contracts">
          <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <ContractRenewDialog
          contractId={c.id}
          currentEnd={c.end_date}
          currentFee={Number(c.fee_amount ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {c.contract_no}
            <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Khách hàng</p>
            {c.link ? (
              <Link to="/office/clients/$linkId" params={{ linkId: c.link.id }}
                className="text-primary hover:underline">
                {c.link.display_name || c.link.tenant?.name || "—"}
              </Link>
            ) : <p>—</p>}
          </div>
          <div><p className="text-xs text-muted-foreground">Ngày ký</p><p>{c.sign_date ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Hiệu lực</p><p>{c.start_date ?? "—"} → {c.end_date ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Chu kỳ</p><p>{c.billing_cycle}</p></div>
          <div><p className="text-xs text-muted-foreground">Phí</p>
            <p>{Number(c.fee_amount ?? 0).toLocaleString("vi-VN")}</p></div>
          <div className="col-span-2 md:col-span-3">
            <p className="text-xs text-muted-foreground">Dịch vụ</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {(c.services ?? []).map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              {!c.services?.length && <p>—</p>}
            </div>
          </div>
          {c.notes && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-muted-foreground">Ghi chú</p>
              <p className="whitespace-pre-wrap">{c.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Lịch sử gia hạn ({renewals.data?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {!renewals.data?.length ? (
            <p className="text-sm text-muted-foreground">Chưa có lần gia hạn nào</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {renewals.data.map((r: { id: string; prev_end_date: string | null; new_end_date: string | null; new_fee_amount: number | null; renewed_at: string; notes: string | null }) => (
                <li key={r.id} className="border-b pb-2 last:border-0">
                  <div className="flex justify-between">
                    <span>{r.prev_end_date ?? "—"} → <strong>{r.new_end_date ?? "—"}</strong></span>
                    <span className="text-muted-foreground">{new Date(r.renewed_at).toLocaleDateString("vi-VN")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Phí mới: {Number(r.new_fee_amount ?? 0).toLocaleString("vi-VN")}
                    {r.notes ? ` · ${r.notes}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
