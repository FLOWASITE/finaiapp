import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Trash2, Package, Wrench, Briefcase, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listLineClassifications,
  updateLineClassification,
  deleteLineClassification,
  type LineClassificationRow,
} from "@/lib/ai/line-classifications.functions";
import { cn } from "@/lib/utils";

type Kind = "goods" | "fixed_asset" | "ccdc" | "service";

const KIND_META: Record<Kind, { label: string; account: string; Icon: any; color: string }> = {
  goods: { label: "Hàng hóa", account: "156", Icon: Package, color: "#0F6E56" },
  fixed_asset: { label: "TSCĐ", account: "211", Icon: Building2, color: "#4F46C7" },
  ccdc: { label: "CCDC", account: "153", Icon: Wrench, color: "#B45309" },
  service: { label: "Dịch vụ", account: "642", Icon: Briefcase, color: "#6B7280" },
};

export function ClassificationsTab() {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");

  const listFn = useServerFn(listLineClassifications);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["ai-line-classifications", search, kindFilter],
    queryFn: () =>
      listFn({
        data: {
          search: search.trim() || undefined,
          kind: kindFilter === "all" ? undefined : kindFilter,
        },
      }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["ai-line-classifications"] });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm mặt hàng đã ghi nhớ…"
              className="h-9 pl-8 text-[13px]"
            />
          </div>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
            <SelectTrigger className="h-9 w-[150px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả phân loại</SelectItem>
              <SelectItem value="goods">Hàng hóa</SelectItem>
              <SelectItem value="fixed_asset">TSCĐ</SelectItem>
              <SelectItem value="ccdc">CCDC</SelectItem>
              <SelectItem value="service">Dịch vụ</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          AI nhớ {rows?.length ?? 0} mặt hàng. Sửa hoặc xoá để AI học lại.
        </p>
      </div>

      {isLoading ? (
        <>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </>
      ) : (rows ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Chưa có ghi nhớ nào. Khi bạn xác nhận hoặc sửa phân loại trên hóa đơn,
          AI sẽ ghi nhớ tại đây.
        </div>
      ) : (
        <div className="space-y-2">
          {(rows ?? []).map((r) => (
            <ClassificationRow key={r.id} row={r} onChanged={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassificationRow({
  row,
  onChanged,
}: {
  row: LineClassificationRow;
  onChanged: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateFn = useServerFn(updateLineClassification);
  const deleteFn = useServerFn(deleteLineClassification);

  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      onChanged();
      toast.success("Đã cập nhật");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      onChanged();
      setDeleteOpen(false);
      toast.success("Đã xoá ghi nhớ");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const meta = KIND_META[row.kind];
  const lastUsed = new Date(row.last_used_at).toLocaleDateString("vi-VN");

  const handleKindChange = (newKind: Kind) => {
    const newAccount = KIND_META[newKind].account;
    updateM.mutate({ data: { id: row.id, kind: newKind, account: newAccount } });
  };

  return (
    <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${meta.color}15`, color: meta.color }}
        >
          <meta.Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-snug">{row.line_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {row.supplier_name ? (
              <span>NCC: {row.supplier_name}</span>
            ) : row.supplier_tax_id ? (
              <span>MST: {row.supplier_tax_id}</span>
            ) : (
              <span className="italic">Áp dụng mọi NCC</span>
            )}
            <span>·</span>
            <span>Đã dùng {row.hit_count} lần</span>
            <span>·</span>
            <span>Gần nhất: {lastUsed}</span>
            {row.source === "user_override" && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                Bạn dạy
              </Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Select value={row.kind} onValueChange={(v) => handleKindChange(v as Kind)}>
            <SelectTrigger className="h-8 w-[140px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="goods">Hàng hóa → 156</SelectItem>
              <SelectItem value="fixed_asset">TSCĐ → 211</SelectItem>
              <SelectItem value="ccdc">CCDC → 153</SelectItem>
              <SelectItem value="service">Dịch vụ → 642</SelectItem>
            </SelectContent>
          </Select>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono tabular-nums">
            TK {row.account}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá ghi nhớ này?</AlertDialogTitle>
            <AlertDialogDescription>
              AI sẽ phân loại lại "{row.line_name}" bằng quy tắc mặc định khi gặp lần sau.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteM.mutate({ data: { id: row.id } })}
              className={cn("bg-destructive hover:bg-destructive/90")}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
