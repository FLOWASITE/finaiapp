// ============================================================
// VSIC 2025 — Hệ thống ngành kinh tế Việt Nam
// ============================================================
// Nguồn: Quyết định 36/2025/QĐ-TTg ngày 29/9/2025
// Hiệu lực: 15/11/2025 — thay thế VSIC 2018 (Quyết định 27/2018)
//
// Cấu trúc chính thức:
//   L1: 22 ngành (A-V) — primary classification trong FinAI
//   L2: 87 ngành (mã 2 số)  — dataset có 88 (do split)
//   L3: 259 ngành (mã 3 số) — dataset chọn lọc 158 phổ biến cho DN
//   L4: 495 ngành (mã 4 số) — dataset chọn lọc 91 phổ biến cho DN
//   L5: 743 ngành (mã 5 số) — không bao gồm (quá chi tiết cho SMB)
//
// Mã L1: 1 chữ cái. L2-L5: 2-5 chữ số.
// DN chọn 1 ngành L1 (chính) khi onboarding; có thể drill-down L2-L4.
// ============================================================

export const VSIC_2025_META = {
  source: "Quyết định 36/2025/QĐ-TTg",
  effectiveDate: "2025-11-15",
  replaces: "Quyết định 27/2018/QĐ-TTg",
} as const;

export type VsicL1Code =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"
  | "K" | "L" | "M" | "N" | "O" | "P" | "Q" | "R" | "S" | "T"
  | "U" | "V";

export interface VsicL1Industry {
  code: VsicL1Code;
  nameVi: string;
  nameViShort: string;
  nameEn: string;
  description: string;
  icon: string;
  finaiSupported: boolean;
  finaiOverlaySlug?: string;
  /** P/U/V không áp dụng cho DN tư nhân */
  nonBusiness?: boolean;
}

export const VSIC_2025_LEVEL1: VsicL1Industry[] = [
  { code: "A", nameVi: "Nông nghiệp, lâm nghiệp và thủy sản", nameViShort: "Nông – Lâm – Thủy sản", nameEn: "Agriculture, forestry and fishing", description: "Trồng trọt, chăn nuôi, lâm nghiệp, đánh bắt và nuôi trồng thủy sản", icon: "Wheat", finaiSupported: false },
  { code: "B", nameVi: "Khai khoáng", nameViShort: "Khai khoáng", nameEn: "Mining and quarrying", description: "Khai thác than, dầu khí, quặng kim loại, đá, cát, muối", icon: "Pickaxe", finaiSupported: false },
  { code: "C", nameVi: "Công nghiệp chế biến, chế tạo", nameViShort: "Sản xuất – Chế tạo", nameEn: "Manufacturing", description: "Sản xuất thực phẩm, dệt may, điện tử, máy móc, ô tô, hóa chất, đồ gia dụng", icon: "Factory", finaiSupported: true, finaiOverlaySlug: "manufacturing" },
  { code: "D", nameVi: "Sản xuất và phân phối điện, khí đốt, nước nóng, hơi nước và điều hoà không khí", nameViShort: "Điện – Khí – Hơi nước", nameEn: "Electricity, gas, steam and air conditioning supply", description: "Phát điện, truyền tải/phân phối điện, kinh doanh khí đốt qua đường ống", icon: "Zap", finaiSupported: false },
  { code: "E", nameVi: "Cung cấp nước; hoạt động quản lý và xử lý rác thải, nước thải", nameViShort: "Nước – Rác thải", nameEn: "Water supply; sewerage, waste management", description: "Khai thác, xử lý và cung cấp nước; thu gom, xử lý rác thải/nước thải", icon: "Recycle", finaiSupported: false },
  { code: "F", nameVi: "Xây dựng", nameViShort: "Xây dựng", nameEn: "Construction", description: "Xây dựng công trình dân dụng, công nghiệp, hạ tầng; thi công, hoàn thiện", icon: "HardHat", finaiSupported: false },
  { code: "G", nameVi: "Bán buôn và bán lẻ; sửa chữa ô tô, mô tô, xe máy và xe có động cơ khác", nameViShort: "Bán buôn – Bán lẻ – TMĐT", nameEn: "Wholesale and retail trade; repair of motor vehicles", description: "Bán buôn, bán lẻ, thương mại điện tử (e-commerce), sửa chữa ô tô xe máy", icon: "ShoppingBag", finaiSupported: true, finaiOverlaySlug: "retail" },
  { code: "H", nameVi: "Vận tải, kho bãi", nameViShort: "Vận tải – Kho bãi", nameEn: "Transportation and storage", description: "Vận tải đường bộ/sắt/biển/hàng không, kho bãi, dịch vụ logistics", icon: "Truck", finaiSupported: false },
  { code: "I", nameVi: "Dịch vụ lưu trú và ăn uống", nameViShort: "F&B – Nhà hàng – Lưu trú", nameEn: "Accommodation and food service activities", description: "Khách sạn, nhà hàng, quán ăn, cafe, bar, dịch vụ ăn uống", icon: "UtensilsCrossed", finaiSupported: true, finaiOverlaySlug: "fnb" },
  { code: "J", nameVi: "Hoạt động xuất bản, phát sóng, sản xuất và phân phối nội dung", nameViShort: "Xuất bản – Phát sóng – Content", nameEn: "Publishing, broadcasting, content production and distribution", description: "Xuất bản sách báo, sản xuất phim, phát thanh truyền hình, nội dung số", icon: "Newspaper", finaiSupported: false },
  { code: "K", nameVi: "Hoạt động viễn thông; lập trình máy tính, tư vấn, cơ sở hạ tầng máy tính và các dịch vụ thông tin khác", nameViShort: "Viễn thông – CNTT – SaaS", nameEn: "Telecommunications, programming, computer infrastructure and information services", description: "Viễn thông, lập trình phần mềm, SaaS, hosting, dịch vụ dữ liệu (NEW VSIC 2025)", icon: "Laptop", finaiSupported: false },
  { code: "L", nameVi: "Hoạt động tài chính, ngân hàng và bảo hiểm", nameViShort: "Tài chính – Ngân hàng – Bảo hiểm", nameEn: "Financial and insurance activities", description: "Ngân hàng, công ty tài chính, bảo hiểm, chứng khoán, fintech", icon: "Landmark", finaiSupported: false },
  { code: "M", nameVi: "Hoạt động kinh doanh bất động sản", nameViShort: "Bất động sản", nameEn: "Real estate activities", description: "Chủ đầu tư BĐS, môi giới BĐS, cho thuê BĐS, quản lý dự án", icon: "Home", finaiSupported: true, finaiOverlaySlug: "realestate" },
  { code: "N", nameVi: "Hoạt động chuyên môn, khoa học và công nghệ", nameViShort: "Chuyên môn – KHCN", nameEn: "Professional, scientific and technical activities", description: "Luật, kế toán/kiểm toán, tư vấn quản lý, kiến trúc – kỹ thuật, NCKH, quảng cáo", icon: "Briefcase", finaiSupported: false },
  { code: "O", nameVi: "Hoạt động hành chính và dịch vụ hỗ trợ", nameViShort: "Hành chính – Hỗ trợ", nameEn: "Administrative and support service activities", description: "Cho thuê thiết bị, du lịch, dịch vụ tuyển dụng, vệ sinh, an ninh, tổ chức sự kiện", icon: "Settings", finaiSupported: false },
  { code: "P", nameVi: "Hoạt động của Đảng cộng sản, tổ chức chính trị - xã hội, quản lý nhà nước, an ninh quốc phòng; bảo đảm xã hội bắt buộc", nameViShort: "QLNN – Đảng – Đoàn thể", nameEn: "Public administration and defence", description: "Cơ quan nhà nước, quốc phòng, an ninh, BHXH (KHÔNG áp dụng cho DN tư nhân)", icon: "Building", finaiSupported: false, nonBusiness: true },
  { code: "Q", nameVi: "Giáo dục và đào tạo", nameViShort: "Giáo dục – Đào tạo", nameEn: "Education", description: "Trường học mầm non/phổ thông/đại học, trung tâm ngoại ngữ, dạy nghề, đào tạo", icon: "GraduationCap", finaiSupported: true, finaiOverlaySlug: "education" },
  { code: "R", nameVi: "Y tế và hoạt động trợ giúp xã hội", nameViShort: "Y tế – Trợ giúp xã hội", nameEn: "Human health and social work activities", description: "Bệnh viện, phòng khám, nhà thuốc, dịch vụ chăm sóc người già, trẻ em", icon: "Stethoscope", finaiSupported: true, finaiOverlaySlug: "healthcare" },
  { code: "S", nameVi: "Nghệ thuật, thể thao và giải trí", nameViShort: "Nghệ thuật – Thể thao – Giải trí", nameEn: "Arts, sports and recreation", description: "Biểu diễn nghệ thuật, thư viện, bảo tàng, casino, thể thao, vui chơi giải trí", icon: "Music", finaiSupported: false },
  { code: "T", nameVi: "Hoạt động dịch vụ khác", nameViShort: "Dịch vụ khác (Spa, Sửa chữa)", nameEn: "Other service activities", description: "Spa, làm đẹp, thẩm mỹ viện, sửa chữa máy tính/đồ gia dụng, dịch vụ tang lễ", icon: "Sparkles", finaiSupported: false },
  { code: "U", nameVi: "Hoạt động làm thuê các công việc trong các hộ gia đình, sản xuất sản phẩm vật chất và dịch vụ tự tiêu dùng của hộ gia đình", nameViShort: "Lao động hộ gia đình", nameEn: "Activities of households as employers", description: "Giúp việc gia đình, hoạt động tự cung tự cấp (KHÔNG áp dụng cho DN)", icon: "Users", finaiSupported: false, nonBusiness: true },
  { code: "V", nameVi: "Hoạt động của các tổ chức và cơ quan quốc tế", nameViShort: "Tổ chức quốc tế", nameEn: "Activities of extraterritorial organizations", description: "Đại sứ quán, lãnh sự quán, tổ chức quốc tế (NEW VSIC 2025 — KHÔNG áp dụng cho DN VN)", icon: "Globe", finaiSupported: false, nonBusiness: true },
];

// ============================================================
// L2-L4 nodes (flat list, parent lookup by parentCode)
// ============================================================

export interface VsicNode {
  code: string;          // "55" | "551" | "5510"
  level: 2 | 3 | 4 | 5;
  parentCode: string;    // L2 → L1 (chữ cái); L3 → L2 (2 số); L4 → L3 (3 số)
  nameVi: string;
}

export const VSIC_2025_NODES: VsicNode[] = [
  // ===== L2 (88 ngành) =====
  { code: "01", level: 2, parentCode: "A", nameVi: "Nông nghiệp và hoạt động dịch vụ có liên quan" },
  { code: "02", level: 2, parentCode: "A", nameVi: "Lâm nghiệp và hoạt động dịch vụ có liên quan" },
  { code: "03", level: 2, parentCode: "A", nameVi: "Khai thác, nuôi trồng thuỷ sản" },
  { code: "05", level: 2, parentCode: "B", nameVi: "Khai thác than cứng và than non" },
  { code: "06", level: 2, parentCode: "B", nameVi: "Khai thác dầu thô và khí đốt tự nhiên" },
  { code: "07", level: 2, parentCode: "B", nameVi: "Khai thác quặng kim loại" },
  { code: "08", level: 2, parentCode: "B", nameVi: "Khai khoáng khác" },
  { code: "09", level: 2, parentCode: "B", nameVi: "Hoạt động dịch vụ hỗ trợ khai thác mỏ và quặng" },
  { code: "10", level: 2, parentCode: "C", nameVi: "Sản xuất chế biến thực phẩm" },
  { code: "11", level: 2, parentCode: "C", nameVi: "Sản xuất đồ uống" },
  { code: "12", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm thuốc lá" },
  { code: "13", level: 2, parentCode: "C", nameVi: "Dệt" },
  { code: "14", level: 2, parentCode: "C", nameVi: "Sản xuất trang phục" },
  { code: "15", level: 2, parentCode: "C", nameVi: "Sản xuất da và các sản phẩm có liên quan" },
  { code: "16", level: 2, parentCode: "C", nameVi: "Chế biến gỗ và sản xuất sản phẩm từ gỗ, tre, nứa (trừ giường, tủ, bàn, ghế); sản xuất sản phẩm từ rơm, rạ và vật liệu tết bện" },
  { code: "17", level: 2, parentCode: "C", nameVi: "Sản xuất giấy và sản phẩm từ giấy" },
  { code: "18", level: 2, parentCode: "C", nameVi: "In, sao chép bản ghi các loại" },
  { code: "19", level: 2, parentCode: "C", nameVi: "Sản xuất than cốc, sản phẩm dầu mỏ tinh chế" },
  { code: "20", level: 2, parentCode: "C", nameVi: "Sản xuất hoá chất và sản phẩm hoá chất" },
  { code: "21", level: 2, parentCode: "C", nameVi: "Sản xuất thuốc, hoá dược và dược liệu" },
  { code: "22", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ cao su và plastic" },
  { code: "23", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ khoáng phi kim loại khác" },
  { code: "24", level: 2, parentCode: "C", nameVi: "Sản xuất kim loại" },
  { code: "25", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ kim loại đúc sẵn (trừ máy móc, thiết bị)" },
  { code: "26", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm điện tử, máy vi tính và sản phẩm quang học" },
  { code: "27", level: 2, parentCode: "C", nameVi: "Sản xuất thiết bị điện" },
  { code: "28", level: 2, parentCode: "C", nameVi: "Sản xuất máy móc, thiết bị chưa được phân vào đâu" },
  { code: "29", level: 2, parentCode: "C", nameVi: "Sản xuất ô tô và xe có động cơ khác" },
  { code: "30", level: 2, parentCode: "C", nameVi: "Sản xuất phương tiện vận tải khác" },
  { code: "31", level: 2, parentCode: "C", nameVi: "Sản xuất giường, tủ, bàn, ghế" },
  { code: "32", level: 2, parentCode: "C", nameVi: "Công nghiệp chế biến, chế tạo khác" },
  { code: "33", level: 2, parentCode: "C", nameVi: "Sửa chữa, bảo dưỡng và lắp đặt máy móc và thiết bị" },
  { code: "35", level: 2, parentCode: "D", nameVi: "Sản xuất và phân phối điện, khí đốt, nước nóng, hơi nước và điều hoà không khí" },
  { code: "36", level: 2, parentCode: "E", nameVi: "Khai thác, xử lý và cung cấp nước" },
  { code: "37", level: 2, parentCode: "E", nameVi: "Thoát nước và xử lý nước thải" },
  { code: "38", level: 2, parentCode: "E", nameVi: "Hoạt động thu gom, xử lý và tiêu huỷ rác thải; tái chế phế liệu" },
  { code: "39", level: 2, parentCode: "E", nameVi: "Xử lý ô nhiễm và hoạt động quản lý chất thải khác" },
  { code: "41", level: 2, parentCode: "F", nameVi: "Xây dựng nhà các loại" },
  { code: "42", level: 2, parentCode: "F", nameVi: "Xây dựng công trình kỹ thuật dân dụng" },
  { code: "43", level: 2, parentCode: "F", nameVi: "Hoạt động xây dựng chuyên dụng" },
  { code: "45", level: 2, parentCode: "G", nameVi: "Bán, sửa chữa ô tô, mô tô, xe máy và xe có động cơ khác" },
  { code: "46", level: 2, parentCode: "G", nameVi: "Bán buôn (trừ ô tô, mô tô, xe máy và xe có động cơ khác)" },
  { code: "47", level: 2, parentCode: "G", nameVi: "Bán lẻ (trừ ô tô, mô tô, xe máy và xe có động cơ khác)" },
  { code: "49", level: 2, parentCode: "H", nameVi: "Vận tải đường sắt, đường bộ và vận tải đường ống" },
  { code: "50", level: 2, parentCode: "H", nameVi: "Vận tải đường thủy" },
  { code: "51", level: 2, parentCode: "H", nameVi: "Vận tải hàng không" },
  { code: "52", level: 2, parentCode: "H", nameVi: "Kho bãi và các hoạt động hỗ trợ cho vận tải" },
  { code: "53", level: 2, parentCode: "H", nameVi: "Bưu chính và chuyển phát" },
  { code: "55", level: 2, parentCode: "I", nameVi: "Dịch vụ lưu trú" },
  { code: "56", level: 2, parentCode: "I", nameVi: "Dịch vụ ăn uống" },
  { code: "58", level: 2, parentCode: "J", nameVi: "Hoạt động xuất bản" },
  { code: "59", level: 2, parentCode: "J", nameVi: "Hoạt động điện ảnh, sản xuất chương trình truyền hình, ghi âm và xuất bản âm nhạc" },
  { code: "60", level: 2, parentCode: "J", nameVi: "Hoạt động phát thanh, truyền hình" },
  { code: "61", level: 2, parentCode: "K", nameVi: "Viễn thông" },
  { code: "62", level: 2, parentCode: "K", nameVi: "Lập trình máy vi tính, dịch vụ tư vấn và các hoạt động khác liên quan đến máy vi tính" },
  { code: "63", level: 2, parentCode: "K", nameVi: "Hoạt động dịch vụ thông tin" },
  { code: "64", level: 2, parentCode: "L", nameVi: "Hoạt động dịch vụ tài chính (trừ bảo hiểm và bảo hiểm xã hội)" },
  { code: "65", level: 2, parentCode: "L", nameVi: "Bảo hiểm, tái bảo hiểm và bảo hiểm xã hội (trừ bảo đảm xã hội bắt buộc)" },
  { code: "66", level: 2, parentCode: "L", nameVi: "Hoạt động tài chính khác" },
  { code: "68", level: 2, parentCode: "M", nameVi: "Hoạt động kinh doanh bất động sản" },
  { code: "69", level: 2, parentCode: "N", nameVi: "Hoạt động pháp luật, kế toán và kiểm toán" },
  { code: "70", level: 2, parentCode: "N", nameVi: "Hoạt động của trụ sở văn phòng; hoạt động tư vấn quản lý" },
  { code: "71", level: 2, parentCode: "N", nameVi: "Hoạt động kiến trúc; kiểm tra và phân tích kỹ thuật" },
  { code: "72", level: 2, parentCode: "N", nameVi: "Nghiên cứu khoa học và phát triển" },
  { code: "73", level: 2, parentCode: "N", nameVi: "Quảng cáo và nghiên cứu thị trường" },
  { code: "74", level: 2, parentCode: "N", nameVi: "Hoạt động chuyên môn, khoa học và công nghệ khác" },
  { code: "75", level: 2, parentCode: "N", nameVi: "Hoạt động thú y" },
  { code: "77", level: 2, parentCode: "O", nameVi: "Cho thuê máy móc, thiết bị (không kèm người điều khiển); cho thuê đồ dùng cá nhân và gia đình; cho thuê tài sản vô hình phi tài chính" },
  { code: "78", level: 2, parentCode: "O", nameVi: "Hoạt động dịch vụ lao động và việc làm" },
  { code: "79", level: 2, parentCode: "O", nameVi: "Hoạt động của các đại lý du lịch, kinh doanh tua du lịch và các dịch vụ hỗ trợ, liên quan đến quảng bá và tổ chức tua du lịch" },
  { code: "80", level: 2, parentCode: "O", nameVi: "Hoạt động điều tra bảo đảm an toàn" },
  { code: "81", level: 2, parentCode: "O", nameVi: "Hoạt động dịch vụ vệ sinh nhà cửa, công trình và cảnh quan" },
  { code: "82", level: 2, parentCode: "O", nameVi: "Hoạt động hành chính, hỗ trợ văn phòng và các hoạt động hỗ trợ kinh doanh khác" },
  { code: "84", level: 2, parentCode: "P", nameVi: "Hoạt động của Đảng cộng sản, tổ chức chính trị - xã hội, quản lý nhà nước, an ninh quốc phòng; bảo đảm xã hội bắt buộc" },
  { code: "85", level: 2, parentCode: "Q", nameVi: "Giáo dục và đào tạo" },
  { code: "86", level: 2, parentCode: "R", nameVi: "Hoạt động y tế" },
  { code: "87", level: 2, parentCode: "R", nameVi: "Hoạt động chăm sóc, điều dưỡng tập trung" },
  { code: "88", level: 2, parentCode: "R", nameVi: "Hoạt động trợ giúp xã hội không tập trung" },
  { code: "90", level: 2, parentCode: "S", nameVi: "Hoạt động sáng tác, nghệ thuật và giải trí" },
  { code: "91", level: 2, parentCode: "S", nameVi: "Hoạt động của thư viện, lưu trữ, bảo tàng và các hoạt động văn hóa khác" },
  { code: "92", level: 2, parentCode: "S", nameVi: "Hoạt động xổ số, cá cược và đánh bạc" },
  { code: "93", level: 2, parentCode: "S", nameVi: "Hoạt động thể thao, vui chơi và giải trí" },
  { code: "94", level: 2, parentCode: "T", nameVi: "Hoạt động của các hiệp hội, tổ chức khác" },
  { code: "95", level: 2, parentCode: "T", nameVi: "Sửa chữa máy vi tính, đồ dùng cá nhân và gia đình" },
  { code: "96", level: 2, parentCode: "T", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác" },
  { code: "97", level: 2, parentCode: "U", nameVi: "Hoạt động làm thuê các công việc gia đình trong các hộ gia đình" },
  { code: "98", level: 2, parentCode: "U", nameVi: "Hoạt động không phân biệt của hộ gia đình sản xuất sản phẩm vật chất và dịch vụ tự tiêu dùng" },
  { code: "99", level: 2, parentCode: "V", nameVi: "Hoạt động của các tổ chức và cơ quan quốc tế" },

  // ===== L3 (158 ngành) =====
  { code: "011", level: 3, parentCode: "01", nameVi: "Trồng cây hàng năm" },
  { code: "012", level: 3, parentCode: "01", nameVi: "Trồng cây lâu năm" },
  { code: "013", level: 3, parentCode: "01", nameVi: "Nhân và chăm sóc cây giống nông nghiệp" },
  { code: "014", level: 3, parentCode: "01", nameVi: "Chăn nuôi" },
  { code: "015", level: 3, parentCode: "01", nameVi: "Trồng trọt, chăn nuôi hỗn hợp" },
  { code: "016", level: 3, parentCode: "01", nameVi: "Hoạt động dịch vụ nông nghiệp" },
  { code: "017", level: 3, parentCode: "01", nameVi: "Săn bắt, đánh bẫy và hoạt động dịch vụ có liên quan" },
  { code: "021", level: 3, parentCode: "02", nameVi: "Trồng rừng và chăm sóc rừng" },
  { code: "022", level: 3, parentCode: "02", nameVi: "Khai thác gỗ và lâm sản khác (trừ gỗ)" },
  { code: "023", level: 3, parentCode: "02", nameVi: "Thu nhặt sản phẩm từ rừng không phải gỗ và lâm sản khác" },
  { code: "024", level: 3, parentCode: "02", nameVi: "Hoạt động dịch vụ lâm nghiệp" },
  { code: "031", level: 3, parentCode: "03", nameVi: "Khai thác thuỷ sản" },
  { code: "032", level: 3, parentCode: "03", nameVi: "Nuôi trồng thuỷ sản" },
  { code: "101", level: 3, parentCode: "10", nameVi: "Chế biến, bảo quản thịt và các sản phẩm từ thịt" },
  { code: "102", level: 3, parentCode: "10", nameVi: "Chế biến, bảo quản thuỷ sản và các sản phẩm từ thuỷ sản" },
  { code: "103", level: 3, parentCode: "10", nameVi: "Chế biến và bảo quản rau quả" },
  { code: "104", level: 3, parentCode: "10", nameVi: "Sản xuất dầu, mỡ động, thực vật" },
  { code: "105", level: 3, parentCode: "10", nameVi: "Chế biến sữa và các sản phẩm từ sữa" },
  { code: "106", level: 3, parentCode: "10", nameVi: "Xay xát và sản xuất bột thô" },
  { code: "107", level: 3, parentCode: "10", nameVi: "Sản xuất thực phẩm khác" },
  { code: "108", level: 3, parentCode: "10", nameVi: "Sản xuất thức ăn gia súc, gia cầm và thuỷ sản" },
  { code: "110", level: 3, parentCode: "11", nameVi: "Sản xuất đồ uống" },
  { code: "131", level: 3, parentCode: "13", nameVi: "Sản xuất sợi, vải dệt thoi và hoàn thiện sản phẩm dệt" },
  { code: "139", level: 3, parentCode: "13", nameVi: "Sản xuất hàng dệt khác" },
  { code: "141", level: 3, parentCode: "14", nameVi: "May trang phục (trừ trang phục từ da lông thú)" },
  { code: "142", level: 3, parentCode: "14", nameVi: "Sản xuất sản phẩm từ da lông thú" },
  { code: "143", level: 3, parentCode: "14", nameVi: "Sản xuất trang phục dệt kim, đan móc" },
  { code: "251", level: 3, parentCode: "25", nameVi: "Sản xuất sản phẩm từ kim loại đúc sẵn" },
  { code: "259", level: 3, parentCode: "25", nameVi: "Sản xuất sản phẩm khác bằng kim loại" },
  { code: "310", level: 3, parentCode: "31", nameVi: "Sản xuất giường, tủ, bàn, ghế" },
  { code: "321", level: 3, parentCode: "32", nameVi: "Sản xuất đồ kim hoàn, đồ giả kim hoàn và các chi tiết liên quan" },
  { code: "410", level: 3, parentCode: "41", nameVi: "Xây dựng nhà các loại" },
  { code: "421", level: 3, parentCode: "42", nameVi: "Xây dựng công trình đường sắt và đường bộ" },
  { code: "422", level: 3, parentCode: "42", nameVi: "Xây dựng công trình công ích" },
  { code: "429", level: 3, parentCode: "42", nameVi: "Xây dựng công trình kỹ thuật dân dụng khác" },
  { code: "431", level: 3, parentCode: "43", nameVi: "Phá dỡ và chuẩn bị mặt bằng" },
  { code: "432", level: 3, parentCode: "43", nameVi: "Lắp đặt hệ thống điện, hệ thống cấp thoát nước và lắp đặt xây dựng khác" },
  { code: "433", level: 3, parentCode: "43", nameVi: "Hoàn thiện công trình xây dựng" },
  { code: "439", level: 3, parentCode: "43", nameVi: "Hoạt động xây dựng chuyên dụng khác" },
  { code: "451", level: 3, parentCode: "45", nameVi: "Bán, bảo dưỡng và sửa chữa ô tô và xe có động cơ khác" },
  { code: "452", level: 3, parentCode: "45", nameVi: "Bán phụ tùng và các bộ phận phụ trợ của ô tô và xe có động cơ khác" },
  { code: "453", level: 3, parentCode: "45", nameVi: "Bán, bảo dưỡng và sửa chữa mô tô, xe máy, phụ tùng và các bộ phận phụ trợ của mô tô, xe máy" },
  { code: "461", level: 3, parentCode: "46", nameVi: "Đại lý, môi giới, đấu giá hàng hoá" },
  { code: "462", level: 3, parentCode: "46", nameVi: "Bán buôn nông, lâm sản nguyên liệu (trừ gỗ, tre, nứa) và động vật sống" },
  { code: "463", level: 3, parentCode: "46", nameVi: "Bán buôn thực phẩm, đồ uống và sản phẩm thuốc lá, thuốc lào" },
  { code: "464", level: 3, parentCode: "46", nameVi: "Bán buôn đồ dùng gia đình" },
  { code: "465", level: 3, parentCode: "46", nameVi: "Bán buôn máy móc, thiết bị và phụ tùng máy khác" },
  { code: "466", level: 3, parentCode: "46", nameVi: "Bán buôn chuyên doanh khác" },
  { code: "469", level: 3, parentCode: "46", nameVi: "Bán buôn tổng hợp" },
  { code: "471", level: 3, parentCode: "47", nameVi: "Bán lẻ trong các cửa hàng kinh doanh tổng hợp" },
  { code: "472", level: 3, parentCode: "47", nameVi: "Bán lẻ lương thực, thực phẩm, đồ uống, thuốc lá, thuốc lào chiếm tỷ trọng lớn trong các cửa hàng chuyên doanh" },
  { code: "473", level: 3, parentCode: "47", nameVi: "Bán lẻ nhiên liệu động cơ trong các cửa hàng chuyên doanh" },
  { code: "474", level: 3, parentCode: "47", nameVi: "Bán lẻ thiết bị công nghệ thông tin liên lạc trong các cửa hàng chuyên doanh" },
  { code: "475", level: 3, parentCode: "47", nameVi: "Bán lẻ thiết bị gia đình khác trong các cửa hàng chuyên doanh" },
  { code: "476", level: 3, parentCode: "47", nameVi: "Bán lẻ hàng văn hoá, giải trí trong các cửa hàng chuyên doanh" },
  { code: "477", level: 3, parentCode: "47", nameVi: "Bán lẻ hàng hoá khác trong các cửa hàng chuyên doanh" },
  { code: "478", level: 3, parentCode: "47", nameVi: "Bán lẻ lưu động hoặc tại chợ" },
  { code: "479", level: 3, parentCode: "47", nameVi: "Bán lẻ hình thức khác (TMĐT, mail order)" },
  { code: "491", level: 3, parentCode: "49", nameVi: "Vận tải đường sắt" },
  { code: "492", level: 3, parentCode: "49", nameVi: "Vận tải bằng xe buýt" },
  { code: "493", level: 3, parentCode: "49", nameVi: "Vận tải đường bộ khác" },
  { code: "494", level: 3, parentCode: "49", nameVi: "Vận tải đường ống" },
  { code: "521", level: 3, parentCode: "52", nameVi: "Kho bãi và lưu giữ hàng hoá" },
  { code: "522", level: 3, parentCode: "52", nameVi: "Hoạt động dịch vụ hỗ trợ cho vận tải" },
  { code: "531", level: 3, parentCode: "53", nameVi: "Bưu chính" },
  { code: "532", level: 3, parentCode: "53", nameVi: "Chuyển phát" },
  { code: "551", level: 3, parentCode: "55", nameVi: "Dịch vụ lưu trú ngắn ngày" },
  { code: "552", level: 3, parentCode: "55", nameVi: "Cơ sở lưu trú khác" },
  { code: "559", level: 3, parentCode: "55", nameVi: "Hoạt động cung cấp dịch vụ lưu trú khác" },
  { code: "561", level: 3, parentCode: "56", nameVi: "Nhà hàng và các dịch vụ ăn uống phục vụ lưu động" },
  { code: "562", level: 3, parentCode: "56", nameVi: "Cung cấp dịch vụ ăn uống theo hợp đồng không thường xuyên với khách hàng (phục vụ tiệc, hội họp, đám cưới...)" },
  { code: "563", level: 3, parentCode: "56", nameVi: "Dịch vụ phục vụ đồ uống" },
  { code: "581", level: 3, parentCode: "58", nameVi: "Xuất bản sách, ấn phẩm định kỳ và các hoạt động xuất bản khác" },
  { code: "582", level: 3, parentCode: "58", nameVi: "Xuất bản phần mềm" },
  { code: "591", level: 3, parentCode: "59", nameVi: "Hoạt động điện ảnh, sản xuất chương trình truyền hình, ghi âm và xuất bản âm nhạc" },
  { code: "592", level: 3, parentCode: "59", nameVi: "Hoạt động ghi âm và xuất bản âm nhạc" },
  { code: "601", level: 3, parentCode: "60", nameVi: "Hoạt động phát thanh" },
  { code: "602", level: 3, parentCode: "60", nameVi: "Hoạt động truyền hình và cung cấp chương trình thuê bao" },
  { code: "611", level: 3, parentCode: "61", nameVi: "Hoạt động viễn thông có dây" },
  { code: "612", level: 3, parentCode: "61", nameVi: "Hoạt động viễn thông không dây" },
  { code: "613", level: 3, parentCode: "61", nameVi: "Hoạt động viễn thông vệ tinh" },
  { code: "619", level: 3, parentCode: "61", nameVi: "Hoạt động viễn thông khác" },
  { code: "620", level: 3, parentCode: "62", nameVi: "Lập trình máy vi tính, dịch vụ tư vấn và các hoạt động khác liên quan đến máy vi tính" },
  { code: "631", level: 3, parentCode: "63", nameVi: "Xử lý dữ liệu, cho thuê và các hoạt động liên quan; cổng thông tin" },
  { code: "639", level: 3, parentCode: "63", nameVi: "Dịch vụ thông tin khác" },
  { code: "641", level: 3, parentCode: "64", nameVi: "Hoạt động trung gian tiền tệ (ngân hàng, quỹ tín dụng)" },
  { code: "642", level: 3, parentCode: "64", nameVi: "Hoạt động công ty nắm giữ tài sản" },
  { code: "643", level: 3, parentCode: "64", nameVi: "Quỹ tín thác, quỹ đầu tư và các hoạt động tài chính tương tự" },
  { code: "649", level: 3, parentCode: "64", nameVi: "Hoạt động dịch vụ tài chính khác (trừ bảo hiểm và bảo hiểm xã hội)" },
  { code: "651", level: 3, parentCode: "65", nameVi: "Bảo hiểm" },
  { code: "652", level: 3, parentCode: "65", nameVi: "Tái bảo hiểm" },
  { code: "653", level: 3, parentCode: "65", nameVi: "Bảo hiểm xã hội" },
  { code: "661", level: 3, parentCode: "66", nameVi: "Hoạt động hỗ trợ dịch vụ tài chính (trừ bảo hiểm và bảo hiểm xã hội)" },
  { code: "662", level: 3, parentCode: "66", nameVi: "Hoạt động hỗ trợ bảo hiểm và bảo hiểm xã hội" },
  { code: "663", level: 3, parentCode: "66", nameVi: "Hoạt động quản lý quỹ" },
  { code: "681", level: 3, parentCode: "68", nameVi: "Kinh doanh bất động sản, quyền sử dụng đất thuộc chủ sở hữu, chủ sử dụng hoặc đi thuê" },
  { code: "682", level: 3, parentCode: "68", nameVi: "Tư vấn, môi giới, đấu giá bất động sản, đấu giá quyền sử dụng đất" },
  { code: "691", level: 3, parentCode: "69", nameVi: "Hoạt động pháp luật" },
  { code: "692", level: 3, parentCode: "69", nameVi: "Hoạt động liên quan đến kế toán, kiểm toán và tư vấn về thuế" },
  { code: "701", level: 3, parentCode: "70", nameVi: "Hoạt động của trụ sở văn phòng" },
  { code: "702", level: 3, parentCode: "70", nameVi: "Hoạt động tư vấn quản lý" },
  { code: "711", level: 3, parentCode: "71", nameVi: "Hoạt động kiến trúc và tư vấn kỹ thuật có liên quan" },
  { code: "712", level: 3, parentCode: "71", nameVi: "Kiểm tra và phân tích kỹ thuật" },
  { code: "721", level: 3, parentCode: "72", nameVi: "Nghiên cứu khoa học và phát triển công nghệ trong lĩnh vực khoa học tự nhiên và kỹ thuật" },
  { code: "722", level: 3, parentCode: "72", nameVi: "Nghiên cứu khoa học và phát triển công nghệ trong lĩnh vực khoa học xã hội và nhân văn" },
  { code: "731", level: 3, parentCode: "73", nameVi: "Quảng cáo" },
  { code: "732", level: 3, parentCode: "73", nameVi: "Nghiên cứu thị trường và thăm dò dư luận" },
  { code: "741", level: 3, parentCode: "74", nameVi: "Hoạt động thiết kế chuyên dụng" },
  { code: "742", level: 3, parentCode: "74", nameVi: "Hoạt động nhiếp ảnh" },
  { code: "749", level: 3, parentCode: "74", nameVi: "Hoạt động chuyên môn, khoa học và công nghệ khác chưa được phân vào đâu" },
  { code: "750", level: 3, parentCode: "75", nameVi: "Hoạt động thú y" },
  { code: "771", level: 3, parentCode: "77", nameVi: "Cho thuê xe có động cơ" },
  { code: "772", level: 3, parentCode: "77", nameVi: "Cho thuê đồ dùng cá nhân và gia đình" },
  { code: "773", level: 3, parentCode: "77", nameVi: "Cho thuê máy móc, thiết bị và đồ dùng hữu hình khác không kèm người điều khiển" },
  { code: "774", level: 3, parentCode: "77", nameVi: "Cho thuê tài sản vô hình phi tài chính" },
  { code: "781", level: 3, parentCode: "78", nameVi: "Hoạt động của các trung tâm, đại lý tư vấn, giới thiệu và môi giới lao động, việc làm" },
  { code: "782", level: 3, parentCode: "78", nameVi: "Cung ứng lao động tạm thời" },
  { code: "783", level: 3, parentCode: "78", nameVi: "Cung ứng và quản lý nguồn lao động" },
  { code: "791", level: 3, parentCode: "79", nameVi: "Hoạt động của các đại lý du lịch, kinh doanh tua du lịch" },
  { code: "799", level: 3, parentCode: "79", nameVi: "Dịch vụ đặt chỗ và các dịch vụ liên quan đến quảng bá và tổ chức tua du lịch" },
  { code: "801", level: 3, parentCode: "80", nameVi: "Hoạt động bảo vệ cá nhân" },
  { code: "802", level: 3, parentCode: "80", nameVi: "Hoạt động dịch vụ hệ thống bảo đảm an toàn" },
  { code: "803", level: 3, parentCode: "80", nameVi: "Hoạt động điều tra" },
  { code: "811", level: 3, parentCode: "81", nameVi: "Dịch vụ hỗ trợ tổng hợp" },
  { code: "812", level: 3, parentCode: "81", nameVi: "Vệ sinh nhà cửa và công trình khác" },
  { code: "813", level: 3, parentCode: "81", nameVi: "Dịch vụ chăm sóc và duy trì cảnh quan" },
  { code: "821", level: 3, parentCode: "82", nameVi: "Hoạt động hành chính và hỗ trợ văn phòng" },
  { code: "822", level: 3, parentCode: "82", nameVi: "Hoạt động dịch vụ liên quan đến các cuộc gọi" },
  { code: "823", level: 3, parentCode: "82", nameVi: "Tổ chức giới thiệu và xúc tiến thương mại" },
  { code: "829", level: 3, parentCode: "82", nameVi: "Hoạt động dịch vụ hỗ trợ kinh doanh khác" },
  { code: "851", level: 3, parentCode: "85", nameVi: "Giáo dục mầm non" },
  { code: "852", level: 3, parentCode: "85", nameVi: "Giáo dục phổ thông" },
  { code: "853", level: 3, parentCode: "85", nameVi: "Giáo dục nghề nghiệp" },
  { code: "854", level: 3, parentCode: "85", nameVi: "Giáo dục đại học" },
  { code: "855", level: 3, parentCode: "85", nameVi: "Giáo dục khác" },
  { code: "856", level: 3, parentCode: "85", nameVi: "Hoạt động dịch vụ hỗ trợ giáo dục" },
  { code: "861", level: 3, parentCode: "86", nameVi: "Hoạt động của các bệnh viện, trạm y tế" },
  { code: "862", level: 3, parentCode: "86", nameVi: "Hoạt động của các phòng khám đa khoa, chuyên khoa và nha khoa" },
  { code: "869", level: 3, parentCode: "86", nameVi: "Hoạt động y tế khác" },
  { code: "871", level: 3, parentCode: "87", nameVi: "Hoạt động chăm sóc, điều dưỡng tập trung" },
  { code: "881", level: 3, parentCode: "88", nameVi: "Hoạt động trợ giúp xã hội không tập trung" },
  { code: "900", level: 3, parentCode: "90", nameVi: "Hoạt động sáng tác, nghệ thuật và giải trí" },
  { code: "910", level: 3, parentCode: "91", nameVi: "Hoạt động của thư viện, lưu trữ, bảo tàng và các hoạt động văn hoá khác" },
  { code: "920", level: 3, parentCode: "92", nameVi: "Hoạt động xổ số, cá cược và đánh bạc" },
  { code: "931", level: 3, parentCode: "93", nameVi: "Hoạt động thể thao" },
  { code: "932", level: 3, parentCode: "93", nameVi: "Hoạt động vui chơi giải trí khác" },
  { code: "941", level: 3, parentCode: "94", nameVi: "Hoạt động của các tổ chức kinh doanh, giới chủ và nghề nghiệp" },
  { code: "942", level: 3, parentCode: "94", nameVi: "Hoạt động của công đoàn" },
  { code: "949", level: 3, parentCode: "94", nameVi: "Hoạt động của các tổ chức khác" },
  { code: "951", level: 3, parentCode: "95", nameVi: "Sửa chữa máy vi tính và thiết bị liên lạc" },
  { code: "952", level: 3, parentCode: "95", nameVi: "Sửa chữa đồ dùng cá nhân và gia đình" },
  { code: "961", level: 3, parentCode: "96", nameVi: "Giặt là, làm sạch các sản phẩm dệt và lông thú" },
  { code: "962", level: 3, parentCode: "96", nameVi: "Hoạt động dịch vụ phục vụ tang lễ" },
  { code: "963", level: 3, parentCode: "96", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác (cắt tóc, làm đẹp, spa, mát-xa, thẩm mỹ viện...)" },
  { code: "970", level: 3, parentCode: "97", nameVi: "Hoạt động làm thuê các công việc gia đình trong các hộ gia đình" },
  { code: "981", level: 3, parentCode: "98", nameVi: "Hoạt động không phân biệt của hộ gia đình sản xuất sản phẩm vật chất tự tiêu dùng" },
  { code: "982", level: 3, parentCode: "98", nameVi: "Hoạt động không phân biệt của hộ gia đình sản xuất dịch vụ tự tiêu dùng" },
  { code: "990", level: 3, parentCode: "99", nameVi: "Hoạt động của các tổ chức và cơ quan quốc tế" },

  // ===== L4 (91 ngành) =====
  { code: "5510", level: 4, parentCode: "551", nameVi: "Dịch vụ lưu trú ngắn ngày (khách sạn, nhà nghỉ)" },
  { code: "5610", level: 4, parentCode: "561", nameVi: "Nhà hàng và các dịch vụ ăn uống phục vụ lưu động" },
  { code: "5621", level: 4, parentCode: "562", nameVi: "Cung cấp dịch vụ ăn uống theo hợp đồng không thường xuyên (phục vụ tiệc, hội họp, đám cưới)" },
  { code: "5629", level: 4, parentCode: "562", nameVi: "Dịch vụ ăn uống khác" },
  { code: "5630", level: 4, parentCode: "563", nameVi: "Dịch vụ phục vụ đồ uống (quán cà phê, bar)" },
  { code: "1010", level: 4, parentCode: "101", nameVi: "Chế biến, bảo quản thịt và các sản phẩm từ thịt" },
  { code: "1020", level: 4, parentCode: "102", nameVi: "Chế biến, bảo quản thuỷ sản và các sản phẩm từ thuỷ sản" },
  { code: "1030", level: 4, parentCode: "103", nameVi: "Chế biến và bảo quản rau quả" },
  { code: "1050", level: 4, parentCode: "105", nameVi: "Chế biến sữa và các sản phẩm từ sữa" },
  { code: "1071", level: 4, parentCode: "107", nameVi: "Sản xuất các loại bánh từ bột" },
  { code: "1074", level: 4, parentCode: "107", nameVi: "Sản xuất mì ống, mì sợi và sản phẩm tương tự" },
  { code: "1075", level: 4, parentCode: "107", nameVi: "Sản xuất món ăn, thức ăn chế biến sẵn" },
  { code: "1079", level: 4, parentCode: "107", nameVi: "Sản xuất thực phẩm khác chưa được phân vào đâu" },
  { code: "1101", level: 4, parentCode: "110", nameVi: "Chưng, tinh cất và pha chế các loại rượu mạnh" },
  { code: "1102", level: 4, parentCode: "110", nameVi: "Sản xuất rượu vang" },
  { code: "1103", level: 4, parentCode: "110", nameVi: "Sản xuất bia và mạch nha ủ men bia" },
  { code: "1104", level: 4, parentCode: "110", nameVi: "Sản xuất đồ uống không cồn, nước khoáng" },
  { code: "1410", level: 4, parentCode: "141", nameVi: "May trang phục (trừ trang phục từ da lông thú)" },
  { code: "1430", level: 4, parentCode: "143", nameVi: "Sản xuất trang phục dệt kim, đan móc" },
  { code: "2511", level: 4, parentCode: "251", nameVi: "Sản xuất các cấu kiện kim loại" },
  { code: "2512", level: 4, parentCode: "251", nameVi: "Sản xuất thùng, bể chứa và dụng cụ chứa đựng bằng kim loại" },
  { code: "2599", level: 4, parentCode: "259", nameVi: "Sản xuất sản phẩm khác bằng kim loại chưa được phân vào đâu" },
  { code: "3100", level: 4, parentCode: "310", nameVi: "Sản xuất giường, tủ, bàn, ghế" },
  { code: "4101", level: 4, parentCode: "410", nameVi: "Xây dựng nhà để ở" },
  { code: "4102", level: 4, parentCode: "410", nameVi: "Xây dựng nhà không để ở" },
  { code: "4211", level: 4, parentCode: "421", nameVi: "Xây dựng công trình đường sắt" },
  { code: "4212", level: 4, parentCode: "421", nameVi: "Xây dựng công trình đường bộ" },
  { code: "4221", level: 4, parentCode: "422", nameVi: "Xây dựng công trình điện" },
  { code: "4222", level: 4, parentCode: "422", nameVi: "Xây dựng công trình cấp, thoát nước" },
  { code: "4223", level: 4, parentCode: "422", nameVi: "Xây dựng công trình viễn thông, thông tin liên lạc" },
  { code: "4321", level: 4, parentCode: "432", nameVi: "Lắp đặt hệ thống điện" },
  { code: "4322", level: 4, parentCode: "432", nameVi: "Lắp đặt hệ thống cấp, thoát nước, lò sưởi và điều hoà không khí" },
  { code: "4329", level: 4, parentCode: "432", nameVi: "Lắp đặt hệ thống xây dựng khác" },
  { code: "4330", level: 4, parentCode: "433", nameVi: "Hoàn thiện công trình xây dựng" },
  { code: "4631", level: 4, parentCode: "463", nameVi: "Bán buôn gạo, lúa mỳ, hạt ngũ cốc khác, bột mỳ" },
  { code: "4632", level: 4, parentCode: "463", nameVi: "Bán buôn thực phẩm" },
  { code: "4633", level: 4, parentCode: "463", nameVi: "Bán buôn đồ uống" },
  { code: "4641", level: 4, parentCode: "464", nameVi: "Bán buôn vải, hàng may sẵn, giày dép" },
  { code: "4649", level: 4, parentCode: "464", nameVi: "Bán buôn đồ dùng khác cho gia đình" },
  { code: "4651", level: 4, parentCode: "465", nameVi: "Bán buôn máy vi tính, thiết bị ngoại vi và phần mềm" },
  { code: "4652", level: 4, parentCode: "465", nameVi: "Bán buôn linh kiện điện tử, viễn thông" },
  { code: "4711", level: 4, parentCode: "471", nameVi: "Bán lẻ lương thực, thực phẩm, đồ uống, thuốc lá, thuốc lào chiếm tỷ trọng lớn trong các cửa hàng kinh doanh tổng hợp" },
  { code: "4719", level: 4, parentCode: "471", nameVi: "Bán lẻ khác trong các cửa hàng kinh doanh tổng hợp" },
  { code: "4741", level: 4, parentCode: "474", nameVi: "Bán lẻ máy vi tính, thiết bị ngoại vi, phần mềm và thiết bị viễn thông trong các cửa hàng chuyên doanh" },
  { code: "4742", level: 4, parentCode: "474", nameVi: "Bán lẻ thiết bị nghe nhìn trong các cửa hàng chuyên doanh" },
  { code: "4791", level: 4, parentCode: "479", nameVi: "Bán lẻ theo yêu cầu đặt hàng qua bưu điện hoặc internet (e-commerce)" },
  { code: "4799", level: 4, parentCode: "479", nameVi: "Bán lẻ hình thức khác chưa được phân vào đâu" },
  { code: "6201", level: 4, parentCode: "620", nameVi: "Lập trình máy vi tính" },
  { code: "6202", level: 4, parentCode: "620", nameVi: "Tư vấn máy vi tính và quản trị hệ thống máy vi tính" },
  { code: "6209", level: 4, parentCode: "620", nameVi: "Hoạt động dịch vụ công nghệ thông tin và dịch vụ khác liên quan đến máy vi tính" },
  { code: "6311", level: 4, parentCode: "631", nameVi: "Xử lý dữ liệu, cho thuê và các hoạt động liên quan" },
  { code: "6312", level: 4, parentCode: "631", nameVi: "Cổng thông tin" },
  { code: "6391", level: 4, parentCode: "639", nameVi: "Hoạt động thông tấn" },
  { code: "6399", level: 4, parentCode: "639", nameVi: "Dịch vụ thông tin khác chưa được phân vào đâu" },
  { code: "6810", level: 4, parentCode: "681", nameVi: "Kinh doanh bất động sản, quyền sử dụng đất thuộc chủ sở hữu, chủ sử dụng hoặc đi thuê" },
  { code: "6820", level: 4, parentCode: "682", nameVi: "Tư vấn, môi giới, đấu giá bất động sản, đấu giá quyền sử dụng đất" },
  { code: "6910", level: 4, parentCode: "691", nameVi: "Hoạt động pháp luật" },
  { code: "6920", level: 4, parentCode: "692", nameVi: "Hoạt động liên quan đến kế toán, kiểm toán và tư vấn về thuế" },
  { code: "7020", level: 4, parentCode: "702", nameVi: "Hoạt động tư vấn quản lý" },
  { code: "7110", level: 4, parentCode: "711", nameVi: "Hoạt động kiến trúc và tư vấn kỹ thuật có liên quan" },
  { code: "7310", level: 4, parentCode: "731", nameVi: "Quảng cáo" },
  { code: "7320", level: 4, parentCode: "732", nameVi: "Nghiên cứu thị trường và thăm dò dư luận" },
  { code: "7410", level: 4, parentCode: "741", nameVi: "Hoạt động thiết kế chuyên dụng (graphic design, UI/UX)" },
  { code: "7420", level: 4, parentCode: "742", nameVi: "Hoạt động nhiếp ảnh" },
  { code: "8510", level: 4, parentCode: "851", nameVi: "Giáo dục mầm non" },
  { code: "8521", level: 4, parentCode: "852", nameVi: "Giáo dục tiểu học" },
  { code: "8522", level: 4, parentCode: "852", nameVi: "Giáo dục trung học cơ sở" },
  { code: "8523", level: 4, parentCode: "852", nameVi: "Giáo dục trung học phổ thông" },
  { code: "8531", level: 4, parentCode: "853", nameVi: "Đào tạo sơ cấp" },
  { code: "8532", level: 4, parentCode: "853", nameVi: "Đào tạo trung cấp" },
  { code: "8533", level: 4, parentCode: "853", nameVi: "Đào tạo cao đẳng" },
  { code: "8541", level: 4, parentCode: "854", nameVi: "Đào tạo đại học" },
  { code: "8542", level: 4, parentCode: "854", nameVi: "Đào tạo thạc sĩ" },
  { code: "8543", level: 4, parentCode: "854", nameVi: "Đào tạo tiến sĩ" },
  { code: "8551", level: 4, parentCode: "855", nameVi: "Giáo dục thể thao và giải trí" },
  { code: "8552", level: 4, parentCode: "855", nameVi: "Giáo dục văn hoá nghệ thuật" },
  { code: "8559", level: 4, parentCode: "855", nameVi: "Giáo dục khác chưa được phân vào đâu (trung tâm ngoại ngữ, tin học)" },
  { code: "8560", level: 4, parentCode: "856", nameVi: "Hoạt động dịch vụ hỗ trợ giáo dục" },
  { code: "8610", level: 4, parentCode: "861", nameVi: "Hoạt động của các bệnh viện, trạm y tế" },
  { code: "8620", level: 4, parentCode: "862", nameVi: "Hoạt động của các phòng khám đa khoa, chuyên khoa và nha khoa" },
  { code: "8691", level: 4, parentCode: "869", nameVi: "Hoạt động y học cổ truyền" },
  { code: "8692", level: 4, parentCode: "869", nameVi: "Hoạt động y tế dự phòng" },
  { code: "8699", level: 4, parentCode: "869", nameVi: "Hoạt động y tế khác chưa được phân vào đâu" },
  { code: "8710", level: 4, parentCode: "871", nameVi: "Hoạt động chăm sóc, điều dưỡng tập trung" },
  { code: "9511", level: 4, parentCode: "951", nameVi: "Sửa chữa máy vi tính và thiết bị ngoại vi" },
  { code: "9512", level: 4, parentCode: "951", nameVi: "Sửa chữa thiết bị liên lạc" },
  { code: "9610", level: 4, parentCode: "961", nameVi: "Giặt là, làm sạch các sản phẩm dệt và lông thú" },
  { code: "9631", level: 4, parentCode: "963", nameVi: "Cắt tóc, làm đầu, gội đầu" },
  { code: "9632", level: 4, parentCode: "963", nameVi: "Hoạt động dịch vụ tắm hơi, mát-xa và các dịch vụ làm đẹp khác (spa, thẩm mỹ viện)" },
  { code: "9633", level: 4, parentCode: "963", nameVi: "Dịch vụ tang lễ" },
  { code: "9639", level: 4, parentCode: "963", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác chưa được phân vào đâu" },
]

// ============================================================
// Helpers
// ============================================================

/** Bỏ dấu tiếng Việt để search */
function unaccent(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function getVsicLevel1(code: string): VsicL1Industry | undefined {
  return VSIC_2025_LEVEL1.find((i) => i.code === code);
}

export function getVsicNode(code: string): VsicNode | undefined {
  return VSIC_2025_NODES.find((n) => n.code === code);
}

/** Lookup theo code bất kể level (L1 chữ cái hoặc L2-L5 chữ số) */
export function lookupVsic(code: string):
  | { level: 1; l1: VsicL1Industry }
  | { level: 2 | 3 | 4 | 5; node: VsicNode; l1: VsicL1Industry }
  | undefined {
  const upper = code.toUpperCase();
  const l1 = getVsicLevel1(upper);
  if (l1) return { level: 1, l1 };
  const node = getVsicNode(code);
  if (!node) return undefined;
  let cur: VsicNode | undefined = node;
  while (cur && cur.level > 2) {
    cur = getVsicNode(cur.parentCode);
  }
  const l1Code = cur?.parentCode ?? "";
  const ancestorL1 = getVsicLevel1(l1Code);
  if (!ancestorL1) return undefined;
  return { level: node.level, node, l1: ancestorL1 };
}

/** Suy ra L1 code từ một code bất kỳ */
export function getL1CodeOf(code: string): VsicL1Code | null {
  const r = lookupVsic(code);
  return (r?.l1.code as VsicL1Code) ?? null;
}

/** Trẻ con trực tiếp của một parent code */
export function getChildren(parentCode: string): VsicNode[] {
  return VSIC_2025_NODES.filter((n) => n.parentCode === parentCode);
}

/** Đường dẫn từ L1 → code (không bao gồm L1) */
export function getAncestors(code: string): VsicNode[] {
  const node = getVsicNode(code);
  if (!node) return [];
  const out: VsicNode[] = [node];
  let parent = getVsicNode(node.parentCode);
  while (parent) {
    out.unshift(parent);
    parent = getVsicNode(parent.parentCode);
  }
  return out;
}

/** Suy luận level từ độ dài / kiểu code */
export function inferLevel(code: string): 1 | 2 | 3 | 4 | 5 | null {
  if (!code) return null;
  if (/^[A-V]$/i.test(code)) return 1;
  if (/^\d{2}$/.test(code)) return 2;
  if (/^\d{3}$/.test(code)) return 3;
  if (/^\d{4}$/.test(code)) return 4;
  if (/^\d{5}$/.test(code)) return 5;
  return null;
}

export interface VsicSearchHit {
  code: string;
  level: 1 | 2 | 3 | 4 | 5;
  nameVi: string;
  l1Code: VsicL1Code;
}

/** Search toàn bộ (L1 + L2-L4) theo code hoặc tên không dấu */
export function searchVsic(query: string, limit = 30): VsicSearchHit[] {
  const q = unaccent(query.trim());
  if (!q) return [];
  const hits: Array<VsicSearchHit & { score: number }> = [];

  for (const l1 of VSIC_2025_LEVEL1) {
    const hay = unaccent(`${l1.code} ${l1.nameVi} ${l1.nameViShort}`);
    if (hay.includes(q)) {
      hits.push({ code: l1.code, level: 1, nameVi: l1.nameVi, l1Code: l1.code, score: l1.code.toLowerCase() === q ? 100 : 50 });
    }
  }
  for (const n of VSIC_2025_NODES) {
    const hay = unaccent(`${n.code} ${n.nameVi}`);
    if (hay.includes(q)) {
      const l1Code = getL1CodeOf(n.code);
      if (!l1Code) continue;
      const score = n.code === query ? 100 : n.code.startsWith(query) ? 80 : 30;
      hits.push({ code: n.code, level: n.level, nameVi: n.nameVi, l1Code, score });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map(({ score: _s, ...h }) => h);
}
