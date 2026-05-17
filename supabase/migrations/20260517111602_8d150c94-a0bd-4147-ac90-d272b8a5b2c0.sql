
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
