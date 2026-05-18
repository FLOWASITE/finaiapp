import { createFileRoute } from "@tanstack/react-router";
import { VoucherListPage } from "@/components/inventory/VoucherListPage";

export const Route = createFileRoute("/_app/inventory/vouchers-in")({
  component: () => <VoucherListPage type="in" />,
});
