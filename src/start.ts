import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { supabase } from "./integrations/supabase/client";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Chặn các lời gọi serverFn ngay tại trình duyệt khi chưa có phiên đăng nhập.
 * Tránh việc server middleware ném "Unauthorized" thành runtime error gây
 * blank screen (xảy ra khi useQuery mount lúc session chưa hydrate hoặc
 * ngay sau khi sign-out trước khi query được hủy).
 *
 * Chỉ chạy trong môi trường trình duyệt — SSR không có session nhưng cũng
 * không thực sự gọi các serverFn cần auth.
 */
const guardClientAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (typeof window !== "undefined") {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        throw new Error("Chưa đăng nhập hoặc phiên đã hết hạn");
      }
    }
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  // guardClientAuth chạy TRƯỚC attachSupabaseAuth để chặn sớm trên client.
  functionMiddleware: [guardClientAuth, attachSupabaseAuth],
}));
