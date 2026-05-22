## Mục tiêu

Làm cho luồng "Thông tin đăng nhập MB" **đúng với BIZ MBBank doanh nghiệp**: form 3 trường (Mã công ty · Tên đăng nhập · Mật khẩu), bố cục & màu sắc gần với trang đăng nhập gốc của BIZ MBBank để người dùng nhận diện ngay và nhập đúng thông tin.

## Bối cảnh kỹ thuật quan trọng

Thư viện `mbbank` npm (Worker hiện đang dùng) **chỉ hỗ trợ MB App cá nhân** — không có endpoint cho BIZ MBBank corporate. BIZ MBBank dùng API khác (`api.biz.mbbank.com.vn`) với:
- 3 trường đăng nhập + captcha ảnh (không có OCR sẵn)
- Token/session cơ chế riêng, có thể yêu cầu OTP/SmartOTP từ thiết bị đã đăng ký

⇒ **Phần backend tự động đồng bộ BIZ MBBank cần một worker riêng mới**, không nằm trong phạm vi PR này (rủi ro cao, cần reverse-engineer API, có thể vi phạm điều khoản — nên thảo luận riêng).

Phạm vi PR này:
- **UI form đăng nhập** đúng 3 trường, brand BIZ MBBank.
- **Schema + server fn** lưu được `mb_corporate_id` cùng credentials hiện tại.
- Đồng bộ tự động qua Worker hiện tại sẽ **tạm tắt mặc định** cho tài khoản BIZ và hiển thị banner "Đang phát triển" — không gọi Worker cá nhân nhầm.

## Thay đổi cụ thể

### 1. Database (migration)
`ALTER TABLE public.bank_accounts ADD COLUMN mb_corporate_id text;`
- Cột nullable để tương thích tài khoản cá nhân đã lưu.
- Không thêm index (truy vấn không lọc theo).

### 2. Server functions (`src/lib/mbbank.functions.ts`)
- `setMbCredentials` nhận thêm `corporate_id: string (1..50)` (optional cho cá nhân, **bắt buộc** với BIZ — validate phía UI).
- Lưu vào `mb_corporate_id`.
- `getMbSyncStatus` trả thêm `mb_corporate_id` để UI hiển thị mask.
- `disconnectMb` clear thêm `mb_corporate_id`.

### 3. UI — `src/components/mbbank-connect-dialog.tsx`
Thiết kế lại block "Empty state" (chưa kết nối) thành **2 chế độ** trên cùng 1 form, có toggle tab nhỏ:

```text
┌─ Loại tài khoản:  [ Doanh nghiệp (BIZ) ] [ Cá nhân ] ─┐
│                                                       │
│  [BIZ MBBank logo bar]                                │
│  Ngân hàng số dành cho khách hàng doanh nghiệp       │
│                                                       │
│  Mã công ty *           Tên đăng nhập *               │
│  [ ____________ ]       [ ______________ ]            │
│                                                       │
│  Mật khẩu *                                           │
│  [ ____________ ] 👁                                  │
│                                                       │
│  ☐ Tự động đồng bộ sau khi kết nối                    │
│  [   Kết nối & lưu thông tin   ]                      │
│                                                       │
│  ℹ️  BIZ MBBank đang trong giai đoạn thử nghiệm —     │
│      đồng bộ tự động chưa khả dụng                    │
└───────────────────────────────────────────────────────┘
```

Chi tiết:
- **Header brand bar**: dải gradient xanh BIZ (`#0046b8 → #003d9e`) với chữ "BIZ MBBank" trắng + tag "Ngân hàng số doanh nghiệp" — không dùng logo gốc (tránh vấn đề bản quyền), dùng typography để gợi nhớ.
- **Toggle Doanh nghiệp / Cá nhân**: dùng `Tabs` (shadcn) ở đầu, mặc định "Doanh nghiệp (BIZ)". Khi chuyển sang "Cá nhân" thì ẩn trường `Mã công ty` và đổi label "Tên đăng nhập" → "Số điện thoại / Username".
- **Inputs**: cao 44px (`h-11`), bo `rounded-md`, focus ring xanh BIZ. Label uppercase nhỏ + `*` đỏ cho bắt buộc — đúng style BIZ.
- **Validation client**:
  - BIZ: cả 3 trường bắt buộc, `corporate_id` regex `^[A-Za-z0-9]{3,20}$`.
  - Cá nhân: username + password bắt buộc.
- **Banner "Đang phát triển"**: chỉ hiện khi chế độ BIZ — text `bg-amber-50 text-amber-900 border-amber-200` với icon `Construction`.
- **Auto-disable sync cho BIZ**: sau khi save creds BIZ, **không** gọi `toggleMbSync(true)` (khác cá nhân). Người dùng phải tự bật sau khi worker BIZ sẵn sàng.
- **Connected state cho BIZ**: tab "Tổng quan" hiển thị thêm dòng "Mã công ty: `ABC***`" (mask 3 ký tự đầu + sao). Toggle "Tự động đồng bộ" bị disable, có tooltip "Sắp ra mắt cho BIZ MBBank".

### 4. Component nhỏ tách ra
`src/components/mbbank-biz-brand-bar.tsx` — dải header brand BIZ tái sử dụng trong cả empty state và header Sheet.

## Files thay đổi

| File | Thay đổi |
|---|---|
| migration | Thêm cột `mb_corporate_id` |
| `src/lib/mbbank.functions.ts` | `setMbCredentials` nhận corporate_id; `disconnectMb` clear; `getMbSyncStatus` trả thêm |
| `src/components/mbbank-connect-dialog.tsx` | Tabs BIZ/Cá nhân, 3 trường BIZ, banner "đang phát triển", auto-disable sync cho BIZ |
| `src/components/mbbank-biz-brand-bar.tsx` (mới) | Dải brand BIZ |

Không đổi: Worker, endpoints `/ingest`, `/sync-error`, `/accounts`, `/sync-log-start`.

## Không bao gồm (cần PR riêng)

- Reverse-engineer API BIZ MBBank (đăng nhập, lấy số dư, lấy giao dịch).
- Worker mới `external/mbbank-biz-worker/` chạy puppeteer/playwright headless để giải captcha + SmartOTP.
- Xử lý OTP push từ app BIZ MBBank.

Đây là một dự án ~2-5 ngày tách biệt, có rủi ro pháp lý/khoá tài khoản — nên xác nhận lại trước khi làm.

Bấm **Implement plan** để mình thực hiện phần UI + schema ngay.