// Bộ item Loại B — "Chi phí theo mục đích"
// Phân loại theo MỤC ĐÍCH CHI TIÊU, không phải tên mặt hàng.
// Dùng cho hàng hóa "trôi nổi": 1 mặt hàng nhiều mục đích → nhiều TK.
//
// Căn cứ pháp lý (verified 2026):
//   - Luật thuế TNDN 2025 (hiệu lực 01/10/2025)
//   - Nghị định 320/2025/NĐ-CP
//   - Thông tư 20/2026/TT-BTC
//   - TK theo TT 99/2025/TT-BTC (default) + TT 133/2016 (SME)

export type TypeBGroup =
  | "PHUC_LOI_NV"
  | "TIEP_KHACH"
  | "CONG_TAC"
  | "SU_KIEN_VH"
  | "MARKETING"
  | "TAI_TRO_CSR"
  | "DAO_TAO"
  | "BAO_HO_LD"
  | "KHONG_DUOC_TRU";

export interface TypeBItem {
  code: string;
  name: string;
  nameEn: string;
  group: TypeBGroup;
  accountTT99: string;
  accountTT133: string;
  altAccounts: string[];
  vatRate: number;
  vatDeductible: boolean;
  citDeductible: boolean;
  citCap: string;
  citWarning: string;
  vatOutputRequired: boolean;
  requiredDocs: string[];
  aliases: string[];
  floatingGoods: string[];
  legalRef: string;
  notes: string;
}

export const TYPEB_ITEMS: TypeBItem[] = [
  // ===== PHÚC LỢI NV =====
  {
    code: "CP-PL-LIENHOAN", name: "Chi liên hoan, ăn uống tập thể NV",
    nameEn: "Staff party / team meal", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6418", "6278"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Tổng phúc lợi ≤ 1 tháng lương BQ thực tế trong năm",
    citWarning: "Cộng dồn với các khoản phúc lợi khác. Nếu tổng phúc lợi cả năm vượt 1 tháng lương BQ → phần vượt KHÔNG được trừ TNDN.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Quy chế chi tiêu nội bộ", "Danh sách NV tham gia"],
    aliases: ["liên hoan", "tiệc công ty", "ăn uống NV", "tất niên", "year end party", "sinh nhật công ty"],
    floatingGoods: ["bánh kem", "bia", "nước ngọt", "set menu nhà hàng", "buffet"],
    legalRef: "Điểm d khoản 4 Điều 10 NĐ 320/2025/NĐ-CP",
    notes: "Quán/nhà hàng xuất HĐ ăn uống cho liên hoan NV. VAT vẫn khấu trừ.",
  },
  {
    code: "CP-PL-NGHIMAT", name: "Chi nghỉ mát, du lịch NV",
    nameEn: "Staff vacation", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6418"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Tổng phúc lợi ≤ 1 tháng lương BQ thực tế trong năm",
    citWarning: "Cộng dồn quỹ phúc lợi. Tour trọn gói: VAT khấu trừ theo HĐ. Cần quyết định + danh sách NV.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn tour", "Quyết định tổ chức", "Danh sách NV"],
    aliases: ["nghỉ mát", "du lịch công ty", "company trip", "team building", "tour nghỉ dưỡng"],
    floatingGoods: ["tour du lịch", "vé máy bay đoàn", "khách sạn", "resort"],
    legalRef: "Điểm d khoản 4 Điều 10 NĐ 320/2025/NĐ-CP",
    notes: "Company trip kết hợp team building. Khống chế chung quỹ phúc lợi.",
  },
  {
    code: "CP-PL-HIEUHY", name: "Chi hiếu hỷ NV (cưới, tang)",
    nameEn: "Staff wedding/funeral support", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0, vatDeductible: false, citDeductible: true,
    citCap: "Tổng phúc lợi ≤ 1 tháng lương BQ thực tế trong năm",
    citWarning: "Chi tiền mặt thường không HĐ → cần quy chế nội bộ + phiếu chi. Cộng dồn quỹ phúc lợi.",
    vatOutputRequired: false,
    requiredDocs: ["Quy chế chi tiêu nội bộ", "Phiếu chi"],
    aliases: ["hiếu hỷ", "mừng cưới", "phúng viếng", "tang lễ NV", "ma chay"],
    floatingGoods: ["tiền mặt", "vòng hoa", "quà mừng"],
    legalRef: "Điểm d khoản 4 Điều 10 NĐ 320/2025/NĐ-CP",
    notes: "Thường chi tiền mặt. Phải có quy chế nội bộ để được trừ.",
  },
  {
    code: "CP-PL-QUATET-NV", name: "Chi quà lễ tết cho NV",
    nameEn: "Staff holiday gifts", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Tổng phúc lợi ≤ 1 tháng lương BQ thực tế trong năm",
    citWarning: "VAT đầu vào khấu trừ. LƯU Ý: quà hiện vật có thể tính vào thu nhập chịu thuế TNCN của NV.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn mua quà", "Danh sách NV nhận", "Quyết định tặng"],
    aliases: ["quà tết NV", "giỏ quà tết", "quà 8/3", "quà trung thu NV", "lì xì"],
    floatingGoods: ["giỏ quà tết", "bánh trung thu", "rượu", "voucher"],
    legalRef: "Điểm d khoản 4 Điều 10 NĐ 320/2025/NĐ-CP",
    notes: "Khác quà KHÁCH HÀNG. Quà NV vào phúc lợi, có thể chịu TNCN.",
  },
  {
    code: "CP-PL-DIEUTRI", name: "Chi hỗ trợ điều trị bệnh NV",
    nameEn: "Staff medical support", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0.05, vatDeductible: true, citDeductible: true,
    citCap: "Tổng phúc lợi ≤ 1 tháng lương BQ thực tế trong năm",
    citWarning: "Hỗ trợ điều trị bệnh hiểm nghèo, tai nạn LĐ. Cộng dồn quỹ phúc lợi.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn viện phí", "Quy chế nội bộ", "Đơn đề nghị NV"],
    aliases: ["hỗ trợ y tế NV", "viện phí NV", "điều trị bệnh", "ốm đau NV"],
    floatingGoods: ["viện phí", "thuốc", "dịch vụ y tế"],
    legalRef: "Điểm d khoản 4 Điều 10 NĐ 320/2025/NĐ-CP",
    notes: "Khác khám sức khỏe định kỳ (chi phí bắt buộc, không khống chế).",
  },
  {
    code: "CP-PL-DONGPHUC", name: "Chi đồng phục NV",
    nameEn: "Staff uniform", group: "PHUC_LOI_NV",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["153", "6418"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Bằng TIỀN: tối đa 5tr/người/năm. Bằng HIỆN VẬT (có HĐ): không khống chế.",
    citWarning: "QUAN TRỌNG: chi bằng tiền > 5tr/người/năm → phần vượt KHÔNG được trừ. Bằng hiện vật có HĐ → trừ toàn bộ, KHÔNG tính quỹ phúc lợi.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn may/mua", "Danh sách NV", "Quy chế đồng phục"],
    aliases: ["đồng phục", "áo công ty", "uniform", "áo thun NV"],
    floatingGoods: ["áo thun", "áo sơ mi", "đồng phục may đo", "vải"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Bằng tiền có trần 5tr; hiện vật không trần. Khác bảo hộ LĐ.",
  },
  // ===== TIẾP KHÁCH =====
  {
    code: "CP-TK-TIEPKHACH", name: "Chi tiếp khách (ăn uống, cà phê)",
    nameEn: "Client entertainment", group: "TIEP_KHACH",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6418"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "KHÔNG còn trần 15% (bỏ từ 2015). Được trừ nếu hợp lý + phục vụ SXKD.",
    citWarning: "Cơ quan thuế soi kỹ. Ghi rõ tiếp đối tác nào, mục đích gì. HĐ ≥ 5tr phải chuyển khoản.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Ghi chú nội dung tiếp khách", "Chứng từ CK nếu ≥ 5tr"],
    aliases: ["tiếp khách", "tiếp đối tác", "cà phê khách hàng", "ăn uống đối tác", "client meeting"],
    floatingGoods: ["set menu", "cà phê", "đồ uống nhà hàng", "bánh"],
    legalRef: "Luật 71/2014 (bỏ trần); Điều 9 Luật TNDN 2025",
    notes: "Trần 15% bỏ từ 2015. Vẫn là điểm rủi ro khi quyết toán.",
  },
  {
    code: "CP-TK-QUAKHACH", name: "Chi quà tặng khách hàng",
    nameEn: "Customer gifts", group: "TIEP_KHACH",
    accountTT99: "6418", accountTT133: "6421", altAccounts: ["6428"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ nếu phục vụ SXKD + đủ chứng từ.",
    citWarning: "CẢNH BÁO: Quà tặng KH phải XUẤT HÓA ĐƠN VAT ĐẦU RA (hàng biếu/tặng vẫn kê khai VAT đầu ra). Lỗi phổ biến bị truy thu.",
    vatOutputRequired: true,
    requiredDocs: ["HĐ mua quà", "HĐ xuất biếu tặng", "Danh sách KH nhận", "Quyết định tặng"],
    aliases: ["quà khách hàng", "quà tặng đối tác", "quà tết khách", "tri ân khách hàng", "customer gift"],
    floatingGoods: ["giỏ quà", "rượu", "bánh", "hoa", "voucher", "hộp quà cao cấp"],
    legalRef: "Điều 9 Luật TNDN 2025; quy định VAT hàng biếu tặng",
    notes: "Khác quà NV. Bắt buộc xuất HĐ đầu ra — Fin phải tự động nhắc.",
  },
  {
    code: "CP-TK-HOINGHI-KH", name: "Chi hội nghị khách hàng",
    nameEn: "Customer conference", group: "TIEP_KHACH",
    accountTT99: "6418", accountTT133: "6421", altAccounts: ["6428"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ nếu phục vụ SXKD + đủ chứng từ.",
    citWarning: "Cần chương trình + danh sách khách mời + hóa đơn dịch vụ.",
    vatOutputRequired: false,
    requiredDocs: ["HĐ thuê hội trường/tiệc", "Chương trình", "Danh sách khách mời"],
    aliases: ["hội nghị khách hàng", "ra mắt sản phẩm", "tri ân khách hàng", "gala dinner", "lễ kỷ niệm"],
    floatingGoods: ["thuê hội trường", "tiệc", "âm thanh ánh sáng", "MC"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Chi phí xúc tiến bán hàng → 6418. Khác hội thảo nội bộ.",
  },
  // ===== CÔNG TÁC =====
  {
    code: "CP-CT-CONGTACPHI", name: "Chi công tác phí (vé, lưu trú, phụ cấp)",
    nameEn: "Business travel", group: "CONG_TAC",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6418", "6278"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Phụ cấp theo quy chế nội bộ. Vé + lưu trú theo HĐ thực tế.",
    citWarning: "Cần quyết định cử công tác + quy chế công tác phí. HĐ ≥ 5tr chuyển khoản.",
    vatOutputRequired: false,
    requiredDocs: ["Lệnh công tác", "Vé máy bay/tàu xe", "HĐ lưu trú", "Quy chế công tác phí"],
    aliases: ["công tác phí", "vé máy bay công tác", "khách sạn công tác", "phụ cấp đi lại", "per diem"],
    floatingGoods: ["vé máy bay", "khách sạn", "taxi", "vé tàu"],
    legalRef: "Điều 9 Luật TNDN 2025; quy chế nội bộ",
    notes: "Phụ cấp khoán (quy chế) vs thực chi (HĐ) — cả 2 được trừ.",
  },
  // ===== SỰ KIỆN / VẬN HÀNH =====
  {
    code: "CP-VH-TRANGTRI-SK", name: "Chi trang trí, vật phẩm sự kiện",
    nameEn: "Event decoration", group: "SU_KIEN_VH",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6418", "642"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ nếu phục vụ SXKD.",
    citWarning: "Hoa, backdrop trang trí khai trương/sự kiện. Giá trị nhỏ chi thẳng 642, không nhập kho.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Mục đích sự kiện"],
    aliases: ["trang trí", "hoa khai trương", "backdrop", "bóng bay", "decor sự kiện", "lẵng hoa"],
    floatingGoods: ["hoa tươi", "hoa chậu", "cây cảnh", "backdrop", "bóng bay", "băng rôn"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Hoa/cây trang trí 1 lần → chi phí thẳng. Khác hàng bán lại (156) / CCDC (153).",
  },
  {
    code: "CP-VH-VPP-TIEUDUNG", name: "Chi văn phòng phẩm tiêu dùng",
    nameEn: "Office consumables", group: "SU_KIEN_VH",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["153"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ toàn bộ nếu phục vụ SXKD.",
    citWarning: "Giá trị nhỏ dùng ngay → 6428. Lô lớn dùng dần → có thể qua 153.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn"],
    aliases: ["văn phòng phẩm", "VPP", "giấy bút", "mực in", "sổ tay"],
    floatingGoods: ["giấy A4", "bút", "mực in", "file", "băng keo"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Tiêu dùng ngay → 6428. Khác VPP nhập kho số lượng lớn (153).",
  },
  {
    code: "CP-VH-PANTRY", name: "Chi vật dụng tiêu hao VP (trà, cà phê, nước)",
    nameEn: "Office pantry", group: "SU_KIEN_VH",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ nếu phục vụ hoạt động văn phòng.",
    citWarning: "Trà, cà phê, nước cho VP + tiếp khách tại chỗ. Giá trị nhỏ, chi thẳng.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn"],
    aliases: ["nước uống văn phòng", "cà phê văn phòng", "trà", "nước suối", "pantry"],
    floatingGoods: ["nước suối", "cà phê", "trà", "đường", "sữa", "giấy vệ sinh"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Vật dụng pantry → chi phí QLDN. Khác đồ uống bán lại (156).",
  },
  // ===== MARKETING =====
  {
    code: "CP-MK-KHUYENMAI", name: "Chi khuyến mại, hàng mẫu",
    nameEn: "Promotion / samples", group: "MARKETING",
    accountTT99: "6418", accountTT133: "6421", altAccounts: ["6428"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "KHÔNG còn trần 15% (bỏ 2015). Được trừ nếu có chương trình KM.",
    citWarning: "CẢNH BÁO: chương trình KM phải ĐĂNG KÝ/THÔNG BÁO Sở Công Thương. Đúng quy định → VAT đầu ra = 0. Không đăng ký → xuất HĐ đầu ra như bán.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Văn bản đăng ký KM với Sở Công Thương", "Thể lệ chương trình"],
    aliases: ["khuyến mại", "hàng mẫu", "sampling", "quà tặng kèm", "mua 1 tặng 1", "voucher giảm giá"],
    floatingGoods: ["hàng mẫu", "quà tặng kèm", "voucher", "sản phẩm dùng thử"],
    legalRef: "Luật 71/2014; Luật Thương mại; NĐ 81/2018",
    notes: "Phải đăng ký Sở Công Thương để VAT đầu ra = 0.",
  },
  {
    code: "CP-MK-QUANGCAO", name: "Chi quảng cáo",
    nameEn: "Advertising", group: "MARKETING",
    accountTT99: "6418", accountTT133: "6421", altAccounts: [],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "KHÔNG còn trần 15% (bỏ 2015). Được trừ toàn bộ nếu phục vụ SXKD.",
    citWarning: "QC qua NCC nước ngoài (FB, Google) chưa MST VN → FCT 5%+5%. Ngành y tế/thẩm mỹ cần giấy phép QC Sở Y tế (NĐ 38/2021).",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Hợp đồng QC", "Giấy phép QC (ngành đặc thù)"],
    aliases: ["quảng cáo", "ads", "marketing", "PR", "booking KOL", "billboard", "TVC"],
    floatingGoods: ["Facebook Ads", "Google Ads", "TikTok Ads", "billboard", "KOL"],
    legalRef: "Luật 71/2014; NĐ 38/2021 (QC y tế/thẩm mỹ)",
    notes: "Ngành thẩm mỹ cần check NĐ 38/2021.",
  },
  {
    code: "CP-MK-HOAHONG", name: "Chi hoa hồng môi giới",
    nameEn: "Brokerage commission", group: "MARKETING",
    accountTT99: "6418", accountTT133: "6421", altAccounts: ["6428"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ nếu có hợp đồng + hóa đơn/chứng từ.",
    citWarning: "Hoa hồng cho cá nhân ≥ 2tr/lần → khấu trừ TNCN 10% trước khi chi. Tổ chức → cần hóa đơn.",
    vatOutputRequired: false,
    requiredDocs: ["Hợp đồng môi giới", "Hóa đơn (tổ chức)", "Chứng từ khấu trừ TNCN (cá nhân)"],
    aliases: ["hoa hồng", "môi giới", "commission", "phí giới thiệu", "referral"],
    floatingGoods: ["hoa hồng bán hàng", "phí môi giới", "referral fee"],
    legalRef: "Điều 9 Luật TNDN 2025",
    notes: "Cá nhân → khấu trừ TNCN 10%. Khác commission sàn TMĐT.",
  },
  // ===== TÀI TRỢ / CSR =====
  {
    code: "CP-CSR-TAITRO-GDYTE", name: "Chi tài trợ giáo dục, y tế",
    nameEn: "Education/healthcare sponsorship", group: "TAI_TRO_CSR",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0, vatDeductible: false, citDeductible: true,
    citCap: "Được trừ nếu tài trợ ĐÚNG đối tượng + đủ hồ sơ.",
    citWarning: "Chỉ trừ khi qua tổ chức được công nhận + biên bản + quyết định. Sai đối tượng → KHÔNG trừ.",
    vatOutputRequired: false,
    requiredDocs: ["Biên bản xác nhận tài trợ", "Quyết định tài trợ", "Hồ sơ đơn vị nhận"],
    aliases: ["tài trợ giáo dục", "tài trợ y tế", "học bổng", "tài trợ trường học", "CSR"],
    floatingGoods: ["tiền tài trợ", "thiết bị y tế tặng", "học bổng"],
    legalRef: "Điều 9 Luật TNDN 2025; NĐ 320/2025",
    notes: "Phải đúng đối tượng + đủ hồ sơ.",
  },
  {
    code: "CP-CSR-THIENTAI", name: "Chi tài trợ khắc phục thiên tai",
    nameEn: "Disaster relief", group: "TAI_TRO_CSR",
    accountTT99: "6428", accountTT133: "6422", altAccounts: [],
    vatRate: 0, vatDeductible: false, citDeductible: true,
    citCap: "Được trừ nếu qua tổ chức được phép (MTTQ, Chữ thập đỏ).",
    citWarning: "Phải có biên lai từ tổ chức được phép tiếp nhận. Chi trực tiếp → KHÔNG trừ.",
    vatOutputRequired: false,
    requiredDocs: ["Biên lai tổ chức tiếp nhận", "Quyết định ủng hộ"],
    aliases: ["tài trợ thiên tai", "ủng hộ bão lũ", "từ thiện thiên tai", "cứu trợ", "MTTQ"],
    floatingGoods: ["tiền ủng hộ", "hàng cứu trợ", "nhu yếu phẩm"],
    legalRef: "Điều 9 Luật TNDN 2025; NĐ 320/2025",
    notes: "Bắt buộc qua tổ chức được phép. Biên lai là điều kiện được trừ.",
  },
  // ===== ĐÀO TẠO =====
  {
    code: "CP-DT-DAOTAO-NV", name: "Chi đào tạo, bồi dưỡng NV",
    nameEn: "Staff training", group: "DAO_TAO",
    accountTT99: "6428", accountTT133: "6422", altAccounts: ["6278"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ toàn bộ (KHÔNG tính vào quỹ phúc lợi khống chế).",
    citWarning: "Đào tạo nâng cao tay nghề phục vụ công việc → trừ toàn bộ. Cần HĐ + quyết định cử học.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn khóa học", "Quyết định cử đào tạo", "Chứng chỉ (nếu có)"],
    aliases: ["đào tạo NV", "khóa học", "training", "bồi dưỡng nghiệp vụ", "workshop"],
    floatingGoods: ["khóa học", "vé hội thảo", "tài liệu đào tạo", "phí chứng chỉ"],
    legalRef: "Điều 9 Luật TNDN 2025; NĐ 320/2025",
    notes: "KHÔNG tính vào quỹ phúc lợi. Trừ riêng, toàn bộ.",
  },
  // ===== BẢO HỘ LĐ =====
  {
    code: "CP-BHLD-BAOHO", name: "Chi bảo hộ lao động",
    nameEn: "Labor protection", group: "BAO_HO_LD",
    accountTT99: "6273", accountTT133: "6421", altAccounts: ["6428", "153"],
    vatRate: 0.10, vatDeductible: true, citDeductible: true,
    citCap: "Được trừ toàn bộ (KHÔNG khống chế, KHÔNG phải phúc lợi).",
    citWarning: "Trang bị bảo hộ theo an toàn LĐ (mũ, găng, giày, khẩu trang). Trừ toàn bộ. KHÁC đồng phục.",
    vatOutputRequired: false,
    requiredDocs: ["Hóa đơn", "Quy định an toàn LĐ", "Danh sách cấp phát"],
    aliases: ["bảo hộ lao động", "đồ bảo hộ", "mũ bảo hộ", "găng tay", "giày bảo hộ", "PPE"],
    floatingGoods: ["mũ bảo hộ", "găng tay", "giày", "kính", "khẩu trang", "áo phản quang"],
    legalRef: "Điều 9 Luật TNDN 2025; Luật ATVSLĐ",
    notes: "Khác đồng phục NV (phúc lợi). Bảo hộ → trừ toàn bộ.",
  },
  // ===== KHÔNG ĐƯỢC TRỪ =====
  {
    code: "CP-PHAT-VPHC", name: "Tiền phạt vi phạm hành chính",
    nameEn: "Administrative penalty", group: "KHONG_DUOC_TRU",
    accountTT99: "811", accountTT133: "811", altAccounts: [],
    vatRate: 0, vatDeductible: false, citDeductible: false,
    citCap: "KHÔNG được trừ TNDN.",
    citWarning: "CẢNH BÁO: Tiền phạt VPHC (thuế, giao thông, môi trường) vào 811 và LOẠI TRỪ khi quyết toán TNDN.",
    vatOutputRequired: false,
    requiredDocs: ["Quyết định xử phạt", "Biên lai nộp phạt"],
    aliases: ["phạt VPHC", "phạt thuế", "phạt giao thông", "phạt chậm nộp", "tiền phạt"],
    floatingGoods: ["tiền phạt"],
    legalRef: "Khoản 2 Điều 9 Luật TNDN 2025",
    notes: "Vào 811, loại trừ TNDN. Fin tự động flag loại trừ.",
  },
];

// ============================================================
// RESOLVER — phân luồng Loại A (mặt hàng) vs Loại B (mục đích)
// ============================================================

const FLOATING_KEYWORDS = [
  "bánh", "kem", "hoa", "cây", "rượu", "bia", "quà", "giỏ quà", "voucher",
  "trà", "cà phê", "nước", "set menu", "tiệc", "tour", "khách sạn",
  "áo", "đồng phục", "vải", "bóng bay", "backdrop",
];

export type ResolverRoute =
  | { route: "typeA"; reason: string }
  | { route: "typeB"; candidates: TypeBItem[]; reason: string }
  | { route: "unknown"; reason: string };

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Quyết định một line item nên đi luồng A (mặt hàng) hay B (mục đích).
 *
 * Logic:
 * 1. Nếu cache hit (đã học) → typeA (instant)
 * 2. Nếu là "hàng trôi nổi" → typeB, gợi ý các Loại B match
 * 3. Nếu Loại A khớp rõ → typeA
 * 4. Còn lại → unknown
 */
export function routeLineItem(
  description: string,
  hasTypeAExactMatch: boolean,
  hasCacheHit: boolean,
): ResolverRoute {
  if (hasCacheHit) {
    return { route: "typeA", reason: "Cache hit — đã học từ lần duyệt trước" };
  }

  const normalized = norm(description);
  const isFloating = FLOATING_KEYWORDS.some((kw) =>
    normalized.includes(norm(kw)),
  );

  if (isFloating) {
    const candidates = TYPEB_ITEMS.filter((item) =>
      item.floatingGoods.some((fg) => {
        const nfg = norm(fg);
        return normalized.includes(nfg) || nfg.includes(normalized);
      }),
    );
    return {
      route: "typeB",
      candidates: candidates.length > 0 ? candidates : suggestByGroup(),
      reason: "Hàng trôi nổi — cần xác định mục đích chi tiêu để chọn TK đúng",
    };
  }

  if (hasTypeAExactMatch) {
    return { route: "typeA", reason: "Khớp mặt hàng rõ bản chất trong thư viện" };
  }

  return { route: "unknown", reason: "Không xác định — cần KTV phân loại" };
}

/** Fallback: trả về các mục đích phổ biến nhất */
function suggestByGroup(): TypeBItem[] {
  const commonCodes = [
    "CP-TK-TIEPKHACH",
    "CP-PL-LIENHOAN",
    "CP-VH-TRANGTRI-SK",
    "CP-TK-QUAKHACH",
  ];
  return TYPEB_ITEMS.filter((i) => commonCodes.includes(i.code));
}

export function getTypeBItem(code: string): TypeBItem | undefined {
  return TYPEB_ITEMS.find((i) => i.code === code);
}

export function searchTypeB(query: string): TypeBItem[] {
  const q = norm(query);
  if (!q) return TYPEB_ITEMS;
  return TYPEB_ITEMS.filter((item) => {
    const hay = norm(
      [item.name, item.nameEn, ...item.aliases, ...item.floatingGoods].join(" "),
    );
    return hay.includes(q);
  });
}

/** Map TK Loại B → LineKind cho resolve-line-kind.server.ts */
export function typeBAccountToLineKind(
  account: string,
): "goods" | "ccdc" | "asset" | "service" {
  if (account === "153") return "ccdc";
  if (account === "211" || account === "213") return "asset";
  if (account === "152" || account === "156" || account === "155") return "goods";
  return "service"; // 642x, 627x, 641x, 811, 242 → service
}
