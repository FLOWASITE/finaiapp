import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { useCatalogStore } from "@/stores/catalogStore";

export const CatalogSearchBar = forwardRef<HTMLInputElement>(function CatalogSearchBar(_, ref) {
  const q = useCatalogStore((s) => s.searchQuery);
  const setQ = useCatalogStore((s) => s.setSearchQuery);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Tìm "tiền điện", "Facebook Ads", "EVN HCMC"...`}
        className="pl-9 pr-9 h-10 bg-white"
      />
      {q && (
        <button
          onClick={() => setQ("")}
          aria-label="Xoá tìm kiếm"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});
