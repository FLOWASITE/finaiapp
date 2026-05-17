
ALTER TABLE public.user_invitations ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant_id ON public.user_invitations (tenant_id);
