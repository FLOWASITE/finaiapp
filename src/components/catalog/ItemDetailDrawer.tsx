import { ExternalLink, Info, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCatalogStore } from "@/stores/catalogStore";
import { getAccountLabel } from "@/data/account-labels";
import { ItemBadges } from "./ItemBadges";
import { RegimeSwitch } from "./RegimeSwitch";
import { ALLOCATION_LABEL, AMORTIZATION_LABEL, FREQUENCY_LABEL } from "@/lib/catalog-format";
import { toast } from "sonner";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-[#04342C]">{children}</div>
    </div>
  );
}

function AccountBox({ regime, accountCode, isDefault }: { regime: "TT99" | "TT133"; accountCode: string; isDefault: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        isDefault ? "border-[#0F6E56] bg-[#E1F5EE]/40" : "border-gray-200 bg-white"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
        Theo {regime === "TT99" ? "TT 99/2025" : "TT 133/2016"}
        {isDefault && <span className="ml-1 text-[#0F6E56]">(đang áp dụng)</span>}
      </div>
      <div className="text-xs space-y-0.5">
        <div>
          <span className="text-muted-foreground">TK Nợ:</span>{" "}
          <span className="font-mono font-semibold text-[#04342C]">{accountCode}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Tên TK:</span>{" "}
          <span className="text-[#04342C]">{getAccountLabel(accountCode, regime)}</span>
        </div>
      </div>
    </div>
  );
}

export function ItemDetailDrawer() {
  const code = useCatalogStore((s) => s.drawerItemCode);
  const openDrawer = useCatalogStore((s) => s.openDrawer);
  const items = useCatalogStore((s) => s.items);
  const regime = useCatalogStore((s) => s.company.accountingRegime);
  const addItem = useCatalogStore((s) => s.addItemToMine);
  const removeItem = useCatalogStore((s) => s.removeItemFromMine);

  const item = items.find((i) => i.code === code);
  const open = !!item;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && openDrawer(null)}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {item && (
          <>
            <SheetHeader className="px-5 py-4 border-b">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="text-base text-[#04342C]">{item.name}</SheetTitle>
                  <SheetDescription className="text-xs">
                    <span className="font-mono">{item.code}</span>
                    {item.nameEn && <> · {item.nameEn}</>}
                  </SheetDescription>
                </div>
                <button
                  onClick={() => openDrawer(null)}
                  className="p-1 rounded-md hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="px-5 py-4 space-y-5">
                {/* Regime status */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Chế độ kế toán áp dụng:</span>
                  <RegimeSwitch />
                </div>

                {/* Badges */}
                <div>
                  <ItemBadges item={item} />
                </div>

                {item.notes && (
                  <div className="rounded-md border border-[#FAEEDA] bg-[#FAEEDA]/40 px-3 py-2 text-xs text-[#633806] flex gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{item.notes}</span>
                  </div>
                )}

                <Separator />

                {/* Hạch toán mặc định: 2 cột */}
                <section>
                  <h3 className="text-sm font-semibold text-[#04342C] mb-2">
                    Hạch toán mặc định
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <AccountBox regime="TT99" accountCode={item.defaultAccountTT99} isDefault={regime === "TT99"} />
                    <AccountBox regime="TT133" accountCode={item.defaultAccountTT133} isDefault={regime === "TT133"} />
                  </div>
                  <div className="mt-3 space-y-0.5">
                    <Row label="TK thay thế">
                      {item.altAccounts.length
                        ? item.altAccounts.map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center rounded bg-[#F1EFE8] px-1.5 py-0.5 mr-1 text-xs font-mono"
                            >
                              {a}
                            </span>
                          ))
                        : "—"}
                    </Row>
                    <Row label="Phân bổ">{ALLOCATION_LABEL[item.allocationMethod]}</Row>
                    <Row label="Phân loại CP">{AMORTIZATION_LABEL[item.amortization]}</Row>
                  </div>

                  {item.allocationMethod === "manual_split" && (
                    <div className="mt-3 rounded-md border border-[#FAEEDA] bg-[#FAEEDA]/40 px-3 py-2 text-xs text-[#633806]">
                      Chi phí này cần chia thủ công giữa nhiều bộ phận. Khi có hoá đơn mới, Fin sẽ
                      hỏi tỉ lệ phân bổ.
                    </div>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-[#04342C] mb-2">Thuế</h3>
                  <Row label="VAT chuẩn">
                    {item.vatRateStandard > 0
                      ? `${Math.round(item.vatRateStandard * 100)}%`
                      : item.vatType === "FCT"
                        ? "Không VAT (FCT)"
                        : "0%"}
                  </Row>
                  <Row label="Giảm VAT 8%">{item.vatReductionEligible ? "Có" : "Không"}</Row>
                  <Row label="Được trừ TNDN">{item.deductible ? "Có" : "Không"}</Row>
                  {item.foreignSupplierTax === "fct_applicable" && (
                    <>
                      <Row label="Thuế nhà thầu">
                        VAT {Math.round(item.fctVatRate * 100)}% + CIT{" "}
                        {Math.round(item.fctCitRate * 100)}%
                      </Row>
                    </>
                  )}
                </section>

                <Separator />

                <section>
                  <h3 className="text-sm font-semibold text-[#04342C] mb-2">
                    Nhà cung cấp & tần suất
                  </h3>
                  <Row label="NCC điển hình">
                    {item.typicalSuppliers.length
                      ? item.typicalSuppliers.join(", ")
                      : "—"}
                  </Row>
                  <Row label="Xuất xứ">
                    {item.supplierCountry === "VN" ? "Việt Nam" : "Nước ngoài"}
                  </Row>
                  <Row label="Tần suất">{FREQUENCY_LABEL[item.frequency]}</Row>
                  <Row label="Aliases">
                    {item.aliases.length ? item.aliases.join(", ") : "—"}
                  </Row>
                </section>

                {(item.usageCount30Days ?? 0) > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-sm font-semibold text-[#04342C] mb-2">Sử dụng</h3>
                      <Row label="30 ngày qua">{item.usageCount30Days} lần</Row>
                      {item.lastUsedAt && <Row label="Gần nhất">{item.lastUsedAt}</Row>}
                    </section>
                  </>
                )}
              </div>
            </ScrollArea>

            <div className="border-t px-5 py-3 flex items-center justify-between gap-2">
              <a
                href="https://thuvienphapluat.vn/van-ban/Doanh-nghiep/Thong-tu-99-2025-TT-BTC.html"
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-[#0F6E56] hover:underline inline-flex items-center gap-1"
              >
                Tham khảo Thông tư 99/2025/TT-BTC <ExternalLink className="h-3 w-3" />
              </a>
              {item.isActive ? (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    removeItem(item.code);
                    toast.success(`Đã gỡ "${item.name}" khỏi danh mục`);
                    openDrawer(null);
                  }}
                >
                  Gỡ khỏi danh mục
                </Button>
              ) : (
                <Button
                  className="bg-[#0F6E56] hover:bg-[#085041] text-white"
                  onClick={() => {
                    addItem(item.code);
                    toast.success(`Đã thêm "${item.name}" vào danh mục`);
                  }}
                >
                  Thêm vào danh mục
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
