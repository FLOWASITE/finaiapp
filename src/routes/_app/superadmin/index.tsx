import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, ClipboardList, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/_app/superadmin/")({
  component: TenantsPage,
});

function TenantsPage() {
  const shortcuts = [
    {
      to: "/superadmin/organizations",
      title: "Tổ chức",
      desc: "Quản lý tenant, gói sử dụng, trạng thái và thành viên.",
      icon: Building2,
    },
    {
      to: "/superadmin/accounts",
      title: "Tài khoản",
      desc: "Quản lý người dùng, vai trò, khóa tài khoản và reset MFA.",
      icon: Users,
    },
    {
      to: "/superadmin/audit",
      title: "Nhật ký",
      desc: "Theo dõi thao tác quản trị và các hoạt động nhạy cảm.",
      icon: ClipboardList,
    },
    {
      to: "/superadmin/security",
      title: "Bảo mật",
      desc: "Kiểm tra chính sách bảo mật, allowlist và cấu hình hệ thống.",
      icon: ShieldCheck,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.to} className="p-4">
              <div className="flex h-full flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-muted p-2 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-medium tracking-tight">{item.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-auto w-fit">
                  <Link to={item.to}>Mở</Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
