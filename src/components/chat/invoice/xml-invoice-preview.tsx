import { Copy, ExternalLink, ShieldCheck, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Line = {
  description?: string | null;
  unit?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  vat_rate?: number | string | null;
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

const RED = "#c8102e";

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

function fmtVatRate(v: number | string | null | undefined): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    if (["KCT", "KKKNT", "KHAC", "KHÁC"].includes(s)) return s;
    const num = Number(s.replace("%", ""));
    if (!Number.isNaN(num)) return `${num}%`;
    return s;
  }
  return `${v}%`;
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
  const visible = lines.slice(0, 5);
  const moreCount = Math.max(0, lines.length - visible.length);
  const isCancelled = data.adjustment_kind === "cancelled";
  const adjustLabel =
    data.adjustment_kind === "replacement"
      ? "Hoá đơn thay thế"
      : data.adjustment_kind === "adjustment"
        ? "Hoá đơn điều chỉnh"
        : null;

  const hasAnyVatRate = visible.some((l) => l.vat_rate != null && l.vat_rate !== "");
  const seriesLabel = [
    data.template ? `Mẫu ${data.template}` : null,
    data.series ? `KH ${data.series}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const onCopyCqt = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!data.cqt_code) return;
    navigator.clipboard.writeText(data.cqt_code).then(
      () => toast.success("Đã copy mã CQT"),
      () => toast.error("Không copy được mã CQT"),
    );
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition hover:shadow-md">
      {/* Stamp bar */}
      <div className="h-1.5 w-full" style={{ background: RED }} />

      {isCancelled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="rotate-[-14deg] rounded border-2 border-destructive/80 bg-background/40 px-3 py-1 text-sm font-black tracking-widest text-destructive backdrop-blur-sm">
            ĐÃ HUỶ
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-2">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: RED }}
          >
            Hoá đơn GTGT
          </div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">
            VAT Invoice · Bản thể hiện
          </div>
          {adjustLabel && (
            <div className="mt-1 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {adjustLabel}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.seller_signed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-2.5 w-2.5" />
              Đã ký số
            </span>
          )}
          {data.cqt_signed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
              <BadgeCheck className="h-2.5 w-2.5" />
              Mã CQT
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-3 gap-2 border-t border-border/60 px-3.5 py-2">
        <MetaCell label="Số" value={data.invoice_no || "—"} accent />
        <MetaCell label="Ký hiệu" value={data.series || "—"} mono />
        <MetaCell label="Ngày" value={fmtDate(data.issue_date)} />
        {seriesLabel && (
          <div className="col-span-3 -mt-1 text-[9px] text-muted-foreground">
            {seriesLabel}
          </div>
        )}
      </div>

      {/* Seller */}
      <section className="border-t border-border/60 px-3.5 py-2">
        <SectionLabel>Người bán</SectionLabel>
        <div className="mt-0.5 text-[12px] font-semibold text-foreground">
          {seller.name || "—"}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {seller.tax_id && (
            <span>
              MST <span className="font-mono font-semibold text-foreground">{seller.tax_id}</span>
            </span>
          )}
          {seller.address && (
            <span className="line-clamp-1 flex-1 min-w-0">{seller.address}</span>
          )}
        </div>
      </section>

      {/* Buyer */}
      {(buyer.name || buyer.tax_id || buyer.address) && (
        <section className="border-t border-border/60 px-3.5 py-2">
          <SectionLabel>Người mua</SectionLabel>
          {buyer.name && (
            <div className="mt-0.5 text-[12px] font-semibold text-foreground">
              {buyer.name}
            </div>
          )}
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            {buyer.tax_id && (
              <span>
                MST <span className="font-mono font-semibold text-foreground">{buyer.tax_id}</span>
              </span>
            )}
            {buyer.address && (
              <span className="line-clamp-1 flex-1 min-w-0">{buyer.address}</span>
            )}
          </div>
        </section>
      )}

      {/* Lines */}
      {visible.length > 0 && (
        <section className="border-t border-border/60 px-3.5 py-2">
          <SectionLabel>Chi tiết</SectionLabel>
          <table className="mt-1 w-full table-fixed border-collapse text-[10px]">
            <thead>
              <tr className="text-left text-[9px] uppercase tracking-wider text-muted-foreground">
                <th className="w-5 pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">Hàng hoá</th>
                <th className="w-9 pb-1 text-right font-medium">SL</th>
                <th className="w-16 pb-1 text-right font-medium">Đơn giá</th>
                <th className="w-16 pb-1 text-right font-medium">T.tiền</th>
                {hasAnyVatRate && (
                  <th className="w-10 pb-1 text-right font-medium">VAT</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((l, i) => (
                <tr
                  key={i}
                  className="border-t border-border/40 align-top even:bg-muted/30"
                >
                  <td className="py-1 text-muted-foreground">{i + 1}</td>
                  <td className="py-1 pr-1">
                    <div className="line-clamp-2 text-foreground">
                      {l.description || "—"}
                    </div>
                    {l.unit && (
                      <div className="text-[9px] text-muted-foreground">
                        ĐVT: {l.unit}
                      </div>
                    )}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {l.qty != null ? fmt(l.qty) : "—"}
                  </td>
                  <td className="py-1 text-right font-mono">{fmt(l.unit_price)}</td>
                  <td className="py-1 text-right font-mono">{fmt(l.amount)}</td>
                  {hasAnyVatRate && (
                    <td className="py-1 text-right font-mono text-muted-foreground">
                      {fmtVatRate(l.vat_rate) || "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {moreCount > 0 && (
            <div className="mt-1 text-center text-[9px] italic text-muted-foreground">
              … +{moreCount} dòng khác
            </div>
          )}
        </section>
      )}

      {/* Totals */}
      <section className="border-t border-border/60 px-3.5 py-2">
        <dl className="grid grid-cols-[1fr_auto] gap-y-0.5 text-[10.5px]">
          <dt className="text-muted-foreground">Cộng tiền hàng</dt>
          <dd className="font-mono text-foreground">{fmt(t.subtotal)}</dd>
          {t.discount_total ? (
            <>
              <dt className="text-muted-foreground">Chiết khấu</dt>
              <dd className="font-mono text-foreground">{fmt(t.discount_total)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Thuế GTGT</dt>
          <dd className="font-mono text-foreground">{fmt(t.vat_amount)}</dd>
          <dt
            className="mt-1 border-t-2 border-border pt-1 text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: RED }}
          >
            Tổng thanh toán
          </dt>
          <dd
            className="mt-1 border-t-2 border-border pt-1 font-mono text-[14px] font-bold"
            style={{ color: RED }}
          >
            {fmt(t.total)} {data.currency || "₫"}
          </dd>
        </dl>
        {t.total_in_words && (
          <div className="mt-1 line-clamp-2 text-[9px] italic text-muted-foreground">
            Bằng chữ: {t.total_in_words}
          </div>
        )}
      </section>

      {/* Footer */}
      <section className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3.5 py-1.5">
        {data.cqt_code ? (
          <button
            type="button"
            onClick={onCopyCqt}
            className="group flex min-w-0 items-center gap-1 truncate text-left text-[9px] text-muted-foreground hover:text-foreground"
            title={`Mã CQT: ${data.cqt_code} — bấm để copy`}
          >
            <Copy className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
            <span className="truncate font-mono">CQT: {data.cqt_code}</span>
          </button>
        ) : (
          <span className="text-[9px] text-muted-foreground">Hoá đơn điện tử</span>
        )}
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-[9px] font-semibold uppercase tracking-wider",
              "hover:underline",
            )}
            style={{ color: RED }}
          >
            <ExternalLink className="h-3 w-3" />
            Tải XML
          </a>
        ) : null}
      </section>
    </div>
  );
}

function MetaCell({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "truncate text-[11px] font-semibold",
          mono || accent ? "font-mono" : "",
        )}
        style={accent ? { color: RED } : undefined}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
