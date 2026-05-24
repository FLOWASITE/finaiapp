import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/superadmin/ai-agents")({
  beforeLoad: () => {
    throw redirect({ to: "/superadmin/ai-model", search: { tab: "agents" } as any });
  },
  component: () => null,
});
