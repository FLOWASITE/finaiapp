
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('owner','admin','accountant','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tenant_member_status AS ENUM ('active','invited','disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TENANTS ============
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  tax_id text,
  address text,
  phone text,
  accounting_standard text NOT NULL DEFAULT 'TT133',
  base_currency text NOT NULL DEFAULT 'VND',
  fiscal_year_start int NOT NULL DEFAULT 1,
  logo_url text,
  signature_url text,
  stamp_url text,
  legal_rep_name text,
  chief_accountant_name text,
  preparer_name text,
  owner_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_user_id);

-- ============ TENANT MEMBERS ============
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.tenant_role NOT NULL DEFAULT 'viewer',
  status public.tenant_member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON public.tenant_members(tenant_id);

-- ============ PROFILES.active_tenant_id ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_tenant_id uuid;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_user_id uuid, _tenant_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND status = 'active'
      AND role::text = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT active_tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ============ updated_at trigger for tenants ============
CREATE OR REPLACE FUNCTION public.tenants_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tenants_set_updated_at();

-- ============ RLS ============
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- tenants policies
DROP POLICY IF EXISTS "members view tenant" ON public.tenants;
CREATE POLICY "members view tenant" ON public.tenants
  FOR SELECT USING (
    public.is_tenant_member(auth.uid(), id) OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "owner admin update tenant" ON public.tenants;
CREATE POLICY "owner admin update tenant" ON public.tenants
  FOR UPDATE USING (
    public.has_tenant_role(auth.uid(), id, ARRAY['owner','admin'])
  ) WITH CHECK (
    public.has_tenant_role(auth.uid(), id, ARRAY['owner','admin'])
  );

DROP POLICY IF EXISTS "any auth create tenant" ON public.tenants;
CREATE POLICY "any auth create tenant" ON public.tenants
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "owner delete tenant" ON public.tenants;
CREATE POLICY "owner delete tenant" ON public.tenants
  FOR DELETE USING (
    public.has_tenant_role(auth.uid(), id, ARRAY['owner'])
  );

-- tenant_members policies
DROP POLICY IF EXISTS "members view members" ON public.tenant_members;
CREATE POLICY "members view members" ON public.tenant_members
  FOR SELECT USING (
    public.is_tenant_member(auth.uid(), tenant_id) OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "owner admin manage members" ON public.tenant_members;
CREATE POLICY "owner admin manage members" ON public.tenant_members
  FOR ALL USING (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin'])
  ) WITH CHECK (
    public.has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin'])
  );

-- ============ BACKFILL: tạo tenant cho mỗi profile hiện có ============
DO $$
DECLARE
  p record;
  new_tenant_id uuid;
BEGIN
  FOR p IN SELECT * FROM public.profiles WHERE active_tenant_id IS NULL LOOP
    -- Tránh tạo trùng nếu đã có tenant với owner này
    SELECT id INTO new_tenant_id FROM public.tenants WHERE owner_user_id = p.id LIMIT 1;

    IF new_tenant_id IS NULL THEN
      INSERT INTO public.tenants (
        name, company_name, tax_id, address, phone,
        accounting_standard, base_currency, fiscal_year_start,
        logo_url, signature_url, stamp_url,
        legal_rep_name, chief_accountant_name, preparer_name,
        owner_user_id
      ) VALUES (
        COALESCE(NULLIF(p.company_name,''), NULLIF(p.email,''), 'Tổ chức của tôi'),
        p.company_name, p.tax_id, p.address, p.phone,
        COALESCE(p.accounting_standard,'TT133'),
        COALESCE(p.base_currency,'VND'),
        COALESCE(p.fiscal_year_start,1),
        p.logo_url, p.signature_url, p.stamp_url,
        p.legal_rep_name, p.chief_accountant_name, p.preparer_name,
        p.id
      ) RETURNING id INTO new_tenant_id;
    END IF;

    INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
    VALUES (new_tenant_id, p.id, 'owner', 'active')
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    UPDATE public.profiles SET active_tenant_id = new_tenant_id WHERE id = p.id;
  END LOOP;
END $$;
