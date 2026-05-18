import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// =================== crypto helpers (AES-GCM with EINVOICE_ENC_KEY) ===================
async function getKey(): Promise<CryptoKey> {
  const raw = process.env.EINVOICE_ENC_KEY;
  if (!raw) throw new Error("Thiếu EINVOICE_ENC_KEY trên server");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}
function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function encryptPwd(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plain),
  );
  return `${b64encode(iv)}:${b64encode(ct)}`;
}
async function decryptPwd(token: string): Promise<string> {
  const [ivB64, ctB64] = token.split(":");
  if (!ivB64 || !ctB64) throw new Error("Định dạng mật khẩu không hợp lệ");
  const key = await getKey();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}

async function resolveTenant(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_tenant_id, tax_id")
    .eq("id", userId)
    .maybeSingle();
  const tenantId: string | null = profile?.active_tenant_id ?? null;
  let tenantTaxId = String(profile?.tax_id ?? "").replace(/\D/g, "");
  if (tenantId) {
    const { data: t } = await supabase
      .from("tenants")
      .select("tax_id")
      .eq("id", tenantId)
      .maybeSingle();
    if (t?.tax_id) tenantTaxId = String(t.tax_id).replace(/\D/g, "");
  }
  return { tenantId, tenantTaxId };
}

// =================== TCT endpoints ===================
const TCT_DIRECT = "https://hoadondientu.gdt.gov.vn:30000";
// Cloudflare Workers (Lovable Cloud runtime) chặn outbound tới cổng :30000.
// Người dùng phải tự host một HTTPS proxy (xem docs/tct-proxy) và set secret
// TCT_PROXY_URL = "https://<proxy-domain>" — server functions sẽ gọi qua đó.
function getTctBase(): string {
  const p = (process.env.TCT_PROXY_URL || "").trim().replace(/\/+$/, "");
  return p || TCT_DIRECT;
}
const TCT_BASE_LABEL = TCT_DIRECT;

// =================== Credentials ===================
export const getTctCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) return { credentials: null };
    const { data } = await supabase
      .from("einvoice_credentials")
      .select("id, tct_username, last_login_at, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return { credentials: data ?? null };
  });

export const saveTctCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().trim().min(3).max(50),
        password: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");
    const enc = await encryptPwd(data.password);

    const { data: existing } = await supabase
      .from("einvoice_credentials")
      .select("id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("einvoice_credentials")
        .update({ tct_username: data.username, tct_password_encrypted: enc })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("einvoice_credentials").insert({
        tenant_id: tenantId,
        user_id: userId,
        tct_username: data.username,
        tct_password_encrypted: enc,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteTctCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");
    const { error } = await supabase
      .from("einvoice_credentials")
      .delete()
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Verify login: dùng captcha vừa nhập + mật khẩu đã lưu.
// Khi thành công sẽ cập nhật last_login_at để hiển thị trên UI.
export const verifyTctLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        captchaKey: z.string().min(1),
        captchaValue: z.string().trim().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");
    const { data: cred } = await supabase
      .from("einvoice_credentials")
      .select("id, tct_username, tct_password_encrypted")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cred) throw new Error("Chưa khai báo tài khoản TCT");

    let password: string;
    try {
      password = await decryptPwd(cred.tct_password_encrypted);
    } catch {
      throw new Error("Không giải mã được mật khẩu đã lưu, vui lòng nhập lại.");
    }

    try {
      await loginTct({
        username: cred.tct_username,
        password,
        ckey: data.captchaKey,
        cvalue: data.captchaValue,
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(msg)) {
        throw new Error(
          "Không kết nối được tới Tổng cục Thuế (cổng :30000 có thể bị chặn). Chi tiết: " +
            msg,
        );
      }
      throw new Error(msg);
    }

    await supabase
      .from("einvoice_credentials")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", cred.id);
    return { ok: true };
  });

// =================== Captcha ===================
export const getTctCaptcha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const res = await fetch(`${TCT_BASE}/captcha`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        return {
          ok: false as const,
          key: "",
          svg: "",
          error: `Captcha HTTP ${res.status}`,
        };
      }
      const json: any = await res.json();
      return {
        ok: true as const,
        key: String(json?.key ?? ""),
        svg: String(json?.content ?? ""),
        error: null,
      };
    } catch (e: any) {
      const msg = e?.message || String(e);
      return {
        ok: false as const,
        key: "",
        svg: "",
        error:
          `Không kết nối được tới hệ thống HĐĐT của Tổng cục Thuế (${TCT_BASE}). ` +
          `Máy chủ Lovable Cloud có thể bị chặn outbound tới cổng :30000. Chi tiết: ${msg}`,
      };
    }
  });

// Auto solve via 2Captcha (best-effort: submit SVG as base64 image)
async function solveCaptchaWith2Captcha(svg: string): Promise<string> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) throw new Error("Chưa cấu hình TWOCAPTCHA_API_KEY");
  const body = b64encode(new TextEncoder().encode(svg));
  const inForm = new URLSearchParams({
    key: apiKey,
    method: "base64",
    body,
    json: "1",
    regsense: "0",
    numeric: "0",
    min_len: "6",
    max_len: "6",
  });
  const sub = await fetch("https://2captcha.com/in.php", {
    method: "POST",
    body: inForm,
  });
  const subJson: any = await sub.json();
  if (subJson?.status !== 1)
    throw new Error(`2Captcha submit lỗi: ${subJson?.request ?? "?"}`);
  const captchaId = subJson.request;

  // Poll up to 90s
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(
      `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`,
    );
    const rj: any = await r.json();
    if (rj?.status === 1) return String(rj.request);
    if (rj?.request !== "CAPCHA_NOT_READY")
      throw new Error(`2Captcha lỗi: ${rj?.request ?? "?"}`);
  }
  throw new Error("2Captcha hết thời gian chờ");
}

// =================== Login + Sync ===================
async function loginTct(args: {
  username: string;
  password: string;
  cvalue: string;
  ckey: string;
}): Promise<string> {
  const res = await fetch(`${TCT_BASE}/security-taxpayer/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      ckey: args.ckey,
      cvalue: args.cvalue,
      username: args.username,
      password: args.password,
    }),
  });
  const txt = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(txt);
  } catch {}
  if (!res.ok || !json?.token) {
    const msg = json?.message || txt || `HTTP ${res.status}`;
    throw new Error(`Đăng nhập TCT thất bại: ${msg}`);
  }
  return String(json.token);
}

function fmtSearchDate(d: string, end = false) {
  // expects ISO yyyy-MM-dd → dd/MM/yyyyTHH:mm:ss
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}T${end ? "23:59:59" : "00:00:00"}`;
}

async function fetchTctInvoices(args: {
  token: string;
  direction: "in" | "out";
  dateFrom: string;
  dateTo: string;
}): Promise<any[]> {
  const path = args.direction === "in" ? "purchase" : "sold";
  const search = `tdlap=ge=${fmtSearchDate(args.dateFrom)};tdlap=le=${fmtSearchDate(args.dateTo, true)}`;
  const out: any[] = [];
  let state: string | null = null;
  for (let page = 0; page < 20; page++) {
    const qp = new URLSearchParams({
      sort: "tdlap:desc,khmshdon:asc,shdon:desc",
      size: "50",
      search,
    });
    if (state) qp.set("state", state);
    const res = await fetch(
      `${TCT_BASE}/query/invoices/${path}?${qp.toString()}`,
      { headers: { Authorization: `Bearer ${args.token}`, Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(`Lỗi tải danh sách HĐ: HTTP ${res.status}`);
    const json: any = await res.json();
    const items: any[] = json?.datas ?? [];
    out.push(...items);
    if (!json?.state || items.length === 0) break;
    state = json.state as string;
  }
  return out;
}

export const syncTctInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        direction: z.enum(["in", "out"]),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        captchaMode: z.enum(["manual", "auto"]),
        captchaKey: z.string().optional().nullable(),
        captchaValue: z.string().optional().nullable(),
        captchaSvg: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { tenantId, tenantTaxId } = await resolveTenant(supabase, userId);
    if (!tenantId) throw new Error("Chưa chọn tổ chức");
    if (!tenantTaxId) throw new Error("Chưa khai báo MST đơn vị");

    const { data: cred } = await supabase
      .from("einvoice_credentials")
      .select("tct_username, tct_password_encrypted")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cred) throw new Error("Chưa lưu tài khoản TCT");
    const password = await decryptPwd(cred.tct_password_encrypted);

    // Resolve captcha
    let ckey = data.captchaKey ?? "";
    let cvalue = data.captchaValue ?? "";
    if (data.captchaMode === "auto") {
      // fetch fresh captcha + auto-solve
      const cap = await fetch(`${TCT_BASE}/captcha`).then((r) => r.json() as any);
      ckey = String(cap?.key ?? "");
      cvalue = await solveCaptchaWith2Captcha(String(cap?.content ?? ""));
    }
    if (!ckey || !cvalue) throw new Error("Thiếu captcha");

    // Create sync log
    const { data: logRow } = await supabase
      .from("einvoice_sync_logs")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        direction: data.direction,
        date_from: data.dateFrom,
        date_to: data.dateTo,
        status: "running",
      })
      .select("id")
      .single();
    const logId = logRow?.id as string | undefined;

    try {
      const token = await loginTct({
        username: cred.tct_username,
        password,
        ckey,
        cvalue,
      });
      await supabase
        .from("einvoice_credentials")
        .update({ last_login_at: new Date().toISOString() })
        .eq("tenant_id", tenantId);

      const items = await fetchTctInvoices({
        token,
        direction: data.direction,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
      });

      let created = 0;
      let duplicate = 0;
      for (const it of items) {
        const sellerTax = String(it.nbmst ?? "").replace(/\D/g, "");
        const buyerTax = String(it.nmmst ?? "").replace(/\D/g, "");
        const invoiceSeries = String(it.khhdon ?? "");
        const invoiceNo = String(it.shdon ?? "");
        if (!invoiceNo) continue;

        const { data: dup } = await supabase
          .from("einvoices")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("direction", data.direction)
          .eq("seller_tax_id", sellerTax || "")
          .eq("invoice_series", invoiceSeries)
          .eq("invoice_no", invoiceNo)
          .maybeSingle();
        if (dup) {
          duplicate++;
          continue;
        }

        const stt = Number(it.tthai ?? 0);
        const tct_status =
          stt === 5
            ? "valid"
            : stt === 6
              ? "cancelled"
              : stt === 7
                ? "adjusted"
                : stt === 8
                  ? "replaced"
                  : "pending";

        await supabase.from("einvoices").insert({
          tenant_id: tenantId,
          user_id: userId,
          direction: data.direction,
          source: "tct_sync",
          seller_tax_id: sellerTax || null,
          seller_name: it.nbten ?? null,
          seller_address: it.nbdchi ?? null,
          buyer_tax_id: buyerTax || null,
          buyer_name: it.nmten ?? null,
          buyer_address: it.nmdchi ?? null,
          invoice_series: invoiceSeries || null,
          invoice_no: invoiceNo,
          issue_date: it.tdlap ? String(it.tdlap).slice(0, 10) : null,
          currency: it.dvtte ?? "VND",
          subtotal: Number(it.tgtcthue ?? 0),
          vat_amount: Number(it.tgtthue ?? 0),
          total: Number(it.tgtttbso ?? 0),
          tct_lookup_code: it.mhdon ?? null,
          tct_mcct: it.mccqt ?? null,
          tct_status,
          tct_raw: it,
        });
        created++;
      }

      if (logId) {
        await supabase
          .from("einvoice_sync_logs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            fetched_count: items.length,
            created_count: created,
            duplicate_count: duplicate,
          })
          .eq("id", logId);
      }

      return { fetched: items.length, created, duplicate };
    } catch (e: any) {
      if (logId) {
        await supabase
          .from("einvoice_sync_logs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: e?.message || String(e),
          })
          .eq("id", logId);
      }
      throw e;
    }
  });

export const listSyncLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { tenantId } = await resolveTenant(supabase, userId);
    if (!tenantId) return { logs: [] };
    const { data } = await supabase
      .from("einvoice_sync_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(20);
    return { logs: data ?? [] };
  });
