import { createFileRoute, redirect } from "@tanstack/react-router";

type ReceiptsSearch = { invoice?: string; customer?: string };

export const Route = createFileRoute("/_app/receipts/")({
  validateSearch: (s: Record<string, unknown>): ReceiptsSearch => ({
    invoice: typeof s.invoice === "string" ? s.invoice : undefined,
    customer: typeof s.customer === "string" ? s.customer : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/sales",
      search: {
        tab: "receipts" as const,
        invoice: search.invoice,
        customer: search.customer,
      },
    });
  },
});
