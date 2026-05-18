import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, FileText } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { DocStatusBadge } from "@/components/doc-status-badge";
import { DocStatusActions } from "@/components/doc-status-actions";
import { DocStatusHistory } from "@/components/doc-status-history";
import { DocumentLinksManager } from "@/components/document-links-manager";
import {
  listLinkedDocuments,
  getDocument,
} from "@/lib/documents.functions";

const OCR_LABELS: Record<string, string> = {
  pending: "Chờ OCR",
  processing: "Đang xử lý",
  done: "Hoàn tất",
  failed: "Lỗi",
  skipped: "Bỏ qua",
};

export function ReceiptDocsSheet({
  open,
  onOpenChange,
  receiptId,
  status,
  hasJournalEntry,
  title,
  description,
  invalidateKeys = ["receipts"],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receiptId: string | null;
  status: string | null | undefined;
  hasJournalEntry: boolean;
  title?: string;
  description?: string;
  invalidateKeys?: string[];
}) {
  const listLinked = useServerFn(listLinkedDocuments);
  const { data, isLoading } = useQuery({
    queryKey: ["doc-links", "customer_receipts", receiptId],
    queryFn: () =>
      listLinked({
        data: { entity_table: "customer_receipts", entity_id: receiptId! },
      }),
    enabled: !!receiptId && open,
  });

  const rows = data?.rows ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title ?? "Tài liệu của phiếu thu"}</SheetTitle>
          <SheetDescription>
            {description ?? "Xem OCR, đổi trạng thái và quản lý đính kèm."}
          </SheetDescription>
        </SheetHeader>

        {!receiptId ? null : (
          <div className="mt-4 space-y-5">
            {/* Status row */}
            <div className="flex items-center justify-between rounded border border-border/60 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Trạng thái</span>
                <DocStatusBadge status={status} />
              </div>
              <DocStatusActions
                table="customer_receipts"
                id={receiptId}
                status={status ?? "uploaded"}
                hasJournalEntry={hasJournalEntry}
                invalidateKeys={invalidateKeys}
              />
            </div>

            {/* Attach manager */}
            <DocumentLinksManager
              entityTable="customer_receipts"
              entityId={receiptId}
            />

            {/* OCR per linked doc */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Dữ liệu OCR</div>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Đính kèm tài liệu để xem dữ liệu OCR.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((l: any) => (
                    <LinkedDocOcr key={l.document_id} doc={l.documents} />
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Status history */}
            <div>
              <div className="text-sm font-medium mb-2">Lịch sử trạng thái</div>
              <DocStatusHistory table="customer_receipts" id={receiptId} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LinkedDocOcr({ doc }: { doc: any }) {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const getDoc = useServerFn(getDocument);
  const qc = useQueryClient();

  const { data: signedData } = useQuery({
    queryKey: ["doc-signed", doc?.id],
    queryFn: () => getDoc({ data: { id: doc.id } }),
    enabled: !!doc?.id && previewOpen,
  });

  if (!doc) return null;
  const hasOcr = doc.ocr_extracted && Object.keys(doc.ocr_extracted).length > 0;

  return (
    <li className="rounded border border-border/60 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {doc.original_filename ?? "—"}
          </span>
          <Badge variant="secondary" className="ml-1 shrink-0">
            {OCR_LABELS[doc.ocr_status] ?? doc.ocr_status ?? "—"}
          </Badge>
        </button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setPreviewOpen(true);
            qc.invalidateQueries({ queryKey: ["doc-signed", doc.id] });
          }}
        >
          <ExternalLink className="mr-1 h-3 w-3" /> Mở file
        </Button>
      </div>

      {previewOpen && signedData?.signedUrl && (
        <div className="mt-2 text-xs">
          <a
            href={signedData.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {signedData.signedUrl.slice(0, 60)}… (mở ở tab mới)
          </a>
        </div>
      )}

      {expanded && (
        <div className="mt-2">
          {hasOcr ? (
            <pre className="max-h-72 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(doc.ocr_extracted, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground">
              Chưa có dữ liệu OCR cho tài liệu này.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
