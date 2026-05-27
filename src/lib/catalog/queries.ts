import { queryOptions } from "@tanstack/react-query";
import { loadCatalog } from "./catalog.functions";

export const catalogQueryOptions = queryOptions({
  queryKey: ["catalog"],
  queryFn: () => loadCatalog(),
});
