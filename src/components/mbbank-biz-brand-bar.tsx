import { Building2 } from "lucide-react";

/**
 * Brand bar gợi nhớ trang đăng nhập BIZ MBBank (xanh đậm).
 * Không dùng logo gốc — typography only để tránh vấn đề bản quyền.
 */
export function MbBizBrandBar({ subtitle }: { subtitle?: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-xl p-4 text-white shadow-sm"
      style={{
        background:
          "linear-gradient(135deg,#0046b8 0%,#0036a0 55%,#002a82 100%)",
      }}
    >
      <div
        aria-hidden
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle,#ffffff 0%,transparent 70%)" }}
      />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm ring-1 ring-white/25">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold tracking-[0.18em] text-white/85">
              BIZ
            </span>
            <span className="text-lg font-bold tracking-tight">MBBank</span>
          </div>
          <div className="text-[11px] text-white/80 mt-0.5">
            {subtitle ?? "Ngân hàng số dành cho khách hàng doanh nghiệp"}
          </div>
        </div>
      </div>
    </div>
  );
}
