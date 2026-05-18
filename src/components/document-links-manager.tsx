import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_PRESETS } from "@/lib/query-presets";
import { toast } from "sonner";
import { Paperclip, X, FileText, Plus, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listLinkedDocuments,
  listAttachableDocuments,
  linkDocument,
  unlinkDocument,
  type DocTable,
} from "@/lib/documents.functions";

export function DocumentLinksManager({
  entityTable,
  entityId,
  disabled,
}: {
  entityTable: DocTable;
  entityId: string | null | undefined;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const listLinked = useServerFn(listLinkedDocuments);
  const unlinkFn = useServerFn(unlinkDocument);
  const [pickerOpen, setPickerOpen] = useState(false);

  const linkedKey = ["doc-links", entityTable, entityId];
  const { data, isLoading } = useQuery({
    queryKey: linkedKey,
    queryFn: () => listLinked({ data: { entity_table: entityTable, entity_id: entityId! } }),
    enabled: !!entityId,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const unlinkMut = useMutation({
    mutationFn: (document_id: string) =>
      unlinkFn({ data: { document_id, entity_table: entityTable, entity_id: entityId! } }),
    onSuccess: () => {
      toast.success("Đã gỡ liên kết tài liệu");
      qc.invalidateQueries({ queryKey: linkedKey });
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi gỡ liên kết"),
  });

  if (!entityId) {
    return (
      <div className="rounded border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        Lưu chứng từ trước để có thể đính kèm tài liệu.
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Tài liệu đính kèm
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="mr-1 h-3 w-3" /> Đính kèm
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Chưa có tài liệu đính kèm. Bấm “Đính kèm” để chọn từ kho tài liệu.
        </div>
      ) : (
        <ul className="space-y-1">
          {rows.map((l: any) => {
            const doc = l.documents;
            return (
              <li
                key={l.document_id}
                className="flex items-center justify-between gap-2 rounded border border-border/50 p-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {doc?.original_filename ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {doc?.doc_kind ?? "—"} · {l.link_type}
                      {doc?.size_bytes ? ` · ${(doc.size_bytes / 1024).toFixed(0)} KB` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || unlinkMut.isPending}
                  onClick={() => unlinkMut.mutate(l.document_id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AttachPicker
        entityTable={entityTable}
        entityId={entityId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onLinked={() => qc.invalidateQueries({ queryKey: linkedKey })}
      />
    </div>
  );
}

function AttachPicker({
  entityTable,
  entityId,
  open,
  onOpenChange,
  onLinked,
}: {
  entityTable: DocTable;
  entityId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLinked: () => void;
}) {
  const listFn = useServerFn(listAttachableDocuments);
  const linkFn = useServerFn(linkDocument);
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["attachable-docs", entityTable, entityId, search],
    queryFn: () =>
      listFn({
        data: { entity_table: entityTable, entity_id: entityId, search: search || undefined },
      }),
    enabled: open,
    ...QUERY_PRESETS.TRANSACTIONAL,
  });

  const linkMut = useMutation({
    mutationFn: (document_id: string) =>
      linkFn({
        data: {
          document_id,
          entity_table: entityTable,
          entity_id: entityId,
          link_type: "attachment",
        },
      }),
    onSuccess: () => {
      toast.success("Đã đính kèm tài liệu");
      onLinked();
      refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "Lỗi đính kèm"),
  });

  const rows = data?.rows ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn tài liệu để đính kèm</DialogTitle>
          <DialogDescription>
            Chỉ hiển thị các tài liệu chưa được gắn vào chứng từ này. Cần upload file mới? Vào{" "}
            <Link to="/documents" className="underline">
              Tài liệu
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên file…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {isLoading && <div className="text-sm text-muted-foreground">Đang tải…</div>}
          {!isLoading && rows.length === 0 && (
            <div className="rounded border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
              Không có tài liệu phù hợp.
            </div>
          )}
          {rows.map((d: any) => (
            <button
              key={d.id}
              type="button"
              disabled={linkMut.isPending}
              onClick={() => linkMut.mutate(d.id)}
              className="flex w-full items-center justify-between gap-2 rounded border border-border/50 p-2 text-left text-sm hover:bg-muted/40 disabled:opacity-60"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.original_filename ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.doc_kind ?? "—"}
                    {d.size_bytes ? ` · ${(d.size_bytes / 1024).toFixed(0)} KB` : ""} ·{" "}
                    {new Date(d.created_at).toLocaleDateString("vi-VN")}
                  </div>
                </div>
              </div>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
