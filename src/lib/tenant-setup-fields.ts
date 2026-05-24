// Shared list of required fields used to compute tenant setup progress.
// Kept client-safe so the UI can derive progress without an extra server roundtrip.
export const REQUIRED_TENANT_FIELDS: { key: string; label: string }[] = [
  { key: "tax_id", label: "Mã số thuế" },
  { key: "company_name", label: "Tên pháp nhân" },
  { key: "legal_form", label: "Loại hình doanh nghiệp" },
  { key: "address", label: "Địa chỉ trụ sở" },
  { key: "accounting_standard", label: "Chuẩn kế toán" },
  { key: "base_currency", label: "Đồng tiền hạch toán" },
  { key: "fiscal_year_start", label: "Tháng bắt đầu năm tài chính" },
  { key: "tax_method", label: "Phương pháp tính thuế GTGT" },
  { key: "vat_period", label: "Kỳ kê khai GTGT" },
  { key: "legal_rep_name", label: "Đại diện pháp luật" },
  { key: "legal_rep_title", label: "Chức danh đại diện" },
];

export function computeTenantSetupProgress(tenant: any | null | undefined) {
  if (!tenant) {
    return { percent: 0, missing: REQUIRED_TENANT_FIELDS, completed: false };
  }
  const missing = REQUIRED_TENANT_FIELDS.filter((f) => {
    const v = tenant[f.key];
    return v === null || v === undefined || v === "";
  });
  const percent = Math.round(
    ((REQUIRED_TENANT_FIELDS.length - missing.length) / REQUIRED_TENANT_FIELDS.length) * 100,
  );
  return { percent, missing, completed: !!tenant.setup_completed };
}
