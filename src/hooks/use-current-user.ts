import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CurrentUserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
};

export type CurrentUserData = {
  userId: string | null;
  email: string | null;
  profile: CurrentUserProfile | null;
  roles: string[];
  isSuperadmin: boolean;
};

const FIVE_MIN = 5 * 60_000;

/**
 * Lấy thông tin user hiện tại + profile + roles trong một lần,
 * cache 5 phút, dùng chung cho header/sidebar... tránh gọi
 * supabase.auth.getUser() và profiles/user_roles lặp ở nhiều nơi.
 */
export function useCurrentUser() {
  return useQuery<CurrentUserData>({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) {
        return {
          userId: null,
          email: null,
          profile: null,
          roles: [],
          isSuperadmin: false,
        };
      }
      const [profileRes, rolesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, display_name, avatar_url, job_title")
          .eq("id", user.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);
      return {
        userId: user.id,
        email: user.email ?? null,
        profile: (profileRes.data as CurrentUserProfile | null) ?? null,
        roles,
        isSuperadmin: roles.includes("superadmin"),
      };
    },
    staleTime: FIVE_MIN,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
