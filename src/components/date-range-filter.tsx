import { useState, useEffect } from "react";
import { Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PRESET_OPTIONS, type PresetKey, getPresetRange, detectPreset, formatVN,
} from "@/lib/date-presets";

type Props = {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  defaultPreset?: PresetKey;
  className?: string;
};

export function DateRangeFilter({ from, to, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>(() => detectPreset(from, to));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  useEffect(() => {
    setDraftFrom(from); setDraftTo(to);
    setPreset(detectPreset(from, to));
  }, [from, to]);

  const onPresetChange = (v: string) => {
    const key = v as PresetKey;
    setPreset(key);
    if (key === "custom") return;
    const r = getPresetRange(key);
    setDraftFrom(r.from); setDraftTo(r.to);
  };

  const apply = () => {
    onChange({ from: draftFrom, to: draftTo });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default" size="sm" className={cn("gap-2", className)}>
          <Filter className="h-4 w-4" />
          Từ {formatVN(from)} đến {formatVN(to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-4" align="start">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
          <div>
            <Label className="text-xs">Khung thời gian</Label>
            <Select value={preset} onValueChange={onPresetChange}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {PRESET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Từ ngày</Label>
            <Input
              type="date" value={draftFrom} className="h-9"
              onChange={(e) => { setDraftFrom(e.target.value); setPreset("custom"); }}
            />
          </div>
          <div>
            <Label className="text-xs">Đến ngày</Label>
            <Input
              type="date" value={draftTo} className="h-9"
              onChange={(e) => { setDraftTo(e.target.value); setPreset("custom"); }}
            />
          </div>
          <Button size="icon" className="h-9 w-9" onClick={apply} aria-label="Lọc">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
