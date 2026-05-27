import { AlertTriangle, Globe, Package, ShieldOff, Sparkles, SplitSquareHorizontal, Wallet, Wrench } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CatalogItem } from "@/types/catalog";
import { useCatalogStore } from "@/stores/catalogStore";
import { getAccountLabel } from "@/data/account-labels";
import { formatVat } from "@/lib/catalog-format";

export function ItemBadges({ item }: { item: CatalogItem }) {
  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const account = regime === "TT99" ? item.defaultAccountTT99 : item.defaultAccountTT133;
  const accountName = getAccountLabel(account, regime);
  const prepaidName = getAccountLabel("242", regime);
  const isPrepaid = item.amortization !== "expense_immediately";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center rounded bg-[#F1EFE8] text-[#2C2C2A] px-1.5 py-0.5 text-[11px] font-mono">
              TK {account}
            </span>
          </TooltipTrigger>
          <TooltipContent>{accountName}</TooltipContent>
        </Tooltip>

        {item.vatRateStandard > 0 ? (
          <span className="inline-flex items-center rounded bg-[#F1EFE8] text-[#2C2C2A] px-1.5 py-0.5 text-[11px]">
            VAT {formatVat(item.vatRateStandard)}
          </span>
        ) : item.vatType === "FCT" ? null : (
          <span className="inline-flex items-center rounded bg-[#F1EFE8] text-[#2C2C2A] px-1.5 py-0.5 text-[11px]">
            VAT 0%
          </span>
        )}

        {item.foreignSupplierTax === "fct_applicable" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded bg-[#FCEBEB] text-[#791F1F] px-1.5 py-0.5 text-[11px] font-medium">
                <AlertTriangle className="h-3 w-3" />
                FCT {Math.round(item.fctVatRate * 100)}%+{Math.round(item.fctCitRate * 100)}%
              </span>
            </TooltipTrigger>
            <TooltipContent>Thuế nhà thầu — kê khai và nộp thay NCC nước ngoài</TooltipContent>
          </Tooltip>
        )}

        {item.allocationMethod === "manual_split" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded bg-[#FAEEDA] text-[#633806] px-1.5 py-0.5 text-[11px]">
                <SplitSquareHorizontal className="h-3 w-3" />
                Chia thủ công
              </span>
            </TooltipTrigger>
            <TooltipContent>Cần chia chi phí giữa các bộ phận</TooltipContent>
          </Tooltip>
        )}

        {item.supplierCountry === "FOREIGN" && (
          <span className="inline-flex items-center gap-0.5 rounded bg-[#E6F1FB] text-[#042C53] px-1.5 py-0.5 text-[11px]">
            <Globe className="h-3 w-3" />
            NCC nước ngoài
          </span>
        )}

        {isPrepaid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded bg-[#FAEEDA] text-[#633806] px-1.5 py-0.5 text-[11px]">
                <Wallet className="h-3 w-3" />
                Trả trước · 242
              </span>
            </TooltipTrigger>
            <TooltipContent>TK 242 — {prepaidName} theo {regime === "TT99" ? "TT 99" : "TT 133"}</TooltipContent>
          </Tooltip>
        )}

        {item.itemType === "goods" ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-[#E6F1FB] text-[#042C53] px-1.5 py-0.5 text-[11px]">
            <Package className="h-3 w-3" />
            Hàng hóa
          </span>
        ) : item.itemType === "service" ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-[#E1F5EE] text-[#0F6E56] px-1.5 py-0.5 text-[11px]">
            <Wrench className="h-3 w-3" />
            Dịch vụ
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded bg-[#F1EFE8] text-[#2C2C2A] px-1.5 py-0.5 text-[11px]">
            <Sparkles className="h-3 w-3" />
            Hỗn hợp
          </span>
        )}

        {!item.deductible && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded bg-[#FCEBEB] text-[#791F1F] px-1.5 py-0.5 text-[11px]">
                <ShieldOff className="h-3 w-3" />
                Không được trừ
              </span>
            </TooltipTrigger>
            <TooltipContent>Chi phí không được trừ khi tính thuế TNDN</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
