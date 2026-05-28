# Sửa crash React #185 khi click card Quy tắc

## Nguyên nhân

Trong `RuleEditor.tsx` có pattern setState trong render (anti-pattern dễ gây "Maximum update depth exceeded" = React #185):

```tsx
// Reset draft khi rule prop đổi
if (draft.id !== rule.id) {
  setDraft(rule);        // ← setState trong render
  setHasTested(false);
}
```

Kết hợp với việc `RuleCard.tsx` luôn mount `RuleEditor` (và `RuleApplicationsSheet`) ngay cả khi `editOpen=false`, mỗi lần một card render lại (do react-query invalidate `["ai-memory"]` sau mọi mutation, do tooltip/hover, do parent state đổi…) thì editor cũng render. Khi `rule` prop là object mới nhưng cùng id, branch trên không cháy — nhưng pattern này vẫn fragile và còn gây **bug pre-fill**: bấm "Chuyển sang dạng cấu trúc" trên banner legacy không nạp được `conditions/actions` đã parse vì `draft.id === rule.id` nên `setDraft` bị bỏ qua.

Cách sửa đúng kiểu React: **dùng `key` để remount editor theo id** thay vì derived-state-trong-render, và **chỉ mount khi mở** để tránh hàng chục editor sống song song trên list.

## Thay đổi

### 1. `src/components/ai-memory/rules-v2/RuleEditor.tsx`
- Xoá khối `if (draft.id !== rule.id) { setDraft(rule); setHasTested(false); }`.
- `useState(rule)` chỉ chạy khi mount → kết hợp với `key` ở parent là đủ.

### 2. `src/components/ai-memory/rules-v2/RuleCard.tsx`
- Chỉ render `<RuleEditor>` khi `editOpen` (mount-on-open) và truyền `key={(prefilled ?? rule).id + (prefilled ? ":pf" : "")}` để mỗi lần mở/đổi prefilled thì state draft khởi tạo lại đúng.
- Tương tự với `<RuleApplicationsSheet>`: chỉ render khi `historyOpen`.
- Giữ nguyên logic `openEditorWithPrefill` (parse legacy → set prefilled → open). Nhờ remount, draft sẽ nhận đúng object đã pre-fill.

### 3. `src/components/ai-memory/rules-v2/RulesListV2.tsx`
- Thêm `key={r.id}` cho cả 2 `<RuleEditor>` ở cuối (draft / approving) để cùng pattern.

## Phạm vi không động tới

- Không đổi server functions, schema, hay logic save/promote/disable.
- Không đổi `ConditionsBlock`, `ActionsBlock`, `RuleSettings`, `RuleTestPanel`.

## Cách kiểm chứng

1. Click vào tiêu đề một card quy tắc bất kỳ (kể cả card "Quy tắc hạch toán" trong danh sách) → editor mở, không còn lỗi #185.
2. Click "Chuyển sang dạng cấu trúc" trên banner legacy → editor mở với conditions/actions đã được parse sẵn (verify thêm bug pre-fill đã sửa).
3. Đóng/mở lại editor → state reset sạch sẽ.
4. Trên danh sách dài (nhiều rule), mở 1 editor không khiến các card khác re-render lặp.
