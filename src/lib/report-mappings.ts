// Mã số chỉ tiêu BCTC đầy đủ theo Thông tư 99/2025/TT-BTC (Phụ lục IV)
// Cấu trúc 3 cấp: 0 = nhóm lớn (A/B/C/D), 1 = mục La Mã, 2 = chỉ tiêu chi tiết
// Quy tắc: parent dùng `formula` cộng các sub-codes; sub-codes dùng `accounts`.

export type BSItem = {
  ma_so: string;
  name: string;
  level: 0 | 1 | 2;
  group: "asset" | "liability" | "equity" | "total";
  accounts?: Array<{ prefix: string; sign: 1 | -1; nature: "debit" | "credit" }>;
  formula?: string[];
  bold?: boolean;
};

const D = (prefix: string, sign: 1 | -1 = 1) => ({ prefix, sign, nature: "debit" as const });
const C = (prefix: string, sign: 1 | -1 = 1) => ({ prefix, sign, nature: "credit" as const });

export const B01_TT99: BSItem[] = [
  // ============ A — TÀI SẢN NGẮN HẠN ============
  { ma_so: "100", name: "A - TÀI SẢN NGẮN HẠN", level: 0, group: "asset", bold: true,
    formula: ["110", "120", "130", "140", "150", "160"] },

  // I. Tiền và tương đương tiền
  { ma_so: "110", name: "I. Tiền và các khoản tương đương tiền", level: 1, group: "asset",
    formula: ["111", "112"] },
  { ma_so: "111", name: "1. Tiền", level: 2, group: "asset",
    accounts: [D("111"), D("112")] },
  { ma_so: "112", name: "2. Các khoản tương đương tiền", level: 2, group: "asset",
    accounts: [D("1281"), D("1288")] },

  // II. Đầu tư tài chính ngắn hạn
  { ma_so: "120", name: "II. Đầu tư tài chính ngắn hạn", level: 1, group: "asset",
    formula: ["121", "122", "123", "124", "125", "126"] },
  { ma_so: "121", name: "1. Chứng khoán kinh doanh", level: 2, group: "asset",
    accounts: [D("121")] },
  { ma_so: "122", name: "2. Dự phòng giảm giá chứng khoán kinh doanh (*)", level: 2, group: "asset",
    accounts: [C("2291", -1)] },
  { ma_so: "123", name: "3. Đầu tư nắm giữ đến ngày đáo hạn ngắn hạn", level: 2, group: "asset",
    accounts: [D("1281"), D("1282"), D("1288")] },
  { ma_so: "124", name: "4. Dự phòng đầu tư nắm giữ đến ngày đáo hạn ngắn hạn (*)", level: 2, group: "asset", accounts: [] },
  { ma_so: "125", name: "5. Đầu tư ngắn hạn khác", level: 2, group: "asset", accounts: [] },
  { ma_so: "126", name: "6. Dự phòng tổn thất các khoản đầu tư ngắn hạn khác (*)", level: 2, group: "asset", accounts: [] },

  // III. Phải thu ngắn hạn
  { ma_so: "130", name: "III. Các khoản phải thu ngắn hạn", level: 1, group: "asset",
    formula: ["131", "132", "133", "134", "135", "136", "137"] },
  { ma_so: "131", name: "1. Phải thu ngắn hạn của khách hàng", level: 2, group: "asset",
    accounts: [D("131")] },
  { ma_so: "132", name: "2. Trả trước cho người bán ngắn hạn", level: 2, group: "asset",
    accounts: [D("331")] },
  { ma_so: "133", name: "3. Phải thu nội bộ ngắn hạn", level: 2, group: "asset",
    accounts: [D("1368")] },
  { ma_so: "134", name: "4. Phải thu theo tiến độ hợp đồng xây dựng", level: 2, group: "asset",
    accounts: [D("337")] },
  { ma_so: "135", name: "5. Phải thu ngắn hạn khác", level: 2, group: "asset",
    accounts: [D("138"), D("141"), D("244")] },
  { ma_so: "136", name: "6. Dự phòng phải thu ngắn hạn khó đòi (*)", level: 2, group: "asset",
    accounts: [C("2293", -1)] },
  { ma_so: "137", name: "7. Tài sản thiếu chờ xử lý", level: 2, group: "asset",
    accounts: [D("1381")] },

  // IV. Hàng tồn kho
  { ma_so: "140", name: "IV. Hàng tồn kho", level: 1, group: "asset",
    formula: ["141", "142"] },
  { ma_so: "141", name: "1. Hàng tồn kho", level: 2, group: "asset",
    accounts: [D("151"), D("152"), D("153"), D("154"), D("155"), D("156"), D("157"), D("158")] },
  { ma_so: "142", name: "2. Dự phòng giảm giá hàng tồn kho (*)", level: 2, group: "asset",
    accounts: [C("2294", -1)] },

  // V. Tài sản sinh học ngắn hạn (mới — TT99)
  { ma_so: "150", name: "V. Tài sản sinh học ngắn hạn", level: 1, group: "asset",
    formula: ["151", "152", "153"] },
  { ma_so: "151", name: "1. Súc vật nuôi lấy sản phẩm một lần ngắn hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "152", name: "2. Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần ngắn hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "153", name: "3. Dự phòng tổn thất tài sản sinh học ngắn hạn (*)", level: 2, group: "asset", accounts: [] },

  // VI. Tài sản ngắn hạn khác
  { ma_so: "160", name: "VI. Tài sản ngắn hạn khác", level: 1, group: "asset",
    formula: ["161", "162", "163", "164", "165"] },
  { ma_so: "161", name: "1. Chi phí chờ phân bổ ngắn hạn", level: 2, group: "asset",
    accounts: [D("242")] },
  { ma_so: "162", name: "2. Thuế GTGT được khấu trừ", level: 2, group: "asset",
    accounts: [D("133")] },
  { ma_so: "163", name: "3. Thuế và các khoản khác phải thu Nhà nước", level: 2, group: "asset",
    accounts: [D("333")] },
  { ma_so: "164", name: "4. Giao dịch mua bán lại trái phiếu Chính phủ", level: 2, group: "asset",
    accounts: [D("171")] },
  { ma_so: "165", name: "5. Tài sản ngắn hạn khác", level: 2, group: "asset",
    accounts: [D("2288")] },

  // ============ B — TÀI SẢN DÀI HẠN ============
  { ma_so: "200", name: "B - TÀI SẢN DÀI HẠN", level: 0, group: "asset", bold: true,
    formula: ["210", "220", "230", "240", "250", "260", "270"] },

  // I. Phải thu dài hạn
  { ma_so: "210", name: "I. Các khoản phải thu dài hạn", level: 1, group: "asset",
    formula: ["211", "212", "213", "214", "215", "216"] },
  { ma_so: "211", name: "1. Phải thu dài hạn của khách hàng", level: 2, group: "asset", accounts: [] },
  { ma_so: "212", name: "2. Trả trước cho người bán dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "213", name: "3. Vốn kinh doanh ở đơn vị trực thuộc", level: 2, group: "asset",
    accounts: [D("1361")] },
  { ma_so: "214", name: "4. Phải thu nội bộ dài hạn", level: 2, group: "asset",
    accounts: [D("1362"), D("1368")] },
  { ma_so: "215", name: "5. Phải thu dài hạn khác", level: 2, group: "asset",
    accounts: [D("244")] },
  { ma_so: "216", name: "6. Dự phòng phải thu dài hạn khó đòi (*)", level: 2, group: "asset", accounts: [] },

  // II. Tài sản cố định
  { ma_so: "220", name: "II. Tài sản cố định", level: 1, group: "asset",
    formula: ["221", "224", "227"] },
  { ma_so: "221", name: "1. Tài sản cố định hữu hình", level: 2, group: "asset",
    formula: ["222", "223"] },
  { ma_so: "222", name: "    - Nguyên giá", level: 2, group: "asset",
    accounts: [D("211")] },
  { ma_so: "223", name: "    - Giá trị hao mòn lũy kế (*)", level: 2, group: "asset",
    accounts: [C("2141", -1)] },
  { ma_so: "224", name: "2. Tài sản cố định thuê tài chính", level: 2, group: "asset",
    formula: ["225", "226"] },
  { ma_so: "225", name: "    - Nguyên giá", level: 2, group: "asset",
    accounts: [D("212")] },
  { ma_so: "226", name: "    - Giá trị hao mòn lũy kế (*)", level: 2, group: "asset",
    accounts: [C("2142", -1)] },
  { ma_so: "227", name: "3. Tài sản cố định vô hình", level: 2, group: "asset",
    formula: ["228", "229"] },
  { ma_so: "228", name: "    - Nguyên giá", level: 2, group: "asset",
    accounts: [D("213")] },
  { ma_so: "229", name: "    - Giá trị hao mòn lũy kế (*)", level: 2, group: "asset",
    accounts: [C("2143", -1)] },

  // III. Tài sản sinh học dài hạn (mới — TT99)
  { ma_so: "230", name: "III. Tài sản sinh học dài hạn", level: 1, group: "asset",
    formula: ["231", "236", "237", "238"] },
  { ma_so: "231", name: "1. Súc vật nuôi cho sản phẩm định kỳ", level: 2, group: "asset",
    formula: ["232", "233"] },
  { ma_so: "232", name: "    a) Súc vật nuôi cho sản phẩm định kỳ chưa đến giai đoạn trưởng thành", level: 2, group: "asset", accounts: [] },
  { ma_so: "233", name: "    b) Súc vật nuôi cho sản phẩm định kỳ đến giai đoạn trưởng thành", level: 2, group: "asset",
    formula: ["234", "235"] },
  { ma_so: "234", name: "        - Nguyên giá", level: 2, group: "asset", accounts: [] },
  { ma_so: "235", name: "        - Giá trị khấu hao lũy kế (*)", level: 2, group: "asset", accounts: [] },
  { ma_so: "236", name: "2. Súc vật nuôi lấy sản phẩm một lần dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "237", name: "3. Cây trồng theo mùa vụ hoặc lấy sản phẩm một lần dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "238", name: "4. Dự phòng tổn thất tài sản sinh học dài hạn (*)", level: 2, group: "asset", accounts: [] },

  // IV. Bất động sản đầu tư
  { ma_so: "240", name: "IV. Bất động sản đầu tư", level: 1, group: "asset",
    formula: ["241", "242"] },
  { ma_so: "241", name: "    - Nguyên giá", level: 2, group: "asset",
    accounts: [D("217")] },
  { ma_so: "242", name: "    - Giá trị hao mòn lũy kế (*)", level: 2, group: "asset",
    accounts: [C("2147", -1)] },

  // V. Tài sản dở dang dài hạn
  { ma_so: "250", name: "V. Tài sản dở dang dài hạn", level: 1, group: "asset",
    formula: ["251", "252"] },
  { ma_so: "251", name: "1. Chi phí sản xuất, kinh doanh dở dang dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "252", name: "2. Chi phí xây dựng cơ bản dở dang", level: 2, group: "asset",
    accounts: [D("241")] },

  // VI. Đầu tư tài chính dài hạn
  { ma_so: "260", name: "VI. Đầu tư tài chính dài hạn", level: 1, group: "asset",
    formula: ["261", "262", "263", "264", "265", "266"] },
  { ma_so: "261", name: "1. Đầu tư vào công ty con", level: 2, group: "asset",
    accounts: [D("221")] },
  { ma_so: "262", name: "2. Đầu tư vào công ty liên doanh, liên kết", level: 2, group: "asset",
    accounts: [D("222")] },
  { ma_so: "263", name: "3. Đầu tư góp vốn vào đơn vị khác", level: 2, group: "asset",
    accounts: [D("2281")] },
  { ma_so: "264", name: "4. Dự phòng tổn thất đầu tư vào đơn vị khác dài hạn (*)", level: 2, group: "asset",
    accounts: [C("2292", -1)] },
  { ma_so: "265", name: "5. Đầu tư nắm giữ đến ngày đáo hạn dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "266", name: "6. Dự phòng đầu tư nắm giữ đến ngày đáo hạn dài hạn (*)", level: 2, group: "asset", accounts: [] },

  // VII. Tài sản dài hạn khác
  { ma_so: "270", name: "VII. Tài sản dài hạn khác", level: 1, group: "asset",
    formula: ["271", "272", "273", "274"] },
  { ma_so: "271", name: "1. Chi phí chờ phân bổ dài hạn", level: 2, group: "asset",
    accounts: [D("242")] },
  { ma_so: "272", name: "2. Tài sản thuế thu nhập hoãn lại", level: 2, group: "asset",
    accounts: [D("243")] },
  { ma_so: "273", name: "3. Thiết bị, vật tư, phụ tùng thay thế dài hạn", level: 2, group: "asset", accounts: [] },
  { ma_so: "274", name: "4. Tài sản dài hạn khác", level: 2, group: "asset", accounts: [] },

  { ma_so: "280", name: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)", level: 0, group: "total", bold: true,
    formula: ["100", "200"] },

  // ============ C — NỢ PHẢI TRẢ ============
  { ma_so: "300", name: "C - NỢ PHẢI TRẢ", level: 0, group: "liability", bold: true,
    formula: ["310", "330"] },

  // I. Nợ ngắn hạn
  { ma_so: "310", name: "I. Nợ ngắn hạn", level: 1, group: "liability",
    formula: ["311", "312", "313", "314", "315", "316", "317", "318", "319", "320", "321", "322", "323", "324", "325"] },
  { ma_so: "311", name: "1. Phải trả người bán ngắn hạn", level: 2, group: "liability",
    accounts: [C("331")] },
  { ma_so: "312", name: "2. Người mua trả tiền trước ngắn hạn", level: 2, group: "liability",
    accounts: [C("131")] },
  { ma_so: "313", name: "3. Phải trả cổ tức, lợi nhuận", level: 2, group: "liability",
    accounts: [C("3388")] },
  { ma_so: "314", name: "4. Thuế và các khoản phải nộp Nhà nước ngắn hạn", level: 2, group: "liability",
    accounts: [C("333")] },
  { ma_so: "315", name: "5. Phải trả người lao động", level: 2, group: "liability",
    accounts: [C("334")] },
  { ma_so: "316", name: "6. Chi phí phải trả ngắn hạn", level: 2, group: "liability",
    accounts: [C("335")] },
  { ma_so: "317", name: "7. Phải trả nội bộ ngắn hạn", level: 2, group: "liability",
    accounts: [C("3368")] },
  { ma_so: "318", name: "8. Phải trả theo tiến độ hợp đồng xây dựng ngắn hạn", level: 2, group: "liability",
    accounts: [C("337")] },
  { ma_so: "319", name: "9. Doanh thu chờ phân bổ ngắn hạn", level: 2, group: "liability",
    accounts: [C("3387")] },
  { ma_so: "320", name: "10. Phải trả ngắn hạn khác", level: 2, group: "liability",
    accounts: [C("338")] },
  { ma_so: "321", name: "11. Vay và nợ thuê tài chính ngắn hạn", level: 2, group: "liability",
    accounts: [C("341")] },
  { ma_so: "322", name: "12. Dự phòng phải trả ngắn hạn", level: 2, group: "liability",
    accounts: [C("352")] },
  { ma_so: "323", name: "13. Quỹ khen thưởng, phúc lợi", level: 2, group: "liability",
    accounts: [C("353")] },
  { ma_so: "324", name: "14. Quỹ bình ổn giá", level: 2, group: "liability",
    accounts: [C("357")] },
  { ma_so: "325", name: "15. Giao dịch mua bán lại trái phiếu Chính phủ", level: 2, group: "liability",
    accounts: [C("171")] },

  // II. Nợ dài hạn
  { ma_so: "330", name: "II. Nợ dài hạn", level: 1, group: "liability",
    formula: ["331", "332", "333", "334", "335", "336", "337", "338", "339", "340", "341", "342", "343", "344"] },
  { ma_so: "331", name: "1. Phải trả người bán dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "332", name: "2. Người mua trả tiền trước dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "333", name: "3. Thuế và các khoản phải nộp Nhà nước dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "334", name: "4. Chi phí phải trả dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "335", name: "5. Phải trả nội bộ về vốn kinh doanh", level: 2, group: "liability",
    accounts: [C("3361")] },
  { ma_so: "336", name: "6. Phải trả nội bộ dài hạn", level: 2, group: "liability",
    accounts: [C("3362"), C("3368")] },
  { ma_so: "337", name: "7. Doanh thu chờ phân bổ dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "338", name: "8. Phải trả dài hạn khác", level: 2, group: "liability",
    accounts: [C("344")] },
  { ma_so: "339", name: "9. Vay và nợ thuê tài chính dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "340", name: "10. Trái phiếu chuyển đổi", level: 2, group: "liability",
    accounts: [C("3432")] },
  { ma_so: "341", name: "11. Cổ phiếu ưu đãi", level: 2, group: "liability", accounts: [] },
  { ma_so: "342", name: "12. Thuế thu nhập hoãn lại phải trả", level: 2, group: "liability",
    accounts: [C("347")] },
  { ma_so: "343", name: "13. Dự phòng phải trả dài hạn", level: 2, group: "liability", accounts: [] },
  { ma_so: "344", name: "14. Quỹ phát triển khoa học và công nghệ", level: 2, group: "liability",
    accounts: [C("356")] },

  // ============ D — VỐN CHỦ SỞ HỮU ============
  { ma_so: "400", name: "D - VỐN CHỦ SỞ HỮU", level: 0, group: "equity", bold: true,
    formula: ["410"] },

  { ma_so: "410", name: "I. Vốn chủ sở hữu", level: 1, group: "equity",
    formula: ["411", "412", "413", "414", "415", "416", "417", "418", "419", "420"] },
  { ma_so: "411", name: "1. Vốn góp của chủ sở hữu", level: 2, group: "equity",
    formula: ["411a", "411b"] },
  { ma_so: "411a", name: "    - Cổ phiếu phổ thông có quyền biểu quyết", level: 2, group: "equity",
    accounts: [C("4111")] },
  { ma_so: "411b", name: "    - Cổ phiếu ưu đãi", level: 2, group: "equity", accounts: [] },
  { ma_so: "412", name: "2. Thặng dư vốn cổ phần", level: 2, group: "equity",
    accounts: [C("4112")] },
  { ma_so: "413", name: "3. Quyền chọn chuyển đổi trái phiếu", level: 2, group: "equity",
    accounts: [C("4113")] },
  { ma_so: "414", name: "4. Vốn khác của chủ sở hữu", level: 2, group: "equity",
    accounts: [C("4118")] },
  { ma_so: "415", name: "5. Cổ phiếu quỹ (*)", level: 2, group: "equity",
    accounts: [D("419", -1)] },
  { ma_so: "416", name: "6. Chênh lệch đánh giá lại tài sản", level: 2, group: "equity",
    accounts: [C("412")] },
  { ma_so: "417", name: "7. Chênh lệch tỷ giá hối đoái", level: 2, group: "equity",
    accounts: [C("413")] },
  { ma_so: "418", name: "8. Quỹ đầu tư phát triển", level: 2, group: "equity",
    accounts: [C("414")] },
  { ma_so: "419", name: "9. Quỹ khác thuộc vốn chủ sở hữu", level: 2, group: "equity",
    accounts: [C("418")] },
  { ma_so: "420", name: "10. Lợi nhuận sau thuế chưa phân phối", level: 2, group: "equity",
    formula: ["420a", "420b"] },
  { ma_so: "420a", name: "    - LNST chưa phân phối lũy kế đến cuối kỳ trước", level: 2, group: "equity",
    accounts: [C("4211")] },
  { ma_so: "420b", name: "    - LNST chưa phân phối kỳ này", level: 2, group: "equity",
    accounts: [C("4212")] },

  { ma_so: "440", name: "TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)", level: 0, group: "total", bold: true,
    formula: ["300", "400"] },
];

// ============ B02 — Kết quả kinh doanh ============
export type ISItem = {
  ma_so: string;
  name: string;
  accounts?: Array<{ prefix: string; sign: 1 | -1; nature: "revenue" | "expense" }>;
  formula?: Array<{ ma_so: string; sign: 1 | -1 }>;
  bold?: boolean;
};

const R = (prefix: string, sign: 1 | -1 = 1) => ({ prefix, sign, nature: "revenue" as const });
const E = (prefix: string, sign: 1 | -1 = 1) => ({ prefix, sign, nature: "expense" as const });

export const B02_TT99: ISItem[] = [
  { ma_so: "01", name: "1. Doanh thu bán hàng và cung cấp dịch vụ", accounts: [R("511")] },
  { ma_so: "02", name: "2. Các khoản giảm trừ doanh thu", accounts: [R("521")] },
  { ma_so: "10", name: "3. Doanh thu thuần (10 = 01 - 02)", bold: true,
    formula: [{ ma_so: "01", sign: 1 }, { ma_so: "02", sign: -1 }] },
  { ma_so: "11", name: "4. Giá vốn hàng bán", accounts: [E("632")] },
  { ma_so: "20", name: "5. Lợi nhuận gộp (20 = 10 - 11)", bold: true,
    formula: [{ ma_so: "10", sign: 1 }, { ma_so: "11", sign: -1 }] },
  { ma_so: "21", name: "6. Doanh thu hoạt động tài chính", accounts: [R("515")] },
  { ma_so: "22", name: "7. Chi phí tài chính", accounts: [E("635")] },
  { ma_so: "23", name: "    - Trong đó: Chi phí lãi vay", accounts: [E("6351")] },
  { ma_so: "24", name: "8. Phần lãi/lỗ trong công ty liên doanh, liên kết", accounts: [R("515")] },
  { ma_so: "25", name: "9. Chi phí bán hàng", accounts: [E("641"), E("6421")] },
  { ma_so: "26", name: "10. Chi phí quản lý doanh nghiệp", accounts: [E("642"), E("6422")] },
  { ma_so: "30", name: "11. Lợi nhuận thuần từ HĐKD (30 = 20+(21-22)+24-25-26)", bold: true,
    formula: [
      { ma_so: "20", sign: 1 }, { ma_so: "21", sign: 1 }, { ma_so: "22", sign: -1 },
      { ma_so: "25", sign: -1 }, { ma_so: "26", sign: -1 },
    ] },
  { ma_so: "31", name: "12. Thu nhập khác", accounts: [R("711")] },
  { ma_so: "32", name: "13. Chi phí khác", accounts: [E("811")] },
  { ma_so: "40", name: "14. Lợi nhuận khác (40 = 31 - 32)", bold: true,
    formula: [{ ma_so: "31", sign: 1 }, { ma_so: "32", sign: -1 }] },
  { ma_so: "50", name: "15. Tổng lợi nhuận kế toán trước thuế (50 = 30 + 40)", bold: true,
    formula: [{ ma_so: "30", sign: 1 }, { ma_so: "40", sign: 1 }] },
  { ma_so: "51", name: "16. Chi phí thuế TNDN hiện hành", accounts: [E("8211")] },
  { ma_so: "52", name: "17. Chi phí thuế TNDN hoãn lại", accounts: [E("8212")] },
  { ma_so: "60", name: "18. Lợi nhuận sau thuế TNDN (60 = 50 - 51 - 52)", bold: true,
    formula: [{ ma_so: "50", sign: 1 }, { ma_so: "51", sign: -1 }, { ma_so: "52", sign: -1 }] },
  { ma_so: "70", name: "19. Lãi cơ bản trên cổ phiếu (EPS)", accounts: [] },
];

// ============ B03 — Lưu chuyển tiền tệ (trực tiếp) ============
export type CFItem = {
  ma_so: string;
  name: string;
  section: "operating" | "investing" | "financing" | "summary";
  counterpart?: { prefixes: string[]; direction: "inflow" | "outflow" | "net" };
  formula?: Array<{ ma_so: string; sign: 1 | -1 }>;
  cashBalance?: "opening" | "closing";
  bold?: boolean;
};

export const B03_TT99: CFItem[] = [
  // I. Hoạt động kinh doanh
  { ma_so: "01", name: "1. Tiền thu từ bán hàng, cung cấp dịch vụ và doanh thu khác", section: "operating",
    counterpart: { prefixes: ["131", "511", "3331"], direction: "inflow" } },
  { ma_so: "02", name: "2. Tiền chi trả cho người cung cấp hàng hóa và dịch vụ", section: "operating",
    counterpart: { prefixes: ["331", "152", "153", "156", "627", "641", "642"], direction: "outflow" } },
  { ma_so: "03", name: "3. Tiền chi trả cho người lao động", section: "operating",
    counterpart: { prefixes: ["334"], direction: "outflow" } },
  { ma_so: "04", name: "4. Tiền lãi vay đã trả", section: "operating",
    counterpart: { prefixes: ["635", "6351"], direction: "outflow" } },
  { ma_so: "05", name: "5. Thuế thu nhập doanh nghiệp đã nộp", section: "operating",
    counterpart: { prefixes: ["3334"], direction: "outflow" } },
  { ma_so: "06", name: "6. Tiền thu khác từ hoạt động kinh doanh", section: "operating",
    counterpart: { prefixes: ["138", "141", "344", "353", "356", "411", "711"], direction: "inflow" } },
  { ma_so: "07", name: "7. Tiền chi khác cho hoạt động kinh doanh", section: "operating",
    counterpart: { prefixes: ["3382", "3383", "3384", "3385", "3388", "3389", "3335", "811", "353", "356"], direction: "outflow" } },
  { ma_so: "20", name: "Lưu chuyển tiền thuần từ hoạt động kinh doanh", section: "operating", bold: true,
    formula: [
      { ma_so: "01", sign: 1 }, { ma_so: "02", sign: -1 }, { ma_so: "03", sign: -1 },
      { ma_so: "04", sign: -1 }, { ma_so: "05", sign: -1 }, { ma_so: "06", sign: 1 }, { ma_so: "07", sign: -1 },
    ] },

  // II. Hoạt động đầu tư
  { ma_so: "21", name: "1. Tiền chi để mua sắm, xây dựng TSCĐ và TS dài hạn khác", section: "investing",
    counterpart: { prefixes: ["211", "212", "213", "217", "241"], direction: "outflow" } },
  { ma_so: "22", name: "2. Tiền thu từ thanh lý, nhượng bán TSCĐ và TS dài hạn khác", section: "investing",
    counterpart: { prefixes: ["711", "211"], direction: "inflow" } },
  { ma_so: "23", name: "3. Tiền chi cho vay, mua công cụ nợ của đơn vị khác", section: "investing",
    counterpart: { prefixes: ["1283", "128", "228"], direction: "outflow" } },
  { ma_so: "24", name: "4. Tiền thu hồi cho vay, bán lại công cụ nợ của đơn vị khác", section: "investing",
    counterpart: { prefixes: ["1283", "128", "228"], direction: "inflow" } },
  { ma_so: "25", name: "5. Tiền chi đầu tư góp vốn vào đơn vị khác", section: "investing",
    counterpart: { prefixes: ["221", "222", "228"], direction: "outflow" } },
  { ma_so: "26", name: "6. Tiền thu hồi đầu tư góp vốn vào đơn vị khác", section: "investing",
    counterpart: { prefixes: ["221", "222", "228"], direction: "inflow" } },
  { ma_so: "27", name: "7. Tiền thu lãi cho vay, cổ tức và lợi nhuận được chia", section: "investing",
    counterpart: { prefixes: ["515"], direction: "inflow" } },
  { ma_so: "30", name: "Lưu chuyển tiền thuần từ hoạt động đầu tư", section: "investing", bold: true,
    formula: [
      { ma_so: "21", sign: -1 }, { ma_so: "22", sign: 1 }, { ma_so: "23", sign: -1 },
      { ma_so: "24", sign: 1 }, { ma_so: "25", sign: -1 }, { ma_so: "26", sign: 1 }, { ma_so: "27", sign: 1 },
    ] },

  // III. Hoạt động tài chính
  { ma_so: "31", name: "1. Tiền thu từ phát hành cổ phiếu, nhận vốn góp của chủ sở hữu", section: "financing",
    counterpart: { prefixes: ["411", "4111", "4112"], direction: "inflow" } },
  { ma_so: "32", name: "2. Tiền trả lại vốn góp cho chủ sở hữu, mua lại cổ phiếu đã phát hành", section: "financing",
    counterpart: { prefixes: ["411", "419"], direction: "outflow" } },
  { ma_so: "33", name: "3. Tiền thu từ đi vay", section: "financing",
    counterpart: { prefixes: ["341", "3431", "3432"], direction: "inflow" } },
  { ma_so: "34", name: "4. Tiền trả nợ gốc vay", section: "financing",
    counterpart: { prefixes: ["341", "3431", "3432"], direction: "outflow" } },
  { ma_so: "35", name: "5. Tiền trả nợ gốc thuê tài chính", section: "financing",
    counterpart: { prefixes: ["3412"], direction: "outflow" } },
  { ma_so: "36", name: "6. Cổ tức, lợi nhuận đã trả cho chủ sở hữu", section: "financing",
    counterpart: { prefixes: ["421", "3388"], direction: "outflow" } },
  { ma_so: "40", name: "Lưu chuyển tiền thuần từ hoạt động tài chính", section: "financing", bold: true,
    formula: [
      { ma_so: "31", sign: 1 }, { ma_so: "32", sign: -1 }, { ma_so: "33", sign: 1 },
      { ma_so: "34", sign: -1 }, { ma_so: "35", sign: -1 }, { ma_so: "36", sign: -1 },
    ] },

  // Tổng hợp
  { ma_so: "50", name: "Lưu chuyển tiền thuần trong kỳ (50 = 20 + 30 + 40)", section: "summary", bold: true,
    formula: [{ ma_so: "20", sign: 1 }, { ma_so: "30", sign: 1 }, { ma_so: "40", sign: 1 }] },
  { ma_so: "60", name: "Tiền và tương đương tiền đầu kỳ", section: "summary", cashBalance: "opening" },
  { ma_so: "61", name: "Ảnh hưởng của thay đổi tỷ giá hối đoái quy đổi ngoại tệ", section: "summary" },
  { ma_so: "70", name: "Tiền và tương đương tiền cuối kỳ (70 = 50 + 60 + 61)", section: "summary", bold: true,
    formula: [{ ma_so: "50", sign: 1 }, { ma_so: "60", sign: 1 }, { ma_so: "61", sign: 1 }] },
];
