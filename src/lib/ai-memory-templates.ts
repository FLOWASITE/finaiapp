// Client-safe helpers cho mẫu quy tắc AI Memory.
// Dùng chung giữa UI (preview live) và server fn (chuẩn hoá khi promote).

export type SlotKind = "text" | "account" | "number" | "op" | "day";

export type TemplateSlot = {
  key: string;
  label: string;
  kind: SlotKind;
  required?: boolean;
  placeholder?: string;
};

export type RuleTemplate = {
  id: string;
  label: string;
  description: string;
  slots: TemplateSlot[];
  render: (slots: Record<string, string>) => {
    title: string;
    when_text: string;
    then_text: string;
  };
};

export const ACCOUNT_QUICK_PICKS = [
  "111", "112", "131", "133", "1331",
  "331", "333", "334", "338",
  "511", "515",
  "621", "622", "627", "6271", "6278",
  "641", "6411", "6418",
  "642", "6421", "6428",
];

const q = (v: string | undefined) => (v && v.trim()) || "…";

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: "vendor-account",
    label: "Nhà cung cấp → Tài khoản",
    description: "Khi gặp 1 nhà cung cấp cố định, hạch toán vào cặp Nợ/Có chuẩn.",
    slots: [
      { key: "vendor", label: "Tên nhà cung cấp", kind: "text", required: true, placeholder: "VD: Highlands Coffee" },
      { key: "debit_acc", label: "TK Nợ", kind: "account", required: true, placeholder: "642" },
      { key: "credit_acc", label: "TK Có", kind: "account", required: true, placeholder: "111" },
    ],
    render: (s) => ({
      title: `Hạch toán cho ${q(s.vendor)} → Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)}`,
      when_text: `vendor = "${q(s.vendor)}"`,
      then_text: `Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)}`,
    }),
  },
  {
    id: "desc-contains-account",
    label: "Mô tả chứa từ khoá → Tài khoản",
    description: "Khi mô tả chứa từ khoá nhất định, hạch toán theo cặp TK định sẵn.",
    slots: [
      { key: "keyword", label: "Từ khoá trong mô tả", kind: "text", required: true, placeholder: "VD: tiếp khách" },
      { key: "debit_acc", label: "TK Nợ", kind: "account", required: true, placeholder: "6428" },
      { key: "credit_acc", label: "TK Có", kind: "account", required: true, placeholder: "111" },
    ],
    render: (s) => ({
      title: `Mô tả chứa "${q(s.keyword)}" → Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)}`,
      when_text: `description contains "${q(s.keyword)}"`,
      then_text: `Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)}`,
    }),
  },
  {
    id: "amount-threshold",
    label: "Ngưỡng số tiền → Hành động",
    description: "Khi số tiền vượt ngưỡng, thực hiện hành động (vd: yêu cầu duyệt).",
    slots: [
      { key: "op", label: "Toán tử", kind: "op", required: true, placeholder: ">" },
      { key: "threshold", label: "Ngưỡng (VNĐ)", kind: "number", required: true, placeholder: "20000000" },
      { key: "action", label: "Hành động", kind: "text", required: true, placeholder: "Yêu cầu duyệt cấp 2" },
    ],
    render: (s) => ({
      title: `Khi số tiền ${q(s.op)} ${q(s.threshold)} → ${q(s.action)}`,
      when_text: `amount ${q(s.op)} ${q(s.threshold)}`,
      then_text: q(s.action),
    }),
  },
  {
    id: "vendor-recurring",
    label: "Giao dịch định kỳ theo NCC",
    description: "Tự tạo bút toán định kỳ vào 1 ngày cố định mỗi tháng.",
    slots: [
      { key: "vendor", label: "Nhà cung cấp", kind: "text", required: true, placeholder: "VD: VNPT" },
      { key: "day", label: "Ngày trong tháng", kind: "day", required: true, placeholder: "5" },
      { key: "debit_acc", label: "TK Nợ", kind: "account", required: true, placeholder: "6427" },
      { key: "credit_acc", label: "TK Có", kind: "account", required: true, placeholder: "331" },
      { key: "amount", label: "Số tiền (VNĐ)", kind: "number", required: false, placeholder: "1500000" },
    ],
    render: (s) => ({
      title: `Định kỳ ngày ${q(s.day)} hàng tháng cho ${q(s.vendor)}`,
      when_text: `vendor = "${q(s.vendor)}" AND day_of_month = ${q(s.day)}`,
      then_text: s.amount
        ? `Tạo bút toán định kỳ Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)} = ${q(s.amount)}`
        : `Tạo bút toán định kỳ Nợ ${q(s.debit_acc)} / Có ${q(s.credit_acc)}`,
    }),
  },
  {
    id: "category-routing",
    label: "Nhóm chi phí → TK & Phòng ban",
    description: "Định tuyến nhóm chi phí vào TK và phòng ban tương ứng.",
    slots: [
      { key: "category", label: "Nhóm chi phí", kind: "text", required: true, placeholder: "VD: Marketing" },
      { key: "debit_acc", label: "TK Nợ", kind: "account", required: true, placeholder: "6418" },
      { key: "department", label: "Phòng ban", kind: "text", required: true, placeholder: "Marketing" },
    ],
    render: (s) => ({
      title: `Nhóm "${q(s.category)}" → TK ${q(s.debit_acc)}, phòng ${q(s.department)}`,
      when_text: `category = "${q(s.category)}"`,
      then_text: `Hạch toán vào TK ${q(s.debit_acc)}, phòng ban "${q(s.department)}"`,
    }),
  },
];

export const TEMPLATES_BY_ID: Record<string, RuleTemplate> = Object.fromEntries(
  RULE_TEMPLATES.map((t) => [t.id, t]),
);

export type ParsedSuggestion = {
  templateId: string;
  slots: Record<string, string>;
};

/** Đoán mẫu + slot từ text thô của đề xuất AI. */
export function parseSuggestion(input: {
  title?: string | null;
  when_text?: string | null;
  then_text?: string | null;
}): ParsedSuggestion {
  const when = (input.when_text ?? "").trim();
  const then = (input.then_text ?? "").trim();
  const title = (input.title ?? "").trim();
  const blob = `${title}\n${when}\n${then}`;

  const accounts = Array.from(blob.matchAll(/\b(\d{3,4})\b/g)).map((m) => m[1]);
  const debit_acc = accounts[0] ?? "";
  const credit_acc = accounts[1] ?? (debit_acc ? "111" : "");

  // amount-threshold
  const amtMatch = blob.match(/amount\s*(>=|<=|>|<)\s*([\d.,]+)/i);
  if (amtMatch) {
    return {
      templateId: "amount-threshold",
      slots: {
        op: amtMatch[1],
        threshold: amtMatch[2].replace(/[.,]/g, ""),
        action: then || "Yêu cầu duyệt cấp 2",
      },
    };
  }

  // vendor-recurring
  const dayMatch = blob.match(/day_of_month\s*=\s*(\d{1,2})/i) ?? blob.match(/ng[aà]y\s+(\d{1,2})\s+h[aà]ng\s+th[aá]ng/i);
  const vendorMatch =
    blob.match(/vendor\s*[:=]\s*"([^"]+)"/i) ??
    blob.match(/nh[aà]\s*cung\s*c[aấ]p\s*[:=]?\s*"?([^"\n,.;]+)/i);
  if (dayMatch && vendorMatch) {
    return {
      templateId: "vendor-recurring",
      slots: {
        vendor: vendorMatch[1].trim(),
        day: dayMatch[1],
        debit_acc,
        credit_acc: credit_acc || "331",
        amount: "",
      },
    };
  }

  // desc-contains-account
  const kwMatch =
    blob.match(/contains?\s*"([^"]+)"/i) ??
    blob.match(/m[oô]\s*t[aả]\s*ch[uứ]a\s*"?([^"\n,.;]+)/i);
  if (kwMatch) {
    return {
      templateId: "desc-contains-account",
      slots: {
        keyword: kwMatch[1].trim(),
        debit_acc: debit_acc || "6428",
        credit_acc: credit_acc || "111",
      },
    };
  }

  // category-routing
  const catMatch = blob.match(/category\s*[:=]\s*"([^"]+)"/i);
  if (catMatch) {
    const deptMatch = blob.match(/ph[oò]ng\s*ban\s*"?([^"\n,.;]+)/i);
    return {
      templateId: "category-routing",
      slots: {
        category: catMatch[1].trim(),
        debit_acc: debit_acc || "6418",
        department: deptMatch?.[1]?.trim() ?? catMatch[1].trim(),
      },
    };
  }

  // default: vendor-account
  return {
    templateId: "vendor-account",
    slots: {
      vendor: vendorMatch?.[1]?.trim() ?? title.replace(/\s*→.*$/, "").trim(),
      debit_acc: debit_acc || "642",
      credit_acc: credit_acc || "111",
    },
  };
}

export function renderRule(templateId: string, slots: Record<string, string>) {
  const tpl = TEMPLATES_BY_ID[templateId] ?? TEMPLATES_BY_ID["vendor-account"];
  return { ...tpl.render(slots), templateLabel: tpl.label };
}

export function validateSlots(templateId: string, slots: Record<string, string>): string | null {
  const tpl = TEMPLATES_BY_ID[templateId];
  if (!tpl) return "Mẫu không hợp lệ";
  for (const s of tpl.slots) {
    if (s.required && !(slots[s.key] ?? "").trim()) {
      return `Vui lòng nhập ${s.label.toLowerCase()}`;
    }
  }
  return null;
}
