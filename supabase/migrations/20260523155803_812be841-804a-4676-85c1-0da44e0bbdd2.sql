
CREATE UNIQUE INDEX IF NOT EXISTS idx_office_tasks_recurring_unique
  ON public.office_tasks (recurring_template_id, COALESCE(link_id, '00000000-0000-0000-0000-000000000000'::uuid), period_year, period_month)
  WHERE recurring_template_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.office_generate_recurring_tasks(p_agency uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  l record;
  v_due date;
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE);
  v_month int := EXTRACT(MONTH FROM CURRENT_DATE);
  v_inserted int := 0;
BEGIN
  FOR t IN
    SELECT * FROM public.office_task_templates
    WHERE active = true
      AND (p_agency IS NULL OR agency_tenant_id = p_agency)
  LOOP
    -- compute due date for this period
    IF t.rule_type = 'monthly_day' THEN
      v_due := make_date(v_year, v_month, LEAST(COALESCE(t.rule_day, 1), 28));
    ELSIF t.rule_type = 'yearly' THEN
      v_due := make_date(v_year, COALESCE(t.rule_month, v_month), LEAST(COALESCE(t.rule_day, 1), 28));
      IF v_due < CURRENT_DATE - INTERVAL '7 days' THEN
        CONTINUE;
      END IF;
    ELSIF t.rule_type = 'quarterly' THEN
      -- end of last quarter + rule_day
      v_due := make_date(v_year, ((((v_month - 1) / 3) * 3) + 1), LEAST(COALESCE(t.rule_day, 30), 28));
    ELSE
      v_due := CURRENT_DATE;
    END IF;

    -- create per scope
    IF t.scope = 'internal' THEN
      INSERT INTO public.office_tasks (
        agency_tenant_id, link_id, title, category, priority, status,
        assignee_user_id, due_date, period_year, period_month,
        recurring_template_id, checklist
      )
      VALUES (
        t.agency_tenant_id, NULL, t.title, t.category, 'med', 'todo',
        t.default_assignee_id, v_due, v_year, v_month, t.id, t.checklist
      )
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
    ELSE
      FOR l IN
        SELECT id FROM public.office_client_links
        WHERE agency_tenant_id = t.agency_tenant_id
          AND status = 'active'
          AND (t.scope = 'all_clients' OR id = ANY(COALESCE(t.scope_link_ids, ARRAY[]::uuid[])))
      LOOP
        INSERT INTO public.office_tasks (
          agency_tenant_id, link_id, title, category, priority, status,
          assignee_user_id, due_date, period_year, period_month,
          recurring_template_id, checklist
        )
        VALUES (
          t.agency_tenant_id, l.id, t.title, t.category, 'med', 'todo',
          t.default_assignee_id, v_due, v_year, v_month, t.id, t.checklist
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.office_generate_recurring_tasks(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.office_generate_recurring_tasks(uuid) TO authenticated, service_role;
