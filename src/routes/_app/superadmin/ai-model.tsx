import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Cpu } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AiAgentsPanel } from "@/components/ai-agents-panel";
import { AiProvidersPanel } from "@/components/ai-providers-panel";

export const Route = createFileRoute("/_app/superadmin/ai-model")({
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (s.tab === "agents" ? "agents" : "providers") as "providers" | "agents",
  }),
  component: AiModelPage,
});

function AiModelPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">AI Model</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý nhiều Provider OpenAI-compatible và gán model cho từng Agent.
          Khi không cấu hình, hệ thống tự fallback sang Lovable AI.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v as "providers" | "agents" }, replace: true })
        }
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="providers">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Providers
          </TabsTrigger>
          <TabsTrigger value="agents">
            <Cpu className="h-3.5 w-3.5 mr-1.5" /> Theo Agent
          </TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          <AiProvidersPanel />
        </TabsContent>
        <TabsContent value="agents" className="mt-4">
          <AiAgentsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
