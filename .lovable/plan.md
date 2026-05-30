
## Mục tiêu

XML hiện tại do `buildVatXmlString` (src/lib/tax-vat.functions.ts) sinh ra **không đúng schema HTKK** — thiếu namespace, sai cấu trúc `TTinChung`, dùng `maTKhai="01/GTGT"` thay vì mã số `842`, gom các chỉ tiêu sai nhóm, không có Phụ lục NQ giảm 8%, vẫn còn `BangKeBanRa/BangKeMuaVao` (TT80/2021 đã bỏ). Cần viết lại đúng theo file mẫu HTKK gửi kèm.

## Phạm vi

Chỉ sửa **backend XML builder** + thêm vài trường cấu hình tenant. Không động UI nghiệp vụ chính, không động dữ liệu hóa đơn. CIT (03/TNDN) và PIT (05/QTT-TNCN) trong `tax.functions.ts` không nằm trong scope lần này.

## Thiết kế XML đầu ra

Cấu trúc bám sát file mẫu:

```text
<?xml version="1.0" encoding="UTF-8"?>
<HSoThueDTu xmlns:xsi="..." xmlns="http://kekhaithue.gdt.gov.vn/TKhaiThue">
  <HSoKhaiThue id="ID-NODETOSIGN-XML">
    <TTinChung>
      <TTinDVu> maDVu=HTKK, tenDVu, pbanDVu=5.5.6, ttinNhaCCapDVu </TTinDVu>
      <TTinTKhaiThue>
        <TKhaiThue>
          maTKhai=842, tenTKhai, moTaBMau, pbanTKhaiXML=2.8.3,
          loaiTKhai (C=chính thức / B=bổ sung), soLan,
          KyKKhaiThue { kieuKy Q|M, kyKKhai "n/yyyy" hoặc "mm/yyyy",
                        kyKKhaiTuNgay, kyKKhaiDenNgay, kyKKhaiTuThang, kyKKhaiDenThang },
          maCQTNoiNop, tenCQTNoiNop, ngayLapTKhai, GiaHan{},
          nguoiKy, ngayKy, nganhNgheKD
        </TKhaiThue>
        <NNT>
          mst, tenNNT, dchiNNT, phuongXa,
          maHuyenNNT, tenHuyenNNT, maTinhNNT, tenTinhNNT,
          dthoaiNNT, faxNNT, emailNNT
        </NNT>
      </TTinTKhaiThue>
    </TTinChung>

    <CTieuTKhaiChinh>
      ma_NganhNghe=00, ten_NganhNghe, tieuMucHachToan=1701,
      Header { ct09, ct10, DiaChiHDSXKDKhacTinhNDTSC{...} },
      ct21, ct22,
      GiaTriVaThueGTGTHHDVMuaVao { ct23, ct24 },
      HangHoaDichVuNhapKhau     { ct23a, ct24a },
      ct25, ct26,
      HHDVBRaChiuThueGTGT       { ct27, ct28 },
      ct29,
      HHDVBRaChiuTSuat5         { ct30, ct31 },
      HHDVBRaChiuTSuat10        { ct32, ct33 },
      ct32a,
      TongDThuVaThueGTGTHHDVBRa { ct34, ct35 },
      ct36, ct37, ct38, ct39a, ct40a, ct40b, ct40, ct41, ct42, ct43
    </CTieuTKhaiChinh>

    <PLuc>                       <!-- chỉ render khi có HĐ giảm 8% -->
      <PL_NQ142_GTGT>
        <HH_DV_MuaVaoTrongKy>
          BangKeTenHHDV ID="ID_n" { tenHHDVMuaVao, giaTriHHDVMuaVao, thueGTGTHHDV } x N
          tongCongGiaTriHHDVMuaVao, tongCongThueGTGTHHDV
        </HH_DV_MuaVaoTrongKy>
        <HH_DV_BanRaTrongKy>
          BangKeTenHHDV ID="ID_n" { tenHHDV, giaTriHHDV,
                                    thueSuatTheoQuyDinh=10, thueSuatSauGiam=8,
                                    thueGTGTDuocGiam } x N
          tongCongGiaTriHHDV, tongCongThueGTGTDuocGiam
        </HH_DV_BanRaTrongKy>
        <ChenhLech><ct9>…</ct9></ChenhLech>
      </PL_NQ142_GTGT>
    </PLuc>
  </HSoKhaiThue>
  <!-- CKyDTu: bỏ qua, file sẽ được ký bằng HTKK/eTax desktop của user -->
</HSoThueDTu>
```

Bảng kê HĐ bán/mua chi tiết cũ (`<BangKeBanRa>/<BangKeMuaVao>`) bị **bỏ hoàn toàn** — TT80/2021 không yêu cầu nữa.

## Quy tắc tính chỉ tiêu (deduction / 01/GTGT)

| ct | Ý nghĩa | Nguồn |
|----|---------|-------|
| ct21 | Giá trị HHDV mua vào không chịu thuế | invoices.vat_code='KCT/KKKNT' subtotal |
| ct22 | Tổng giá trị HHDV mua vào | sum(invoices.subtotal) hoặc 0 |
| ct23/ct24 | Giá trị + VAT mua vào (chịu thuế) | sum subtotal/vat_amount invoices có VAT |
| ct23a/ct24a | Giá trị + VAT HHDV nhập khẩu | invoices.import_flag (nếu có) — mặc định 0 |
| ct25 | VAT đầu vào được khấu trừ kỳ này | ct24 + ct24a − loại theo tax-001/tax-002 |
| ct26 | Doanh thu bán không chịu thuế | sales_invoices.vat_code='KCT' |
| ct27/ct28 | Tổng DT + VAT bán ra chịu thuế | sum 5%+8%+10% |
| ct29 | DT bán 0% | sales 0% subtotal |
| ct30/ct31 | DT + VAT 5% | sales 5% |
| ct32/ct33 | DT + VAT 10% **gốc** (gồm cả phần được giảm còn 8%) | sales 10% + 8% (gộp về 10% gốc) |
| ct32a | DT bán giảm trực tiếp theo NQ | 0 mặc định |
| ct34/ct35 | Tổng DT + VAT đầu ra | ct26+ct27+ct29 / ct28 |
| ct36 | VAT phát sinh phải nộp = ct35 − ct25 (nếu ≥0) | tính |
| ct37 | Điều chỉnh tăng kỳ trước | từ `vat_filing_adjustments` direction='increase' |
| ct38 | Điều chỉnh giảm kỳ trước | direction='decrease' |
| ct39a | VAT đã nộp ở khâu nhập khẩu / nộp thay | 0 mặc định |
| ct40a | VAT phải nộp kỳ này = max(0, ct36+ct37−ct38−ct39a) | tính |
| ct40b | VAT nộp thay người nộp thuế khác | 0 |
| ct40 | = ct40a + ct40b | tính |
| ct41 | VAT chưa khấu trừ hết chuyển kỳ sau = max(0, ct25−ct35+…) | tính |
| ct42 | Đề nghị hoàn | 0 |
| ct43 | VAT còn được khấu trừ chuyển kỳ sau = ct41 − ct42 | tính |

Với **04/GTGT (trực tiếp)** vẫn dùng schema cũ đơn giản (đã có) — không phải scope chính lần này.

## Phụ lục PL_NQ142_GTGT

Render khi có ≥1 HĐ (mua hoặc bán) áp thuế suất 8% trong kỳ:
- `HH_DV_MuaVaoTrongKy`: liệt kê từng dòng `invoices` có `vat_code='8'`. Mỗi dòng = 1 hóa đơn (gộp dòng chi tiết của hóa đơn lại). `tenHHDVMuaVao` lấy từ description chính của HĐ (nếu trống dùng `Phí dịch vụ - {invoice_no}`).
- `HH_DV_BanRaTrongKy`: tương tự với `sales_invoices` vat_code='8'.
- `tongCong*` tính lại từ danh sách.
- `ChenhLech/ct9` = sum(`thueGTGTDuocGiam`) so với mức 10% gốc — theo file mẫu là số âm `-156810` (chênh lệch do làm tròn từng dòng) → ta tính: `sum(giaTri × 0.10) − sum(thueGTGTDuocGiam) − sum(giaTri × 0.10)`... thực tế file để **chênh lệch làm tròn** ⇒ ta tính: `tongCongThueGTGTDuocGiam_byline − round(tongCongGiaTri × 0.08)`.

## Cấu hình tenant cần thêm

Migration nhỏ thêm vào `tenants`:
- `tax_authority_code text` (vd "70100")
- `tax_authority_name text` (vd "Thuế Thành phố Hồ Chí Minh")
- `province_code text` (vd "701"), `province_name text`
- `district_code text`, `district_name text`, `ward_name text`
- `legal_rep_name text` — mặc định nguoiKy
- `phone text`, `fax text`, `email text` đã có thì dùng

Nếu thiếu, XML để rỗng `<…/>` đúng như mẫu.

## Tham số khi commit/preview

`buildVatXmlPreview` / `commitVatFiling` nhận thêm tùy chọn:
- `loaiTKhai`: `"C"` (chính thức) | `"B"` (bổ sung). Mặc định C.
- `soLan`: số nguyên ≥0. Mặc định 0 (C=0; B≥1).
- `ngayLapTKhai`, `ngayKy`: mặc định = today (UTC+7).
- `nguoiKy`: mặc định = `tenants.legal_rep_name`.

UI ở tab "Lịch sử & trạng thái" (`/tax/gtgt`) đã có nút "Tải XML" — bổ sung dialog nhỏ trước khi tải để cho user xác nhận `loaiTKhai/soLan/nguoiKy`.

## Files thay đổi

1. **`src/lib/tax-vat.functions.ts`** — viết lại `buildVatXmlString` theo schema mới, thêm helper `buildPlNq142Block`, tách `roundInt`, `formatPeriodForXml`. Mở rộng `getTenantVatConfig` để select thêm cột mới. `buildVatXmlPreview` + `commitVatFiling` nhận thêm `loaiTKhai`, `soLan`, `nguoiKy`, `ngayLap`.
2. **Migration** — thêm các cột `tax_authority_code/name`, `province_code/name`, `district_code/name`, `ward_name`, `legal_rep_name` vào `tenants` (nullable).
3. **`src/routes/_app/tax/gtgt.tsx`** — thêm dialog xác nhận trước khi tải XML (3 input + nút Tải). Không đổi layout chính.
4. **`src/integrations/supabase/types.ts`** — tự cập nhật sau migration.

## Việc KHÔNG làm

- Không ký số XML (CKyDTu) — file xuất ra dạng chưa ký, user mở HTKK/eTax client để ký bằng USB token.
- Không sửa builder 03/TNDN, 05/QTT-TNCN.
- Không đổi logic tính `summary.payable / carryForward` đã có — chỉ map vào đúng ct fields.

## Câu hỏi cần xác nhận trước khi build

1. **Phụ lục NQ giảm 8%**: kỳ hiện tại (2026) hiệu lực nghị quyết nào — NQ 174/2024 hay NQ 198/2025? File mẫu dùng tag `PL_NQ142_GTGT` (HTKK 5.5.6 vẫn để key cũ này). Mình **giữ nguyên tag** `PL_NQ142_GTGT` để tương thích HTKK đang chạy, OK chứ?
2. **Mã CQT/tỉnh/phường**: lưu cố định trên `tenants` hay cho user nhập mỗi lần xuất tờ khai? Mình đề xuất lưu trên tenants (1 lần).
3. **Người ký + ngày ký**: lấy mặc định từ tenant + ngày hôm nay, có dialog xác nhận trước khi tải — đồng ý?

Trả lời 3 câu hỏi rồi mình triển khai.
