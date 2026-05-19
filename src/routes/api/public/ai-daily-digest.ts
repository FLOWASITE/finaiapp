import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Daily digest job — scans every tenant and writes/updates rows in ai_insights
 * for: overdue receivables, overdue payables, low stock, negative cash.
 * Idempotent via (tenant_id, dedupe_key).
 */
export const Route = createFileRoute("/api/public/ai-daily-digest")({
  server: {
    handlers: {
      POST: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const summary: Record<string, number> = { tenants: 0, inserts: 0 };

        const { data: tenants, error: tErr } = await supabaseAdmin
          .from("tenants")
          .select("id, name");
        if (tErr) return new Response(`tenants: ${tErr.message}`, { status: 500 });
        summary.tenants = tenants?.length ?? 0;

        const upserts: any[] = [];

        for (const t of tenants ?? []) {
          // 1) Overdue AR (sales_invoices)
          const { data: arOver } = await supabaseAdmin
            .from("sales_invoices")
            .select("id, invoice_no, total, paid_amount, due_date, customer_id")
            .eq("tenant_id", t.id)
            .neq("status", "void")
            .lt("due_date", today)
            .neq("payment_status", "paid")
            .limit(500);
          const arOverdueAmt = (arOver ?? []).reduce(
            (s, r: any) => s + (Number(r.total ?? 0) - Number(r.paid_amount ?? 0)),
            0
          );
          if ((arOver?.length ?? 0) > 0) {
            upserts.push({
              tenant_id: t.id,
              severity: arOverdueAmt > 50_000_000 ? "critical" : "warn",
              category: "ar_overdue",
              title: `${arOver!.length} hoá đơn bán hàng quá hạn`,
              body: `Tổng nợ quá hạn: ${arOverdueAmt.toLocaleString("vi-VN")} ₫`,
              action_url: "/receivables",
              metadata: { count: arOver!.length, amount: arOverdueAmt },
              dedupe_key: `ar_overdue_${today}`,
            });
          }

          // 2) Overdue AP (purchase invoices)
          const { data: apOver } = await supabaseAdmin
            .from("invoices")
            .select("id, invoice_no, total, due_date, payment_status")
            .eq("tenant_id", t.id)
            .neq("status", "void")
            .lt("due_date", today)
            .neq("payment_status", "paid")
            .limit(500);
          if ((apOver?.length ?? 0) > 0) {
            const apAmt = (apOver ?? []).reduce((s, r: any) => s + Number(r.total ?? 0), 0);
            upserts.push({
              tenant_id: t.id,
              severity: "warn",
              category: "ap_overdue",
              title: `${apOver!.length} hoá đơn mua quá hạn thanh toán`,
              body: `Tổng phải trả quá hạn: ${apAmt.toLocaleString("vi-VN")} ₫`,
              action_url: "/payables",
              metadata: { count: apOver!.length, amount: apAmt },
              dedupe_key: `ap_overdue_${today}`,
            });
          }

          // 3) Low / negative stock — products with on_hand <= reorder_point
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id, name, sku, reorder_point")
            .eq("tenant_id", t.id)
            .not("reorder_point", "is", null)
            .limit(500);
          let lowCount = 0;
          for (const p of prods ?? []) {
            const { data: onHand } = await supabaseAdmin.rpc("fn_product_on_hand", {
              p_product: p.id,
              p_warehouse: null,
            } as any);
            if (Number(onHand ?? 0) <= Number((p as any).reorder_point ?? 0)) lowCount++;
          }
          if (lowCount > 0) {
            upserts.push({
              tenant_id: t.id,
              severity: lowCount > 10 ? "critical" : "warn",
              category: "low_stock",
              title: `${lowCount} mặt hàng dưới ngưỡng tồn kho`,
              body: "Hãy lên đơn mua hàng để bổ sung kho.",
              action_url: "/inventory",
              metadata: { count: lowCount },
              dedupe_key: `low_stock_${today}`,
            });
          }
        }

        if (upserts.length) {
          const { error: upErr } = await supabaseAdmin
            .from("ai_insights")
            .upsert(upserts, { onConflict: "tenant_id,dedupe_key" });
          if (upErr) return new Response(`upsert: ${upErr.message}`, { status: 500 });
          summary.inserts = upserts.length;
        }

        return Response.json({ ok: true, ...summary, date: today });
      },
      GET: async () => Response.json({ ok: true, info: "POST to run digest" }),
    },
  },
});
