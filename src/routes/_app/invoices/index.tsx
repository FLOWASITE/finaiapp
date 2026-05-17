import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { extractInvoice } from "@/lib/invoices.functions";

export const Route = createFileRoute("/_app/invoices/")({
  component: InvoicesList,
});

function InvoicesList() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const extract = useServerFn(extractInvoice);

  const { data: invoices, refetch } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, supplier_name, invoice_no, issue_date, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Chưa đăng nhập");

      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file);
      if (upErr) throw upErr;

      const { data: inv, error: insErr } = await supabase
        .from("invoices")
        .insert({ user_id: userId, file_path: path, status: "pending" })
        .select("id")
        .single();
      if (insErr || !inv) throw insErr || new Error("Không tạo được hóa đơn");

      toast.info("Đang bóc tách bằng AI...");
      await extract({ data: { invoiceId: inv.id } });
      toast.success("Bóc tách xong");
      await refetch();
      router.navigate({ to: "/invoices/$id", params: { id: inv.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hóa đơn đầu vào</h1>
          <p className="text-sm text-muted-foreground">Upload ảnh hoặc PDF — AI tự bóc tách</p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Đang xử lý..." : "Upload hóa đơn"}
          </Button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Ngày HĐ</th>
              <th className="px-4 py-3">Số HĐ</th>
              <th className="px-4 py-3">Nhà cung cấp</th>
              <th className="px-4 py-3 text-right">Tổng tiền</th>
              <th className="px-4 py-3">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((i) => (
              <tr key={i.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3">
                  <Link to="/invoices/$id" params={{ id: i.id }} className="text-accent">
                    {i.issue_date ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3">{i.invoice_no ?? "—"}</td>
                <td className="px-4 py-3">{i.supplier_name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {Number(i.total || 0).toLocaleString("vi-VN")}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
            {(invoices ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  Chưa có hóa đơn. Upload file đầu tiên để bắt đầu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Chờ OCR", cls: "bg-muted text-muted-foreground" },
    extracted: { label: "Đã bóc tách", cls: "bg-accent/15 text-accent-foreground" },
    reviewed: { label: "Đã review", cls: "bg-accent/15 text-accent-foreground" },
    approved: { label: "Đã ghi sổ", cls: "bg-accent text-accent-foreground" },
    failed: { label: "Lỗi", cls: "bg-destructive/15 text-destructive" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}
