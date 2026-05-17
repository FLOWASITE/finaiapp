import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadVatData(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
) {
  const { data: purchases } = await supabase
    .from("invoices")
    .select("id, invoice_no, issue_date, supplier_name, supplier_tax_id, subtotal, vat_amount, total")
    .eq("user_id", userId)
    .gte("issue_date", from)
    .lte("issue_date", to);

  const { data: sales } = await supabase
    .from("sales_invoices")
    .select("id, einvoice_code, invoice_no, issue_date, customer_name, customer_tax_id, subtotal, vat_amount, total")
    .eq("user_id", userId)
    .eq("status", "issued")
    .gte("issue_date", from)
    .lte("issue_date", to);

  const inputVat = (purchases ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
  const outputVat = (sales ?? []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
  const inputBase = (purchases ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const outputBase = (sales ?? []).reduce((s, r) => s + Number(r.subtotal || 0), 0);

  return {
    summary: {
      outputBase, outputVat, inputBase, inputVat,
      payable: Math.max(0, outputVat - inputVat),
      carryForward: Math.max(0, inputVat - outputVat),
    },
    purchases: purchases ?? [],
    sales: sales ?? [],
  };
}

export const getVatReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const result = await loadVatData(context.supabase, context.userId, data.from, data.to);
    return { period: { from: data.from, to: data.to }, ...result };
  });

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!)
  );
}

export const buildVatXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { from: string; to: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_name, tax_id")
      .eq("id", userId)
      .single();

    const { summary, purchases, sales } = await loadVatData(supabase, userId, data.from, data.to);
    const period = data.from.slice(0, 7);
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<HSoThueDTu>`);
    lines.push(`  <HSoKhaiThue>`);
    lines.push(`    <TTinChung>`);
    lines.push(`      <TTinTKhaiThue>`);
    lines.push(`        <maTKhai>01/GTGT</maTKhai>`);
    lines.push(`        <kyKKhaiThue><kieuKy>M</kieuKy><kyKKhai>${period}</kyKKhai></kyKKhaiThue>`);
    lines.push(`        <mst>${esc(profile?.tax_id)}</mst>`);
    lines.push(`        <tenNNT>${esc(profile?.company_name)}</tenNNT>`);
    lines.push(`      </TTinTKhaiThue>`);
    lines.push(`    </TTinChung>`);
    lines.push(`    <CTieuTKhaiChinh>`);
    lines.push(`      <ct23>${summary.outputBase.toFixed(0)}</ct23>`);
    lines.push(`      <ct24>${summary.outputVat.toFixed(0)}</ct24>`);
    lines.push(`      <ct25>${summary.inputBase.toFixed(0)}</ct25>`);
    lines.push(`      <ct26>${summary.inputVat.toFixed(0)}</ct26>`);
    lines.push(`      <ct40>${summary.payable.toFixed(0)}</ct40>`);
    lines.push(`      <ct43>${summary.carryForward.toFixed(0)}</ct43>`);
    lines.push(`    </CTieuTKhaiChinh>`);
    lines.push(`  </HSoKhaiThue>`);
    lines.push(`  <BangKeBanRa>`);
    for (const s of sales) {
      lines.push(`    <CTietHDon><shdon>${esc(s.einvoice_code || s.invoice_no)}</shdon><nlhdon>${s.issue_date}</nlhdon><tenNMua>${esc(s.customer_name)}</tenNMua><mstNMua>${esc(s.customer_tax_id)}</mstNMua><dtcthue>${Number(s.subtotal).toFixed(0)}</dtcthue><thueGTGT>${Number(s.vat_amount).toFixed(0)}</thueGTGT></CTietHDon>`);
    }
    lines.push(`  </BangKeBanRa>`);
    lines.push(`  <BangKeMuaVao>`);
    for (const p of purchases) {
      lines.push(`    <CTietHDon><shdon>${esc(p.invoice_no)}</shdon><nlhdon>${p.issue_date}</nlhdon><tenNBan>${esc(p.supplier_name)}</tenNBan><mstNBan>${esc(p.supplier_tax_id)}</mstNBan><dtcthue>${Number(p.subtotal).toFixed(0)}</dtcthue><thueGTGT>${Number(p.vat_amount).toFixed(0)}</thueGTGT></CTietHDon>`);
    }
    lines.push(`  </BangKeMuaVao>`);
    lines.push(`</HSoThueDTu>`);
    return { xml: lines.join("\n"), filename: `01-GTGT-${period}.xml` };
  });
