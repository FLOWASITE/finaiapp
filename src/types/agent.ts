export type AgentId =
  | "extract"
  | "categorize"
  | "reconcile"
  | "tax"
  | "alert"
  | "report";

export type AgentStatus =
  | "online"
  | "working"
  | "idle"
  | "warning"
  | "error"
  | "disabled";

export type AgentMode = "auto" | "suggest" | "learn_only" | "disabled";

export type ConfidenceProfile = "strict" | "balanced" | "flexible";

export type AgentActivity = {
  id: string;
  timestamp: string;
  action: string;
  result: "success" | "warning" | "error";
  details?: string;
  related_transaction_id?: string;
  duration_ms?: number;
};

export type AgentSettings = {
  enabled: boolean;
  mode: AgentMode;
  confidence_threshold: number;
  confidence_profile: ConfidenceProfile;
  custom_instructions?: string;
  notify_on: {
    error: boolean;
    warning: boolean;
    completion: boolean;
  };
  schedule?: {
    type: "always" | "business_hours" | "off_hours" | "custom";
    custom_cron?: string;
  };
};

export type Agent = {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  icon: string;
  color: { bg: string; icon: string; accent: string };
  status: AgentStatus;
  status_message?: string;
  stats: {
    tasks_today: number;
    tasks_total: number;
    success_rate: number;
    avg_duration_ms: number;
    last_run?: string;
    last_error?: { timestamp: string; message: string };
  };
  settings: AgentSettings;
  connected_rules_count: number;
  connected_rules_ids: string[];
  recent_activity: AgentActivity[];
  depends_on: AgentId[];
  feeds_into: AgentId[];
};

export type OrchestrationFlow = {
  trigger: string;
  steps: {
    agent_id: AgentId;
    order: number;
    parallel_group?: number;
    optional: boolean;
    condition?: string;
  }[];
};
