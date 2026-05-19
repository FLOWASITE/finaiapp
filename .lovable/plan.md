## Mục tiêu

Mọi nơi đang nhập **mã tài khoản** bằng `<Input>` text trong phân hệ **Tài sản cố định**, **Tài sản phân bổ (CCDC)** và **Lương** sẽ được thay bằng **picker chọn TK từ danh mục TK hệ thống** (`chart_of_accounts`), tránh nhập sai mã / lệch với COA.

## Cách tiếp cận

Đã có sẵn:
- `listChartOfAccounts` server fn (`src/lib/coa.functions.ts`).
- Component `AccountCombobox` đang nằm **private** trong `src/components/voucher-form.tsx` (có search theo mã + tên, có nhóm "Gợi ý thường dùng" + "Toàn bộ COA", chỉ hiện TK active).

→ **Tách `AccountCombobox` thành component dùng chung** ở `src/components/ui/account-combobox.tsx`, nhận props:
- `value`, `onChange`
- `suggestions?: { code: string; name: string }[]` (gợi ý theo ngữ cảnh, optional)
- `placeholder?`, `disabled?`

Voucher-form import lại từ component chung (không đổi hành vi).

Mỗi route dùng `useQuery(["coa"], listChartOfAccounts)` 1 lần, share qua cache (đã có sẵn key `"coa"`).

## Điểm thay thế

### A. Tài sản cố định
1. `src/routes/_app/assets/index.tsx` (form TSCĐ) — 3 ô:
   - TK Tài sản (211), TK Hao mòn (214), TK Chi phí KH
   - Suggestions: `211x` / `214x` / `6422,6421,6427,154,627,641,642`
2. `src/routes/_app/assets/categories.tsx` (nhóm TSCĐ) — 3 ô tương tự (default_*).
3. `src/routes/_app/assets/disposal.tsx` (thanh lý) — 5 ô:
   - TK thu tiền, TK VAT đầu ra, TK thu nhập khác (711), TK chi phí khác (811), TK trả chi phí thanh lý.
4. `src/routes/_app/assets/reclassify.tsx` (tái phân loại) — `target_account` (153/242/211…), `expense_account`.
5. `src/routes/_app/assets/books.tsx` — sổ KH cũng có 3 ô account theo `fa-books.functions.ts`. Kiểm tra & thay nếu UI đang dùng Input (xem nhanh trước khi sửa).

### B. Tài sản phân bổ (CCDC)
6. `src/routes/_app/assets/allocations.tsx` — `prepaid_account` (242/142), `expense_account` (6423/627…).
7. Wizard **from-invoice** (`from-invoice.tsx`) & **from-fixed-asset** (`from-fixed-asset.tsx`) nếu có ô account → thay luôn.

### C. Lương
8. `src/routes/_app/payroll/components.tsx` — `expense_account` của cấu phần lương (62x/64x/154).
9. `src/routes/_app/payroll/policies.tsx` — quét và thay các ô TK nếu có (phụ cấp/BHXH mặc định).

## Không đổi
- Server fn (zod schema vẫn `z.string().min(1).max(20)`) — phía BE không cần đổi.
- `bank_account` (số TK ngân hàng NV) **không** phải mã TK COA → giữ nguyên Input.
- Tên cột DB, JE lines, báo cáo: không đổi.

## Chi tiết kỹ thuật

```tsx
// src/components/ui/account-combobox.tsx
export function AccountCombobox({ value, onChange, suggestions = [], placeholder, disabled }: Props) {
  const fetchCoa = useServerFn(listChartOfAccounts);
  const { data: coa } = useQuery({ queryKey: ["coa"], queryFn: () => fetchCoa({}), ...QUERY_PRESETS.REFERENCE });
  // ... copy logic từ voucher-form, lọc is_active, merge suggestions, search code+name
}
```

Mỗi điểm thay = đổi:
```tsx
<Input value={form.asset_account} onChange={e => set(...)} />
// →
<AccountCombobox value={form.asset_account} onChange={v => set("asset_account", v)}
  suggestions={[{code:"211", name:"TSCĐ hữu hình"}, {code:"2111",...}, ...]} />
```

## Thứ tự thi hành
1. Tạo `account-combobox.tsx` chung + refactor `voucher-form.tsx` import nó.
2. Thay tại TSCĐ (5 file mục A).
3. Thay tại CCDC (mục B).
4. Thay tại Lương (mục C).
5. Build check + smoke test mở từng dialog xem combobox load COA OK.

## Câu hỏi xác nhận
- Đồng ý phương án trên?
- Có muốn **chặn lưu** nếu mã TK không tồn tại trong `chart_of_accounts` (validation phía serverFn), hay chỉ cần UI picker là đủ?
