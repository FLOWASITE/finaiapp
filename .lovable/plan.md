# Giải pháp parse XML HĐĐT chuẩn TT78/TT32

## Hiện trạng

3 file đang tự parse XML riêng, mỗi nơi đọc 1 tập field khác nhau:

- `src/lib/einvoice-xml.functions.ts` — import file XML
- `src/lib/einvoices.functions.ts` — đọc XML đã lưu
- `src/lib/einvoices-sync.functions.ts` — đồng bộ từ cổng TCT

Khi đối chiếu với file mẫu `C26TTT34942.xml` (CT 28, TT78 v2.1.0), có ~15 trường quan trọng đang **bị bỏ qua hoặc đọc sai**:

| Thiếu / sai | Hệ quả |
|---|---|
| `KHMSHDon` (mẫu số) không gộp với `KHHDon` | Ký hiệu hoá đơn cụt: `C26TTT` thay vì `1C26TTT` → trùng key khi dedupe |
| `HTTToan` (hình thức thanh toán: TM/CK) | Không biết hoá đơn đã/chưa thanh toán |
| `TGia` (tỷ giá ngoại tệ) | Sai số khi hoá đơn USD/EUR |
| `TLCKhau / STCKhau / TTCKTMai` (chiết khấu) | Lệch số tiền dòng & tổng |
| `THTTLTSuat` (bảng tổng hợp theo thuế suất) | Không tách được 5/8/10/KCT/KKKNT cho tờ khai GTGT |
| `TSuat = "KCT" / "KKKNT" / "KHAC"` | `parsePct` trả 0 → nhầm thành chịu thuế 0% |
| `TChat` (1=hàng, 2=khuyến mãi, 3=chiết khấu, 4=ghi chú) | Import cả dòng KM/CK/ghi chú thành dòng hàng |
| `TTKhac` (Trạng thái thanh toán, Mã số bí mật, Tổng tiền bằng chữ, Quận/Tỉnh/Quốc gia bên bán, Loại + số giấy tờ bên mua) | Mất dữ liệu tra cứu & cá nhân hoá |
| `HVTNMHang` (người mua hàng cá nhân) | Mất tên người mua khi B2C |
| `STKNHang / TNHang` (số TK & ngân hàng) | Không tự đối soát chuyển khoản |
| `MCCQT` (mã CQT) đọc OK nhưng không phân biệt HĐ có mã / không mã | Sai logic "HĐ có mã của CQT" |
| `TCHDon / HDLQuan` (HĐ thay thế / điều chỉnh) | Mất liên kết HĐ gốc |
| `DSCKS` (chữ ký bên bán + CQT) | Không hiển thị "đã ký bởi" và thời điểm ký |
| BOM UTF-8 đầu file | `parse()` ném lỗi với 1 số nhà cung cấp |
| `NLap` dạng `DD/MM/YYYY` (một số NCC) | `issue_date` lưu sai |

Ngoài ra: `MCCQT` đôi khi không phải object `{#text, @_Id}` mà là string trực tiếp; code chỉ thử 2 nhánh, vẫn lọt 1 case.

## Mục tiêu

1. Một module parser **duy nhất**, dùng chung cho 3 nơi.
2. Trả về kiểu dữ liệu (`ParsedEinvoice`) đã chuẩn hoá, kèm `warnings[]` thay vì ném lỗi vụn vặt.
3. Đủ field để vừa lưu DB (cột hiện có), vừa lưu `raw_ocr` JSON đầy đủ cho hiển thị/tra cứu sau.
4. Không đổi schema DB ở bước này — chỉ thêm dữ liệu vào các cột đang có + cột `raw_ocr` (JSONB).

## Phạm vi thay đổi

### File mới
- `src/lib/einvoice-xml-parser.server.ts` — parser thuần, không đụng Supabase

  Xuất:
  ```ts
  export type ParsedEinvoice = {
    version: string;             // PBan
    template: string;            // KHMSHDon
    series: string;              // KHMSHDon + KHHDon (vd "1C26TTT")
    invoice_no: string;          // SHDon
    issue_date: string | null;   // YYYY-MM-DD
    sign_date: string | null;    // SigningTime của NBan
    currency: string;            // DVTTe
    fx_rate: number;             // TGia
    payment_method: string;      // HTTToan
    has_cqt_code: boolean;
    cqt_code: string | null;     // MCCQT
    cqt_signed: boolean;
    seller_signed: boolean;
    adjustment_kind: "original" | "replacement" | "adjustment" | "cancelled";
    related_invoice: { series?: string; no?: string; date?: string } | null;

    seller: { name; tax_id; address; phone; email; bank_account; bank_name; district; province; country };
    buyer:  { name; tax_id; address; phone; email; bank_account; bank_name; contact_person; id_type; id_no };

    lines: Array<{
      seq: number;
      kind: "item" | "promo" | "discount" | "note";   // từ TChat
      code: string;
      description: string;
      unit: string;
      qty: number;
      unit_price: number;
      discount_amount: number;
      amount: number;            // ThTien (sau CK dòng, trước thuế)
      vat_rate_raw: string;      // "8%" | "KCT" | "KKKNT" | "KHAC" | "-"
      vat_rate: number | null;   // null nếu không chịu thuế / không kê khai
      vat_taxable: boolean;
      vat_amount: number;
      gross_amount: number;      // từ TTKhac "Thành tiền thanh toán của hàng hóa"
    }>;

    totals: {
      subtotal: number;          // TgTCThue
      vat_amount: number;        // TgTThue
      discount_total: number;    // TTCKTMai
      total: number;             // TgTTTBSo
      total_in_words: string;    // TgTTTBChu
      by_rate: Array<{ rate_raw: string; rate: number | null; taxable: number; tax: number }>;
    };

    raw_ttkhac: Record<string, string>;  // mọi TTruong → DLieu ở 3 cấp (TTChung/NBan/NMua/TToan/gốc)
    warnings: string[];
  };

  export function parseEinvoiceXml(xml: string): ParsedEinvoice;
  ```

  Đặc tả xử lý:
  - Strip BOM `\uFEFF`, normalize newlines, `XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseTagValue:false, trimValues:true, isArray: predicate })` — dùng `isArray` để ép `HHDVu`, `LTSuat`, `TTin` luôn là array.
  - Dò root linh hoạt: `HDon → DLHDon` hoặc `HDon[0].DLHDon` hoặc envelope ngoài.
  - `MCCQT`: chấp nhận cả `string`, `{ "#text", "@_Id" }`, hoặc thiếu hoàn toàn → `has_cqt_code = !!cqt_code`.
  - `parsePct`: ánh xạ `KCT|KCTGT|\\` → `{rate: null, taxable: false}`, `KKKNT` → `{rate: null, taxable: false}`, `0%|5%|8%|10%` → numeric, `KHAC` + giá trị riêng → đọc thêm `TSuatKhac`.
  - `NLap`: thử ISO trước, fallback `DD/MM/YYYY` / `DD-MM-YYYY` → ISO; nếu fail → `null` + warning.
  - `TChat`: 1→item, 2→promo, 3→discount, 4→note. Khi `promo|note` thì `qty/amount=0` không tính vào tổng (vẫn lưu để hiển thị).
  - `TTKhac`: gom tất cả `TTin[].TTruong → DLieu` thành map phẳng, đồng thời tách các key đã biết (Trạng thái thanh toán, Mã số bí mật, Tổng tiền bằng chữ, Quận/Tỉnh/Quốc gia, Loại/Số giấy tờ, Link tra cứu) vào struct chính.
  - Sanity check: `|subtotal + vat_amount - total| <= 1` → nếu lệch, push warning `"Tổng lệch X đồng"`.
  - Validate bằng Zod ở cuối → ném `EinvoiceParseError` với danh sách warning để UI hiển thị.

### File sửa

1. `src/lib/einvoice-xml.functions.ts`
   - Thay block parse thủ công bằng `parseEinvoiceXml(file.content)`.
   - Dedupe purchase: dùng `(invoice_no, sellerTax, series)` thay vì `(invoice_no, sellerTax)` → đúng quy định 1 ký hiệu có thể trùng số giữa 2 NCC khác mẫu.
   - Map `payment_method`, `fx_rate`, `cqt_code`, `has_cqt_code`, `adjustment_kind` vào `raw_ocr`.
   - Bỏ qua dòng `kind != "item"` khi insert `invoice_lines/sales_invoice_lines`, hoặc insert kèm flag (chọn: bỏ qua để không lệch tổng).
   - `vat_rate = null` khi `!vat_taxable` → ghi `vat_code = "KCT" / "KKKNT"` ở sales line.
   - `invoice_series` lưu giá trị chuẩn `series` (mẫu+ký hiệu).

2. `src/lib/einvoices.functions.ts` (chỗ đọc lại XML hiển thị)
   - Thay parse riêng bằng `parseEinvoiceXml` → giao diện chi tiết HĐ hiển thị đủ thông tin (chữ ký, mã tra cứu, bảng thuế theo nhóm thuế suất, dòng KM/CK).

3. `src/lib/einvoices-sync.functions.ts` (đồng bộ TCT)
   - Mỗi HĐ trả về từ cổng TCT có XML đính kèm → parse bằng module mới, lấy dữ liệu chuẩn hoá thay vì các field rời rạc từ JSON cổng.

### Không đổi
- Không sửa schema DB ở plan này.
- Không sửa UI nhập file (`import-einvoice-xml-dialog.tsx`) ngoài việc hiển thị thêm warning trả về.
- Không động vào `MCCQT` verify chữ ký (phạm vi khác).

## Kiểm thử

Tạo `src/lib/__tests__/einvoice-xml-parser.test.ts` (bunx vitest) với fixtures:

1. `C26TTT34942.xml` (file user gửi) — TT78 v2.1.0 có MCCQT, có dòng KM (TChat=2), VAT 8%.
2. Fixture HĐ không mã (`KHMSHDon=2`, không `MCCQT`).
3. Fixture HĐ điều chỉnh (`HDLQuan`, `TCHDon=3`).
4. Fixture đa thuế suất (5% + 10% + KCT trong cùng HĐ).
5. Fixture NLap `19/04/2026`.
6. Fixture có BOM + xuống dòng Windows.

Assert: `series`, `totals.by_rate`, `lines[].kind`, `payment_method`, `adjustment_kind`, không có warning nghiêm trọng.

## Rủi ro
- Một số NCC dùng namespace khác / khoá lowercase → giữ fallback dò không phân biệt hoa thường ở `DLHDon` root.
- `vat_rate=null` có thể vi phạm NOT NULL ở cột `invoice_lines.vat_rate` → fallback `0` + đặt cờ `non_taxable` trong description prefix, hoặc kiểm tra schema trước khi đổi (sẽ check ở bước implement).
