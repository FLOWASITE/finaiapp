import { createFileRoute } from "@tanstack/react-router";
import { PurchaseTabs } from "@/components/purchases/PurchaseTabs";
import { Button } from "@/components/ui/button";
import { PackageX, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/purchases/returns")({
  component: PurchaseReturnsPage,
});

function PurchaseReturnsPage() {
  return (
    <div className="flex flex-col">
      <PurchaseTabs />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Hàng mua trả lại</h1>
            <p className="text-sm text-muted-foreground mt-1">Quản lý các phiếu trả lại hàng cho nhà cung cấp</p>
          </div>
          <Button disabled><Plus className="h-4 w-4 mr-2" /> Tạo phiếu trả lại</Button>
        </div>
        <div className="border rounded-lg p-12 flex flex-col items-center justify-center text-center bg-muted/20">
          <PackageX className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Chưa có phiếu trả lại nào</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">Tính năng đang được phát triển.</p>
        </div>
      </div>
    </div>
  );
}
