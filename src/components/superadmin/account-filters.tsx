import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter, X } from "lucide-react";

export type AccountFiltersValue = {
  q: string;
  roles: string[];
  status: string;
  created_from: string;
  created_to: string;
  last_login_bucket: string;
};

export const EMPTY_FILTERS: AccountFiltersValue = {
  q: "",
  roles: [],
  status: "any",
  created_from: "",
  created_to: "",
  last_login_bucket: "any",
};

const ROLES = ["owner", "accountant", "viewer", "superadmin"];

export function AccountFilters({
  value,
  onChange,
}: {
  value: AccountFiltersValue;
  onChange: (v: AccountFiltersValue) => void;
}) {
  const activeCount =
    (value.roles.length ? 1 : 0) +
    (value.status !== "any" ? 1 : 0) +
    (value.created_from || value.created_to ? 1 : 0) +
    (value.last_login_bucket !== "any" ? 1 : 0);

  const reset = () => onChange({ ...EMPTY_FILTERS, q: value.q });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Tìm email / tên / công ty..."
        value={value.q}
        onChange={(e) => onChange({ ...value, q: e.target.value })}
        className="max-w-sm"
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Bộ lọc
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-5 px-1.5">{activeCount}</Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Vai trò</Label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => {
                const has = value.roles.includes(r);
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${has ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <Checkbox
                      checked={has}
                      onCheckedChange={(v) =>
                        onChange({
                          ...value,
                          roles: v
                            ? [...value.roles, r]
                            : value.roles.filter((x) => x !== r),
                        })
                      }
                      className="h-3 w-3"
                    />
                    {r}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Trạng thái</Label>
            <Select
              value={value.status}
              onValueChange={(v) => onChange({ ...value, status: v })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Tất cả</SelectItem>
                <SelectItem value="active">Hoạt động</SelectItem>
                <SelectItem value="unconfirmed">Chưa xác thực</SelectItem>
                <SelectItem value="banned">Đã khóa</SelectItem>
                <SelectItem value="with_mfa">Đã bật 2FA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Đăng nhập gần nhất</Label>
            <Select
              value={value.last_login_bucket}
              onValueChange={(v) => onChange({ ...value, last_login_bucket: v })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Tất cả</SelectItem>
                <SelectItem value="never">Chưa từng</SelectItem>
                <SelectItem value="7d">≤ 7 ngày</SelectItem>
                <SelectItem value="30d">≤ 30 ngày</SelectItem>
                <SelectItem value="90d_plus">&gt; 90 ngày</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Tạo từ</Label>
              <Input type="date" className="h-8" value={value.created_from}
                onChange={(e) => onChange({ ...value, created_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đến</Label>
              <Input type="date" className="h-8" value={value.created_to}
                onChange={(e) => onChange({ ...value, created_to: e.target.value })} />
            </div>
          </div>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="w-full" onClick={reset}>
              <X className="mr-1 h-3 w-3" /> Xóa bộ lọc
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
