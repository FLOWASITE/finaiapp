import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/payables/")({
  beforeLoad: () => {
    throw redirect({ to: "/purchases", search: { tab: "payments" } });
  },
  component: () => null,
});
