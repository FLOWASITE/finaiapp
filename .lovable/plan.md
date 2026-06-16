## Mục tiêu
Seed thêm các dịch vụ phổ biến vào **thư viện toàn cục** (`tenant_product_catalog` với `is_global = true`), thuộc 4 nhóm: Chi phí văn phòng, Vận chuyển & giao nhận, Dịch vụ chuyên môn, Marketing & quảng cáo.

Sau khi seed, mọi tổ chức (kể cả tổ chức mới tạo như "Linh kiện Tân Phú") sẽ thấy ngay các mục này trong tab **Thư viện** của trang Hàng hóa & dịch vụ. Người dùng bấm **Thêm** để đưa vào tab **Của tôi** (cơ chế hiện có — không cần code mới).

Lưu ý về câu hỏi: bạn chọn "thêm vào Của tôi" + phạm vi "Mọi tổ chức". Cách an toàn nhất là seed vào **thư viện toàn cục** (1 lần, dùng cho mọi tenant) thay vì insert hàng loạt vào bảng `products` của từng tenant (sẽ tạo rác ở các tenant không cần và khó rollback). Nếu bạn thực sự muốn auto-promote vào "Của tôi" cho tenant đang active, nói thêm và tôi sẽ bổ sung bước đó.

## Danh sách dịch vụ sẽ thêm (~28 mục)

**Chi phí văn phòng** (`item_type=service`, `default_account=642`, VAT 8–10%)
- Tiền điện, Tiền nước, Cước internet, Cước điện thoại cố định, Cước điện thoại di động, Thuê văn phòng, Phí quản lý tòa nhà, Văn phòng phẩm (dịch vụ), Dịch vụ vệ sinh văn phòng, Dịch vụ bảo vệ

**Vận chuyển & giao nhận** (`item_type=service`, `default_account=641` cho bán / `642` mặc định)
- Cước vận chuyển nội địa, Phí giao hàng nhanh (ship), Phí bốc xếp, Phí lưu kho/kho bãi, Cước vận tải đường bộ, Phí hải quan & thông quan

**Dịch vụ chuyên môn** (`item_type=service`, `default_account=642`)
- Dịch vụ kế toán thuê ngoài, Dịch vụ tư vấn thuế, Phí kiểm toán, Dịch vụ tư vấn pháp lý, Phí công chứng, Dịch vụ dịch thuật, Phí dịch vụ ngân hàng

**Marketing & quảng cáo** (`item_type=service`, `default_account=641`)
- Quảng cáo Facebook Ads, Quảng cáo Google Ads, Quảng cáo TikTok Ads, Dịch vụ thiết kế đồ họa, Chi phí in ấn (catalog, brochure, name card), Tổ chức sự kiện, Quà tặng khách hàng

## Triển khai kỹ thuật
1. Một lệnh `INSERT ... ON CONFLICT (tenant_id, name_norm) DO NOTHING` vào `public.tenant_product_catalog` với:
   - `tenant_id = NULL`, `is_global = true`
   - `name_norm` chuẩn hoá đúng quy ước `normalizeLineName` (lowercase, bỏ dấu, trim) để index `tenant_product_catalog_unique` và mapper hiện tại nhận diện được.
   - `category` map sang các code đang dùng trong `adapt.ts`: `VAN_PHONG`, `RETAIL`/`MANUFACTURING`-không phù hợp → dùng `VAN_PHONG` cho vận chuyển/marketing, `CHUYEN_MON` cho chuyên môn. (Adapter sẽ tự rơi về `VAN_PHONG` nếu không khớp — chấp nhận được.)
   - `item_type = 'service'`, `default_account` & `vat_rate` như trên.
2. Idempotent: chạy lại nhiều lần không tạo trùng nhờ unique `(tenant_id, name_norm)`.
3. Không sửa schema, không đổi RLS, không sửa code frontend.

## Kiểm thử sau seed
- Vào trang `/items`, tab **Thư viện**: thấy 28 mục mới ở 4 nhóm.
- Bấm **Thêm** trên một mục → xuất hiện trong tab **Của tôi** của tenant hiện tại.
- Tạo tenant mới → tab **Thư viện** vẫn có đầy đủ 28 mục.