const fmt = (n: number) => Number(n || 0).toLocaleString("vi-VN");

interface VoucherLine {
  id?: string;
  qty: number | string;
  unit_cost: number | string;
  note?: string | null;
  products?: { code?: string; name?: string; unit?: string } | null;
}

interface JournalLine {
  account_code: string;
  debit: number | string;
  credit: number | string;
}

interface Voucher {
  voucher_no: string;
  voucher_date: string;
  voucher_type?: string;
  type?: "in" | "out";
  warehouses?: { code?: string; name?: string } | null;
  counter_account: string;
  reason?: string | null;
}

export function printVoucher(args: {
  voucher: Voucher;
  lines: VoucherLine[];
  journal_lines?: JournalLine[];
  type: "in" | "out";
  companyName?: string;
}) {
  const { voucher: v, lines, journal_lines = [], type, companyName = "CÔNG TY" } = args;
  const isIn = type === "in";
  const title = isIn ? "PHIẾU NHẬP KHO" : "PHIẾU XUẤT KHO";
  const total = lines.reduce((s, l) => s + Number(l.qty) * Number(l.unit_cost), 0);

  const rowsHtml = lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${escape(l.products?.name ?? "")}<div class="muted">${escape(l.products?.code ?? "")}</div></td>
      <td class="c">${escape(l.products?.unit ?? "")}</td>
      <td class="r">${fmt(Number(l.qty))}</td>
      <td class="r">${fmt(Number(l.unit_cost))}</td>
      <td class="r">${fmt(Number(l.qty) * Number(l.unit_cost))}</td>
    </tr>`).join("");

  const jrHtml = journal_lines.length ? `
    <h3>Bút toán hạch toán</h3>
    <table class="t">
      <thead><tr><th>Tài khoản</th><th class="r">Nợ</th><th class="r">Có</th></tr></thead>
      <tbody>
        ${journal_lines.map((j) => `
          <tr><td class="mono">${escape(j.account_code)}</td>
              <td class="r">${Number(j.debit) ? fmt(Number(j.debit)) : ""}</td>
              <td class="r">${Number(j.credit) ? fmt(Number(j.credit)) : ""}</td></tr>`).join("")}
      </tbody>
    </table>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${escape(v.voucher_no)} - ${title}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Times New Roman', serif; color: #000; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .company { font-weight: bold; text-transform: uppercase; }
  .doc-no { text-align: right; font-size: 12px; }
  h1 { text-align: center; font-size: 22px; margin: 14px 0 4px; letter-spacing: 2px; }
  .date { text-align: center; font-style: italic; margin-bottom: 12px; }
  .meta { margin: 8px 0; line-height: 1.6; }
  .meta b { display: inline-block; min-width: 110px; }
  table.t { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.t th, table.t td { border: 1px solid #000; padding: 5px 6px; vertical-align: top; }
  table.t th { background: #f0f0f0; text-align: center; }
  .r { text-align: right; } .c { text-align: center; }
  .muted { color: #666; font-size: 11px; }
  .mono { font-family: 'Courier New', monospace; }
  tfoot td { font-weight: bold; background: #fafafa; }
  h3 { margin-top: 18px; font-size: 14px; }
  .sign { margin-top: 36px; display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; gap: 8px; }
  .sign div { font-weight: bold; }
  .sign .role { font-style: italic; font-weight: normal; font-size: 11px; }
  .actions { position: fixed; top: 8px; right: 8px; }
  .actions button { padding: 6px 12px; cursor: pointer; }
  @media print { .actions { display: none; } }
</style></head>
<body>
  <div class="actions"><button onclick="window.print()">In</button></div>
  <div class="head">
    <div>
      <div class="company">${escape(companyName)}</div>
      <div class="muted">Địa chỉ: ............................................</div>
    </div>
    <div class="doc-no">
      Số: <b>${escape(v.voucher_no)}</b><br/>
      Mẫu số: ${isIn ? "01-VT" : "02-VT"}
    </div>
  </div>
  <h1>${title}</h1>
  <div class="date">Ngày ${formatDate(v.voucher_date)}</div>

  <div class="meta">
    <div><b>${isIn ? "Người giao hàng" : "Người nhận hàng"}:</b> ............................................</div>
    <div><b>Lý do ${isIn ? "nhập" : "xuất"}:</b> ${escape(v.reason ?? "")}</div>
    <div><b>${isIn ? "Nhập tại kho" : "Xuất tại kho"}:</b> ${escape(v.warehouses ? `${v.warehouses.code ?? ""} — ${v.warehouses.name ?? ""}` : "—")}</div>
    <div><b>Tài khoản ${isIn ? "Có" : "Nợ"} đối ứng:</b> <span class="mono">${escape(v.counter_account)}</span></div>
  </div>

  <table class="t">
    <thead>
      <tr>
        <th style="width:32px">STT</th>
        <th>Tên, quy cách vật tư, hàng hoá</th>
        <th style="width:60px">ĐVT</th>
        <th style="width:80px">Số lượng</th>
        <th style="width:100px">Đơn giá</th>
        <th style="width:120px">Thành tiền</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr><td colspan="5" class="r">Tổng cộng</td><td class="r">${fmt(total)}</td></tr>
    </tfoot>
  </table>

  <div class="meta" style="margin-top:8px">
    <b>Bằng chữ:</b> <i>${escape(numberToVi(total))}</i>
  </div>

  ${jrHtml}

  <div class="sign">
    <div>Người lập phiếu<div class="role">(Ký, họ tên)</div></div>
    <div>${isIn ? "Người giao" : "Người nhận"}<div class="role">(Ký, họ tên)</div></div>
    <div>Thủ kho<div class="role">(Ký, họ tên)</div></div>
    <div>Kế toán trưởng<div class="role">(Ký, họ tên)</div></div>
  </div>

  <script>setTimeout(function(){ window.print(); }, 300);</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function escape(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day} tháng ${m} năm ${y}`;
}

function numberToVi(n: number): string {
  if (!n) return "Không đồng";
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const readTriple = (num: number, full: boolean): string => {
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;
    const parts: string[] = [];
    if (full || h > 0) parts.push(digits[h] + " trăm");
    if (t > 1) { parts.push(digits[t] + " mươi"); if (u === 1) parts.push("mốt"); else if (u === 5) parts.push("lăm"); else if (u > 0) parts.push(digits[u]); }
    else if (t === 1) { parts.push("mười"); if (u === 5) parts.push("lăm"); else if (u > 0) parts.push(digits[u]); }
    else if (t === 0) { if (u > 0) { if (full || h > 0) parts.push("lẻ"); parts.push(digits[u]); } }
    return parts.join(" ");
  };
  const scales = ["", "nghìn", "triệu", "tỷ"];
  const num = Math.floor(n);
  const groups: number[] = [];
  let rest = num;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0 && i !== 0) continue;
    out.push(readTriple(groups[i], i !== groups.length - 1) + (scales[i] ? " " + scales[i] : ""));
  }
  const s = out.join(" ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1) + " đồng";
}
