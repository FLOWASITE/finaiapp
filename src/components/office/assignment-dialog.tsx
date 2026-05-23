import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upsertAssignment } from "@/lib/office/staff.functions";
import { listClientLinks } from "@/lib/office/client-links.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";

export function AssignmentDialog({
  staffId, staffName,
}: { staffId: string; staffName: string }) {
  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [role, setRole] = useState<"lead" | "assistant" | "reviewer">("lead");

  const qc = useQueryClient();
  const fn = useServerFn(upsertAssignment);
  const linksFn = useServerFn(listClientLinks);
  const links = useQuery({
    queryKey: ["office", "links"], queryFn: () => linksFn(), enabled: open,
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({ data: { staff_id: staffId, link_id: linkId, role } }),
    onSuccess: () => {
      toast.success("Đã gán phụ trách");
      qc.invalidateQueries({ queryKey: ["office"] });
      setOpen(false);
      setLinkId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LinkIcon className="h-4 w-4 mr-1" />Gán khách
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán "{staffName}" phụ trách khách hàng</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Khách hàng</Label>
            <Select value={linkId} onValueChange={setLinkId}>
              <SelectTrigger><SelectValue placeholder="Chọn khách hàng" /></SelectTrigger>
              <SelectContent>
                {(links.data ?? []).map((l: { id: string; display_name: string | null; tenant: { name: string } | null }) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.display_name || l.tenant?.name || l.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vai trò</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Chính</SelectItem>
                <SelectItem value="assistant">Hỗ trợ</SelectItem>
                <SelectItem value="reviewer">Soát xét</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!linkId || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Gán"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
