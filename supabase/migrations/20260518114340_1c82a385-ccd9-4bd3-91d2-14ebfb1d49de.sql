-- (C) Enable real audit logging

-- 1. Upgrade audit_trigger() to capture tenant_id
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_record_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_tenant uuid;
  v_row jsonb;
  v_entry uuid;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_row := v_before;
    BEGIN v_record_id := (OLD.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_row := v_after;
    BEGIN v_record_id := (NEW.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  ELSE
    v_after := to_jsonb(NEW);
    v_row := v_after;
    BEGIN v_record_id := (NEW.id)::uuid; EXCEPTION WHEN others THEN v_record_id := NULL; END;
  END IF;

  -- Try direct tenant_id column
  IF v_row ? 'tenant_id' AND (v_row->>'tenant_id') IS NOT NULL THEN
    BEGIN v_tenant := (v_row->>'tenant_id')::uuid; EXCEPTION WHEN others THEN v_tenant := NULL; END;
  END IF;

  -- Fallback: journal_lines inherits tenant from journal_entries
  IF v_tenant IS NULL AND TG_TABLE_NAME = 'journal_lines' AND (v_row->>'entry_id') IS NOT NULL THEN
    BEGIN
      v_entry := (v_row->>'entry_id')::uuid;
      SELECT tenant_id INTO v_tenant FROM public.journal_entries WHERE id = v_entry;
    EXCEPTION WHEN others THEN v_tenant := NULL; END;
  END IF;

  INSERT INTO public.audit_logs (user_id, actor_email, action, table_name, record_id, before, after, tenant_id)
  VALUES (v_uid, v_email, lower(TG_OP), TG_TABLE_NAME, v_record_id, v_before, v_after, v_tenant);

  RETURN COALESCE(NEW, OLD);
END $function$;

-- 2. Attach triggers to business tables (idempotent)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'einvoices',
    'cash_vouchers','bank_vouchers',
    'customer_receipts','supplier_payments',
    'bank_transactions','fixed_assets',
    'journal_lines',
    'accounts','customers','suppliers','employees','bank_accounts',
    'branches','departments','projects','cost_centers',
    'tax_periods',
    'tenants','tenant_members',
    'documents','document_links'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
        t, t
      );
    END IF;
  END LOOP;

  -- profiles: only UPDATE and DELETE (avoid noise from handle_new_user inserts)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_profiles ON public.profiles';
    EXECUTE 'CREATE TRIGGER audit_profiles AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()';
  END IF;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_record
  ON public.audit_logs (table_name, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_table_created
  ON public.audit_logs (tenant_id, table_name, created_at DESC);