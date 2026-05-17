// Mã số chỉ tiêu BCTC theo Thông tư 99/2025/TT-BTC (Phụ lục IV)
// Mỗi item: mã số, tên, level (0=heading, 1=section, 2=line), accounts → {prefix, sign}, formula?

export type BSItem = {
  ma_so: string;
  name: string;
  level: 0 | 1 | 2;
  group: "asset" | "liability" | "equity" | "total";
  accounts?: Array<{ prefix: string; sign: 1 | -1; nature: "debit" | "credit" }>;
  formula?: string[]; // tổng các mã số khác
  bold?: boolean;
};

// Mặc định: tài sản = Nợ - Có; nợ phải trả/VCSH = Có - Nợ
export const B01_TT99: BSItem[] = [
  { ma_so: "100", name: "A. TÀI SẢN NGẮN HẠN", level: 0, group: "asset", bold: true, formula: ["110", "120", "130", "140", "150"] },
  { ma_so: "110", name: "I. Tiền và các khoản tương đương tiền", level: 1, group: "asset",
    accounts: [{ prefix: "111", sign: 1, nature: "debit" }, { prefix: "112", sign: 1, nature: "debit" }, { prefix: "113", sign: 1, nature: "debit" }] },
  { ma_so: "120", name: "II. Đầu tư tài chính ngắn hạn", level: 1, group: "asset",
    accounts: [{ prefix: "121", sign: 1, nature: "debit" }, { prefix: "128", sign: 1, nature: "debit" }, { prefix: "2291", sign: -1, nature: "credit" }] },
  { ma_so: "130", name: "III. Các khoản phải thu ngắn hạn", level: 1, group: "asset",
    accounts: [
      { prefix: "131", sign: 1, nature: "debit" },
      { prefix: "136", sign: 1, nature: "debit" },
      { prefix: "138", sign: 1, nature: "debit" },
      { prefix: "141", sign: 1, nature: "debit" },
      { prefix: "151", sign: 1, nature: "debit" },
      { prefix: "2293", sign: -1, nature: "credit" },
    ] },
  { ma_so: "140", name: "IV. Hàng tồn kho", level: 1, group: "asset",
    accounts: [
      { prefix: "152", sign: 1, nature: "debit" },
      { prefix: "153", sign: 1, nature: "debit" },
      { prefix: "154", sign: 1, nature: "debit" },
      { prefix: "155", sign: 1, nature: "debit" },
      { prefix: "156", sign: 1, nature: "debit" },
      { prefix: "157", sign: 1, nature: "debit" },
      { prefix: "158", sign: 1, nature: "debit" },
      { prefix: "2294", sign: -1, nature: "credit" },
    ] },
  { ma_so: "150", name: "V. Tài sản ngắn hạn khác", level: 1, group: "asset",
    accounts: [{ prefix: "133", sign: 1, nature: "debit" }, { prefix: "242", sign: 1, nature: "debit" }] },

  { ma_so: "200", name: "B. TÀI SẢN DÀI HẠN", level: 0, group: "asset", bold: true, formula: ["210", "220", "230", "240", "250", "260", "270"] },
  { ma_so: "210", name: "I. Các khoản phải thu dài hạn", level: 1, group: "asset",
    accounts: [{ prefix: "131", sign: 1, nature: "debit" }, { prefix: "244", sign: 1, nature: "debit" }] },
  { ma_so: "220", name: "II. Tài sản cố định", level: 1, group: "asset",
    accounts: [
      { prefix: "211", sign: 1, nature: "debit" },
      { prefix: "212", sign: 1, nature: "debit" },
      { prefix: "213", sign: 1, nature: "debit" },
      { prefix: "214", sign: -1, nature: "credit" },
    ] },
  { ma_so: "230", name: "III. Bất động sản đầu tư", level: 1, group: "asset",
    accounts: [{ prefix: "217", sign: 1, nature: "debit" }, { prefix: "2147", sign: -1, nature: "credit" }] },
  { ma_so: "240", name: "IV. Tài sản dở dang dài hạn", level: 1, group: "asset",
    accounts: [{ prefix: "241", sign: 1, nature: "debit" }] },
  { ma_so: "250", name: "V. Đầu tư tài chính dài hạn", level: 1, group: "asset",
    accounts: [{ prefix: "221", sign: 1, nature: "debit" }, { prefix: "222", sign: 1, nature: "debit" }, { prefix: "228", sign: 1, nature: "debit" }, { prefix: "2292", sign: -1, nature: "credit" }] },
  { ma_so: "260", name: "VI. Tài sản dài hạn khác", level: 1, group: "asset",
    accounts: [{ prefix: "242", sign: 1, nature: "debit" }, { prefix: "243", sign: 1, nature: "debit" }] },
  { ma_so: "270", name: "VII. Tài sản sinh học (TT99)", level: 1, group: "asset",
    accounts: [{ prefix: "215", sign: 1, nature: "debit" }] },

  { ma_so: "280", name: "TỔNG CỘNG TÀI SẢN", level: 0, group: "total", bold: true, formula: ["100", "200"] },

  { ma_so: "300", name: "C. NỢ PHẢI TRẢ", level: 0, group: "liability", bold: true, formula: ["310", "330"] },
  { ma_so: "310", name: "I. Nợ ngắn hạn", level: 1, group: "liability",
    accounts: [
      { prefix: "331", sign: 1, nature: "credit" },
      { prefix: "333", sign: 1, nature: "credit" },
      { prefix: "334", sign: 1, nature: "credit" },
      { prefix: "335", sign: 1, nature: "credit" },
      { prefix: "3382", sign: 1, nature: "credit" },
      { prefix: "3383", sign: 1, nature: "credit" },
      { prefix: "3384", sign: 1, nature: "credit" },
      { prefix: "3385", sign: 1, nature: "credit" },
      { prefix: "3386", sign: 1, nature: "credit" },
      { prefix: "3387", sign: 1, nature: "credit" },
      { prefix: "3388", sign: 1, nature: "credit" },
      { prefix: "3389", sign: 1, nature: "credit" },
      { prefix: "341", sign: 1, nature: "credit" },
    ] },
  { ma_so: "330", name: "II. Nợ dài hạn", level: 1, group: "liability",
    accounts: [{ prefix: "343", sign: 1, nature: "credit" }, { prefix: "344", sign: 1, nature: "credit" }, { prefix: "347", sign: 1, nature: "credit" }, { prefix: "352", sign: 1, nature: "credit" }] },

  { ma_so: "400", name: "D. VỐN CHỦ SỞ HỮU", level: 0, group: "equity", bold: true, formula: ["410", "430"] },
  { ma_so: "410", name: "I. Vốn chủ sở hữu", level: 1, group: "equity",
    accounts: [
      { prefix: "411", sign: 1, nature: "credit" },
      { prefix: "412", sign: 1, nature: "credit" },
      { prefix: "413", sign: 1, nature: "credit" },
      { prefix: "414", sign: 1, nature: "credit" },
      { prefix: "418", sign: 1, nature: "credit" },
      { prefix: "421", sign: 1, nature: "credit" },
      { prefix: "441", sign: 1, nature: "credit" },
    ] },
  { ma_so: "430", name: "II. Nguồn kinh phí và quỹ khác", level: 1, group: "equity",
    accounts: [{ prefix: "461", sign: 1, nature: "credit" }, { prefix: "466", sign: 1, nature: "credit" }] },

  { ma_so: "440", name: "TỔNG CỘNG NGUỒN VỐN", level: 0, group: "total", bold: true, formula: ["300", "400"] },
];

export type ISItem = {
  ma_so: string;
  name: string;
  accounts?: Array<{ prefix: string; sign: 1 | -1; nature: "revenue" | "expense" }>;
  formula?: Array<{ ma_so: string; sign: 1 | -1 }>;
  bold?: boolean;
};

// Doanh thu = Có - Nợ; Chi phí = Nợ - Có
export const B02_TT99: ISItem[] = [
  { ma_so: "01", name: "1. Doanh thu bán hàng và cung cấp dịch vụ", accounts: [{ prefix: "511", sign: 1, nature: "revenue" }] },
  { ma_so: "02", name: "2. Các khoản giảm trừ doanh thu", accounts: [{ prefix: "521", sign: 1, nature: "revenue" }] },
  { ma_so: "10", name: "3. Doanh thu thuần (10 = 01 - 02)", bold: true, formula: [{ ma_so: "01", sign: 1 }, { ma_so: "02", sign: -1 }] },
  { ma_so: "11", name: "4. Giá vốn hàng bán", accounts: [{ prefix: "632", sign: 1, nature: "expense" }] },
  { ma_so: "20", name: "5. Lợi nhuận gộp (20 = 10 - 11)", bold: true, formula: [{ ma_so: "10", sign: 1 }, { ma_so: "11", sign: -1 }] },
  { ma_so: "21", name: "6. Doanh thu hoạt động tài chính", accounts: [{ prefix: "515", sign: 1, nature: "revenue" }] },
  { ma_so: "22", name: "7. Chi phí tài chính", accounts: [{ prefix: "635", sign: 1, nature: "expense" }] },
  { ma_so: "25", name: "8. Chi phí bán hàng", accounts: [{ prefix: "641", sign: 1, nature: "expense" }, { prefix: "6421", sign: 1, nature: "expense" }] },
  { ma_so: "26", name: "9. Chi phí quản lý doanh nghiệp", accounts: [{ prefix: "642", sign: 1, nature: "expense" }, { prefix: "6422", sign: 1, nature: "expense" }] },
  { ma_so: "30", name: "10. Lợi nhuận thuần từ HĐKD (30 = 20+21-22-25-26)", bold: true,
    formula: [{ ma_so: "20", sign: 1 }, { ma_so: "21", sign: 1 }, { ma_so: "22", sign: -1 }, { ma_so: "25", sign: -1 }, { ma_so: "26", sign: -1 }] },
  { ma_so: "31", name: "11. Thu nhập khác", accounts: [{ prefix: "711", sign: 1, nature: "revenue" }] },
  { ma_so: "32", name: "12. Chi phí khác", accounts: [{ prefix: "811", sign: 1, nature: "expense" }] },
  { ma_so: "40", name: "13. Lợi nhuận khác (40 = 31 - 32)", bold: true, formula: [{ ma_so: "31", sign: 1 }, { ma_so: "32", sign: -1 }] },
  { ma_so: "50", name: "14. Tổng lợi nhuận kế toán trước thuế (50 = 30+40)", bold: true, formula: [{ ma_so: "30", sign: 1 }, { ma_so: "40", sign: 1 }] },
  { ma_so: "51", name: "15. Chi phí thuế TNDN", accounts: [{ prefix: "821", sign: 1, nature: "expense" }] },
  { ma_so: "60", name: "16. Lợi nhuận sau thuế TNDN (60 = 50 - 51)", bold: true, formula: [{ ma_so: "50", sign: 1 }, { ma_so: "51", sign: -1 }] },
];

// LCTT — phương pháp trực tiếp (B03-DN)
export type CFItem = {
  ma_so: string;
  name: string;
  section: "operating" | "investing" | "financing" | "summary";
  // Quy tắc: tìm các journal lines có một bên là tiền (111/112) và đối ứng thuộc các prefix sau
  counterpart?: { prefixes: string[]; direction: "inflow" | "outflow" | "net" };
  formula?: Array<{ ma_so: string; sign: 1 | -1 }>;
  bold?: boolean;
};

export const B03_TT99: CFItem[] = [
  { ma_so: "01", name: "1. Tiền thu từ bán hàng, cung cấp dịch vụ", section: "operating",
    counterpart: { prefixes: ["131", "511", "3331"], direction: "inflow" } },
  { ma_so: "02", name: "2. Tiền chi trả cho nhà cung cấp", section: "operating",
    counterpart: { prefixes: ["331", "152", "153", "156", "627", "641", "642"], direction: "outflow" } },
  { ma_so: "03", name: "3. Tiền chi trả cho người lao động", section: "operating",
    counterpart: { prefixes: ["334"], direction: "outflow" } },
  { ma_so: "04", name: "4. Tiền lãi vay đã trả", section: "operating",
    counterpart: { prefixes: ["635"], direction: "outflow" } },
  { ma_so: "05", name: "5. Thuế TNDN đã nộp", section: "operating",
    counterpart: { prefixes: ["3334"], direction: "outflow" } },
  { ma_so: "06", name: "6. Tiền thu khác từ HĐKD", section: "operating",
    counterpart: { prefixes: ["138", "711"], direction: "inflow" } },
  { ma_so: "07", name: "7. Tiền chi khác cho HĐKD", section: "operating",
    counterpart: { prefixes: ["3382", "3383", "3384", "3389", "3335", "811"], direction: "outflow" } },
  { ma_so: "20", name: "Lưu chuyển tiền thuần từ HĐKD", section: "operating", bold: true,
    formula: [{ ma_so: "01", sign: 1 }, { ma_so: "02", sign: -1 }, { ma_so: "03", sign: -1 }, { ma_so: "04", sign: -1 }, { ma_so: "05", sign: -1 }, { ma_so: "06", sign: 1 }, { ma_so: "07", sign: -1 }] },

  { ma_so: "21", name: "1. Tiền chi mua TSCĐ, BĐS đầu tư", section: "investing",
    counterpart: { prefixes: ["211", "212", "213", "217", "241"], direction: "outflow" } },
  { ma_so: "22", name: "2. Tiền thu thanh lý, nhượng bán TSCĐ", section: "investing",
    counterpart: { prefixes: ["711"], direction: "inflow" } },
  { ma_so: "23", name: "3. Tiền chi cho vay, mua công cụ nợ", section: "investing",
    counterpart: { prefixes: ["128", "228"], direction: "outflow" } },
  { ma_so: "24", name: "4. Tiền thu hồi cho vay, bán công cụ nợ", section: "investing",
    counterpart: { prefixes: ["128", "228"], direction: "inflow" } },
  { ma_so: "27", name: "7. Tiền thu lãi cho vay, cổ tức", section: "investing",
    counterpart: { prefixes: ["515"], direction: "inflow" } },
  { ma_so: "30", name: "Lưu chuyển tiền thuần từ HĐ đầu tư", section: "investing", bold: true,
    formula: [{ ma_so: "21", sign: -1 }, { ma_so: "22", sign: 1 }, { ma_so: "23", sign: -1 }, { ma_so: "24", sign: 1 }, { ma_so: "27", sign: 1 }] },

  { ma_so: "31", name: "1. Tiền thu từ phát hành cổ phiếu, góp vốn", section: "financing",
    counterpart: { prefixes: ["411"], direction: "inflow" } },
  { ma_so: "33", name: "3. Tiền vay ngắn hạn, dài hạn nhận được", section: "financing",
    counterpart: { prefixes: ["341"], direction: "inflow" } },
  { ma_so: "34", name: "4. Tiền chi trả nợ gốc vay", section: "financing",
    counterpart: { prefixes: ["341"], direction: "outflow" } },
  { ma_so: "36", name: "6. Cổ tức, lợi nhuận đã trả cho chủ sở hữu", section: "financing",
    counterpart: { prefixes: ["421"], direction: "outflow" } },
  { ma_so: "40", name: "Lưu chuyển tiền thuần từ HĐ tài chính", section: "financing", bold: true,
    formula: [{ ma_so: "31", sign: 1 }, { ma_so: "33", sign: 1 }, { ma_so: "34", sign: -1 }, { ma_so: "36", sign: -1 }] },

  { ma_so: "50", name: "Lưu chuyển tiền thuần trong kỳ (50=20+30+40)", section: "summary", bold: true,
    formula: [{ ma_so: "20", sign: 1 }, { ma_so: "30", sign: 1 }, { ma_so: "40", sign: 1 }] },
];
