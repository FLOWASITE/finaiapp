
-- 1) Multi-provider table
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  base_url text NOT NULL,
  api_key_encrypted text,
  extra_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Superadmin manages ai_providers" ON public.ai_providers;
CREATE POLICY "Superadmin manages ai_providers"
  ON public.ai_providers
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'::app_role));

-- Đảm bảo chỉ có 1 default tại một thời điểm
CREATE UNIQUE INDEX IF NOT EXISTS ai_providers_one_default
  ON public.ai_providers ((1)) WHERE is_default = true;

CREATE TRIGGER ai_providers_set_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Mở rộng ai_agent_models
ALTER TABLE public.ai_agent_models
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS temperature numeric(3,2),
  ADD COLUMN IF NOT EXISTS max_tokens integer;

-- 3) Migrate dữ liệu cũ từ ai_model_config thành 1 provider legacy
DO $$
DECLARE
  cfg_row record;
  new_id uuid;
BEGIN
  SELECT * INTO cfg_row FROM public.ai_model_config WHERE id = 1;
  IF cfg_row IS NOT NULL
     AND cfg_row.api_key_encrypted IS NOT NULL
     AND cfg_row.base_url IS NOT NULL
     AND cfg_row.base_url <> ''
     AND NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE code = 'legacy_default')
  THEN
    INSERT INTO public.ai_providers (code, label, base_url, api_key_encrypted, extra_headers, enabled, is_default, notes)
    VALUES (
      'legacy_default',
      COALESCE(NULLIF(cfg_row.provider_label, ''), 'Legacy Provider'),
      cfg_row.base_url,
      cfg_row.api_key_encrypted,
      COALESCE(cfg_row.extra_headers, '{}'::jsonb),
      COALESCE(cfg_row.enabled, false),
      true,
      'Migrated từ ai_model_config (deprecated)'
    )
    RETURNING id INTO new_id;

    UPDATE public.ai_agent_models
       SET provider_id = new_id
     WHERE model_name IS NOT NULL AND provider_id IS NULL;
  END IF;
END$$;
