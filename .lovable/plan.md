## Mục tiêu
Chỉ chỉnh UI/UX của `src/components/chat/parse-progress-dialog.tsx` (và truyền thêm 1 prop từ `composer.tsx` nếu cần). Không đụng logic server/DB.

## 1. Visual stepper 3 pha (Parsing → Classifying → Ready)
Thêm thanh stepper ngang ngay dưới `DialogHeader`:

```text
[●─Parsing────]──[○─Classifying──]──[○─Ready──]
   done           active             pending
```

- Mỗi bước có icon (Loader2 khi active, CheckCircle2 khi done, vòng tròn rỗng khi pending) + nhãn + đường nối đổi màu.
- Active dùng `text-primary`, done dùng `text-emerald-500`, pending `text-muted-foreground`.
- Animation: đường nối fill từ trái → phải bằng `transition-all duration-500`.

## 2. Metrics & ETA
Bổ sung khối thống kê dưới stepper:

- Pha **parsing**: `{doneCount}/{total} xong · {errorCount} lỗi · ⏱ {elapsed}s · ~{eta}s còn lại · {speed} file/s`
  - `elapsed` tính từ lần đầu prop `phase==='parsing'` (lưu `startedAt` bằng `useRef`).
  - `speed = doneCount / elapsedSec`; `eta = (total-doneCount)/speed`.
- Pha **classifying**: badge tổng cảnh báo `{warnCount} cảnh báo · {errorCount} chặn`.
- Pha **ready**: `Tổng thời gian {totalMs}s · {avgMs}s/file`.

## 3. Pha Classifying — gom nhóm + tóm tắt + auto-skip

### 3a. Banner tóm tắt (sticky top trong scroll area)
```text
✓ 3 OK    ⚠ 2 trùng hoá đơn    ⚠ 1 cần tạo TK    ⊘ 2 đã tự bỏ qua
```
Chip có thể click để filter danh sách bên dưới (state `filter: 'all'|'ok'|'dup'|'bank'|'skipped'`).

### 3b. Gom nhóm theo loại cảnh báo
Phân loại mỗi `ClassificationResult` thành 1 bucket:
- `file_dup` — có warning `file_duplicate`
- `invoice_dup` — `invoice_duplicate` / `voucher_duplicate`
- `bank_unknown` — `bank_account_unknown`
- `txn_overlap` — có `txn_overlap.duplicate_count > 0` nhưng không thuộc trên
- `ok` — không có warning nào

Render dưới dạng các `<section>` collapsible với header:
```text
▾ Trùng file (2)     [Bỏ qua tất cả] [Tiếp tục tất cả]
  └ ClassifyRow ...
  └ ClassifyRow ...
▾ Hoá đơn đã tồn tại (1)
▾ TK ngân hàng chưa khớp (1)
▾ OK (3)
```
Mặc định mở các nhóm có cảnh báo, đóng nhóm `OK`.

### 3c. Auto-skip file trùng hoàn toàn
Trong `composer.tsx`, khi nhận `classifications`, init `decisions`:
- Nếu có warning `type === 'file_duplicate'` → `decisions[i].action = 'skip'`.
- Nếu user click "Khôi phục" thì set lại `'continue'`.
- Thêm badge nhỏ `Đã tự bỏ qua` trên các row auto-skip để rõ lý do.

(Đây là thay đổi nhỏ trong init logic của `composer.tsx`; component dialog vẫn nhận `decisions` từ ngoài.)

## 4. Files chạm vào
- `src/components/chat/parse-progress-dialog.tsx` — thêm stepper, metrics, banner tóm tắt, group sections, bulk action mỗi nhóm, filter chip.
- `src/components/chat/composer.tsx` — chỗ build initial `decisions`: tự set `skip` cho file_duplicate; truyền thêm timestamps nếu cần ETA (hoặc để dialog tự đo bằng `useRef`).

Không sửa server functions, không sửa DB, không đổi shape của `ClassificationResult` / `ClassifyDecision`.

## 5. Edge cases
- `total === 0` → ẩn metrics.
- `phase` chuyển ngược (hiếm) → reset `startedAt`.
- Nhóm rỗng → không render section.
- Filter active nhưng nhóm rỗng → hiện empty state nhỏ "Không có file trong bộ lọc này".
