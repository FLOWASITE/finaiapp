import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Briefcase } from "lucide-react";
import { BusinessActivitySection } from "@/components/settings/business-activity-section";

export const Route = createFileRoute("/_app/settings/business-activity")({
  component: BusinessActivityPage,
});

function BusinessActivityPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Cài đặt
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Briefcase className="h-6 w-6" />
          Hoạt động kinh doanh & Danh mục mặt hàng
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Giúp Fin hạch toán đúng tài khoản (152/153/156/211/213/242) cho từng mặt hàng
          trên hoá đơn đầu vào.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hoạt động & Mặt hàng kinh doanh</CardTitle>
          <CardDescription>
            Loại hình hoạt động, ngưỡng phân bổ CCDC, và danh mục mặt hàng bán lại.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessActivitySection />
        </CardContent>
      </Card>
    </div>
  );
}
