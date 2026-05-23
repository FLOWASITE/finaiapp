import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { upsertTask } from "@/lib/office/tasks.functions";
import { listClientLinks } from "@/lib/office/client-links.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  ["vat_filing", "Kê khai VAT"],
  ["pit", "Thuế TNCN"],
  ["cit", "Thuế TNDN"],
  ["social_insurance", "BHXH"],
  ["bookkeeping", "Sổ sách kế toán"],
  ["financial_report", "BCTC"],
  ["internal", "Nội bộ"],
  ["other", "Khác"],
] as const;

const PRIORITIES = [
  ["low", "Thấp"], ["med", "Trung bình"], ["high", "Cao"], ["urgent", "Khẩn"],
] as const;

export function TaskDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertTask);
  const linksFn = useServerFn(listClientLinks);
  const links = useQuery({
    queryKey: ["office", "links"], queryFn: () => linksFn(), enabled: open,
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "other" as (typeof CATEGORIES)[number][0],
    priority: "med" as (typeof PRIORITIES)[number][0],
    link_id: "" as string,
    due_date: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          title: form.title,
          description: form.description || null,
          category: form.category,
          priority: form.priority,
          status: "todo",
          link_id: form.link_id || null,
          due_date: form.due_date || null,
          checklist: [],
        },
      }),
    onSuccess: () => {
      toast.success("Đã tạo công việc");
      qc.invalidateQueries({ queryKey: ["office"] });
      setOpen(false);
      setForm({ title: "", description: "", category: "other", priority: "med", link_id: "", due_date: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Công việc</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Tạo công việc mới</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Tiêu đề *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Mô tả</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Khách hàng</Label>
              <Select value={form.link_id || "none"} onValueChange={(v) => setForm({ ...form, link_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nội bộ —</SelectItem>
                  {(links.data ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.display_name || l.tenant?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Hạn</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Loại</Label>
              <Select value={form.category} onValueChange={(v: any) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ưu tiên</Label>
              <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => mut.mutate()} disabled={!form.title.trim() || mut.isPending}>
            {mut.isPending ? "Đang lưu..." : "Tạo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
