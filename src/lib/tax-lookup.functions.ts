import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TaxLookupResult = {
  taxId: string;
  name: string;
  shortName?: string | null;
  address?: string | null;
  director?: string | null;
  source: "vietqr" | "ttdn";
};

const InputSchema = z.object({
  taxCode: z
    .string()
    .trim()
    .min(10, "MST tối thiểu 10 ký tự")
    .max(14, "MST tối đa 14 ký tự")
    .regex(/^[0-9-]+$/, "MST chỉ gồm số và dấu '-'"),
});

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(t);
  }
}

async function tryVietQR(taxCode: string): Promise<TaxLookupResult | null> {
  try {
    const res = await fetchWithTimeout(`https://api.vietqr.io/v2/business/${encodeURIComponent(taxCode)}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json?.code !== "00" || !json?.data?.name) return null;
    return {
      taxId: String(json.data.id ?? taxCode),
      name: String(json.data.name),
      shortName: json.data.shortName ?? null,
      address: json.data.address ?? null,
      director: null,
      source: "vietqr",
    };
  } catch {
    return null;
  }
}

async function tryTTDN(taxCode: string): Promise<TaxLookupResult | null> {
  try {
    const res = await fetchWithTimeout(`https://thongtindoanhnghiep.co/api/company/${encodeURIComponent(taxCode)}`);
    if (!res.ok) return null;
    const json: any = await res.json();
    if (!json?.Title) return null;
    return {
      taxId: String(json.MaSoThue ?? taxCode),
      name: String(json.Title),
      shortName: json.TitleEn ?? null,
      address: json.DiaChiCongTy ?? null,
      director: json.GiamDocCongTy ?? null,
      source: "ttdn",
    };
  } catch {
    return null;
  }
}

export const lookupTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const code = data.taxCode.trim();
    const r1 = await tryVietQR(code);
    if (r1) return r1;
    const r2 = await tryTTDN(code);
    if (r2) return r2;
    throw new Error(`Không tìm thấy thông tin cho MST ${code}`);
  });
