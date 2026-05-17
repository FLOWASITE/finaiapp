import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { exportTenantBackup } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_app/admin/backup")({ component: BackupPage });

function BackupPage() {
  const fn = useServerFn(exportTenantBackup);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const dump = await fn();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      toast.success("Đã tải sao lưu");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6 space-y-3">
      <h2 className="text-sm font-semibold">Sao lưu dữ liệu</h2>
      <p className="text-sm text-muted-foreground">Xuất toàn bộ dữ liệu công ty (hóa đơn, bút toán, lương, tài sản, danh mục) ra tệp JSON để lưu trữ ngoài hệ thống.</p>
      <Button onClick={run} disabled={busy}><Download className="mr-1.5 h-4 w-4" />{busy ? "Đang xuất…" : "Tải sao lưu JSON"}</Button>
    </Card>
  );
}
