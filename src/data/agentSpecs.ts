import type { AgentId, AgentSpec } from "@/types/agent";
import { extractSpec } from "./specs/extract";
import { categorizeSpec } from "./specs/categorize";
import { reconcileSpec } from "./specs/reconcile";
import { taxSpec } from "./specs/tax";
import { alertSpec } from "./specs/alert";
import { reportSpec } from "./specs/report";

export const agentSpecs: Record<AgentId, AgentSpec> = {
  extract: extractSpec,
  categorize: categorizeSpec,
  reconcile: reconcileSpec,
  tax: taxSpec,
  alert: alertSpec,
  report: reportSpec,
};
