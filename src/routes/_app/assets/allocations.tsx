import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_app/assets/allocations")({
  component: AssetAllocationsPage,
});

function AssetAllocationsPage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
        <Construction className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Tài sản phân bổ</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tính năng đang được phát triển. Sẽ sớm có mặt trong các bản cập nhật tới.
        </p>
      </div>
    </div>
  );
}
