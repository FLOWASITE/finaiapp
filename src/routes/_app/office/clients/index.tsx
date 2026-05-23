import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClientLinks } from "@/lib/office/client-links.functions";
import { listProspects } from "@/lib/office/prospects.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ProspectDialog } from "@/components/office/prospect-dialog";
import { ClientLinkDialog } from "@/components/office/client-link-dialog";
import { ProspectConvertDialog } from "@/components/office/prospect-convert-dialog";
import { InviteStaffDialog } from "@/components/office/invite-staff-dialog";

export const Route = createFileRoute("/_app/office/clients/")({ component: ClientsPage });

function ClientsPage() {
  const linksFn = useServerFn(listClientLinks);
  const prospectsFn = useServerFn(listProspects);
  const links = useQuery({ queryKey: ["office", "links"], queryFn: () => linksFn() });
  const prospects = useQuery({ queryKey: ["office", "prospects"], queryFn: () => prospectsFn() });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Khách đã sử dụng FinAI ({links.data?.length ?? 0})
          </CardTitle>
          <ClientLinkDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên khách hàng</TableHead>
                <TableHead>MST</TableHead>
                <TableHead>Phụ trách</TableHead>
                <TableHead className="text-right">Phí/tháng</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(links.data ?? []).map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.display_name || l.tenant?.name}</TableCell>
                  <TableCell>{l.tenant?.tax_id ?? "—"}</TableCell>
                  <TableCell>{l.manager?.display_name || l.manager?.email || "—"}</TableCell>
                  <TableCell className="text-right">
                    {Number(l.fee_per_month ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.status === "active" ? "default" : "secondary"}>
                      {l.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <InviteStaffDialog linkId={l.id} clientName={l.display_name || l.tenant?.name || ""} />
                  </TableCell>
                </TableRow>
              ))}
              {!links.data?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Chưa có khách hàng nào được liên kết
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Khách tiềm năng ({prospects.data?.length ?? 0})
          </CardTitle>
          <ProspectDialog />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>MST</TableHead>
                <TableHead>Liên hệ</TableHead>
                <TableHead className="text-right">Ước tính phí</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(prospects.data ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.tax_id ?? "—"}</TableCell>
                  <TableCell>{p.contact_person ?? p.phone ?? p.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {Number(p.estimated_fee ?? 0).toLocaleString("vi-VN")}
                  </TableCell>
                  <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {p.status !== "won" && (
                      <ProspectConvertDialog prospectId={p.id} prospectName={p.name} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!prospects.data?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Chưa có khách tiềm năng
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
