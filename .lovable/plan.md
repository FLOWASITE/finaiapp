
## Mục tiêu
Sắp xếp lại tab **Tổ chức** trong `/settings` thành 3 section rõ ràng theo yêu cầu, đổi tên các thuật ngữ cho gần gũi với KTV Việt Nam, gộp trang **Hoạt động kinh doanh & Mặt hàng** (hiện ở `/settings/business-activity`) vào ngay trong tab này.

## Bố cục mới

### 1. Thông tin doanh nghiệp (đổi từ "Hồ sơ pháp lý")
Bố cục field theo từng dòng (md:grid-cols-12 để khớp tỉ lệ):

```text
[ MST ] [ Logo (upload nhỏ) ] [ Tên Công ty ............... ]
[ Đại diện pháp luật ] [ Ngày thành lập ] [ Website ]
[ Loại hình DN: ◉ Công ty   ○ Hộ kinh doanh ]
[ Địa chỉ ............ ] [ Điện thoại ] [ Email ]
[ Ngành nghề kinh doanh (multi-select) ]
```

Thay đổi từ vựng:
- "Tên pháp nhân" → **Tên Công ty**
- Bỏ "Tên giao dịch / Thương hiệu", "Tên hiển thị nội bộ", "Cơ quan thuế quản lý" (chuyển sang section 2)
- "Loại hình doanh nghiệp" rút còn 2 lựa chọn UI: **Công ty** / **Hộ kinh doanh** (map xuống `legal_form`: chọn "Công ty" giữ giá trị chi tiết hiện tại nếu có — `llc/jsc/partnership/sole_prop/branch/other`; chọn "Hộ kinh doanh" → `household`). Nếu DB đang có giá trị chi tiết, UI hiển thị radio "Công ty" được chọn.
- Logo di chuyển từ section "Thương hiệu & Chữ ký" lên đây (upload thumbnail inline cạnh tên công ty). Chữ ký + con dấu giữ ở section "Người đại diện" (xem dưới).

### 2. Thông tin kế toán thuế (đổi từ "Cấu hình kế toán")
```text
[ Chế độ kế toán ] [ Ngày bắt đầu năm tài chính ] [ Đồng tiền ]
[ Kỳ kê khai GTGT ] [ Phương pháp tính thuế ] [ Cơ quan thuế quản lý ]
```

Thay đổi từ vựng & field:
- Tiêu đề: "Cấu hình kế toán" → **Thông tin kế toán thuế**
- "Chuẩn kế toán áp dụng" → **Chế độ kế toán**
- "Tháng bắt đầu năm tài chính" → **Ngày bắt đầu năm tài chính** (đổi từ Select tháng sang Day+Month picker, mặc định 01/01; lưu thêm field `fiscal_year_start_day` = 1, giữ `fiscal_year_start` cho tháng)
- Đưa "Cơ quan thuế quản lý" sang đây (đang ở section 1 cũ)
- Bỏ "Kỳ kê khai TNCN" khỏi section này (giữ field trong DB, ẩn UI — hoặc đưa xuống mục nâng cao nếu cần — mặc định ẩn theo yêu cầu)

### 3. Hoạt động kinh doanh (gộp từ `/settings/business-activity`)
Đưa nội dung trang `/settings/business-activity` vào dạng section inline:
```text
Ngành nghề kinh doanh  (multi-select — share field `industries` với section 1, hiển thị readonly hoặc đồng bộ)
Loại hình hoạt động    (checkbox: Thương mại / Sản xuất / Dịch vụ)
Danh mục mặt hàng kinh doanh  (bảng + nút Thêm/Import CSV — y nguyên ProductDialog)
```
Trang `/settings/business-activity` giữ làm route riêng (cho shortcut) nhưng nội dung được tái sử dụng qua component dùng chung `<BusinessActivitySection />` để hiển thị trong tab Tổ chức.

### Các section còn lại
- **Người đại diện** (giữ nguyên) + dời "Chữ ký đại diện" và "Con dấu công ty" xuống đây (vì gắn với pháp nhân/đại diện)
- Section **Liên hệ & Địa chỉ** (cũ) bị giải tán: địa chỉ/điện thoại/email gộp vào section 1; địa chỉ giao hàng (toggle) chuyển xuống cuối section 1.
- Section **Thương hiệu & Chữ ký** (cũ) bỏ.

## Side nav (SectionNav)
Cập nhật danh sách 3 mục mới:
- `sec-business` — Thông tin doanh nghiệp
- `sec-tax` — Thông tin kế toán thuế
- `sec-activity` — Hoạt động kinh doanh
- `sec-reps` — Người đại diện (giữ)

## Chi tiết kỹ thuật
- File chính: `src/routes/_app/settings/index.tsx` — refactor `OrganizationTab`, cập nhật `SECTIONS`.
- Tạo component dùng chung: `src/components/settings/business-activity-section.tsx` — copy logic từ `src/routes/_app/settings/business-activity.tsx`. Trang `/settings/business-activity` chuyển thành wrapper render component này.
- Logo upload inline: tận dụng `CompactImageRow` thu nhỏ (chỉ icon + button "Tải logo").
- Loại hình DN 2-option: dùng `RadioGroup` (shadcn). Mapping helper:
  ```ts
  // UI value 'company' | 'household'
  const uiKind = form.legal_form === 'household' ? 'household' : 'company';
  ```
  Khi chuyển sang "Công ty" mà chưa có giá trị chi tiết → mặc định `llc`.
- "Ngày bắt đầu năm tài chính": 2 select Day(1–31) + Month(1–12), validate hợp lệ. DB: thêm cột `fiscal_year_start_day INT DEFAULT 1` (migration nhỏ) — chỉ chạy khi user duyệt.
- Không thay đổi logic save, RLS, hay business-activity functions.

## Phạm vi không thay đổi
- Các tab khác (Hồ sơ cá nhân, Thành viên, Phân quyền, Khoá sổ, Tỷ giá): không đụng.
- Shortcut cards phía trên: giữ nguyên.
- Trang `/settings/business-activity`: giữ route, dùng lại component mới.

## Câu hỏi xác nhận
1. **Ngành nghề kinh doanh** xuất hiện cả Section 1 và Section 3 — có ý là cùng 1 trường, hiển thị 2 nơi để tiện tra cứu, đúng không? (Tôi sẽ share state, sửa ở đâu cũng cập nhật cùng nhau.)
2. **Tháng bắt đầu năm tài chính → Ngày bắt đầu**: cần cả ngày+tháng (vd 01/04) hay chỉ đổi label nhưng vẫn chọn tháng? Tôi mặc định ngày+tháng (cần migration cột mới).
3. Có cần giữ field **Tên hiển thị nội bộ / Tên giao dịch** ở đâu đó (vd ẩn trong "Thêm tuỳ chọn") hay xoá luôn khỏi UI?
