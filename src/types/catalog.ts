export type ItemType = "service" | "goods" | "mixed";
export type Frequency = "monthly" | "quarterly" | "yearly" | "one-time" | "adhoc" | "daily";
export type Amortization = "expense_immediately" | "prepaid_short" | "prepaid_long";
export type AllocationMethod = "single" | "manual_split" | "percent" | "headcount" | "area";
export type SupplierCountry = "VN" | "FOREIGN";
export type ForeignSupplierTax = "none" | "fct_applicable";
export type AccountingRegime = "TT99" | "TT133";

export type CategoryCode =
  | "TIEN_ICH" | "VIEN_THONG" | "THUE_BDS" | "LOGISTICS" | "CHUYEN_MON"
  | "MARKETING" | "VAN_PHONG" | "TAI_CHINH" | "NHAN_SU" | "CNTT"
  | "CONG_TAC" | "BAO_HIEM" | "THUE_LE_PHI" | "NHAP_KHAU" | "PHAP_LY" | "CSR"
  | "FNB" | "HEALTHCARE" | "EDUCATION" | "MANUFACTURING" | "RETAIL" | "REALESTATE";

export interface CatalogItem {
  id?: string;
  code: string;
  name: string;
  nameEn?: string;
  category: CategoryCode;
  subcategory?: string;
  itemType: ItemType;
  defaultAccountTT99: string;
  defaultAccountTT133: string;
  altAccounts: string[];
  vatRateStandard: number;
  vatReductionEligible: boolean;
  vatType?: string;
  deductible: boolean;
  aliases: string[];
  typicalSuppliers: string[];
  supplierCountry: SupplierCountry;
  frequency: Frequency;
  amortization: Amortization;
  allocationMethod: AllocationMethod;
  industryRelevance: string[];
  foreignSupplierTax: ForeignSupplierTax;
  fctVatRate: number;
  fctCitRate: number;
  notes?: string;
  isActive: boolean;
  usageCount30Days?: number;
  lastUsedAt?: string;
  isAiSuggested?: boolean;
  aiSuggestionReason?: string;
}

export interface CategoryMeta {
  code: CategoryCode;
  nameVi: string;
  icon: string;
  isIndustry: boolean;
}

export interface CompanyContext {
  name: string;
  accountingRegime: AccountingRegime;
  industry: string;
  industryNameVi: string;
}
