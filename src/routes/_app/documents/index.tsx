import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listDocuments,
  getDocument,
  deleteDocument,
} from "@/lib/documents.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Trash2, Eye, ExternalLink } from "lucide-react";
import { DocStatusBadge } from "@/components/doc-status-badge";

export const Route = createFileRoute("/_app/documents/")({
  component: DocumentsPage,
});

const OCR_LABELS: Record<string, string> = {
  pending: "Chờ OCR",
  processing: "Đang xử lý",
  done: "Hoàn tất",
  failed: "Lỗi",
  skipped: "Bỏ qua",
};

const KIND_LABELS: Record<string, string> = {
  einvoice: "Hoá đơn điện tử",
  invoice: "Hoá đơn",
  receipt: "Phiếu thu/chi",
  bank: "Sao kê NH",
  contract: "Hợp đồng",
  other: "Khác",
};

function DocumentsPage() {
  const list = useServerFn(listDocuments);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["documents", search],
    queryFn: () => list({ data: { search: search || undefined, limit: 100, offset: 0 } }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tài liệu</h1>
          <p className="text-sm text-muted-foreground">
            Kho lưu trữ tập trung — file, OCR và liên kết với chứng từ.
          </p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Tìm theo tên file..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên file</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Nguồn</TableHead>
                <TableHead>OCR</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((d: any) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <button
                      className="flex items-center gap-2 hover:underline text-left"
                      onClick={() => setOpenId(d.id)}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate max-w-xs">
                        {d.original_filename ?? d.storage_path?.split("/").pop() ?? "—"}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{KIND_LABELS[d.doc_kind] ?? d.doc_kind}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{d.source}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{OCR_LABELS[d.ocr_status] ?? d.ocr_status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString("vi-VN")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setOpenId(d.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Chưa có tài liệu nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <DocumentDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function DocumentDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const getDoc = useServerFn(getDocument);
  const delDoc = useServerFn(deleteDocument);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: () => getDoc({ data: { id: id! } }),
    enabled: !!id,
  });

  const delMut = useMutation({
    mutationFn: () => delDoc({ data: { id: id! } }),
    onSuccess: () => {
      toast.success("Đã xoá tài liệu");
      qc.invalidateQueries({ queryKey: ["documents"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doc = data?.doc;
  const isImage = doc?.mime_type?.startsWith("image/");
  const isPdf = doc?.mime_type === "application/pdf";

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{doc?.original_filename ?? "Tài liệu"}</SheetTitle>
          <SheetDescription>
            {doc && (
              <>
                {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(1)} KB · ` : ""}
                {doc.mime_type}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <Skeleton className="h-64 w-full mt-4" />
        ) : doc ? (
          <div className="space-y-4 mt-4">
            <div className="flex gap-2">
              {data.signedUrl && (
                <>
                  <Button asChild variant="outline" size="sm">
                    <a href={data.signedUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" /> Mở
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={data.signedUrl} download={doc.original_filename ?? ""}>
                      <Download className="h-4 w-4 mr-1" /> Tải về
                    </a>
                  </Button>
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-1" /> Xoá
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Xoá tài liệu?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Hành động không thể hoàn tác. Nếu tài liệu đang liên kết với chứng từ, hệ
                      thống sẽ chặn xoá.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Huỷ</AlertDialogCancel>
                    <AlertDialogAction onClick={() => delMut.mutate()}>Xoá</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Xem trước</TabsTrigger>
                <TabsTrigger value="ocr">OCR</TabsTrigger>
                <TabsTrigger value="links">Liên kết ({data.links.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-3">
                {data.signedUrl && isImage && (
                  <img
                    src={data.signedUrl}
                    alt={doc.original_filename ?? ""}
                    className="max-w-full rounded border"
                  />
                )}
                {data.signedUrl && isPdf && (
                  <iframe
                    src={data.signedUrl}
                    className="w-full h-[600px] rounded border"
                    title="PDF preview"
                  />
                )}
                {data.signedUrl && !isImage && !isPdf && (
                  <p className="text-sm text-muted-foreground">
                    Không hỗ trợ xem trước định dạng này. Bấm "Tải về" để xem.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="ocr" className="mt-3">
                {doc.ocr_extracted ? (
                  <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                    {JSON.stringify(doc.ocr_extracted, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu OCR.</p>
                )}
              </TabsContent>

              <TabsContent value="links" className="mt-3">
                {data.links.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa liên kết với chứng từ nào.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.links.map((l: any) => (
                      <li
                        key={l.entity_table + l.entity_id}
                        className="flex items-center justify-between border rounded p-2 text-sm"
                      >
                        <div>
                          <Badge variant="outline" className="mr-2">
                            {l.entity_table}
                          </Badge>
                          <span className="text-muted-foreground">{l.link_type}</span>
                        </div>
                        <code className="text-xs text-muted-foreground">
                          {l.entity_id.slice(0, 8)}…
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
