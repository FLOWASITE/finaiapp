import { describe, it, expect } from "vitest";
import { splitItemName } from "../split-item-name";

describe("splitItemName", () => {
  it("tách cước vận chuyển với ngày + tuyến + biển số", () => {
    const r = splitItemName("Cước vận chuyển ngày 28/01/2026 HCM-HN Xe 50H-897.69");
    expect(r.canonical_name.toLowerCase()).toBe("cước vận chuyển".toLowerCase());
    expect(r.note_parts.join(" ")).toMatch(/28\/01\/2026/);
    expect(r.note_parts.join(" ")).toMatch(/HCM/);
    expect(r.note_parts.join(" ")).toMatch(/50H/);
  });

  it("tách tiền điện kỳ tháng", () => {
    const r = splitItemName("Tiền điện kỳ tháng 01/2026");
    expect(r.canonical_name).toBe("Tiền điện");
    expect(r.line_note).toMatch(/tháng 01\/2026/i);
  });

  it("GIỮ quy cách SP trong ngoặc (thùng/hộp/lon)", () => {
    const r = splitItemName("Bia Tiger lon 330ml (thùng 24)");
    expect(r.canonical_name).toBe("Bia Tiger lon 330ml (thùng 24)");
    expect(r.line_note).toBe("");
  });

  it("ngắn / không có metadata thì giữ nguyên", () => {
    const r = splitItemName("Dịch vụ tư vấn");
    expect(r.canonical_name).toBe("Dịch vụ tư vấn");
    expect(r.line_note).toBe("");
  });

  it("vận chuyển HN-HCM xe ngày", () => {
    const r = splitItemName("Vận chuyển HN-HCM xe 29C-12345 ngày 15/3");
    expect(r.canonical_name.toLowerCase()).toBe("vận chuyển");
    expect(r.note_parts.length).toBeGreaterThanOrEqual(2);
  });

  it("fallback giữ raw_name khi canonical quá ngắn", () => {
    const r = splitItemName("123/456");
    // sau khi tách date, canonical rỗng → fallback
    expect(r.canonical_name).toBe("123/456");
  });

  it("vận chuyển hàng từ VP đến Bình Giã", () => {
    const r = splitItemName(
      "Vận chuyển hàng (Thực phẩm rau, củ, trái cây) từ VP 44 Nguyễn Thái Bình đến Bình Giã, biển số xe 72B-001.79",
    );
    expect(r.canonical_name.toLowerCase()).toMatch(/vận chuyển hàng/);
    expect(r.line_note).toMatch(/72B/);
    // cụm trong ngoặc "Thực phẩm rau, củ, trái cây" KHÔNG phải quy cách → tách
    expect(r.line_note).toMatch(/Thực phẩm/);
  });
});
