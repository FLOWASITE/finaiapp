import { createFileRoute } from "@tanstack/react-router";
import { PartyListEnhanced } from "@/components/parties/party-list-enhanced";

export const Route = createFileRoute("/_app/customers/")({ component: CustomersPage });

function CustomersPage() {
  return <PartyListEnhanced kind="customer" />;
}
