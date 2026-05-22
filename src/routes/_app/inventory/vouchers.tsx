import { createFileRoute } from "@tanstack/react-router";
import { VoucherListPage } from "@/components/inventory/VoucherListPage";

export const Route = createFileRoute("/_app/inventory/vouchers")({
  component: () => <VoucherListPage type="all" />,
});
