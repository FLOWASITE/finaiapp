import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Plus,
  Settings,
  ChevronDown,
  Trash2,
  PlusCircle,
  Eye,
  FileText,
  Filter,
  Search,
  Loader2,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { getVoucherList } from "@/lib/vouchers.functions";
import { createManualJournalEntry } from "@/lib/journal.functions";
import { VoucherDetailDialog } from "@/components/voucher-detail-dialog";
import { useServerFn } from "@tanstack/react-start";
import { formatVN, getPresetRange, detectPreset, PRESET_OPTIONS, type PresetKey } from "@/lib/date-presets";

export const Route = createFileRoute("/_app/journal")({
  component: JournalPage,
});

function JournalPage() {
  const todayDate = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const queryClient = useQueryClient();

  // Date range filter state
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  
  // Date range popover states
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [preset, setPreset] = useState<PresetKey>(() => detectPreset(from, to));
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  // Inline filter states
  const [filterLoaiGiaoDich, setFilterLoaiGiaoDich] = useState("");
  const [filterSoChungTu, setFilterSoChungTu] = useState("");
  const [filterNgayHachToanFrom, setFilterNgayHachToanFrom] = useState("");
  const [filterNgayHachToanTo, setFilterNgayHachToanTo] = useState("");
  const [filterNoiDung, setFilterNoiDung] = useState("");
  const [filterGiaTriMin, setFilterGiaTriMin] = useState("");
  const [filterGiaTriMax, setFilterGiaTriMax] = useState("");
  const [filterTaiLieu, setFilterTaiLieu] = useState("");

  // Table selection state
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  
  // Create voucher dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newDate, setNewDate] = useState(todayDate);
  const [newDescription, setNewDescription] = useState("");
  const [newLines, setNewLines] = useState<Array<{ account_code: string; debit: number; credit: number }>>([
    { account_code: "", debit: 0, credit: 0 },
    { account_code: "", debit: 0, credit: 0 },
  ]);

  // Detail dialog state
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  // Fetch voucher list server-side function
  const fetchVouchers = useServerFn(getVoucherList);
  const createManualVoucher = useServerFn(createManualJournalEntry);

  const { data: voucherData, isLoading } = useQuery({
    queryKey: ["voucher-list", from, to],
    queryFn: () =>
      fetchVouchers({
        data: {
          from,
          to,
          pageSize: 100000, // Fetch all within date range for quick client-side inline filtering
        },
      }),
  });

  // Query Chart of Accounts for manual voucher creation
  const { data: accounts } = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chart_of_accounts")
        .select("code, name")
        .eq("is_active", true)
        .order("code", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Reset preset values on from/to change
  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setPreset(detectPreset(from, to));
  }, [from, to]);

  const onPresetChange = (v: string) => {
    const key = v as PresetKey;
    setPreset(key);
    if (key === "custom") return;
    const r = getPresetRange(key);
    setDraftFrom(r.from);
    setDraftTo(r.to);
  };

  const applyDateRange = () => {
    setFrom(draftFrom);
    setTo(draftTo);
    setDatePopoverOpen(false);
    setSelectedRows([]);
  };

  // Group detailed journal lines by entry_id to get voucher level rows
  const groupedVouchers = useMemo(() => {
    const map = new Map<string, {
      id: string;
      entry_date: string;
      voucher_no: string;
      voucher_type: string;
      description: string | null;
      amount: number;
      document_no: string | null;
    }>();

    (voucherData?.rows ?? []).forEach((row) => {
      const existing = map.get(row.entry_id);
      if (existing) {
        // Sum debit lines for voucher value
        existing.amount += row.debit;
      } else {
        map.set(row.entry_id, {
          id: row.entry_id,
          entry_date: row.entry_date,
          voucher_no: row.voucher_no,
          voucher_type: row.voucher_type,
          description: row.description,
          amount: row.debit,
          document_no: row.invoice_no,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  }, [voucherData?.rows]);

  // Apply client-side inline filters
  const filteredVouchers = useMemo(() => {
    return groupedVouchers.filter((v) => {
      // 1. Loại giao dịch filter
      if (filterLoaiGiaoDich) {
        const typeNorm = v.voucher_type.toLowerCase();
        const selNorm = filterLoaiGiaoDich.toLowerCase();
        // Match short codes (PT, PC, BC, BN) or full name
        const matchPT = selNorm === "pt" && (typeNorm.includes("phiếu thu") || typeNorm.includes("pt"));
        const matchPC = selNorm === "pc" && (typeNorm.includes("phiếu chi") || typeNorm.includes("pc"));
        const matchBC = selNorm === "bc" && (typeNorm.includes("báo có") || typeNorm.includes("bc"));
        const matchBN = selNorm === "bn" && (typeNorm.includes("báo nợ") || typeNorm.includes("bn"));
        const matchPKT = selNorm === "pkt" && (typeNorm.includes("kế toán") && !typeNorm.includes("thu") && !typeNorm.includes("chi"));
        const matchPNK = selNorm === "pnk" && typeNorm.includes("nhập kho");
        const matchPXK = selNorm === "pxk" && typeNorm.includes("xuất kho");
        const matchHDB = selNorm === "hđb" && typeNorm.includes("hóa đơn bán");
        const matchHDM = selNorm === "hđm" && typeNorm.includes("hóa đơn mua");
        
        const isMatched = matchPT || matchPC || matchBC || matchBN || matchPKT || matchPNK || matchPXK || matchHDB || matchHDM;
        if (!isMatched) return false;
      }

      // 2. Số chứng từ filter
      if (filterSoChungTu && !v.voucher_no.toLowerCase().includes(filterSoChungTu.toLowerCase())) {
        return false;
      }

      // 3. Ngày hạch toán range filter
      if (filterNgayHachToanFrom && v.entry_date < filterNgayHachToanFrom) {
        return false;
      }
      if (filterNgayHachToanTo && v.entry_date > filterNgayHachToanTo) {
        return false;
      }

      // 4. Nội dung filter
      if (filterNoiDung && !(v.description ?? "").toLowerCase().includes(filterNoiDung.toLowerCase())) {
        return false;
      }

      // 5. Giá trị range filter
      if (filterGiaTriMin && v.amount < Number(filterGiaTriMin)) {
        return false;
      }
      if (filterGiaTriMax && v.amount > Number(filterGiaTriMax)) {
        return false;
      }

      // 6. Tài liệu filter
      if (filterTaiLieu && !(v.document_no ?? "").toLowerCase().includes(filterTaiLieu.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [
    groupedVouchers,
    filterLoaiGiaoDich,
    filterSoChungTu,
    filterNgayHachToanFrom,
    filterNgayHachToanTo,
    filterNoiDung,
    filterGiaTriMin,
    filterGiaTriMax,
    filterTaiLieu,
  ]);

  // Sum value for footer row
  const totalValueSum = useMemo(() => {
    return filteredVouchers.reduce((s, v) => s + v.amount, 0);
  }, [filteredVouchers]);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("journal_entries")
        .delete()
        .in("id", ids);
      if (error) throw error;
      return ids;
    },
    onSuccess: () => {
      toast.success("Đã xóa các phiếu kế toán thành công!");
      setSelectedRows([]);
      queryClient.invalidateQueries({ queryKey: ["voucher-list"] });
    },
    onError: (err: any) => {
      toast.error("Không thể xóa phiếu: " + err.message);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeLines = newLines.filter(
        (l) => l.account_code && (l.debit > 0 || l.credit > 0)
      );
      if (activeLines.length < 2) {
        throw new Error("Phiếu kế toán cần ít nhất 2 dòng định khoản");
      }
      return createManualVoucher({
        data: {
          description: newDescription,
          entry_date: newDate,
          lines: activeLines,
        },
      });
    },
    onSuccess: () => {
      toast.success("Tạo phiếu kế toán thành công!");
      setShowCreateDialog(false);
      queryClient.invalidateQueries({ queryKey: ["voucher-list"] });
      setSelectedRows([]);
    },
    onError: (err: any) => {
      toast.error(err.message || "Tạo phiếu kế toán thất bại");
    },
  });

  const handleDeleteSelected = () => {
    if (confirm(`Bạn có chắc chắn muốn xóa ${selectedRows.length} phiếu đã chọn không?`)) {
      deleteMutation.mutate(selectedRows);
    }
  };

  // Helper lines for create new voucher
  const handleAddLine = () => {
    setNewLines([...newLines, { account_code: "", debit: 0, credit: 0 }]);
  };

  const handleRemoveLine = (idx: number) => {
    if (newLines.length <= 2) {
      toast.warning("Phiếu kế toán cần ít nhất 2 dòng định khoản");
      return;
    }
    setNewLines(newLines.filter((_, i) => i !== idx));
  };

  const handleLineChange = (
    idx: number,
    field: "account_code" | "debit" | "credit",
    val: any
  ) => {
    const next = [...newLines];
    if (field === "account_code") {
      next[idx].account_code = val;
    } else {
      next[idx][field] = Number(val) || 0;
    }
    setNewLines(next);
  };

  const sumDebit = useMemo(() => newLines.reduce((s, l) => s + l.debit, 0), [newLines]);
  const sumCredit = useMemo(() => newLines.reduce((s, l) => s + l.credit, 0), [newLines]);
  const isBalanced = useMemo(
    () => Math.abs(sumDebit - sumCredit) < 0.01 && sumDebit > 0,
    [sumDebit, sumCredit]
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Top Sub-Tabs navigation */}
      <div className="border-b border-border bg-background px-8 shrink-0">
        <div className="flex h-12 items-center gap-6">
          <button className="h-full border-b-2 border-emerald-600 text-sm font-semibold text-emerald-600 px-1">
            Phiếu kế toán
          </button>
          <button className="h-full border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-foreground px-1">
            Khai báo nghiệp vụ
          </button>
        </div>
      </div>

      <div className="p-8 space-y-4 flex-1 overflow-auto">
        {/* Title area & buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Phiếu kế toán</h1>
            {/* Date range filter button */}
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 flex items-center gap-1.5 shadow-none"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Từ {formatVN(from)} đến {formatVN(to)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[520px] p-4" align="start">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-3">
                  <div>
                    <Label className="text-xs">Khung thời gian</Label>
                    <Select value={preset} onValueChange={onPresetChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {PRESET_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Từ ngày</Label>
                    <Input
                      type="date"
                      value={draftFrom}
                      className="h-9"
                      onChange={(e) => {
                        setDraftFrom(e.target.value);
                        setPreset("custom");
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Đến ngày</Label>
                    <Input
                      type="date"
                      value={draftTo}
                      className="h-9"
                      onChange={(e) => {
                        setDraftTo(e.target.value);
                        setPreset("custom");
                      }}
                    />
                  </div>
                  <Button
                    size="icon"
                    className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={applyDateRange}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-medium gap-1 shadow-sm">
                  Phiếu đã chọn ({selectedRows.length})
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-1" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={selectedRows.length === 0}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Xóa phiếu đã chọn
                </Button>
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              className="h-8 text-xs font-medium bg-[#10B981] hover:bg-[#0D9488] text-white flex items-center gap-1.5 rounded-md shadow-sm transition-colors"
              onClick={() => {
                setNewLines([
                  { account_code: "", debit: 0, credit: 0 },
                  { account_code: "", debit: 0, credit: 0 },
                ]);
                setNewDescription("");
                setNewDate(todayDate);
                setShowCreateDialog(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm mới
            </Button>

            <Button variant="outline" size="icon" className="h-8 w-8 shadow-sm" aria-label="Cài đặt">
              <Settings className="h-4 w-4" />
            </Button>

            <span className="inline-flex items-center justify-center rounded-md bg-emerald-50 border border-emerald-100 text-emerald-700 font-semibold px-2.5 py-1.5 text-xs leading-none shadow-sm">
              Tổng: {filteredVouchers.length}
            </span>
          </div>
        </div>

        {/* Table representation */}
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
              <span>Đang tải danh sách phiếu…</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-foreground">
                <thead>
                  {/* Dòng tiêu đề cột */}
                  <tr className="border-b border-border bg-muted/40 font-semibold">
                    <th className="w-10 px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={
                          filteredVouchers.length > 0 &&
                          selectedRows.length === filteredVouchers.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(filteredVouchers.map((v) => v.id));
                          } else {
                            setSelectedRows([]);
                          }
                        }}
                        className="rounded border-input accent-emerald-600 h-3.5 w-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="w-12 px-3 py-2 text-center">STT</th>
                    <th className="w-40 px-3 py-2">Loại giao dịch *</th>
                    <th className="w-40 px-3 py-2">Số chứng từ *</th>
                    <th className="w-48 px-3 py-2">Ngày hạch toán *</th>
                    <th className="px-3 py-2">Nội dung *</th>
                    <th className="w-48 px-3 py-2 text-right">Giá trị *</th>
                    <th className="w-40 px-3 py-2">Tài liệu</th>
                  </tr>

                  {/* Dòng bộ lọc inline */}
                  <tr className="border-b border-border bg-muted/10">
                    <td className="px-3 py-1.5 text-center"></td>
                    <td className="px-3 py-1.5 text-center"></td>

                    {/* Loại giao dịch */}
                    <td className="px-3 py-1.5">
                      <select
                        value={filterLoaiGiaoDich}
                        onChange={(e) => setFilterLoaiGiaoDich(e.target.value)}
                        className="w-full h-8 px-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">Vui lòng chọn</option>
                        <option value="PT">PT — Phiếu thu</option>
                        <option value="PC">PC — Phiếu chi</option>
                        <option value="BC">BC — Báo có</option>
                        <option value="BN">BN — Báo nợ</option>
                        <option value="PKT">PKT — Phiếu kế toán</option>
                        <option value="PNK">PNK — Phiếu nhập kho</option>
                        <option value="PXK">PXK — Phiếu xuất kho</option>
                        <option value="HĐB">HĐB — Hóa đơn bán</option>
                        <option value="HĐM">HĐM — Hóa đơn mua</option>
                      </select>
                    </td>

                    {/* Số chứng từ */}
                    <td className="px-3 py-1.5">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm"
                          value={filterSoChungTu}
                          onChange={(e) => setFilterSoChungTu(e.target.value)}
                          className="w-full h-8 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </td>

                    {/* Ngày hạch toán */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={filterNgayHachToanFrom}
                          onChange={(e) => setFilterNgayHachToanFrom(e.target.value)}
                          className="w-[calc(50%-2px)] h-8 px-1 text-[10px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-muted-foreground text-[10px]">-</span>
                        <input
                          type="date"
                          value={filterNgayHachToanTo}
                          onChange={(e) => setFilterNgayHachToanTo(e.target.value)}
                          className="w-[calc(50%-2px)] h-8 px-1 text-[10px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </td>

                    {/* Nội dung */}
                    <td className="px-3 py-1.5">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm"
                          value={filterNoiDung}
                          onChange={(e) => setFilterNoiDung(e.target.value)}
                          className="w-full h-8 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </td>

                    {/* Giá trị */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          placeholder="Tối thiểu"
                          value={filterGiaTriMin}
                          onChange={(e) => setFilterGiaTriMin(e.target.value)}
                          className="w-[calc(50%-2px)] h-8 px-1.5 text-[10px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-muted-foreground text-[10px]">-</span>
                        <input
                          type="number"
                          placeholder="Tối đa"
                          value={filterGiaTriMax}
                          onChange={(e) => setFilterGiaTriMax(e.target.value)}
                          className="w-[calc(50%-2px)] h-8 px-1.5 text-[10px] rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </td>

                    {/* Tài liệu */}
                    <td className="px-3 py-1.5">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Tìm kiếm"
                          value={filterTaiLieu}
                          onChange={(e) => setFilterTaiLieu(e.target.value)}
                          className="w-full h-8 pl-7 pr-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    </td>
                  </tr>
                </thead>

                <tbody>
                  {filteredVouchers.map((v, index) => {
                    const isSelected = selectedRows.includes(v.id);
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setDetailEntryId(v.id)}
                        className={`border-b border-border hover:bg-muted/40 cursor-pointer transition-colors ${
                          isSelected ? "bg-emerald-50/20" : ""
                        }`}
                      >
                        <td
                          className="px-3 py-2 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRows((prev) => [...prev, v.id]);
                              } else {
                                setSelectedRows((prev) => prev.filter((id) => id !== v.id));
                              }
                            }}
                            className="rounded border-input accent-emerald-600 h-3.5 w-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-center text-muted-foreground font-mono">
                          {index + 1}
                        </td>
                        <td className="px-3 py-2 font-medium">{v.voucher_type}</td>
                        <td className="px-3 py-2 font-mono">{v.voucher_no}</td>
                        <td className="px-3 py-2 font-mono">{formatVN(v.entry_date)}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-xs truncate" title={v.description || ""}>
                          {v.description || "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium">
                          {v.amount.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground text-[10px]">
                          {v.document_no || "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredVouchers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-16 text-center text-muted-foreground bg-muted/5">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
                          <span>Không có dữ liệu</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>

                {filteredVouchers.length > 0 && (
                  <tfoot className="bg-muted/30 font-semibold border-t-2 border-border">
                    <tr>
                      <td className="px-3 py-3" colSpan={6}></td>
                      <td className="px-3 py-3 text-right font-mono text-emerald-700">
                        {totalValueSum.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-3 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Manual Voucher Creation Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Tạo mới Phiếu kế toán
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Master details */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Ngày hạch toán *</Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Diễn giải / Nội dung *</Label>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Nhập diễn giải lý do phát sinh phiếu..."
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Lines Grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Bút toán định khoản</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] font-medium border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={handleAddLine}
                >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" />
                  Thêm dòng
                </Button>
              </div>

              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="px-2 py-2 text-left">Tài khoản *</th>
                      <th className="w-36 px-2 py-2 text-right">Số tiền Nợ *</th>
                      <th className="w-36 px-2 py-2 text-right">Số tiền Có *</th>
                      <th className="w-10 px-2 py-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newLines.map((line, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="p-1.5">
                          <select
                            value={line.account_code}
                            onChange={(e) => handleLineChange(i, "account_code", e.target.value)}
                            className="w-full h-8 px-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">Chọn tài khoản</option>
                            {accounts?.map((acc) => (
                              <option key={acc.code} value={acc.code}>
                                {acc.code} — {acc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={line.debit || ""}
                            onChange={(e) => handleLineChange(i, "debit", e.target.value)}
                            className="h-8 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={line.credit || ""}
                            onChange={(e) => handleLineChange(i, "credit", e.target.value)}
                            className="h-8 text-right font-mono text-xs"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveLine(i)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 font-semibold border-t border-border">
                    <tr>
                      <td className="px-2.5 py-2 text-right">Tổng cộng</td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-700">
                        {sumDebit.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono text-emerald-700">
                        {sumCredit.toLocaleString("vi-VN")}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between text-[11px] mt-1.5">
                {isBalanced ? (
                  <span className="text-emerald-600 font-medium">✓ Bút toán cân đối</span>
                ) : sumDebit > 0 || sumCredit > 0 ? (
                  <span className="text-destructive font-medium">
                    ⚠ Chưa cân đối (chênh lệch: {Math.abs(sumDebit - sumCredit).toLocaleString("vi-VN")})
                  </span>
                ) : (
                  <span className="text-muted-foreground">Nhập các cặp Nợ/Có tương ứng</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 pt-3">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Hủy
            </Button>
            <Button
              disabled={!isBalanced || !newDescription.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              Lưu phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Viewer dialog */}
      <VoucherDetailDialog entryId={detailEntryId} onClose={() => setDetailEntryId(null)} />
    </div>
  );
}
