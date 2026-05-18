import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listCategoriesTree, upsertCategory, deleteCategory } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Layers } from "lucide-react";

export const Route = createFileRoute("/_app/items/categories")({ component: CategoriesPage });

type Cat = { id: string; name: string; parent_id: string | null; sku_count: number };
type Node = Cat & { children: Node[]; total: number };

function buildTree(cats: Cat[]): Node[] {
  const map = new Map<string, Node>();
  cats.forEach((c) => map.set(c.id, { ...c, children: [], total: c.sku_count }));
  const roots: Node[] = [];
  map.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(n);
    else roots.push(n);
  });
  const sum = (n: Node): number => {
    n.total = n.sku_count + n.children.reduce((s, c) => s + sum(c), 0);
    return n.total;
  };
  roots.forEach(sum);
  return roots;
}

function CategoriesPage() {
  const list = useServerFn(listCategoriesTree);
  const { data: cats } = useQuery({ queryKey: ["cat-tree"], queryFn: () => list(),
 ...QUERY_PRESETS.REFERENCE,
});
  const [search, setSearch] = useState("");

  const tree = useMemo(() => buildTree(((cats as any[]) ?? []) as Cat[]), [cats]);
  const flatList = (cats as Cat[]) ?? [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Layers className="h-6 w-6" />Nhóm hàng hoá</h1>
          <p className="text-sm text-muted-foreground">Quản lý cây phân nhóm — hỗ trợ nhóm con không giới hạn.</p>
        </div>
        <CategoryDialog allCats={flatList} />
      </div>

      <Card>
        <CardContent className="p-4">
          <Input placeholder="Tìm theo tên..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {tree.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted-foreground">Chưa có nhóm nào</div>
        ) : (
          <ul>
            {tree.map((n) => (
              <TreeRow key={n.id} node={n} depth={0} allCats={flatList} search={search.toLowerCase()} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TreeRow({ node, depth, allCats, search }: { node: Node; depth: number; allCats: Cat[]; search: string }) {
  const [open, setOpen] = useState(true);
  const match = !search || node.name.toLowerCase().includes(search);
  const childrenMatch = node.children.some((c) => containsMatch(c, search));
  if (!match && !childrenMatch) return null;
  return (
    <>
      <li className="border-t border-border first:border-t-0 flex items-center gap-2 px-4 py-2 hover:bg-muted/30" style={{ paddingLeft: 16 + depth * 24 }}>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(!open)}
          disabled={node.children.length === 0}
          aria-label="toggle"
        >
          {node.children.length > 0 ? (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="inline-block w-4" />}
        </button>
        <span className="flex-1 font-medium">{node.name}</span>
        <Badge variant="outline" className="text-xs">{node.sku_count} trực tiếp</Badge>
        {node.children.length > 0 && <Badge variant="outline" className="text-xs bg-muted">Tổng {node.total}</Badge>}
        <CategoryDialog cat={node} allCats={allCats} />
        <CategoryDialog allCats={allCats} parentId={node.id} addChild />
        <DeleteCategoryButton id={node.id} name={node.name} canDelete={node.children.length === 0 && node.sku_count === 0} />
      </li>
      {open && node.children.map((c) => (
        <TreeRow key={c.id} node={c} depth={depth + 1} allCats={allCats} search={search} />
      ))}
    </>
  );
}

function containsMatch(n: Node, s: string): boolean {
  if (!s) return true;
  if (n.name.toLowerCase().includes(s)) return true;
  return n.children.some((c) => containsMatch(c, s));
}

function CategoryDialog({ cat, allCats, parentId, addChild }: { cat?: Cat; allCats: Cat[]; parentId?: string; addChild?: boolean }) {
  const up = useServerFn(upsertCategory);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    name: cat?.name ?? "",
    parent_id: (cat?.parent_id ?? parentId ?? "") as string,
  }));

  const m = useMutation({
    mutationFn: () => up({ data: { id: cat?.id, name: form.name, parent_id: form.parent_id || null } as any }),
    onSuccess: () => {
      toast.success(cat ? "Đã cập nhật" : "Đã thêm nhóm");
      qc.invalidateQueries({ queryKey: ["cat-tree"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      setOpen(false);
      if (!cat) setForm({ name: "", parent_id: parentId ?? "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cannot pick self/descendant as parent
  const invalidParents = useMemo(() => {
    if (!cat) return new Set<string>();
    const bad = new Set<string>([cat.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of allCats) {
        if (c.parent_id && bad.has(c.parent_id) && !bad.has(c.id)) { bad.add(c.id); changed = true; }
      }
    }
    return bad;
  }, [cat, allCats]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {cat ? (
          <Button variant="ghost" size="icon" title="Sửa"><Pencil className="h-4 w-4" /></Button>
        ) : addChild ? (
          <Button variant="ghost" size="icon" title="Thêm nhóm con"><Plus className="h-4 w-4" /></Button>
        ) : (
          <Button><Plus className="mr-2 h-4 w-4" />Thêm nhóm</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{cat ? "Sửa nhóm" : addChild ? "Thêm nhóm con" : "Thêm nhóm"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Tên nhóm *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhóm cha</Label>
            <Select value={form.parent_id || "__none__"} onValueChange={(v) => setForm({ ...form, parent_id: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Không (nhóm gốc)</SelectItem>
                {allCats.filter((c) => !invalidParents.has(c.id)).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
          <Button onClick={() => m.mutate()} disabled={!form.name.trim() || m.isPending}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryButton({ id, name, canDelete }: { id: string; name: string; canDelete: boolean }) {
  const del = useServerFn(deleteCategory);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { toast.success("Đã xoá"); qc.invalidateQueries({ queryKey: ["cat-tree"] }); qc.invalidateQueries({ queryKey: ["categories"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-rose-600" disabled={!canDelete} title={canDelete ? "Xoá" : "Còn nhóm con hoặc mặt hàng"}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xoá nhóm "{name}"?</AlertDialogTitle>
          <AlertDialogDescription>Hành động này không thể hoàn tác.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>Xoá</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
