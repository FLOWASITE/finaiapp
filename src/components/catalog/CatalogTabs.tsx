import { Sparkles } from "lucide-react";
import { useCatalogStore, TabKey } from "@/stores/catalogStore";

export function CatalogTabs() {
  const activeTab = useCatalogStore((s) => s.activeTab);
  const setActiveTab = useCatalogStore((s) => s.setActiveTab);
  const items = useCatalogStore((s) => s.items);

  const counts = {
    mine: items.filter((i) => i.isActive).length,
    suggested: items.filter((i) => !i.isActive && i.isAiSuggested).length,
    library: items.length,
  };

  const TABS: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: "mine", label: "Của tôi" },
    {
      key: "suggested",
      label: "Fin đề xuất",
      icon: <Sparkles className="h-3.5 w-3.5 text-[#1D9E75]" />,
    },
    { key: "library", label: "Thư viện" },
  ];

  return (
    <div className="flex items-center gap-6 border-b border-gray-200">
      {TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`relative flex items-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              active ? "text-[#0F6E56]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
            <span
              className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                active ? "bg-[#E1F5EE] text-[#0F6E56]" : "bg-[#F1EFE8] text-[#2C2C2A]"
              }`}
            >
              {counts[t.key]}
            </span>
            {active && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-[#0F6E56] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
