// Chuyển số sang chữ tiếng Việt (chuẩn kế toán)
const D = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readTriple(n: number, full: boolean): string {
  const tr = Math.floor(n / 100);
  const ch = Math.floor((n % 100) / 10);
  const dv = n % 10;
  const parts: string[] = [];
  if (full || tr > 0) {
    parts.push(`${D[tr]} trăm`);
  }
  if (ch === 0) {
    if (dv > 0) {
      if (full || tr > 0) parts.push("lẻ");
      parts.push(D[dv]);
    }
  } else if (ch === 1) {
    parts.push("mười");
    if (dv === 5) parts.push("lăm");
    else if (dv === 1) parts.push("mốt");
    else if (dv > 0) parts.push(D[dv]);
  } else {
    parts.push(`${D[ch]} mươi`);
    if (dv === 1) parts.push("mốt");
    else if (dv === 4) parts.push("tư");
    else if (dv === 5) parts.push("lăm");
    else if (dv > 0) parts.push(D[dv]);
  }
  return parts.join(" ").trim();
}

export function numberToVietnameseWords(num: number): string {
  if (!isFinite(num)) return "";
  const n = Math.floor(Math.abs(num));
  if (n === 0) return "Không đồng";

  const units = ["", "nghìn", "triệu", "tỷ"];
  const triples: number[] = [];
  let x = n;
  while (x > 0) {
    triples.push(x % 1000);
    x = Math.floor(x / 1000);
  }

  const out: string[] = [];
  for (let i = triples.length - 1; i >= 0; i--) {
    const v = triples[i];
    if (v === 0 && !(i === 0 && out.length === 0)) {
      // skip empty group but keep "tỷ" boundary
      if (i % 3 === 0 && i > 0 && out.length > 0) out.push("tỷ");
      continue;
    }
    const isFirst = out.length === 0;
    out.push(readTriple(v, !isFirst));
    if (i > 0) out.push(units[i % 4]);
    if (i % 3 === 0 && i > 0) out.push("tỷ");
  }

  const s = out.join(" ").replace(/\s+/g, " ").trim();
  return (num < 0 ? "Âm " : "") + s.charAt(0).toUpperCase() + s.slice(1) + " đồng";
}
