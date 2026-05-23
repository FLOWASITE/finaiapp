import { createServerFn } from "@tanstack/react-start";
import { withTenant } from "@/integrations/supabase/with-tenant";

export const getOfficeDashboard = createServerFn({ method: "GET" })
  .middleware([withTenant])
  .handler(async ({ context }) => {
    const { supabase, tenantId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    const [clients, tasksAll, overdue, dueSoon, expiringContracts, staff] = await Promise.all([
      supabase
        .from("office_client_links")
        .select("id", { count: "exact", head: true })
        .eq("agency_tenant_id", tenantId)
        .eq("status", "active"),
      supabase
        .from("office_tasks")
        .select("status", { count: "exact" })
        .eq("agency_tenant_id", tenantId)
        .neq("status", "done")
        .neq("status", "cancelled"),
      supabase
        .from("office_tasks")
        .select("id", { count: "exact", head: true })
        .eq("agency_tenant_id", tenantId)
        .lt("due_date", today)
        .neq("status", "done")
        .neq("status", "cancelled"),
      supabase
        .from("office_tasks")
        .select("id", { count: "exact", head: true })
        .eq("agency_tenant_id", tenantId)
        .gte("due_date", today)
        .lte("due_date", in14)
        .neq("status", "done"),
      supabase
        .from("office_contracts")
        .select("id, contract_no, end_date", { count: "exact" })
        .eq("agency_tenant_id", tenantId)
        .lte("end_date", in30)
        .gte("end_date", today)
        .order("end_date", { ascending: true }),
      supabase
        .from("office_staff")
        .select("id", { count: "exact", head: true })
        .eq("agency_tenant_id", tenantId)
        .eq("status", "active"),
    ]);

    const tasksByStatus: Record<string, number> = {};
    (tasksAll.data ?? []).forEach((r: { status: string }) => {
      tasksByStatus[r.status] = (tasksByStatus[r.status] ?? 0) + 1;
    });

    return {
      activeClients: clients.count ?? 0,
      activeStaff: staff.count ?? 0,
      openTasks: tasksAll.count ?? 0,
      overdueTasks: overdue.count ?? 0,
      dueSoonTasks: dueSoon.count ?? 0,
      tasksByStatus,
      expiringContracts: expiringContracts.data ?? [],
    };
  });
