import { createFileRoute } from "@tanstack/react-router";
import { PartyGroupsPage } from "@/components/party-groups-page";

export const Route = createFileRoute("/_app/customers/groups")({
  component: () => <PartyGroupsPage kind="customer" />,
});
