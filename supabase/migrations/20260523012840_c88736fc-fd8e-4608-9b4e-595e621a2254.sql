
-- =========================================================
-- 1) Tenant-isolation tables: use membership/role checks
-- =========================================================

-- fa_disposals
DROP POLICY IF EXISTS tenant_select_fa_disposals ON public.fa_disposals;
DROP POLICY IF EXISTS tenant_insert_fa_disposals ON public.fa_disposals;
DROP POLICY IF EXISTS tenant_update_fa_disposals ON public.fa_disposals;
DROP POLICY IF EXISTS tenant_delete_fa_disposals ON public.fa_disposals;
CREATE POLICY tenant_select_fa_disposals ON public.fa_disposals
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tenant_insert_fa_disposals ON public.fa_disposals
  FOR INSERT WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_update_fa_disposals ON public.fa_disposals
  FOR UPDATE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_delete_fa_disposals ON public.fa_disposals
  FOR DELETE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

-- fa_inventory_count_lines
DROP POLICY IF EXISTS tenant_select_fa_inv_lines ON public.fa_inventory_count_lines;
DROP POLICY IF EXISTS tenant_insert_fa_inv_lines ON public.fa_inventory_count_lines;
DROP POLICY IF EXISTS tenant_update_fa_inv_lines ON public.fa_inventory_count_lines;
DROP POLICY IF EXISTS tenant_delete_fa_inv_lines ON public.fa_inventory_count_lines;
CREATE POLICY tenant_select_fa_inv_lines ON public.fa_inventory_count_lines
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tenant_insert_fa_inv_lines ON public.fa_inventory_count_lines
  FOR INSERT WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_update_fa_inv_lines ON public.fa_inventory_count_lines
  FOR UPDATE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_delete_fa_inv_lines ON public.fa_inventory_count_lines
  FOR DELETE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

-- fa_inventory_counts
DROP POLICY IF EXISTS tenant_select_fa_inv_counts ON public.fa_inventory_counts;
DROP POLICY IF EXISTS tenant_insert_fa_inv_counts ON public.fa_inventory_counts;
DROP POLICY IF EXISTS tenant_update_fa_inv_counts ON public.fa_inventory_counts;
DROP POLICY IF EXISTS tenant_delete_fa_inv_counts ON public.fa_inventory_counts;
CREATE POLICY tenant_select_fa_inv_counts ON public.fa_inventory_counts
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tenant_insert_fa_inv_counts ON public.fa_inventory_counts
  FOR INSERT WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_update_fa_inv_counts ON public.fa_inventory_counts
  FOR UPDATE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_delete_fa_inv_counts ON public.fa_inventory_counts
  FOR DELETE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

-- fa_reclassifications
DROP POLICY IF EXISTS tenant_select_fa_reclass ON public.fa_reclassifications;
DROP POLICY IF EXISTS tenant_insert_fa_reclass ON public.fa_reclassifications;
DROP POLICY IF EXISTS tenant_update_fa_reclass ON public.fa_reclassifications;
DROP POLICY IF EXISTS tenant_delete_fa_reclass ON public.fa_reclassifications;
CREATE POLICY tenant_select_fa_reclass ON public.fa_reclassifications
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY tenant_insert_fa_reclass ON public.fa_reclassifications
  FOR INSERT WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_update_fa_reclass ON public.fa_reclassifications
  FOR UPDATE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']))
  WITH CHECK (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin','accountant']));
CREATE POLICY tenant_delete_fa_reclass ON public.fa_reclassifications
  FOR DELETE USING (has_tenant_role(auth.uid(), tenant_id, ARRAY['owner','admin']));

-- account_period_balances (read-only summary)
DROP POLICY IF EXISTS "tenant read account_period_balances" ON public.account_period_balances;
CREATE POLICY "tenant read account_period_balances" ON public.account_period_balances
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));

-- monthly_summary (read-only summary)
DROP POLICY IF EXISTS "tenant read monthly_summary" ON public.monthly_summary;
CREATE POLICY "tenant read monthly_summary" ON public.monthly_summary
  FOR SELECT USING (is_tenant_member(auth.uid(), tenant_id));

-- =========================================================
-- 2) document_status_history: require tenant membership
-- =========================================================
DROP POLICY IF EXISTS "status history insert" ON public.document_status_history;
CREATE POLICY "status history insert" ON public.document_status_history
  FOR INSERT WITH CHECK (tenant_id IS NOT NULL AND is_tenant_member(auth.uid(), tenant_id));

-- =========================================================
-- 3) notifications: users can only insert to themselves
-- =========================================================
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- 4) Storage: add explicit UPDATE policies for buckets
-- =========================================================
DROP POLICY IF EXISTS "invoices update own" ON storage.objects;
CREATE POLICY "invoices update own" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'invoices' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'invoices' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "einvoices update tenant" ON storage.objects;
CREATE POLICY "einvoices update tenant" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'einvoices'
    AND has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','accountant'])
  )
  WITH CHECK (
    bucket_id = 'einvoices'
    AND has_tenant_role(auth.uid(), ((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','accountant'])
  );
