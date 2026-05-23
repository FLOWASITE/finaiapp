import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStaff } from "@/lib/office/staff.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StaffDialog } from "@/components/office/staff-dialog";

export const Route = createFileRoute("/_app/office/staff/")({ component: StaffPage });

function StaffPage() {
  const fn = useServerFn(listStaff);
  const { data } = useQuery({ queryKey: ["office", "staff"], queryFn: () => fn() });

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><StaffDialog /></div>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">Chưa có nhân viên</p>
      ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.map((s: any) => (
        <Card key={s.id}>
          <CardContent className="p-4 flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={s.avatar_url ?? undefined} />
              <AvatarFallback>{s.full_name?.charAt(0) ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{s.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {s.position ?? "—"} · {s.department ?? "—"}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                {(s.skills ?? []).slice(0, 3).map((sk: string) => (
                  <Badge key={sk} variant="outline" className="text-[10px]">{sk}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
