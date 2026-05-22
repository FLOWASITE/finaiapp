import { MB } from "mbbank";
import cron from "node-cron";
import crypto from "node:crypto";

const BASE = process.env.LOVABLE_INGEST_URL?.replace(/\/$/, "");
const SECRET = process.env.MBBANK_WORKER_SECRET;
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS || 7);
if (!BASE || !SECRET) { console.error("Thiếu LOVABLE_INGEST_URL hoặc MBBANK_WORKER_SECRET"); process.exit(1); }

function sign(body) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

async function fetchAccounts() {
  const res = await fetch(`${BASE}/accounts`, { headers: { "x-mb-signature": sign("/api/public/mbbank/accounts") } });
  if (!res.ok) throw new Error(`accounts ${res.status}: ${await res.text()}`);
  return (await res.json()).accounts;
}

async function postIngest(payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${BASE}/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mb-signature": sign(body) },
    body,
  });
  if (!res.ok) throw new Error(`ingest ${res.status}: ${await res.text()}`);
}

async function postError(bank_account_id, error) {
  const body = JSON.stringify({ bank_account_id, error: String(error).slice(0, 1500) });
  await fetch(`${BASE}/sync-error`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-mb-signature": sign(body) },
    body,
  }).catch(() => {});
}

function fmtDate(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }

async function syncOne(acc) {
  console.log(`[${new Date().toISOString()}] Sync ${acc.name} (${acc.account_no})`);
  try {
    const mb = new MB({ username: acc.username, password: acc.password });
    await mb.login();
    const balance = await mb.getBalance().catch(() => null);
    const to = new Date();
    const from = new Date(Date.now() - HISTORY_DAYS * 86400000);
    const hist = await mb.getTransactionsHistory({
      accountNumber: acc.account_no,
      fromDate: fmtDate(from),
      toDate: fmtDate(to),
    });
    const transactions = (hist?.transactionHistoryList || hist || []).map((t) => ({
      external_ref: String(t.refNo || t.transactionId || `${t.transactionDate}-${t.creditAmount || t.debitAmount}-${(t.description||"").slice(0,20)}`),
      txn_date: (t.transactionDate || "").replace(/(\d{2})\/(\d{2})\/(\d{4}).*/, "$3-$2-$1") || new Date().toISOString().slice(0,10),
      amount: Number(t.creditAmount || 0) - Number(t.debitAmount || 0),
      description: t.description || t.transactionDesc || null,
      counterparty: t.benAccountName || t.counterAccountName || null,
      running_balance: t.runningBalance ? Number(t.runningBalance) : null,
    }));
    let totalBal = null;
    if (balance) {
      const found = (balance.acct_list || []).find((a) => a.acctNo === acc.account_no);
      totalBal = found ? Number(found.currentBalance) : null;
    }
    await postIngest({ bank_account_id: acc.id, balance: totalBal, transactions });
    console.log(`  → ${transactions.length} giao dịch, số dư ${totalBal ?? "?"}`);
  } catch (e) {
    console.error(`  ✗ ${acc.name}: ${e.message}`);
    await postError(acc.id, e.message);
  }
}

async function tick() {
  try {
    const accounts = await fetchAccounts();
    console.log(`Tick: ${accounts.length} tài khoản cần sync`);
    for (const a of accounts) {
      await syncOne(a);
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch (e) {
    console.error("Tick error:", e.message);
  }
}

cron.schedule(process.env.SYNC_INTERVAL_CRON || "*/5 * * * *", tick);
console.log("MB Bank worker khởi động — cron:", process.env.SYNC_INTERVAL_CRON || "*/5 * * * *");
tick();
