
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.grant_owner_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_invoice_payment_status() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_period_locked(uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_period_locked(uuid, date) TO authenticated;
