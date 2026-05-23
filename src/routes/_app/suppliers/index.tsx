import { createFileRoute } from "@tanstack/react-router";
import { PartyListEnhanced } from "@/components/parties/party-list-enhanced";

export const Route = createFileRoute("/_app/suppliers/")({ component: SuppliersPage });

function SuppliersPage() {
  return <PartyListEnhanced kind="supplier" />;
}
