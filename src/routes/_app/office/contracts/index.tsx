import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listContracts } from "@/lib/office/contracts.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ContractDialog } from "@/components/office/contract-dialog";
import { ContractRenewDialog } from "@/components/office/contract-renew-dialog";

export const Route = createFileRoute("/_app/office/contracts/")({ component: ContractsPage });

function ContractsPage() {
  const fn = useServerFn(listContracts);
  const { data } = useQuery({ queryKey: ["office", "contracts"], queryFn: () => fn() });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Hợp đồng dịch vụ ({data?.length ?? 0})</CardTitle>
        <ContractDialog />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Số HĐ</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Hiệu lực</TableHead>
              <TableHead className="text-right">Phí</TableHead>
              <TableHead>Chu kỳ</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link to="/office/contracts/$contractId" params={{ contractId: c.id }}
                    className="text-primary hover:underline">{c.contract_no}</Link>
                </TableCell>
                <TableCell>{c.link?.display_name || c.link?.tenant?.name || "—"}</TableCell>
                <TableCell>{c.start_date ?? "—"} → {c.end_date ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {Number(c.fee_amount ?? 0).toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>{c.billing_cycle}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <ContractRenewDialog
                    contractId={c.id}
                    currentEnd={c.end_date}
                    currentFee={Number(c.fee_amount ?? 0)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!data?.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                  Chưa có hợp đồng
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
