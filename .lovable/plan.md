
# AccuVN MVP — Pipeline OCR + AI định khoản

Xây một web app demo chạy được trên Lovable, tập trung vào luồng cốt lõi: upload hóa đơn → OCR bóc tách → AI gợi ý định khoản theo TT133 → kế toán viên duyệt → ghi vào sổ nhật ký chung. Đây là MVP để chứng minh giá trị USP, không phải full ERP.

## 1. Phạm vi MVP (làm)

- Auth (đăng nhập email + mật khẩu, 1 doanh nghiệp/tài khoản)
- Dashboard: thống kê hóa đơn tháng, số bút toán chờ duyệt, tổng chi phí theo nhóm TK
- Module **Hóa đơn đầu vào**:
  - Upload ảnh/PDF hóa đơn (1 file hoặc batch)
  - OCR + LLM hậu xử lý → trích: MST người bán, tên NCC, số HĐ, ngày, mặt hàng, đơn giá, VAT, tổng tiền
  - Form review: kế toán sửa các trường sai trước khi lưu
- Module **AI định khoản**:
  - Với mỗi hóa đơn đã OCR, AI gợi ý cặp Nợ/Có theo hệ thống TK TT133 + độ tin cậy + lý do
  - Hiển thị top-3 gợi ý, kế toán chọn/sửa
  - Lưu feedback để cải thiện prompt (few-shot từ lịch sử)
- Module **Sổ nhật ký chung**: danh sách bút toán đã duyệt, filter theo ngày/TK, export CSV
- Danh mục: Hệ thống tài khoản TT133 (seed sẵn), nhà cung cấp (auto tạo khi gặp MST mới)

## 2. Ngoài phạm vi MVP (không làm)

Tích hợp API Tổng cục Thuế, T-VAN, ngân hàng, BCTC đầy đủ (B01-B09), khấu hao TSCĐ, đa chi nhánh, mobile app, chatbot, dự báo dòng tiền, đối soát ngân hàng, phát hành HĐĐT. Những phần này thuộc Pha 2-3, chỉ mock UI nếu cần demo.

## 3. Luồng người dùng chính

```text
[Upload hóa đơn .jpg/.pdf]
        │
        ▼
[Edge: OCR pipeline]
   ├─ Gemini 3 Flash (vision) bóc field structured JSON
   └─ Validate: MST regex, tổng tiền = Σ dòng + VAT
        │
        ▼
[Form review của kế toán] ─── sửa nếu sai
        │
        ▼
[Edge: AI suggest định khoản]
   ├─ Input: NCC, mặt hàng, số tiền, VAT
   ├─ Context: hệ thống TK TT133 + 5 bút toán tương tự gần nhất
   └─ Output: 3 gợi ý {Nợ, Có, diễn giải, confidence, lý do}
        │
        ▼
[Kế toán chọn / sửa / approve]
        │
        ▼
[Ghi vào bảng journal_entries]
```

## 4. Kiến trúc kỹ thuật trên Lovable

- **Frontend**: TanStack Start (sẵn có) + Tailwind + shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — Postgres + Auth + Storage cho file hóa đơn
- **AI**: Lovable AI Gateway qua AI SDK, model `google/gemini-3-flash-preview` (multimodal, đọc ảnh trực tiếp — không cần OCR riêng giai đoạn MVP)
- **Server functions** (TanStack `createServerFn`):
  - `extractInvoice({ fileUrl })` → structured output với Zod schema
  - `suggestJournalEntry({ invoiceId })` → trả 3 gợi ý
- **Storage**: bucket `invoices` (private, RLS theo user_id)

### Schema DB tối thiểu

```text
profiles(id, email, company_name, tax_id)
chart_of_accounts(code, name, type, parent_code)   -- seed TT133
suppliers(id, user_id, tax_id, name, address, risk_flag)
invoices(id, user_id, file_path, supplier_id, invoice_no, issue_date,
         subtotal, vat_amount, total, status, raw_ocr jsonb)
invoice_lines(id, invoice_id, description, qty, unit_price, amount, vat_rate)
journal_entries(id, user_id, invoice_id, entry_date, description, created_at)
journal_lines(id, entry_id, account_code, debit, credit)
ai_suggestions(id, invoice_id, suggestions jsonb, chosen_index, feedback)
```

Tất cả bảng bật RLS theo `user_id = auth.uid()`. Role admin tách bảng `user_roles` riêng.

## 5. AI prompt strategy (điểm khác biệt)

**Extraction prompt**: dùng `Output.object` với Zod schema cho hóa đơn VN (MST 10/13 ký tự, thuế suất 0/5/8/10%, ngày DD/MM/YYYY). Gemini 3 Flash đọc ảnh trực tiếp.

**Suggestion prompt** (system):
- Context tĩnh: bảng TK TT133 rút gọn (~80 TK thường dùng), quy tắc định khoản chuẩn (mua hàng hóa → 156/1331/331, dịch vụ → 642/1331/331, TSCĐ → 211...).
- Few-shot động: lấy 5 bút toán gần nhất của cùng NCC hoặc cùng loại mặt hàng từ `journal_entries` user này.
- Output bắt buộc structured: `{ suggestions: [{ debit_account, credit_account, amount, description, confidence: 0-1, reasoning }] }`.

**Nguyên tắc an toàn**: AI không bao giờ auto-post. Mọi bút toán phải có kế toán nhấn "Duyệt". Lưu cả phiên bản AI đề xuất + phiên bản kế toán sửa để audit và fine-tune sau.

## 6. Lộ trình build (trong Lovable)

1. Enable Lovable Cloud + Auth (email/password)
2. Tạo migrations cho 7 bảng + seed `chart_of_accounts` TT133
3. Storage bucket `invoices` + RLS
4. Trang đăng nhập + dashboard layout (sidebar: Hóa đơn / Bút toán / Danh mục)
5. Trang Upload hóa đơn + server fn `extractInvoice`
6. Trang Review hóa đơn (form chỉnh sửa các trường OCR)
7. Server fn `suggestJournalEntry` + UI chọn gợi ý
8. Trang Sổ nhật ký + export CSV
9. Seed demo data + polish UI

## 7. Câu hỏi cần xác nhận trước khi code

- **Chuẩn áp dụng cho MVP**: TT133 (SME) — đúng chứ? Hay cần cả TT200?
- **Style/branding**: dùng tông gì? (đề xuất: clean fintech, xanh navy + accent emerald, font Inter — hợp tài chính VN). Có muốn tôi tạo design directions không?
- **Seed dữ liệu demo**: có muốn tôi tạo 5-10 hóa đơn mẫu (ảnh giả lập) để demo ngay không?

Sau khi bạn xác nhận 3 điểm trên, tôi sẽ bắt đầu enable Cloud và build theo thứ tự ở mục 6.
