revoke execute on function public.match_products_for_vendor(uuid, vector, int) from public, anon;
grant execute on function public.match_products_for_vendor(uuid, vector, int) to authenticated;
