// ============================================================
// VSIC 2025 — Hệ thống ngành kinh tế Việt Nam (5 cấp)
// ============================================================
// L1: 22 ngành (A-V) — primary classification trong FinAI
// L2: 87 ngành (mã 2 số)
// L3: 259 ngành (mã 3 số)
// L4: 495 ngành (mã 4 số)
// L5: 743 ngành (mã 5 số)
//
// Mã ngành VSIC dùng 5 chữ số ở cấp chi tiết nhất. L1 dùng 1 chữ cái.
// DN chọn 1 ngành L1 (primary) khi onboarding; có thể drill-down L2-L5.
// ============================================================

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
  { code: "K", nameVi: "Hoạt động viễn thông; lập trình máy tính, tư vấn, cơ sở hạ tầng máy tính và các dịch vụ thông tin khác", nameViShort: "Viễn thông – CNTT – SaaS", nameEn: "Telecommunications, programming, computer infrastructure and information services", description: "Viễn thông, lập trình phần mềm, SaaS, hosting, dịch vụ dữ liệu", icon: "Laptop", finaiSupported: false },
  { code: "L", nameVi: "Hoạt động tài chính, ngân hàng và bảo hiểm", nameViShort: "Tài chính – Ngân hàng – Bảo hiểm", nameEn: "Financial and insurance activities", description: "Ngân hàng, công ty tài chính, bảo hiểm, chứng khoán, fintech", icon: "Landmark", finaiSupported: false },
  { code: "M", nameVi: "Hoạt động kinh doanh bất động sản", nameViShort: "Bất động sản", nameEn: "Real estate activities", description: "Chủ đầu tư BĐS, môi giới BĐS, cho thuê BĐS, quản lý dự án", icon: "Home", finaiSupported: true, finaiOverlaySlug: "realestate" },
  { code: "N", nameVi: "Hoạt động chuyên môn, khoa học và công nghệ", nameViShort: "Chuyên môn – KHCN", nameEn: "Professional, scientific and technical activities", description: "Luật, kế toán/kiểm toán, tư vấn quản lý, kiến trúc – kỹ thuật, NCKH, quảng cáo", icon: "Briefcase", finaiSupported: false },
  { code: "O", nameVi: "Hoạt động hành chính và dịch vụ hỗ trợ", nameViShort: "Hành chính – Hỗ trợ", nameEn: "Administrative and support service activities", description: "Cho thuê thiết bị, du lịch, dịch vụ tuyển dụng, vệ sinh, an ninh, tổ chức sự kiện", icon: "Settings", finaiSupported: false },
  { code: "P", nameVi: "Hoạt động của Đảng CSVN, tổ chức chính trị - xã hội, quản lý nhà nước, an ninh quốc phòng, đảm bảo xã hội bắt buộc", nameViShort: "QLNN – Đảng – Đoàn thể", nameEn: "Public administration and defence", description: "Cơ quan nhà nước, quốc phòng, an ninh, BHXH (KHÔNG áp dụng cho DN tư nhân)", icon: "Building", finaiSupported: false, nonBusiness: true },
  { code: "Q", nameVi: "Giáo dục và đào tạo", nameViShort: "Giáo dục – Đào tạo", nameEn: "Education", description: "Trường học mầm non/phổ thông/đại học, trung tâm ngoại ngữ, dạy nghề, đào tạo", icon: "GraduationCap", finaiSupported: true, finaiOverlaySlug: "education" },
  { code: "R", nameVi: "Y tế và hoạt động trợ giúp xã hội", nameViShort: "Y tế – Trợ giúp xã hội", nameEn: "Human health and social work activities", description: "Bệnh viện, phòng khám, nhà thuốc, dịch vụ chăm sóc người già, trẻ em", icon: "Stethoscope", finaiSupported: true, finaiOverlaySlug: "healthcare" },
  { code: "S", nameVi: "Nghệ thuật, vui chơi và giải trí", nameViShort: "Nghệ thuật – Giải trí", nameEn: "Arts, entertainment and recreation", description: "Biểu diễn nghệ thuật, thư viện, bảo tàng, casino, thể thao, vui chơi giải trí", icon: "Music", finaiSupported: false },
  { code: "T", nameVi: "Hoạt động dịch vụ khác", nameViShort: "Dịch vụ khác (Spa, Sửa chữa)", nameEn: "Other service activities", description: "Spa, làm đẹp, thẩm mỹ viện, sửa chữa máy tính/đồ gia dụng, dịch vụ tang lễ", icon: "Sparkles", finaiSupported: false },
  { code: "U", nameVi: "Hoạt động làm thuê các công việc trong các hộ gia đình, sản xuất sản phẩm vật chất và dịch vụ tự tiêu dùng của hộ gia đình", nameViShort: "Lao động hộ gia đình", nameEn: "Activities of households as employers", description: "Giúp việc gia đình, hoạt động tự cung tự cấp (KHÔNG áp dụng cho DN)", icon: "Users", finaiSupported: false, nonBusiness: true },
  { code: "V", nameVi: "Hoạt động của các tổ chức và cơ quan quốc tế", nameViShort: "Tổ chức quốc tế", nameEn: "Activities of extraterritorial organizations", description: "Đại sứ quán, lãnh sự quán, tổ chức quốc tế (KHÔNG áp dụng cho DN VN)", icon: "Globe", finaiSupported: false, nonBusiness: true },
];

// ============================================================
// L2-L5 nodes (flat list, parent lookup by parentCode)
// ============================================================

export interface VsicNode {
  code: string;          // "55" | "551" | "5510" | "55101"
  level: 2 | 3 | 4 | 5;
  parentCode: string;    // L2 → L1 (chữ cái); L3 → L2 (2 số); ...
  nameVi: string;
}

/**
 * Seed dataset — các ngành L2-L5 phổ biến nhất cho SMB Việt Nam.
 * Dataset đầy đủ 1.584 mã sẽ được bổ sung khi có file VSIC 2025 chính thức từ TCTK.
 * Cấu trúc đã sẵn sàng nhận thêm — chỉ cần append vào mảng này.
 */
export const VSIC_2025_NODES: VsicNode[] = [
  // ===== C — Sản xuất chế tạo =====
  { code: "10", level: 2, parentCode: "C", nameVi: "Sản xuất chế biến thực phẩm" },
  { code: "11", level: 2, parentCode: "C", nameVi: "Sản xuất đồ uống" },
  { code: "13", level: 2, parentCode: "C", nameVi: "Dệt" },
  { code: "14", level: 2, parentCode: "C", nameVi: "Sản xuất trang phục" },
  { code: "15", level: 2, parentCode: "C", nameVi: "Sản xuất da và các sản phẩm có liên quan" },
  { code: "16", level: 2, parentCode: "C", nameVi: "Chế biến gỗ và sản xuất sản phẩm từ gỗ, tre, nứa" },
  { code: "17", level: 2, parentCode: "C", nameVi: "Sản xuất giấy và sản phẩm từ giấy" },
  { code: "18", level: 2, parentCode: "C", nameVi: "In, sao chép bản ghi các loại" },
  { code: "20", level: 2, parentCode: "C", nameVi: "Sản xuất hoá chất và sản phẩm hoá chất" },
  { code: "22", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ cao su và plastic" },
  { code: "23", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ khoáng phi kim loại khác" },
  { code: "25", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm từ kim loại đúc sẵn (trừ máy móc, thiết bị)" },
  { code: "26", level: 2, parentCode: "C", nameVi: "Sản xuất sản phẩm điện tử, máy vi tính và sản phẩm quang học" },
  { code: "27", level: 2, parentCode: "C", nameVi: "Sản xuất thiết bị điện" },
  { code: "28", level: 2, parentCode: "C", nameVi: "Sản xuất máy móc, thiết bị chưa được phân vào đâu" },
  { code: "31", level: 2, parentCode: "C", nameVi: "Sản xuất giường, tủ, bàn, ghế" },
  { code: "32", level: 2, parentCode: "C", nameVi: "Công nghiệp chế biến, chế tạo khác" },

  // ===== F — Xây dựng =====
  { code: "41", level: 2, parentCode: "F", nameVi: "Xây dựng nhà các loại" },
  { code: "42", level: 2, parentCode: "F", nameVi: "Xây dựng công trình kỹ thuật dân dụng" },
  { code: "43", level: 2, parentCode: "F", nameVi: "Hoạt động xây dựng chuyên dụng" },

  // ===== G — Bán buôn / bán lẻ =====
  { code: "45", level: 2, parentCode: "G", nameVi: "Bán, sửa chữa ô tô, mô tô, xe máy và xe có động cơ khác" },
  { code: "46", level: 2, parentCode: "G", nameVi: "Bán buôn (trừ ô tô, mô tô, xe máy)" },
  { code: "47", level: 2, parentCode: "G", nameVi: "Bán lẻ (trừ ô tô, mô tô, xe máy)" },
  { code: "461", level: 3, parentCode: "46", nameVi: "Đại lý, môi giới, đấu giá hàng hoá" },
  { code: "4610", level: 4, parentCode: "461", nameVi: "Đại lý, môi giới, đấu giá hàng hoá" },
  { code: "463", level: 3, parentCode: "46", nameVi: "Bán buôn lương thực, thực phẩm, đồ uống và sản phẩm thuốc lá" },
  { code: "4631", level: 4, parentCode: "463", nameVi: "Bán buôn thực phẩm" },
  { code: "4632", level: 4, parentCode: "463", nameVi: "Bán buôn đồ uống" },
  { code: "465", level: 3, parentCode: "46", nameVi: "Bán buôn máy móc, thiết bị" },
  { code: "4651", level: 4, parentCode: "465", nameVi: "Bán buôn máy vi tính, thiết bị ngoại vi và phần mềm" },
  { code: "4652", level: 4, parentCode: "465", nameVi: "Bán buôn thiết bị, linh kiện điện tử, viễn thông" },
  { code: "4659", level: 4, parentCode: "465", nameVi: "Bán buôn máy móc, thiết bị khác" },
  { code: "471", level: 3, parentCode: "47", nameVi: "Bán lẻ trong cửa hàng tổng hợp" },
  { code: "4711", level: 4, parentCode: "471", nameVi: "Bán lẻ lương thực, thực phẩm tổng hợp" },
  { code: "474", level: 3, parentCode: "47", nameVi: "Bán lẻ thiết bị thông tin liên lạc, máy tính" },
  { code: "4741", level: 4, parentCode: "474", nameVi: "Bán lẻ máy vi tính, thiết bị ngoại vi, phần mềm" },

  // ===== H — Vận tải =====
  { code: "49", level: 2, parentCode: "H", nameVi: "Vận tải đường sắt, đường bộ và vận tải đường ống" },
  { code: "50", level: 2, parentCode: "H", nameVi: "Vận tải đường thủy" },
  { code: "51", level: 2, parentCode: "H", nameVi: "Vận tải hàng không" },
  { code: "52", level: 2, parentCode: "H", nameVi: "Kho bãi và các hoạt động hỗ trợ cho vận tải" },
  { code: "53", level: 2, parentCode: "H", nameVi: "Bưu chính và chuyển phát" },
  { code: "493", level: 3, parentCode: "49", nameVi: "Vận tải đường bộ" },
  { code: "4933", level: 4, parentCode: "493", nameVi: "Vận tải hàng hóa bằng đường bộ" },

  // ===== I — F&B / Lưu trú =====
  { code: "55", level: 2, parentCode: "I", nameVi: "Dịch vụ lưu trú" },
  { code: "56", level: 2, parentCode: "I", nameVi: "Dịch vụ ăn uống" },
  { code: "551", level: 3, parentCode: "55", nameVi: "Dịch vụ lưu trú ngắn ngày (khách sạn, nhà nghỉ)" },
  { code: "5510", level: 4, parentCode: "551", nameVi: "Dịch vụ lưu trú ngắn ngày" },
  { code: "552", level: 3, parentCode: "55", nameVi: "Khu cắm trại, du lịch lưu động" },
  { code: "559", level: 3, parentCode: "55", nameVi: "Cơ sở lưu trú khác" },
  { code: "561", level: 3, parentCode: "56", nameVi: "Nhà hàng và quán ăn lưu động" },
  { code: "5610", level: 4, parentCode: "561", nameVi: "Nhà hàng và các dịch vụ ăn uống phục vụ lưu động" },
  { code: "562", level: 3, parentCode: "56", nameVi: "Cung cấp dịch vụ ăn uống theo hợp đồng" },
  { code: "5621", level: 4, parentCode: "562", nameVi: "Cung cấp dịch vụ ăn uống cho các sự kiện, theo hợp đồng" },
  { code: "563", level: 3, parentCode: "56", nameVi: "Quán bar, quầy uống không kèm biểu diễn nghệ thuật" },

  // ===== J — Xuất bản / Phát sóng =====
  { code: "58", level: 2, parentCode: "J", nameVi: "Hoạt động xuất bản" },
  { code: "59", level: 2, parentCode: "J", nameVi: "Hoạt động điện ảnh, sản xuất chương trình truyền hình, ghi âm" },
  { code: "60", level: 2, parentCode: "J", nameVi: "Hoạt động phát thanh, truyền hình" },
  { code: "5811", level: 4, parentCode: "581", nameVi: "Xuất bản sách" },
  { code: "581", level: 3, parentCode: "58", nameVi: "Xuất bản sách, tài liệu định kỳ và các hoạt động xuất bản khác" },

  // ===== K — Viễn thông / CNTT =====
  { code: "61", level: 2, parentCode: "K", nameVi: "Viễn thông" },
  { code: "62", level: 2, parentCode: "K", nameVi: "Lập trình máy vi tính, dịch vụ tư vấn và các hoạt động khác liên quan đến máy vi tính" },
  { code: "63", level: 2, parentCode: "K", nameVi: "Hoạt động dịch vụ thông tin" },
  { code: "620", level: 3, parentCode: "62", nameVi: "Lập trình máy vi tính, dịch vụ tư vấn và các hoạt động khác liên quan đến máy vi tính" },
  { code: "6201", level: 4, parentCode: "620", nameVi: "Lập trình máy vi tính" },
  { code: "6202", level: 4, parentCode: "620", nameVi: "Tư vấn máy vi tính và quản trị hệ thống máy vi tính" },
  { code: "6209", level: 4, parentCode: "620", nameVi: "Hoạt động dịch vụ CNTT và dịch vụ khác liên quan đến máy vi tính" },
  { code: "631", level: 3, parentCode: "63", nameVi: "Xử lý dữ liệu, cho thuê và hoạt động liên quan; cổng thông tin" },
  { code: "6311", level: 4, parentCode: "631", nameVi: "Xử lý dữ liệu, cho thuê và các hoạt động liên quan" },
  { code: "6312", level: 4, parentCode: "631", nameVi: "Cổng thông tin" },

  // ===== L — Tài chính =====
  { code: "64", level: 2, parentCode: "L", nameVi: "Hoạt động dịch vụ tài chính (trừ bảo hiểm và bảo hiểm xã hội)" },
  { code: "65", level: 2, parentCode: "L", nameVi: "Bảo hiểm, tái bảo hiểm và bảo hiểm xã hội (trừ bảo đảm xã hội bắt buộc)" },
  { code: "66", level: 2, parentCode: "L", nameVi: "Hoạt động tài chính khác" },
  { code: "6491", level: 4, parentCode: "649", nameVi: "Cho thuê tài chính" },
  { code: "6492", level: 4, parentCode: "649", nameVi: "Hoạt động cấp tín dụng khác" },
  { code: "649", level: 3, parentCode: "64", nameVi: "Hoạt động dịch vụ tài chính khác (trừ bảo hiểm và BHXH)" },

  // ===== M — Bất động sản =====
  { code: "68", level: 2, parentCode: "M", nameVi: "Hoạt động kinh doanh bất động sản" },
  { code: "681", level: 3, parentCode: "68", nameVi: "Kinh doanh bất động sản, quyền sử dụng đất" },
  { code: "6810", level: 4, parentCode: "681", nameVi: "Kinh doanh BĐS, quyền sử dụng đất thuộc sở hữu, chủ sử dụng hoặc đi thuê" },
  { code: "682", level: 3, parentCode: "68", nameVi: "Tư vấn, môi giới, đấu giá BĐS" },
  { code: "6820", level: 4, parentCode: "682", nameVi: "Tư vấn, môi giới, đấu giá BĐS, đấu giá quyền sử dụng đất" },

  // ===== N — Chuyên môn, KHCN =====
  { code: "69", level: 2, parentCode: "N", nameVi: "Hoạt động pháp luật, kế toán và kiểm toán" },
  { code: "70", level: 2, parentCode: "N", nameVi: "Hoạt động trụ sở văn phòng; hoạt động tư vấn quản lý" },
  { code: "71", level: 2, parentCode: "N", nameVi: "Hoạt động kiến trúc; kiểm tra và phân tích kỹ thuật" },
  { code: "72", level: 2, parentCode: "N", nameVi: "Nghiên cứu khoa học và phát triển" },
  { code: "73", level: 2, parentCode: "N", nameVi: "Quảng cáo và nghiên cứu thị trường" },
  { code: "74", level: 2, parentCode: "N", nameVi: "Hoạt động chuyên môn, khoa học và công nghệ khác" },
  { code: "692", level: 3, parentCode: "69", nameVi: "Hoạt động liên quan đến kế toán, kiểm toán và tư vấn về thuế" },
  { code: "6920", level: 4, parentCode: "692", nameVi: "Hoạt động liên quan đến kế toán, kiểm toán và tư vấn về thuế" },
  { code: "702", level: 3, parentCode: "70", nameVi: "Hoạt động tư vấn quản lý" },
  { code: "7020", level: 4, parentCode: "702", nameVi: "Hoạt động tư vấn quản lý" },
  { code: "711", level: 3, parentCode: "71", nameVi: "Hoạt động kiến trúc và tư vấn kỹ thuật có liên quan" },
  { code: "7110", level: 4, parentCode: "711", nameVi: "Hoạt động kiến trúc và tư vấn kỹ thuật có liên quan" },
  { code: "731", level: 3, parentCode: "73", nameVi: "Quảng cáo" },
  { code: "7310", level: 4, parentCode: "731", nameVi: "Quảng cáo" },

  // ===== O — Hành chính / hỗ trợ =====
  { code: "77", level: 2, parentCode: "O", nameVi: "Cho thuê máy móc, thiết bị (không kèm người điều khiển); cho thuê đồ dùng cá nhân và gia đình" },
  { code: "78", level: 2, parentCode: "O", nameVi: "Hoạt động dịch vụ lao động và việc làm" },
  { code: "79", level: 2, parentCode: "O", nameVi: "Hoạt động của các đại lý du lịch, kinh doanh tour du lịch" },
  { code: "82", level: 2, parentCode: "O", nameVi: "Hoạt động hành chính, hỗ trợ văn phòng và các hoạt động hỗ trợ kinh doanh khác" },
  { code: "8211", level: 4, parentCode: "821", nameVi: "Dịch vụ hành chính văn phòng tổng hợp" },
  { code: "821", level: 3, parentCode: "82", nameVi: "Hoạt động hành chính và hỗ trợ văn phòng" },
  { code: "8299", level: 4, parentCode: "829", nameVi: "Hoạt động dịch vụ hỗ trợ kinh doanh khác chưa được phân vào đâu" },
  { code: "829", level: 3, parentCode: "82", nameVi: "Hoạt động dịch vụ hỗ trợ kinh doanh khác" },

  // ===== Q — Giáo dục =====
  { code: "85", level: 2, parentCode: "Q", nameVi: "Giáo dục và đào tạo" },
  { code: "851", level: 3, parentCode: "85", nameVi: "Giáo dục mầm non" },
  { code: "8510", level: 4, parentCode: "851", nameVi: "Giáo dục mầm non" },
  { code: "852", level: 3, parentCode: "85", nameVi: "Giáo dục phổ thông" },
  { code: "853", level: 3, parentCode: "85", nameVi: "Giáo dục nghề nghiệp" },
  { code: "854", level: 3, parentCode: "85", nameVi: "Giáo dục đại học" },
  { code: "855", level: 3, parentCode: "85", nameVi: "Giáo dục khác (TT ngoại ngữ, tin học, dạy nghề ngắn hạn)" },
  { code: "8559", level: 4, parentCode: "855", nameVi: "Giáo dục khác chưa được phân vào đâu" },

  // ===== R — Y tế =====
  { code: "86", level: 2, parentCode: "R", nameVi: "Hoạt động y tế" },
  { code: "87", level: 2, parentCode: "R", nameVi: "Hoạt động chăm sóc, điều dưỡng tập trung" },
  { code: "88", level: 2, parentCode: "R", nameVi: "Hoạt động trợ giúp xã hội không tập trung" },
  { code: "861", level: 3, parentCode: "86", nameVi: "Hoạt động của các bệnh viện, trạm y tế" },
  { code: "862", level: 3, parentCode: "86", nameVi: "Hoạt động của các phòng khám đa khoa, chuyên khoa" },
  { code: "869", level: 3, parentCode: "86", nameVi: "Hoạt động y tế khác (Y học cổ truyền, nha khoa, vật lý trị liệu)" },
  { code: "8621", level: 4, parentCode: "862", nameVi: "Hoạt động y tế dự phòng" },

  // ===== T — Dịch vụ khác (Spa, sửa chữa) =====
  { code: "95", level: 2, parentCode: "T", nameVi: "Sửa chữa máy vi tính, đồ dùng cá nhân và gia đình" },
  { code: "96", level: 2, parentCode: "T", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác" },
  { code: "9511", level: 4, parentCode: "951", nameVi: "Sửa chữa máy vi tính và thiết bị ngoại vi" },
  { code: "951", level: 3, parentCode: "95", nameVi: "Sửa chữa máy vi tính và thiết bị liên lạc" },
  { code: "961", level: 3, parentCode: "96", nameVi: "Giặt là, làm sạch các sản phẩm dệt và lông thú" },
  { code: "9610", level: 4, parentCode: "961", nameVi: "Giặt là, làm sạch các sản phẩm dệt và lông thú" },
  { code: "962", level: 3, parentCode: "96", nameVi: "Cắt tóc, làm đầu, gội đầu" },
  { code: "9620", level: 4, parentCode: "962", nameVi: "Cắt tóc, làm đầu, gội đầu" },
  { code: "963", level: 3, parentCode: "96", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác" },
  { code: "9631", level: 4, parentCode: "963", nameVi: "Dịch vụ tắm hơi, mát-xa và các dịch vụ làm đẹp khác (spa, thẩm mỹ viện)" },
  { code: "9609", level: 4, parentCode: "960", nameVi: "Hoạt động dịch vụ phục vụ cá nhân khác chưa được phân vào đâu" },
];

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
  // Trace lên L1
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

/** Suy luận level từ độ dài / kiểu code (cho dữ liệu cũ thiếu metadata) */
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

/** Search toàn bộ (L1 + L2-L5) theo code hoặc tên không dấu */
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
