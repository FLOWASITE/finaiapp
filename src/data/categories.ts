import { CategoryMeta } from "@/types/catalog";

export const CATEGORIES: CategoryMeta[] = [
  { code: "TIEN_ICH",     nameVi: "Tiện ích cố định",       icon: "Zap",             isIndustry: false },
  { code: "VIEN_THONG",   nameVi: "Viễn thông – Internet",  icon: "Wifi",            isIndustry: false },
  { code: "THUE_BDS",     nameVi: "Thuê & Bất động sản",    icon: "Building",        isIndustry: false },
  { code: "LOGISTICS",    nameVi: "Vận chuyển – Logistics", icon: "Truck",           isIndustry: false },
  { code: "CHUYEN_MON",   nameVi: "Dịch vụ chuyên môn",     icon: "Briefcase",       isIndustry: false },
  { code: "MARKETING",    nameVi: "Marketing – Quảng cáo",  icon: "Megaphone",       isIndustry: false },
  { code: "VAN_PHONG",    nameVi: "Văn phòng – Hành chính", icon: "Building2",       isIndustry: false },
  { code: "TAI_CHINH",    nameVi: "Tài chính – Ngân hàng",  icon: "Landmark",        isIndustry: false },
  { code: "NHAN_SU",      nameVi: "Nhân sự – Đào tạo",      icon: "Users",           isIndustry: false },
  { code: "CNTT",         nameVi: "CNTT & Phần mềm",        icon: "Laptop",          isIndustry: false },
  { code: "CONG_TAC",     nameVi: "Công tác – Du lịch",     icon: "Plane",           isIndustry: false },
  { code: "BAO_HIEM",     nameVi: "Bảo hiểm",               icon: "Shield",          isIndustry: false },
  { code: "THUE_LE_PHI",  nameVi: "Thuế – Lệ phí NN",       icon: "Receipt",         isIndustry: false },
  { code: "NHAP_KHAU",    nameVi: "Nhập khẩu mở rộng",      icon: "PackageOpen",     isIndustry: false },
  { code: "PHAP_LY",      nameVi: "Pháp lý – Tranh chấp",   icon: "Scale",           isIndustry: false },
  { code: "CSR",          nameVi: "CSR – Từ thiện",         icon: "Heart",           isIndustry: false },
  { code: "FNB",          nameVi: "F&B – Nhà hàng",         icon: "UtensilsCrossed", isIndustry: true  },
  { code: "HEALTHCARE",   nameVi: "Y tế",                   icon: "Stethoscope",     isIndustry: true  },
  { code: "EDUCATION",    nameVi: "Giáo dục",               icon: "GraduationCap",   isIndustry: true  },
  { code: "MANUFACTURING",nameVi: "Sản xuất",               icon: "Factory",         isIndustry: true  },
  { code: "RETAIL",       nameVi: "Bán lẻ / TMĐT",          icon: "ShoppingBag",     isIndustry: true  },
  { code: "REALESTATE",   nameVi: "Bất động sản",           icon: "Home",            isIndustry: true  },
];

export const CATEGORY_BY_CODE: Record<string, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.code, c]),
);
