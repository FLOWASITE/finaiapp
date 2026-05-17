## Mục tiêu

File `src/lib/report-mappings.ts` hiện đang dùng cấu trúc B01 cũ (gần với TT200 — "Bảng cân đối kế toán"), không khớp mẫu chuẩn **Báo cáo tình hình tài chính** trong TT 99/2025/TT-BTC mà user vừa gửi. Cần viết lại đầy đủ danh mục B01 cho khớp 100% mã số, tên và thứ tự trong thông tư.

## Phạm vi

Chỉ chỉnh `B01_TT99` trong `src/lib/report-mappings.ts`. Không động đến B02/B03/B09 hay logic tính toán trong `reports.functions.ts` — bộ engine hiện tại (`accounts` + `formula`) đã đủ để render đúng nếu mapping chính xác.

UI bảng (`src/routes/_app/reports/index.tsx`) đã hỗ trợ 3 cấp (level 0/1/2) và auto kỳ so sánh nên không phải đổi.

## Cấu trúc B01 mới (theo TT99)

### A — TÀI SẢN NGẮN HẠN (100 = 110+120+130+140+150+160)

- **110 Tiền và tương đương tiền** → 111 Tiền, 112 Tương đương tiền
- **120 Đầu tư tài chính ngắn hạn** → 121 CK kinh doanh, 122 Dự phòng giảm giá CKKD (*), 123 ĐT nắm giữ đến đáo hạn NH, 124 Dự phòng (*), 125 ĐT NH khác, 126 Dự phòng (*)
- **130 Phải thu ngắn hạn** → 131 KH, 132 Trả trước người bán NH, 133 Phải thu nội bộ NH, 134 Phải thu theo tiến độ HĐXD, 135 Phải thu NH khác, 136 Dự phòng khó đòi (*), 137 Tài sản thiếu chờ xử lý
- **140 Hàng tồn kho** → 141 HTK, 142 Dự phòng giảm giá HTK (*)
- **150 Tài sản sinh học ngắn hạn** (MỚI) → 151 Súc vật nuôi lấy SP 1 lần NH, 152 Cây trồng mùa vụ NH, 153 Dự phòng tổn thất (*)
- **160 Tài sản ngắn hạn khác** → 161 Chi phí chờ phân bổ NH, 162 Thuế GTGT khấu trừ, 163 Thuế phải thu NN, 164 Giao dịch repo TPCP, 165 TS NH khác

### B — TÀI SẢN DÀI HẠN (200 = 210+220+230+240+250+260+270)

- **210 Phải thu dài hạn** → 211–215 + 216 Dự phòng (*)
- **220 Tài sản cố định** → 221 TSCĐ hữu hình (222 nguyên giá, 223 hao mòn*), 224 TSCĐ thuê TC (225, 226*), 227 TSCĐ vô hình (228, 229*)
- **230 Tài sản sinh học dài hạn** (MỚI, chi tiết phức tạp) → 231 Súc vật nuôi SP định kỳ (232 chưa trưởng thành, 233 đã trưởng thành: 234 nguyên giá, 235 khấu hao*), 236 Súc vật nuôi SP 1 lần DH, 237 Cây trồng mùa vụ DH, 238 Dự phòng (*)
- **240 Bất động sản đầu tư** → 241 nguyên giá, 242 hao mòn (*)
- **250 Tài sản dở dang dài hạn** → 251 CP SXKD dở dang DH, 252 CP XDCB dở dang
- **260 Đầu tư tài chính dài hạn** → 261 Cty con, 262 LDLK, 263 Góp vốn khác, 264 Dự phòng (*), 265 ĐT nắm giữ đến đáo hạn DH, 266 Dự phòng (*)
- **270 Tài sản dài hạn khác** → 271 CP chờ phân bổ DH, 272 TS thuế TNDN hoãn lại, 273 Thiết bị/vật tư/phụ tùng thay thế DH, 274 TS DH khác

**280 TỔNG CỘNG TÀI SẢN = 100 + 200**

### C — NỢ PHẢI TRẢ (300 = 310 + 330)

- **310 Nợ ngắn hạn** (15 mục): 311 Phải trả người bán NH, 312 Người mua trả trước NH, 313 Phải trả cổ tức/LN, 314 Thuế phải nộp NN NH, 315 Phải trả NLĐ, 316 Chi phí phải trả NH, 317 Phải trả nội bộ NH, 318 Phải trả theo tiến độ HĐXD NH, 319 Doanh thu chờ phân bổ NH, 320 Phải trả NH khác, 321 Vay & nợ thuê TC NH, 322 Dự phòng phải trả NH, 323 Quỹ KT-PL, 324 Quỹ bình ổn giá, 325 Giao dịch repo TPCP
- **330 Nợ dài hạn** (14 mục): 331–344 theo đúng thứ tự TT99 (Trái phiếu chuyển đổi = 340, Cổ phiếu ưu đãi = 341, Thuế TNDN hoãn lại phải trả = 342, Dự phòng phải trả DH = 343, Quỹ KH&CN = 344)

### D — VỐN CHỦ SỞ HỮU (400 = 410)

- **410 Vốn chủ sở hữu**: 411 Vốn góp CSH (411a cổ phần phổ thông có quyền biểu quyết, 411b cổ phần ưu đãi), 412 Thặng dư VCP, 413 Quyền chọn chuyển đổi TP, 414 Vốn khác CSH, 415 Cổ phiếu quỹ (*), 416 Chênh lệch ĐGL tài sản, 417 Chênh lệch tỷ giá, 418 Quỹ ĐTPT, 419 Quỹ khác thuộc VCSH, 420 LNST chưa phân phối (420a lũy kế kỳ trước, 420b kỳ này)
- **Bỏ mục 430** (TT99 không còn "Nguồn kinh phí và quỹ khác" trong B01 cho DN HĐ liên tục)

**440 TỔNG CỘNG NGUỒN VỐN = 300 + 400**

## Kỹ thuật

- Giữ nguyên `BSItem` type và helper `D()/C()`.
- Mỗi mã lá (level 2) gắn `accounts` theo chart of accounts TT200 (đã dùng); mã tổng/mục dùng `formula`.
- Các mục mới (tài sản sinh học, quỹ bình ổn giá, repo TPCP, cổ phiếu ưu đãi, phải trả cổ tức, phải trả nội bộ về vốn KD…) gắn `accounts: []` khi chưa có TK chuẩn — vẫn hiển thị dòng để khớp mẫu, giá trị = 0 cho đến khi user khai báo TK tương ứng.
- Mã có dấu (*) (dự phòng / hao mòn / cổ phiếu quỹ) dùng `sign: -1` để trừ vào mục cha.
- 411a / 411b / 420a / 420b: level 2, parent (411, 420) dùng `formula` cộng hai sub-code.

## Kiểm tra sau khi sửa

- Build TS phải pass (type `BSItem` đã hỗ trợ mọi field cần dùng).
- Mở `/reports` chọn B01 — bảng phải hiện đủ A/B/C/D với các mã 100, 110…165, 200, 210…274, 280, 300, 310…344, 400, 410…420b, 440 đúng thứ tự thông tư.
- Tổng kiểm tra: 280 = 100+200, 440 = 300+400, và 280 = 440 (cân đối) với dữ liệu hiện có.

Không sửa file khác. Sau khi user duyệt sẽ áp dụng trong một lượt edit duy nhất.