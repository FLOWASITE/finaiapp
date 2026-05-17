import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/sales-dashboard/")({
  beforeLoad: () => {
    throw redirect({ to: "/sales" });
  },
});
