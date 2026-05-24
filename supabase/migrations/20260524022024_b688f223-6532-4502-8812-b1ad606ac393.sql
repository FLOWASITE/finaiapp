CREATE TABLE public.ai_line_classifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  supplier_id UUID NULL,
  supplier_tax_id TEXT NULL,
  line_name TEXT NOT NULL,
  line_name_norm TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('goods','fixed_asset','ccdc','service')),
  account TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user_override' CHECK (source IN ('rule','user_override','ai')),
  hit_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ai_line_class_unique
  ON public.ai_line_classifications (tenant_id, COALESCE(supplier_tax_id, ''), line_name_norm);

CREATE INDEX ai_line_class_tenant_idx
  ON public.ai_line_classifications (tenant_id, last_used_at DESC);

ALTER TABLE public.ai_line_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tenant classifications"
  ON public.ai_line_classifications FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can insert tenant classifications"
  ON public.ai_line_classifications FOR INSERT
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can update tenant classifications"
  ON public.ai_line_classifications FOR UPDATE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Members can delete tenant classifications"
  ON public.ai_line_classifications FOR DELETE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE TRIGGER ai_line_classifications_set_updated_at
  BEFORE UPDATE ON public.ai_line_classifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();