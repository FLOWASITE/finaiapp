/**
 * Bản đồ mã tài khoản VAS → tên thân thiện (ngôn ngữ kinh doanh).
 *
 * Dùng cho Front-Office: thay vì "511" hiện "Doanh thu". Khi user bật
 * "Chế độ kế toán" (xem useAccountingMode), UI hiển thị cả tên thân thiện
 * + mã TK gốc.
 *
 * Map này chỉ là fallback. Nếu COA của tenant có tên tuỳ biến thì component
 * gọi nên ưu tiên tên từ COA và rơi xuống map này khi không có.
 */

export const ACCOUNT_FRIENDLY_LABELS: Record<string, string> = {
  // Tiền
  "111": "Tiền mặt",
  "112": "Tiền gửi ngân hàng",
  "113": "Tiền đang chuyển",
  "1211": "Đầu tư ngắn hạn",
  // Phải thu / phải trả
  "131": "Phải thu khách hàng",
  "133": "Thuế GTGT được khấu trừ",
  "138": "Phải thu khác",
  "141": "Tạm ứng",
  "331": "Phải trả nhà cung cấp",
  "333": "Thuế phải nộp Nhà nước",
  "3331": "Thuế GTGT phải nộp",
  "3334": "Thuế TNDN phải nộp",
  "3335": "Thuế TNCN phải nộp",
  "334": "Phải trả người lao động",
  "338": "Phải trả khác",
  // Hàng tồn kho
  "151": "Hàng mua đang đi đường",
  "152": "Nguyên vật liệu",
  "153": "Công cụ dụng cụ",
  "154": "Chi phí sản xuất dở dang",
  "155": "Thành phẩm",
  "156": "Hàng hoá",
  "157": "Hàng gửi bán",
  // Tài sản
  "211": "Tài sản cố định hữu hình",
  "213": "Tài sản cố định vô hình",
  "214": "Hao mòn TSCĐ",
  "242": "Chi phí trả trước",
  // Nguồn vốn
  "311": "Vay ngắn hạn",
  "341": "Vay & nợ thuê tài chính",
  "411": "Vốn đầu tư của chủ sở hữu",
  "421": "Lợi nhuận chưa phân phối",
  // Doanh thu
  "511": "Doanh thu bán hàng",
  "515": "Doanh thu hoạt động tài chính",
  "521": "Chiết khấu thương mại",
  "711": "Thu nhập khác",
  // Chi phí
  "611": "Mua hàng",
  "621": "Chi phí nguyên vật liệu",
  "622": "Chi phí nhân công",
  "627": "Chi phí sản xuất chung",
  "632": "Giá vốn hàng bán",
  "635": "Chi phí tài chính",
  "641": "Chi phí bán hàng",
  "6411": "CP nhân viên bán hàng",
  "6421": "CP nhân viên quản lý",
  "6427": "CP dịch vụ mua ngoài",
  "6428": "CP bằng tiền khác",
  "642": "Chi phí quản lý doanh nghiệp",
  "811": "Chi phí khác",
  "821": "Chi phí thuế TNDN",
  // Kết quả
  "911": "Xác định kết quả kinh doanh",
};

/** Trả về tên thân thiện cho mã TK; nếu không có thì trả về mã. */
export function friendlyAccountName(code: string | null | undefined): string {
  if (!code) return "";
  const c = String(code).trim();
  if (ACCOUNT_FRIENDLY_LABELS[c]) return ACCOUNT_FRIENDLY_LABELS[c];
  // Thử bậc cha (vd 6428 → 642)
  for (let len = c.length - 1; len >= 3; len--) {
    const head = c.slice(0, len);
    if (ACCOUNT_FRIENDLY_LABELS[head]) return ACCOUNT_FRIENDLY_LABELS[head];
  }
  return c;
}
