import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type TscdConfirmResult = {
  useful_life_years: number;
  asset_kind: "tangible" | "intangible";
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Tổng nguyên giá (gross) để hiển thị tham khảo */
  amount: number;
  /** Mô tả tài sản (mô tả dòng HĐ) */
  description?: string;
  /** Loại TSCĐ phát hiện từ AI: 211 (hữu hình) hoặc 213 (vô hình) */
  suggestedKind: "tangible" | "intangible";
  /** Số năm khấu hao gợi ý */
  suggestedYears?: number;
  busy?: boolean;
  onConfirm: (result: TscdConfirmResult) => void;
};

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

/**
 * Hiển thị khi AI đề xuất TSCĐ (211/213) — KTT cần xác nhận thời gian
 * khấu hao và loại TS trước khi ghi sổ (theo TT 45/2013/TT-BTC).
 */
export function TscdConfirmDialog({
  open,
  onOpenChange,
  amount,
  description,
  suggestedKind,
  suggestedYears = 5,
  busy,
  onConfirm,
}: Props) {
  const [years, setYears] = useState<number>(suggestedYears);
  const [kind, setKind] = useState<"tangible" | "intangible">(suggestedKind);

  const monthly = years > 0 ? Math.round(amount / (years * 12)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận tài sản cố định</DialogTitle>
          <DialogDescription>
            AI phát hiện dòng này là TSCĐ (nguyên giá ≥ 30 triệu, sử dụng &gt; 1 năm).
            Vui lòng xác nhận thời gian khấu hao theo khung TT 45/2013/TT-BTC.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {description && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mô tả
              </div>
              <div className="mt-0.5 line-clamp-2">{description}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Nguyên giá: <span className="font-semibold text-foreground">{fmt(amount)} ₫</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Loại tài sản</Label>
            <RadioGroup
              value={kind}
              onValueChange={(v) => setKind(v as "tangible" | "intangible")}
              className="grid grid-cols-2 gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="tangible" id="kind-tangible" />
                <div>
                  <div className="text-sm font-medium">Hữu hình (211)</div>
                  <div className="text-[11px] text-muted-foreground">Máy móc, thiết bị, xe…</div>
                </div>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="intangible" id="kind-intangible" />
                <div>
                  <div className="text-sm font-medium">Vô hình (213)</div>
                  <div className="text-[11px] text-muted-foreground">Phần mềm, bản quyền…</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="useful-life">Thời gian khấu hao (năm)</Label>
            <Input
              id="useful-life"
              type="number"
              min={1}
              max={50}
              value={years}
              onChange={(e) => setYears(Math.max(1, Number(e.target.value) || 1))}
            />
            <div className="text-xs text-muted-foreground">
              Khấu hao mỗi tháng: <span className="font-semibold text-foreground">{fmt(monthly)} ₫</span>
              {" · "}
              Khung TT 45: máy móc 3–15 năm · xe 6–10 năm · nhà 5–50 năm · phần mềm 3–10 năm.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            onClick={() => onConfirm({ useful_life_years: years, asset_kind: kind })}
            disabled={busy || years < 1}
            className="gap-1.5"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Xác nhận & ghi sổ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
