
CREATE TABLE public.einvoice_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  tct_username text NOT NULL,
  tct_password_encrypted text NOT NULL,
  last_login_at timestamptz,
  last_session_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.einvoice_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant creds select" ON public.einvoice_credentials
  FOR SELECT USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant creds insert" ON public.einvoice_credentials
  FOR INSERT WITH CHECK (tenant_id = current_tenant_id() AND has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant creds update" ON public.einvoice_credentials
  FOR UPDATE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));

CREATE POLICY "tenant creds delete" ON public.einvoice_credentials
  FOR DELETE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

CREATE TRIGGER trg_einvoice_credentials_updated
  BEFORE UPDATE ON public.einvoice_credentials
  FOR EACH ROW EXECUTE FUNCTION public.tenants_set_updated_at();
