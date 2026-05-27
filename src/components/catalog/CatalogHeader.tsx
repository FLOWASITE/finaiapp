import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalogStore } from "@/stores/catalogStore";
import { RegimeSwitch } from "./RegimeSwitch";
import { ItemCreateDialog } from "./ItemCreateDialog";

export function CatalogHeader() {
  const company = useCatalogStore((s) => s.company);
  const [open, setOpen] = useState(false);

  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-[#04342C]">
          Danh mục hàng hóa, dịch vụ
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#2C2C2A]">
          <span className="font-medium">{company.name}</span>
          <span className="text-muted-foreground hidden md:inline">·</span>
          <RegimeSwitch />
        </div>
      </div>
      <Button
        className="bg-[#0F6E56] hover:bg-[#085041] text-white"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1.5" /> Tạo mới
      </Button>
      <ItemCreateDialog open={open} onOpenChange={setOpen} />
    </header>
  );
}
