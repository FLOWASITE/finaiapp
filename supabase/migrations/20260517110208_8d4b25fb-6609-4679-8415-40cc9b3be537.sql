
-- Phase 4 PDF với chữ ký: bổ sung thông tin người ký + ảnh chữ ký/dấu công ty
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url text,
  ADD COLUMN IF NOT EXISTS legal_rep_name text,
  ADD COLUMN IF NOT EXISTS chief_accountant_name text,
  ADD COLUMN IF NOT EXISTS preparer_name text;

-- Bucket lưu chữ ký + dấu (public để in trực tiếp trong report)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: mỗi user CRUD trong folder uid của mình
DROP POLICY IF EXISTS "branding read public" ON storage.objects;
CREATE POLICY "branding read public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding upload own" ON storage.objects;
CREATE POLICY "branding upload own"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "branding update own" ON storage.objects;
CREATE POLICY "branding update own"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "branding delete own" ON storage.objects;
CREATE POLICY "branding delete own"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'branding' AND auth.uid()::text = (storage.foldername(name))[1]);
