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
  size = "default",
}: {
  data: EinvoiceExtras;
  signedUrl?: string | null;
  size?: "default" | "large";
}) {
  const seller = data.seller ?? {};
  const buyer = data.buyer ?? {};
  const lines = data.lines ?? [];
  const t = data.totals ?? {};
  const isLarge = size === "large";
  const visible = isLarge ? lines : lines.slice(0, 5);
  const moreCount = isLarge ? 0 : Math.max(0, lines.length - visible.length);
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

  // Size-driven class tokens
  const px = isLarge ? "px-6" : "px-4";
  const titleCls = isLarge ? "text-sm" : "text-[11px]";
  const metaValCls = isLarge ? "text-[15px]" : "text-[12.5px]";
  const partyNameCls = isLarge ? "text-base" : "text-[13px]";
  const partyMetaCls = isLarge ? "text-[12px]" : "text-[11px]";
  const tableCls = isLarge ? "text-[13px]" : "text-[11.5px]";
  const tableHeadCls = isLarge ? "text-[11px]" : "text-[10px]";
  const totalsCls = isLarge ? "text-[13px]" : "text-[11.5px]";
  const grandCls = isLarge ? "text-2xl" : "text-[16px]";
  const grandLabelCls = isLarge ? "text-[12px]" : "text-[11px]";
  const footerCls = isLarge ? "text-[11px]" : "text-[10px]";

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
      <div className={cn("flex items-start justify-between gap-2 pt-3 pb-2", px)}>
        <div>
          <div
            className={cn("font-semibold uppercase tracking-[0.22em]", titleCls)}
            style={{ color: RED }}
          >
            Hoá đơn GTGT
          </div>
          <div className={cn("mt-0.5 text-muted-foreground", isLarge ? "text-[11px]" : "text-[9.5px]")}>
            VAT Invoice · Bản thể hiện
          </div>
          {adjustLabel && (
            <div className={cn(
              "mt-1 inline-block rounded bg-amber-500/10 px-1.5 py-0.5 font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400",
              isLarge ? "text-[10px]" : "text-[9px]",
            )}>
              {adjustLabel}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.seller_signed && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400",
              isLarge ? "text-[10px]" : "text-[9px]",
            )}>
              <ShieldCheck className="h-3 w-3" />
              Đã ký số
            </span>
          )}
          {data.cqt_signed && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400",
              isLarge ? "text-[10px]" : "text-[9px]",
            )}>
              <BadgeCheck className="h-3 w-3" />
              Mã CQT
            </span>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className={cn("grid grid-cols-3 gap-2 border-t border-border/60 py-2.5", px)}>
        <MetaCell label="Số" value={data.invoice_no || "—"} valueCls={metaValCls} accent />
        <MetaCell label="Ký hiệu" value={data.series || "—"} valueCls={metaValCls} mono />
        <MetaCell label="Ngày" value={fmtDate(data.issue_date)} valueCls={metaValCls} />
        {seriesLabel && (
          <div className={cn("col-span-3 -mt-1 text-muted-foreground", isLarge ? "text-[10px]" : "text-[9px]")}>
            {seriesLabel}
          </div>
        )}
      </div>

      {/* Seller */}
      <section className={cn("border-t border-border/60 py-2.5", px)}>
        <SectionLabel large={isLarge}>Người bán</SectionLabel>
        <div className={cn("mt-0.5 font-semibold text-foreground", partyNameCls)}>
          {seller.name || "—"}
        </div>
        <div className={cn("mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground", partyMetaCls)}>
          {seller.tax_id && (
            <span>
              MST <span className="font-mono font-semibold text-foreground">{seller.tax_id}</span>
            </span>
          )}
          {seller.address && (
            <span className={cn("flex-1 min-w-0", isLarge ? "" : "line-clamp-1")}>{seller.address}</span>
          )}
        </div>
      </section>

      {/* Buyer */}
      {(buyer.name || buyer.tax_id || buyer.address) && (
        <section className={cn("border-t border-border/60 py-2.5", px)}>
          <SectionLabel large={isLarge}>Người mua</SectionLabel>
          {buyer.name && (
            <div className={cn("mt-0.5 font-semibold text-foreground", partyNameCls)}>
              {buyer.name}
            </div>
          )}
          <div className={cn("mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-muted-foreground", partyMetaCls)}>
            {buyer.tax_id && (
              <span>
                MST <span className="font-mono font-semibold text-foreground">{buyer.tax_id}</span>
              </span>
            )}
            {buyer.address && (
              <span className={cn("flex-1 min-w-0", isLarge ? "" : "line-clamp-1")}>{buyer.address}</span>
            )}
          </div>
        </section>
      )}

      {/* Lines */}
      {visible.length > 0 && (
        <section className={cn("border-t border-border/60 py-2.5", px)}>
          <SectionLabel large={isLarge}>Chi tiết</SectionLabel>
          <table className={cn("mt-1.5 w-full table-fixed border-collapse", tableCls)}>
            <thead>
              <tr className={cn("text-left uppercase tracking-wider text-muted-foreground", tableHeadCls)}>
                <th className="w-6 pb-1 font-medium">#</th>
                <th className="pb-1 font-medium">Hàng hoá</th>
                <th className={cn("pb-1 text-right font-medium", isLarge ? "w-14" : "w-10")}>SL</th>
                <th className={cn("pb-1 text-right font-medium", isLarge ? "w-24" : "w-20")}>Đơn giá</th>
                <th className={cn("pb-1 text-right font-medium", isLarge ? "w-28" : "w-20")}>T.tiền</th>
                {hasAnyVatRate && (
                  <th className={cn("pb-1 text-right font-medium", isLarge ? "w-14" : "w-12")}>VAT</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((l, i) => (
                <tr
                  key={i}
                  className="border-t border-border/40 align-top even:bg-muted/30"
                >
                  <td className="py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="py-1.5 pr-2">
                    <div className={cn("text-foreground", isLarge ? "" : "line-clamp-2")}>
                      {l.description || "—"}
                    </div>
                    {l.unit && (
                      <div className={cn("text-muted-foreground", isLarge ? "text-[11px]" : "text-[9.5px]")}>
                        ĐVT: {l.unit}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {l.qty != null ? fmt(l.qty) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono">{fmt(l.unit_price)}</td>
                  <td className="py-1.5 text-right font-mono">{fmt(l.amount)}</td>
                  {hasAnyVatRate && (
                    <td className="py-1.5 text-right font-mono text-muted-foreground">
                      {fmtVatRate(l.vat_rate) || "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {moreCount > 0 && (
            <div className="mt-1 text-center text-[10px] italic text-muted-foreground">
              … +{moreCount} dòng khác
            </div>
          )}
        </section>
      )}

      {/* Totals */}
      <section className={cn("border-t border-border/60 py-2.5", px)}>
        <dl className={cn("grid grid-cols-[1fr_auto] gap-y-0.5", totalsCls)}>
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
            className={cn(
              "mt-1.5 border-t-2 border-border pt-1.5 font-semibold uppercase tracking-wider",
              grandLabelCls,
            )}
            style={{ color: RED }}
          >
            Tổng thanh toán
          </dt>
          <dd
            className={cn(
              "mt-1.5 border-t-2 border-border pt-1.5 font-mono font-bold",
              grandCls,
            )}
            style={{ color: RED }}
          >
            {fmt(t.total)} {data.currency || "₫"}
          </dd>
        </dl>
        {t.total_in_words && (
          <div className={cn("mt-1 italic text-muted-foreground", isLarge ? "text-[11px]" : "text-[10px]")}>
            Bằng chữ: {t.total_in_words}
          </div>
        )}
      </section>

      {/* Footer */}
      <section className={cn("flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 py-2", px)}>
        {data.cqt_code ? (
          <button
            type="button"
            onClick={onCopyCqt}
            className={cn(
              "group flex min-w-0 items-center gap-1 truncate text-left text-muted-foreground hover:text-foreground",
              footerCls,
            )}
            title={`Mã CQT: ${data.cqt_code} — bấm để copy`}
          >
            <Copy className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
            <span className="truncate font-mono">CQT: {data.cqt_code}</span>
          </button>
        ) : (
          <span className={cn("text-muted-foreground", footerCls)}>Hoá đơn điện tử</span>
        )}
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 font-semibold uppercase tracking-wider hover:underline",
              footerCls,
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
  valueCls,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  valueCls?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "truncate font-semibold",
          valueCls ?? "text-[12.5px]",
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

function SectionLabel({ children, large }: { children: React.ReactNode; large?: boolean }) {
  return (
    <div className={cn(
      "font-semibold uppercase tracking-wider text-muted-foreground",
      large ? "text-[10.5px]" : "text-[9.5px]",
    )}>
      {children}
    </div>
  );
}
