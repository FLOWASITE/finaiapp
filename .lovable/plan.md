
# UI-First Architecture — Kế toán làm Backend

Dựa trên 4 lựa chọn của bạn: **Hybrid workspace · Command-first · Ẩn lớp kế toán mặc định · AI sheet làm composer chính**.

## 1. Hai workspace song song

```text
┌─────────────────────────────────────────────────────────┐
│  Topbar:  [Logo]  [⌘K Command]  [Workspace ▾]  [User] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  /  → FRONT-OFFICE  (mặc định cho mọi user)            │
│        Inbox · Tiền · Đối tác · Hàng hoá · Hỏi AI      │
│                                                         │
│  /accounting → BACK-OFFICE  (chỉ role accountant)      │
│        Journal · COA · Sổ cái · BCTC · Đối soát · Kỳ   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- **Workspace switcher** ở topbar (giống Linear "Workspaces"): 1 click chuyển giữa Front/Back.
- URL prefix rõ ràng: route hiện tại nằm dưới `_app/` sẽ được chia thành `_app/(front)/...` và `_app/(back)/...`. Tất cả module kế toán hiện có (`coa`, `journal`, `bank.book`, `reports`, `tax`…) chuyển vào back-office, không xoá.
- Role-based: non-accountant chỉ thấy switcher khi được cấp quyền; mặc định landing = Front.

## 2. Front-Office — 5 không gian, không phải 30 module

Thay vì sidebar 30 mục như hiện tại, gom thành 5 trục mà non-accountant hiểu ngay:

| Không gian | Thay thế cho module hiện tại | Câu hỏi nó trả lời |
|---|---|---|
| **Inbox** (mặc định) | Pending actions, ePending, duyệt nháp | "Hôm nay tôi cần làm gì?" |
| **Tiền** | bank, cash, receipts, payments, reconcile | "Tiền vào/ra/tồn thế nào?" |
| **Đối tác** | customers, suppliers, receivables, payables | "Ai nợ tôi? Tôi nợ ai?" |
| **Hàng hoá** | items, inventory, assets | "Bán gì, tồn bao nhiêu?" |
| **Hồ sơ** | invoices, einvoices, documents | "Hoá đơn, file đã có gì?" |

Sidebar trái chỉ 5 icon + Hỏi AI ở dưới. Mọi route con (vd `/bank/reconcile`) vẫn giữ URL cũ, chỉ đổi cách user *vào* chúng.

## 3. Command-first navigation (Cmd+K là trung tâm)

Nâng cấp `command-palette.tsx` hiện có thành **trung tâm thao tác** thay vì chỉ tìm trang:

```text
⌘K mở →

┌──────────────────────────────────────────────────┐
│ 🔍 Gõ tự nhiên hoặc tìm…                         │
├──────────────────────────────────────────────────┤
│ HÀNH ĐỘNG                                        │
│  + Thu tiền từ khách A 5 triệu                   │
│  + Ghi chi phí điện tháng 11                     │
│  + Nhập file PDF / sao kê                        │
│  + Đối soát ngân hàng                            │
├──────────────────────────────────────────────────┤
│ ĐI ĐẾN                                           │
│  → Khách hàng / Acme Corp                        │
│  → Sao kê Vietcombank tháng 11                   │
├──────────────────────────────────────────────────┤
│ HỎI                                              │
│  ? Tháng này lãi bao nhiêu?                      │
│  ? Ai nợ tôi quá 30 ngày?                        │
└──────────────────────────────────────────────────┘
```

Parser nhẹ ở client phân loại input:
- Bắt đầu bằng `+` hoặc động từ ("thu", "chi", "mua") → mở **AskAiSheet** với prompt prefilled (composer).
- Bắt đầu bằng `?` hoặc câu hỏi → mở AskAiSheet ở mode **Q&A** với insight widget.
- Còn lại → fuzzy search trang/đối tác/chứng từ.

Phím tắt phụ giữ chuẩn Linear: `C` = create, `G` then `I` = go to Inbox, `G` then `T` = Tiền, `?` = help.

## 4. AskAiSheet trở thành composer chính

Sheet hiện tại (`Cmd+J`) đã có upload + extract. Mở rộng thành **một entry point duy nhất** cho mọi nghiệp vụ:

- **Bỏ** các nút "Tạo mới" rải rác trên từng module. Chỉ còn 1 nút `+ Thêm` ở topbar → mở AskAiSheet.
- Sheet có 3 tab ngang: **Gõ** (natural language) · **Tải file** (đa file batch hiện có) · **Mẫu nhanh** (6 card: Thu, Chi, Bán, Mua, Nhập kho, Chuyển khoản).
- Mọi đường dẫn tạo nháp hiện tại (`createPurchaseInvoice`, `createBankVoucher`, …) vẫn dùng `proposeActionFn` — không đổi backend.
- Sau khi AI trả về nháp → preview ở `/import/preview` (đã có) → confirm → vào duyệt.

## 5. Ẩn lớp kế toán mặc định, mở khi cần

Mọi card chứng từ ở Front-office hiển thị **ngôn ngữ kinh doanh**:

```text
┌────────────────────────────────────────────────┐
│ Acme Corp đã thanh toán                        │
│ +5.000.000₫        15/11/2025 · Vietcombank    │
│                                                │
│ Ghi vào: Doanh thu • Phải thu khách hàng       │
│         [Xem bút toán ▾]                       │
└────────────────────────────────────────────────┘
```

- Mặc định: tên TK thân thiện ("Doanh thu", "Phải thu KH"), không hiện 511/131.
- Toggle "Chế độ kế toán" ở User menu → bật lên thì mọi card hiện thêm dòng `Nợ 112 / Có 131 — 5.000.000` và mã TK.
- Map mã ↔ tên: tạo `src/lib/accounting/account-labels.ts` (lookup `COA.name` + fallback dictionary cho mã chuẩn VAS).

## 6. Inbox — landing page mới

Thay `dashboard.tsx` 628 dòng bằng Inbox theo phong cách Linear/Superhuman:

- Các "lane" gom việc: **Cần duyệt** (nháp AI) · **Quá hạn** (AR/AP) · **Chưa đối soát** (sao kê) · **Sắp đến hạn** (thuế, lương) · **Bất thường** (insight AI).
- Mỗi dòng = 1 hành động, phím `E` archive, `Enter` mở chi tiết, `A` approve.
- Widget AI nhỏ ở phải hiển thị 3 câu hỏi gợi ý kiểu "Tháng này so với tháng trước?".

Dashboard số liệu cũ chuyển thành route `/insights` (vẫn truy cập được, không phải landing).

## 7. Back-Office giữ nguyên kế toán đầy đủ

Tất cả module hiện có (journal, COA, BCTC, sổ cái, đối soát, tax, kỳ kế toán, audit) **không đổi**, chỉ:
- Chuyển vào prefix `/accounting/...`.
- Sidebar back-office là dạng dày như hiện tại — kế toán quen rồi.
- Có nút "← Front-office" trên topbar để chuyển nhanh.

## 8. Việc cần làm (theo thứ tự)

1. **Routing skeleton**: tạo `src/routes/_app/(front)/` và `src/routes/_app/(back)/`, di chuyển file (file-based routing tự cập nhật routeTree). Không xoá file, chỉ move.
2. **Workspace switcher + role**: thêm context `useWorkspace()` lưu Front/Back, thêm toggle ở `app-header.tsx`.
3. **Sidebar mới**: tạo `front-sidebar.tsx` (5 icon) bên cạnh `app-sidebar.tsx` (giữ làm back-sidebar).
4. **Inbox route** `/` hoặc `/inbox`: gom dữ liệu từ pending actions, AR/AP overdue, unmatched bank txns.
5. **Command palette nâng cấp**: thêm 3 section (Hành động / Đi đến / Hỏi) + parser intent + tích hợp mở AskAiSheet với prefill.
6. **AskAiSheet 3 tab**: thêm tab "Mẫu nhanh" với 6 card, tab "Gõ" cho natural language composer.
7. **Friendly account labels**: `account-labels.ts` + component `<AccountTag code="511" />` dùng chung; toggle "Chế độ kế toán" trong User menu (persist localStorage).
8. **Document card**: component `<DocumentCard>` chung cho front-office, render theo ngôn ngữ kinh doanh + accordion "Xem bút toán".
9. **Back-office shell**: `_app/(back)/layout.tsx` giữ sidebar dày, header có breadcrumb "Back-office · …".
10. **Migration của dashboard**: chuyển dashboard hiện tại → `/insights`, thay home thành Inbox.

## Chi tiết kỹ thuật

- **Không đụng backend**: tất cả serverFn (`createPurchaseInvoice`, `importAndPostStatement`, `proposeActionFn`…) giữ nguyên. UI chỉ là lớp trình bày mới.
- **Route grouping** trong TanStack: thư mục dạng `(front)` không xuất hiện trong URL, chỉ để gom layout — đúng pattern hiện có cho `_app`.
- **Role check**: dùng `useUserRole()` hiện có, gate workspace switcher bằng role `accountant` hoặc `admin`.
- **Persistence**: workspace hiện tại + "Chế độ kế toán" lưu `localStorage`; route active vẫn là source of truth.
- **Không phá link**: mọi URL hiện tại (`/bank/reconcile`, `/invoices`, …) tiếp tục resolve — chỉ chuyển vị trí file trong cây, không đổi path.
- **i18n**: account label map đặt riêng để sau này dễ swap sang tiếng Anh.

## Phạm vi của plan này

- ✅ Bao gồm: routing reshape, workspace switcher, sidebar front mới, command palette, AskAiSheet composer, friendly labels, Inbox landing.
- ❌ Không bao gồm (làm sau): redesign visual từng module back-office, mobile layout, chỉnh sửa nghiệp vụ kế toán, thay đổi data model.

Bạn có thể bấm "Thực hiện kế hoạch" để mình bắt đầu từ bước 1 (routing skeleton + workspace switcher), hoặc cho biết muốn ưu tiên bước nào trước.
