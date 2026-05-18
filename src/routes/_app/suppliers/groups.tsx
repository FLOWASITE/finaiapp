import { createFileRoute } from "@tanstack/react-router";
import { PartyGroupsPage } from "@/components/party-groups-page";

export const Route = createFileRoute("/_app/suppliers/groups")({
  component: () => <PartyGroupsPage kind="supplier" />,
});
