
REVOKE EXECUTE ON FUNCTION public.fn_product_reserved_qty(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_product_on_hand(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_product_available_qty(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_release_reservation_for_so_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_product_reserved_qty(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_product_on_hand(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_product_available_qty(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_reservation_for_so_line(uuid) TO authenticated;
