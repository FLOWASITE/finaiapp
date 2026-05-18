import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Search, FolderTree, Users, Building2 } from "lucide-react";
import { toast } from "sonner";

import {
  listPartyGroups,
  upsertPartyGroup,
  deletePartyGroup,
} from "@/lib/partyGroups.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  kind: "customer" | "supplier";
}

type GroupRow = {
  id: string;
  code: string | null;
  name: string;
  parent_id: string | null;
  description: string | null;
  member_count: number;
};

export function PartyGroupsPage({ kind }: Props) {
  const isCustomer = kind === "customer";
  const listFn = useServerFn(listPartyGroups);
  const qc = useQueryClient();
  const { data: groups, isLoading } = useQuery({
    queryKey: ["party-groups", kind],
    queryFn: () => listFn({ data: { kind } }),
  });

  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<GroupRow> | null>(null);

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase();
    const rows = (groups ?? []) as GroupRow[];
    if (!lq) return rows;
    return rows.filter((g) =>
      [g.code, g.name, g.description].some((v) => (v ?? "").toLowerCase().includes(lq)),
    );
  }, [groups, q]);

  const byId = useMemo(() => {
    const m = new Map<string, GroupRow>();
    for (const g of (groups ?? []) as GroupRow[]) m.set(g.id, g);
    return m;
  }, [groups]);

  const title = isCustomer ? "Nhóm khách hàng" : "Nhóm nhà cung cấp";
  const Icon = isCustomer ? Users : Building2;
  const backHref = isCustomer ? "/customers" : "/suppliers";
  const totalMembers = ((groups ?? []) as GroupRow[]).reduce((s, g) => s + g.member_count, 0);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FolderTree className="h-6 w-6" /> {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Phân nhóm để báo cáo doanh thu / công nợ theo nhóm.{" "}
            <Link to={backHref} className="text-primary hover:underline">
              ← Quay lại danh sách
            </Link>
          </p>
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus className="mr-2 h-4 w-4" /> Nhóm mới
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Số nhóm</div>
          <div className="mt-1 text-xl font-semibold">{(groups ?? []).length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">
            {isCustomer ? "Khách hàng đã phân nhóm" : "Nhà cung cấp đã phân nhóm"}
          </div>
          <div className="mt-1 text-xl font-semibold">{totalMembers}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Cấp tối đa</div>
          <div className="mt-1 text-xl font-semibold">
            {((groups ?? []) as GroupRow[]).some((g) => g.parent_id) ? "2+ cấp" : "1 cấp"}
          </div>
        </CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm mã, tên nhóm…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Mã</th>
              <th className="px-3 py-2 text-left">Tên nhóm</th>
              <th className="px-3 py-2 text-left">Nhóm cha</th>
              <th className="px-3 py-2 text-right">
                <Icon className="inline h-3.5 w-3.5 mr-1" />
                Số {isCustomer ? "KH" : "NCC"}
              </th>
              <th className="px-3 py-2 text-left hidden md:table-cell">Mô tả</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Đang tải…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Chưa có nhóm nào</td></tr>
            )}
            {filtered.map((g) => (
              <tr key={g.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{g.code ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{g.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {g.parent_id ? byId.get(g.parent_id)?.name ?? "—" : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {g.member_count > 0
                    ? <Badge variant="secondary">{g.member_count}</Badge>
                    : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[260px]">
                  {g.description ?? ""}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(g)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <DeleteButton id={g.id} kind={kind} disabled={g.member_count > 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GroupDialog
        kind={kind}
        groups={(groups ?? []) as GroupRow[]}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["party-groups", kind] }); }}
      />
    </div>
  );
}

function DeleteButton({ id, kind, disabled }: { id: string; kind: "customer" | "supplier"; disabled: boolean }) {
  const del = useServerFn(deletePartyGroup);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id, kind } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["party-groups", kind] });
      toast.success("Đã xoá nhóm");
    },
    onError: (e: any) => toast.error(e?.message ?? "Không xoá được"),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled} title={disabled ? "Nhóm còn thành viên" : "Xoá"}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá nhóm này?</AlertDialogTitle>
          <AlertDialogDescription>Hành động không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Đóng</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Xác nhận xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GroupDialog({
  kind, groups, editing, onClose, onSaved,
}: {
  kind: "customer" | "supplier";
  groups: GroupRow[];
  editing: Partial<GroupRow> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertPartyGroup);
  const [form, setForm] = useState<{ code: string; name: string; parent_id: string; description: string }>({
    code: "", name: "", parent_id: "", description: "",
  });

  // Reset form when editing changes
  useMemo(() => {
    if (editing) {
      setForm({
        code: editing.code ?? "",
        name: editing.name ?? "",
        parent_id: editing.parent_id ?? "",
        description: editing.description ?? "",
      });
    }
  }, [editing]);

  const m = useMutation({
    mutationFn: () => upsert({
      data: {
        id: editing?.id,
        kind,
        code: form.code,
        name: form.name,
        parent_id: form.parent_id,
        description: form.description,
      } as any,
    }),
    onSuccess: () => {
      toast.success(editing?.id ? "Đã cập nhật nhóm" : "Đã tạo nhóm");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
  });

  const parentOptions = groups.filter((g) => g.id !== editing?.id);

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Sửa nhóm" : "Nhóm mới"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Mã nhóm</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="VIP, BÁN_LẺ…" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Tên nhóm *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhóm cha</Label>
            <Select
              value={form.parent_id || "none"}
              onValueChange={(v: string) => setForm({ ...form, parent_id: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">(Không có)</SelectItem>
                {parentOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.code ? `${g.code} — ${g.name}` : g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mô tả</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !form.name.trim()}>
            {m.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
