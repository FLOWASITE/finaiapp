import { supabase } from "@/integrations/supabase/client";
import { withTimeoutReject } from "@/lib/auth-recovery";

export async function requireSuperadminGuard(): Promise<void> {
  return;
}

export type SuperadminCheckResult =
  | { status: "allowed" }
  | { status: "unauthenticated"; reason: string }
  | { status: "forbidden"; reason: string; email?: string | null; roles: string[] }
  | { status: "error"; step: "session" | "roles"; code: string; message: string };

export async function checkSuperadminNow(): Promise<SuperadminCheckResult> {
  // Bước 1: lấy session
  let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"];
  try {
    const res = await withTimeoutReject<Awaited<ReturnType<typeof supabase.auth.getSession>>>(
      supabase.auth.getSession(),
      3_000,
    );
    if (res.error) {
      return {
        status: "error",
        step: "session",
        code: "session_error",
        message: `Không đọc được session: ${res.error.message}`,
      };
    }
    sessionData = res.data;
  } catch (e: any) {
    return {
      status: "error",
      step: "session",
      code: e?.message === "timeout" ? "session_timeout" : "session_exception",
      message:
        e?.message === "timeout"
          ? "Hết 3s chờ phiên đăng nhập (supabase.auth.getSession). Hãy thử tải lại trang."
          : `Lỗi khi lấy phiên đăng nhập: ${e?.message ?? "unknown"}`,
    };
  }

  const user = sessionData.session?.user;
  if (!sessionData.session?.access_token || !user) {
    return { status: "unauthenticated", reason: "Chưa có phiên đăng nhập hợp lệ." };
  }

  // Bước 2: lấy roles
  let rolesRows: any[] = [];
  try {
    const res: any = await withTimeoutReject(
      Promise.resolve(supabase.from("user_roles").select("role").eq("user_id", user.id)),
      5_000,
    );
    if (res?.error) {
      return {
        status: "error",
        step: "roles",
        code: "roles_query_error",
        message: `Không đọc được user_roles: ${res.error.message}`,
      };
    }
    rolesRows = res?.data ?? [];
  } catch (e: any) {
    return {
      status: "error",
      step: "roles",
      code: e?.message === "timeout" ? "roles_timeout" : "roles_exception",
      message:
        e?.message === "timeout"
          ? "Hết 5s chờ truy vấn user_roles. Có thể RLS đang chặn hoặc mạng chậm."
          : `Lỗi khi truy vấn user_roles: ${e?.message ?? "unknown"}`,
    };
  }

  const roles = rolesRows.map((r: any) => r.role as string);
  if (roles.includes("superadmin")) return { status: "allowed" };

  return {
    status: "forbidden",
    reason:
      roles.length === 0
        ? "Tài khoản này chưa có bản ghi nào trong user_roles."
        : `Tài khoản có role [${roles.join(", ")}] nhưng thiếu 'superadmin'.`,
    email: user.email ?? null,
    roles,
  };
}
