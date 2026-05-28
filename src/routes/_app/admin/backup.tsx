import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/backup")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/data/export" });
  },
});
