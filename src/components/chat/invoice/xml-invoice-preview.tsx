import { ExternalLink, ShieldCheck } from "lucide-react";

type Line = {
  description?: string | null;
  unit?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  vat_rate?: number | null;
};

type Party = {
  name?: string | null;
  tax_id?: string | null;
  address?: string | null;
};

export type EinvoiceExtras = {
  series?: string | null;
  template?: string | null;
  invoice_no?: string | null;
  issue_date?: string | null;
  currency?: string | null;
  cqt_code?: string | null;
  cqt_signed?: boolean;
  seller_signed?: boolean;
  adjustment_kind?: "original" | "replacement" | "adjustment" | "cancelled";
  seller?: Party;
  buyer?: Party;
  lines?: Line[];
  totals?: {
    subtotal?: number | null;
    vat_amount?: number | null;
    discount_total?: number | null;
    total?: number | null;
    total_in_words?: string | null;
  };
};

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("vi-VN");
}

export function XmlInvoicePreview({
  data,
  signedUrl,
}: {
  data: EinvoiceExtras;
  signedUrl?: string | null;
}) {
  const seller = data.seller ?? {};
  const buyer = data.buyer ?? {};
  const lines = data.lines ?? [];
  const t = data.totals ?? {};
  const visible = lines.slice(0, 4);
  const moreCount = Math.max(0, lines.length - visible.length);
  const isCancelled = data.adjustment_kind === "cancelled";
  const adjustLabel =
    data.adjustment_kind === "replacement"
      ? "HÓA ĐƠN THAY THẾ"
      : data.adjustment_kind === "adjustment"
        ? "HÓA ĐƠN ĐIỀU CHỈNH"
        : data.adjustment_kind === "cancelled"
          ? "HÓA ĐƠN ĐÃ HUỶ"
          : null;

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-[#d9bfa3]/70 bg-[#fffaf2] text-[10.5px] leading-snug text-slate-800 shadow-sm dark:border-amber-900/40 dark:bg-amber-50/95">
      {/* watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #c8102e 0 2px, transparent 2px 14px)",
        }}
      />
      {isCancelled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="rotate-[-18deg] rounded border-2 border-red-600/80 px-3 py-1 text-sm font-black tracking-widest text-red-600/80">
            ĐÃ HUỶ
          </span>
        </div>
      )}

      <div className="relative px-3 pt-3 pb-2 text-center">
        <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-[#c8102e]">
          Hóa đơn giá trị gia tăng
        </div>
        <div className="mt-0.5 text-[9px] text-slate-600">
          (VAT Invoice) · Bản thể hiện
        </div>
        {adjustLabel && (
          <div className="mt-1 inline-block rounded bg-[#c8102e]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#c8102e]">
            {adjustLabel}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700">
          <span>
            Ngày <span className="font-semibold">{fmtDate(data.issue_date)}</span>
          </span>
          {data.series && (
            <span>
              Ký hiệu <span className="font-mono font-semibold">{data.series}</span>
            </span>
          )}
          <span>
            Số <span className="font-mono font-semibold text-[#c8102e]">{data.invoice_no || "—"}</span>
          </span>
        </div>
      </div>

      <div className="relative mx-3 border-t border-dashed border-[#c8102e]/30" />

      {/* Seller */}
      <section className="relative px-3 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-[#c8102e]">
          Đơn vị bán hàng
        </div>
        <div className="mt-0.5 font-semibold text-slate-900">
          {seller.name || "—"}
        </div>
        {seller.tax_id && (
          <div className="mt-0.5">
            <span className="text-slate-500">MST:</span>{" "}
            <span className="font-mono font-semibold">{seller.tax_id}</span>
          </div>
        )}
        {seller.address && (
          <div className="mt-0.5 line-clamp-2 text-slate-600">
            <span className="text-slate-500">Địa chỉ:</span> {seller.address}
          </div>
        )}
      </section>

      {/* Buyer */}
      {(buyer.name || buyer.tax_id || buyer.address) && (
        <section className="relative border-t border-dashed border-[#c8102e]/20 px-3 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#c8102e]">
            Đơn vị mua hàng
          </div>
          {buyer.name && (
            <div className="mt-0.5 font-medium text-slate-900">{buyer.name}</div>
          )}
          {buyer.tax_id && (
            <div className="mt-0.5">
              <span className="text-slate-500">MST:</span>{" "}
              <span className="font-mono">{buyer.tax_id}</span>
            </div>
          )}
          {buyer.address && (
            <div className="mt-0.5 line-clamp-2 text-slate-600">
              <span className="text-slate-500">Địa chỉ:</span> {buyer.address}
            </div>
          )}
        </section>
      )}

      {/* Lines */}
      {visible.length > 0 && (
        <section className="relative border-t border-dashed border-[#c8102e]/20 px-3 py-2">
          <table className="w-full table-fixed border-collapse text-[10px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                <th className="w-6 pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">Hàng hoá / dịch vụ</th>
                <th className="w-10 pb-1 text-right font-medium">SL</th>
                <th className="w-16 pb-1 text-right font-medium">Đơn giá</th>
                <th className="w-16 pb-1 text-right font-medium">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l, i) => (
                <tr key={i} className="border-t border-[#c8102e]/10 align-top">
                  <td className="py-1 text-slate-500">{i + 1}</td>
                  <td className="py-1 pr-1">
                    <div className="line-clamp-2 text-slate-800">
                      {l.description || "—"}
                    </div>
                    {l.unit && (
                      <div className="text-[9px] text-slate-500">ĐVT: {l.unit}</div>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {l.qty != null ? fmt(l.qty) : "—"}
                  </td>
                  <td className="py-1 text-right font-mono">{fmt(l.unit_price)}</td>
                  <td className="py-1 text-right font-mono">{fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {moreCount > 0 && (
            <div className="mt-1 text-center text-[9px] italic text-slate-500">
              … +{moreCount} dòng khác
            </div>
          )}
        </section>
      )}

      {/* Totals */}
      <section className="relative border-t border-dashed border-[#c8102e]/30 px-3 py-2">
        <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-[10px]">
          <dt className="text-slate-600">Cộng tiền hàng</dt>
          <dd className="font-mono">{fmt(t.subtotal)}</dd>
          {t.discount_total ? (
            <>
              <dt className="text-slate-600">Chiết khấu</dt>
              <dd className="font-mono">{fmt(t.discount_total)}</dd>
            </>
          ) : null}
          <dt className="text-slate-600">Tiền thuế GTGT</dt>
          <dd className="font-mono">{fmt(t.vat_amount)}</dd>
          <dt className="border-t border-[#c8102e]/30 pt-1 text-[10.5px] font-semibold text-slate-900">
            Tổng thanh toán
          </dt>
          <dd className="border-t border-[#c8102e]/30 pt-1 font-mono text-[11px] font-bold text-[#c8102e]">
            {fmt(t.total)} {data.currency || "VND"}
          </dd>
        </dl>
        {t.total_in_words && (
          <div className="mt-1 line-clamp-2 text-[9px] italic text-slate-600">
            Bằng chữ: {t.total_in_words}
          </div>
        )}
      </section>

      {/* Footer / signature */}
      <section className="relative flex items-center justify-between gap-2 border-t border-[#c8102e]/20 bg-[#fff5e6]/60 px-3 py-1.5">
        <div className="flex items-center gap-1 text-[9px] text-emerald-700">
          <ShieldCheck className="h-3 w-3" />
          <span className="font-semibold uppercase tracking-wider">
            {data.cqt_signed
              ? "Có mã CQT"
              : data.seller_signed
                ? "Đã ký số"
                : "Chưa ký"}
          </span>
        </div>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[9px] font-medium text-[#c8102e] hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Tải XML gốc
          </a>
        ) : null}
      </section>
      {data.cqt_code && (
        <div className="relative truncate border-t border-dashed border-[#c8102e]/20 px-3 py-1 text-center font-mono text-[9px] text-slate-500">
          Mã CQT: {data.cqt_code}
        </div>
      )}
    </div>
  );
}
