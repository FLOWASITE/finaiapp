import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/CatalogPage";

export const Route = createFileRoute("/_app/items/")({ component: CatalogPage });
