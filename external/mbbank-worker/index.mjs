import { MB } from "mbbank";
import cron from "node-cron";
import Fastify from "fastify";
import crypto from "node:crypto";

// ---------- Config ----------
const BASE = process.env.LOVABLE_INGEST_URL?.replace(/\/$/, "");
const SECRET = process.env.MBBANK_WORKER_SECRET;
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS || 7);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CRON_EXPR = process.env.SYNC_INTERVAL_CRON || "*/5 * * * *";
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000); // 30 min
const MAX_FAIL_STREAK = Number(process.env.MAX_FAIL_STREAK || 3);

if (!BASE || !SECRET) {
  console.error("Thiếu LOVABLE_INGEST_URL hoặc MBBANK_WORKER_SECRET");
  process.exit(1);
}

// ---------- HMAC helpers ----------
function sign(body) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function verify(rawBody, header, maxAgeSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > maxAgeSec) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Lovable API calls ----------
async function fetchAccounts() {
  const res = await fetch(`${BASE}/accounts`, {
    headers: { "x-mb-signature": sign("/api/public/mbbank/accounts") },
  });
  if (!res.ok) throw new Error(`accounts ${res.status}: ${await res.text()}`);
  return (await res.json()).accounts || [];
}

async function startSyncLog(bank_account_id) {
  const body = JSON.stringify({ bank_account_id });
  const res = await fetch(`${BASE}/sync-log-start`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mb-signature": sign(body) },
    body,
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.sync_log_id || null;
}

async function postIngest(payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mb-signature": sign(body) },
    body,
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
  return res.json().catch(() => ({}));
}

async function postError(bank_account_id, error, sync_log_id) {
  const body = JSON.stringify({ bank_account_id, error: String(error).slice(0, 1500), sync_log_id });
  await fetch(`${BASE}/sync-error`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mb-signature": sign(body) },
    body,
  }).catch(() => {});
}

// ---------- Date helpers ----------
function fmtDateDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function parseTxnDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Expected: dd/MM/yyyy HH:mm:ss or dd/MM/yyyy
  const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Fallback ISO
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

// ---------- MB session cache ----------
/** key = `${username}` → { mb, loggedAt } */
const sessions = new Map();
const failStreak = new Map(); // account_id → consecutive failures

async function getMbClient(acc) {
  const key = acc.username;
  const now = Date.now();
  const cached = sessions.get(key);
  if (cached && now - cached.loggedAt < SESSION_TTL_MS) {
    return cached.mb;
  }
  const mb = new MB({
    username: acc.username,
    password: acc.password,
    preferredOCRMethod: "default",
    saveWasm: true,
  });
  await mb.login();
  sessions.set(key, { mb, loggedAt: now });
  return mb;
}

function dropSession(username) {
  sessions.delete(username);
}

// ---------- Core sync ----------
async function syncOne(acc) {
  const fails = failStreak.get(acc.id) || 0;
  if (fails >= MAX_FAIL_STREAK) {
    console.log(`[skip] ${acc.name} đã fail ${fails} lần liên tiếp — bỏ qua đến khi user can thiệp`);
    return;
  }

  const sync_log_id = await startSyncLog(acc.id).catch(() => null);
  console.log(`[${new Date().toISOString()}] Sync ${acc.name} (${acc.account_no}) log=${sync_log_id ?? "?"}`);

  try {
    let mb;
    try {
      mb = await getMbClient(acc);
    } catch (e) {
      dropSession(acc.username);
      // Retry login once
      mb = await getMbClient(acc);
    }

    let balance = null;
    try {
      balance = await mb.getBalance();
    } catch (e) {
      console.warn(`  getBalance lỗi: ${e.message}`);
    }

    const to = new Date();
    const from = new Date(Date.now() - HISTORY_DAYS * 86400000);
    let hist;
    try {
      hist = await mb.getTransactionsHistory({
        accountNumber: acc.account_no,
        fromDate: fmtDateDDMMYYYY(from),
        toDate: fmtDateDDMMYYYY(to),
      });
    } catch (e) {
      // Session có thể đã hết hạn → bỏ cache, ném lỗi để retry tick sau
      dropSession(acc.username);
      throw e;
    }

    const rawList = hist?.transactionHistoryList || hist?.transactions || (Array.isArray(hist) ? hist : []) || [];
    const transactions = rawList.map((t) => {
      const credit = Number(t.creditAmount || 0);
      const debit = Number(t.debitAmount || 0);
      const ref =
        t.refNo ||
        t.transactionId ||
        t.referenceNumber ||
        `${t.transactionDate || ""}-${credit - debit}-${(t.description || "").slice(0, 20)}`;
      return {
        external_ref: String(ref).slice(0, 120),
        txn_date: parseTxnDate(t.transactionDate || t.postDate || t.txnDate),
        amount: credit - debit,
        description: (t.description || t.transactionDesc || t.addDescription || null)?.toString().slice(0, 2000) ?? null,
        counterparty: (t.benAccountName || t.counterAccountName || t.benAccountNo || null)?.toString().slice(0, 300) ?? null,
        running_balance:
          t.availableBalance != null
            ? Number(t.availableBalance)
            : t.runningBalance != null
              ? Number(t.runningBalance)
              : null,
      };
    });

    let totalBal = null;
    if (balance) {
      const list = balance.acct_list || balance.acctList || balance.accountList || [];
      const found = list.find((a) => (a.acctNo || a.accountNo || a.number) === acc.account_no);
      if (found) {
        totalBal = Number(found.currentBalance ?? found.availableBalance ?? found.balance ?? 0);
      }
    }

    await postIngest({
      bank_account_id: acc.id,
      balance: totalBal,
      transactions,
      sync_log_id,
    });

    failStreak.set(acc.id, 0);
    console.log(`  ✓ ${transactions.length} giao dịch, số dư ${totalBal ?? "?"}`);
  } catch (e) {
    failStreak.set(acc.id, fails + 1);
    console.error(`  ✗ ${acc.name}: ${e.message}`);
    await postError(acc.id, e.message, sync_log_id);
  }
}

// ---------- Queue (serial, ngăn trùng) ----------
let running = false;
const pendingIds = new Set();

async function processQueue() {
  if (running) return;
  running = true;
  try {
    while (pendingIds.size > 0) {
      const all = await fetchAccounts();
      const byId = new Map(all.map((a) => [a.id, a]));
      const ids = Array.from(pendingIds);
      pendingIds.clear();
      for (const id of ids) {
        const acc = byId.get(id);
        if (!acc) continue;
        await syncOne(acc);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  } finally {
    running = false;
  }
}

async function tick() {
  try {
    const accounts = await fetchAccounts();
    console.log(`Tick: ${accounts.length} tài khoản cần sync`);
    accounts.forEach((a) => pendingIds.add(a.id));
    await processQueue();
  } catch (e) {
    console.error("Tick error:", e.message);
  }
}

// ---------- HTTP server ----------
const app = Fastify({ logger: false });

app.get("/healthz", async () => ({
  ok: true,
  cron: CRON_EXPR,
  sessions: sessions.size,
  running,
  pending: pendingIds.size,
}));

app.post("/sync-now", async (req, reply) => {
  const raw = JSON.stringify(req.body ?? {});
  if (!verify(raw, req.headers["x-mb-signature"])) {
    return reply.code(401).send({ ok: false, error: "bad signature" });
  }
  const id = req.body?.bank_account_id;
  if (!id) return reply.code(400).send({ ok: false, error: "missing bank_account_id" });

  failStreak.set(id, 0); // reset để cho phép retry thủ công
  pendingIds.add(id);
  processQueue().catch((e) => console.error("queue err:", e.message));
  return { ok: true, queued: id };
});

app.listen({ port: PORT, host: HOST }).then(() => {
  console.log(`MB Bank worker HTTP server: http://${HOST}:${PORT}`);
  console.log(`Cron: ${CRON_EXPR}`);
  cron.schedule(CRON_EXPR, tick);
  tick();
});
