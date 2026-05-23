import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProspects, deleteProspect } from "@/lib/office/prospects.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2 } from "lucide-react";
import { ProspectConvertDialog } from "@/components/office/prospect-convert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/office/prospects/$id")({ component: ProspectDetail });

function ProspectDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listProspects);
  const delFn = useServerFn(deleteProspect);
  const navigate = Route.useNavigate();

  const { data } = useQuery({ queryKey: ["office", "prospects"], queryFn: () => listFn() });
  const p = (data ?? []).find((x: { id: string }) => x.id === id) as
    | { id: string; name: string; code: string | null; tax_id: string | null;
        contact_person: string | null; phone: string | null; email: string | null;
        address: string | null; industry: string | null; source: string | null;
        status: string; estimated_fee: number | null; notes: string | null;
        converted_tenant_id: string | null; created_at: string }
    | undefined;

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["office", "prospects"] });
      toast.success("Đã xoá");
      navigate({ to: "/office/clients" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data) return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  if (!p) return <p className="text-sm text-muted-foreground">Không tìm thấy khách tiềm năng</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/office/clients">
          <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Quay lại</Button>
        </Link>
        <div className="flex gap-2">
          {p.status !== "won" && <ProspectConvertDialog prospectId={p.id} prospectName={p.name} />}
          <Button variant="outline" size="sm" onClick={() => del.mutate()}>
            <Trash2 className="h-4 w-4 mr-1" />Xoá
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
            {p.name}
            <Badge variant={p.status === "won" ? "default" : p.status === "lost" ? "destructive" : "secondary"}>
              {p.status}
            </Badge>
            {p.code && <span className="text-xs text-muted-foreground font-normal">#{p.code}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><p className="text-xs text-muted-foreground">MST</p><p>{p.tax_id ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Người liên hệ</p><p>{p.contact_person ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Phí dự kiến</p>
            <p>{Number(p.estimated_fee ?? 0).toLocaleString("vi-VN")}</p></div>
          <div><p className="text-xs text-muted-foreground">SĐT</p><p>{p.phone ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Email</p><p className="truncate">{p.email ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Nguồn</p><p>{p.source ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Ngành</p><p>{p.industry ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Tạo lúc</p>
            <p>{new Date(p.created_at).toLocaleDateString("vi-VN")}</p></div>
          <div className="col-span-2 md:col-span-3">
            <p className="text-xs text-muted-foreground">Địa chỉ</p>
            <p>{p.address ?? "—"}</p>
          </div>
          {p.notes && (
            <div className="col-span-2 md:col-span-3">
              <p className="text-xs text-muted-foreground">Ghi chú</p>
              <p className="whitespace-pre-wrap">{p.notes}</p>
            </div>
          )}
          {p.converted_tenant_id && (
            <div className="col-span-2 md:col-span-3 text-xs text-muted-foreground">
              Đã chuyển thành khách hàng (tenant id: <code>{p.converted_tenant_id}</code>)
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
