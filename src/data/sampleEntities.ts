// Mock entities for the Memory Graph prototype. Derived from sampleRules
// but also includes a few "orphan" entities so the graph can surface them
// as gaps (vendor with no rule, account with no rule).

export type VendorEntity = {
  id: string;
  name: string;
  tax_id?: string;
  industry?: string;
};

export type AccountEntity = {
  id: string;
  code: string;
  name: string;
};

export const sampleVendors: VendorEntity[] = [
  { id: "v-grab", name: "Grab for Business", tax_id: "0312554326", industry: "Vận tải" },
  { id: "v-be", name: "Be Group", tax_id: "0314136868", industry: "Vận tải" },
  { id: "v-highlands", name: "Highlands Coffee", tax_id: "0303013764", industry: "F&B" },
  { id: "v-evn", name: "EVN HCMC", tax_id: "0300951119", industry: "Điện lực" },
  { id: "v-vnpt", name: "VNPT", tax_id: "0100684378", industry: "Viễn thông" },
];

export const sampleAccounts: AccountEntity[] = [
  { id: "a-112", code: "112", name: "Tiền gửi ngân hàng" },
  { id: "a-131", code: "131", name: "Phải thu khách hàng" },
  { id: "a-331", code: "331", name: "Phải trả NCC" },
  { id: "a-641", code: "641", name: "Chi phí bán hàng" },
  { id: "a-642", code: "642", name: "Chi phí QLDN" },
  { id: "a-627", code: "627", name: "Chi phí SXC" },
];
