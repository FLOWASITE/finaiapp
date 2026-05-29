
-- 1. Backfill: ensure every profile has at least one tenant + owner membership.
DO $$
DECLARE
  p RECORD;
  new_tid uuid;
BEGIN
  FOR p IN
    SELECT pr.* FROM profiles pr
    WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.owner_user_id = pr.id)
      AND NOT EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.user_id = pr.id)
  LOOP
    INSERT INTO tenants (
      name, company_name, tax_id, address, phone,
      accounting_standard, base_currency, fiscal_year_start,
      logo_url, signature_url, stamp_url,
      legal_rep_name, chief_accountant_name, preparer_name,
      owner_user_id, status
    ) VALUES (
      COALESCE(NULLIF(p.company_name, ''), p.email, 'Tenant'),
      p.company_name, p.tax_id, p.address, p.phone,
      COALESCE(p.accounting_standard, 'TT133'),
      COALESCE(p.base_currency, 'VND'),
      COALESCE(p.fiscal_year_start, 1),
      p.logo_url, p.signature_url, p.stamp_url,
      p.legal_rep_name, p.chief_accountant_name, p.preparer_name,
      p.id, 'active'
    ) RETURNING id INTO new_tid;

    INSERT INTO tenant_members (tenant_id, user_id, role, status)
    VALUES (new_tid, p.id, 'owner', 'active')
    ON CONFLICT DO NOTHING;

    IF p.active_tenant_id IS NULL THEN
      UPDATE profiles SET active_tenant_id = new_tid WHERE id = p.id;
    END IF;
  END LOOP;
END $$;

-- 2. Default plan rows for tenants missing one.
INSERT INTO tenant_plans (tenant_id, plan, status)
SELECT t.id, 'free', 'active'
FROM tenants t
LEFT JOIN tenant_plans tp ON tp.tenant_id = t.id
WHERE tp.tenant_id IS NULL;

-- 3. Cascade delete function: removes a tenant and ALL business data
-- (any public table with a tenant_id column), but never touches auth.users.
CREATE OR REPLACE FUNCTION public.fn_superadmin_delete_tenant_cascade(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- AuthZ: only superadmin may invoke.
  IF NOT public.has_role(auth.uid(), 'superadmin') THEN
    RAISE EXCEPTION 'forbidden: superadmin role required';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;

  -- Bypass FK constraints between business tables for this transaction.
  PERFORM set_config('session_replication_role', 'replica', true);

  -- Delete from every public table with a tenant_id column,
  -- except the tenants table itself (handled last) and audit_logs
  -- (kept for after-action audit trail; deleted at the very end).
  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name NOT IN ('tenants', 'audit_logs')
    ORDER BY table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', r.table_name)
      USING _tenant_id;
  END LOOP;

  -- Clear active_tenant_id on profiles still pointing at this tenant.
  UPDATE public.profiles SET active_tenant_id = NULL WHERE active_tenant_id = _tenant_id;

  -- Restore normal FK enforcement before deleting tenant + audit.
  PERFORM set_config('session_replication_role', 'origin', true);

  DELETE FROM public.audit_logs WHERE tenant_id = _tenant_id;
  DELETE FROM public.tenants WHERE id = _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_superadmin_delete_tenant_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_superadmin_delete_tenant_cascade(uuid) TO authenticated;
