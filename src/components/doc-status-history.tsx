import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getStatusHistory } from "@/lib/documents.functions";
import type { DocTable } from "@/lib/documents.functions";
import { DocStatusBadge } from "@/components/doc-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "lucide-react";

export function DocStatusHistory({
  table,
  id,
}: {
  table: DocTable;
  id: string;
}) {
  const fetcher = useServerFn(getStatusHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["doc-status-history", table, id],
    queryFn: () => fetcher({ data: { entity_table: table, entity_id: id } }),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data || data.length === 0)
    return <p className="text-sm text-muted-foreground">Chưa có thay đổi trạng thái.</p>;

  return (
    <ul className="space-y-3">
      {data.map((row: any) => (
        <li key={row.id} className="flex items-start gap-3 text-sm">
          <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {row.from_status && <DocStatusBadge status={row.from_status} />}
              {row.from_status && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              <DocStatusBadge status={row.to_status} />
            </div>
            {row.reason && (
              <p className="text-muted-foreground italic">"{row.reason}"</p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(row.changed_at).toLocaleString("vi-VN")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
