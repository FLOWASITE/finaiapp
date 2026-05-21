# Cải thiện phân loại file trong ChatDock

## Vấn đề hiện tại

Trong `src/lib/ai/bulk-intake.server.ts` và `classify-file.server.ts`, các quy tắc đang quá lạc quan nên file sai loại vẫn bị đẩy thẳng vào "tự hạch toán":

1. **Heuristic mặc định quá mạnh** — Mọi PDF không khớp regex đều được gán `purchase_invoice` với confidence `0.85` → bucket **auto**. Hợp đồng, CV, biên bản dạng PDF cũng bị coi là hoá đơn vào.
2. **AI chỉ override khi confidence ≥ 0.5** — Nếu Gemini trả "other" với 0.4, heuristic 0.85 thắng → file rác vẫn vào auto.
3. **MST chỉ dùng để lật giữa purchase/sales** — Không dùng MST để xác nhận đó CÓ phải hoá đơn hay không.
4. **Cache phân loại không thể reset** — `ai_uploads.classify_meta` cache theo `file_hash`; phân loại sai 1 lần là sai mãi cho cùng file.
5. **PDF scan (ảnh) gửi nguyên file inline** — Model dễ timeout hoặc trả "other" fallback, làm tệ thêm.
6. **Sao kê Excel/PDF không tên gợi ý** — Chỉ dựa `RX_STATEMENT` (tên ngân hàng trong filename); sao kê đặt tên lạ rơi vào `excel_unknown` → ask.

## Hướng sửa

### A. Đổi triết lý: AI là nguồn chính, heuristic chỉ là gợi ý

Trong `bulk-intake.server.ts`:

- **Luôn gọi `classifyFile` cho mọi file PDF/ảnh/Excel** (đang có rồi) nhưng đổi cách hợp nhất:
  - Nếu AI confidence ≥ 0.7 → dùng AI bất kể heuristic.
  - Nếu AI confidence 0.4–0.7 → giữ `kind` của AI nhưng hạ bucket xuống **review** (không auto).
  - Nếu AI confidence < 0.4 hoặc AI lỗi → bucket = **ask** (không tin heuristic mặc định nữa).
- **Bỏ default `purchase_invoice` cho PDF không khớp regex**. Đổi sang `group: "other"`, `bucket: "ask"`, confidence 0.3. Buộc AI/người dùng xác nhận.

### B. Dùng MST làm chốt chặn

Trong `classify-file.server.ts`:

- Sau khi AI trả kết quả, nếu MST tenant tồn tại nhưng:
  - AI nói `purchase_invoice` mà **buyer_tax_id ≠ tenant** → hạ confidence xuống 0.4 (đẩy về review). Có thể là HĐ của doanh nghiệp khác bị quăng nhầm.
  - AI nói `sales_invoice` mà **seller_tax_id ≠ tenant** → tương tự.
  - AI nói `other` nhưng có 1 trong 2 MST khớp tenant → ép thành purchase/sales tương ứng, confidence 0.8.

### C. Prompt phân loại chặt hơn

Sửa `systemPrompt` trong `classifyFile`:

- Yêu cầu model trả `confidence ≤ 0.5` nếu KHÔNG nhìn thấy: tên người bán, MST, số hoá đơn, hoặc bảng cột nợ/có (cho sao kê).
- Thêm few-shot ngắn: "hợp đồng / báo giá / CV / ảnh chụp tự do" = `other`, không phải `purchase_invoice`.
- Tăng `textSnippet` từ 4000 → 8000 ký tự (đủ để thấy phần tổng/ MST cuối hoá đơn).

### D. PDF scan: ép qua OCR thật, không gửi inline PDF nặng

Hiện tại nếu `extractPdfText` không ra text, file PDF được nhét nguyên vào `messages[].content` (gói `type: "file"`). Với PDF lớn (10+ MB), Gemini Flash hay trượt.

- Nếu PDF > 1.5 MB và không có text trích được → render trang 1 thành ảnh PNG (dùng pdfjs / pdf-text helper đã có) và gửi `type: "image"` thay cho `type: "file"`. Giảm payload + tăng độ chính xác.
- (Cần kiểm tra `pdf-text.server.ts` có sẵn renderer chưa; nếu chưa thì fallback là giữ nguyên nhưng cắt PDF chỉ 3 trang đầu.)

### E. Heuristic regex bổ sung sao kê

Thêm vào `RX_STATEMENT`:

- Pattern cột tài khoản 10–14 số liên tiếp.
- Từ khoá nội dung: "số dư đầu kỳ", "số dư cuối kỳ", "phát sinh nợ", "phát sinh có" (chỉ dùng được khi heuristic xem được text — sẽ chuyển check này vào nhánh AI thay vì filename).

### F. Cho phép reset cache phân loại

- Khi user kéo file vào lần nữa và bấm "phân loại lại" (sẽ thêm action nhỏ ở bulk-intake card), gọi 1 server fn `reclassifyUpload({uploadId})` xoá `classify_meta` rồi chạy lại `classifyFile`.
- Trong UI `bulk-intake-card.tsx`: thêm menu 3 chấm trên mỗi item → "Phân loại lại bằng AI" / "Đánh dấu là loại khác" (purchase/sales/bank/cash/other) — ép override thủ công và lưu vào `classify_meta`.

### G. Hiển thị lý do phân loại rõ hơn

Trong card hiển thị bucket, thêm dòng phụ:

- "AI conf 0.62 · MST khớp tenant" hoặc "Heuristic — chưa có AI" để user biết tin được tới đâu.

## File sẽ chỉnh

```text
src/lib/ai/classify-file.server.ts        — prompt, MST override, snippet 8k
src/lib/ai/bulk-intake.server.ts          — luật hợp nhất AI+heuristic, bỏ default
src/lib/ai/parse-document.functions.ts    — thêm reclassifyUpload serverFn
src/components/chat/bulk/bulk-intake-card.tsx — menu phân loại lại + override thủ công
src/components/chat/bulk/types.ts         — thêm field `classifySource` để hiển thị
```

## Không đụng tới

- Schema DB (`ai_uploads.classify_meta` đã có cột `jsonb`, dùng tiếp).
- Luồng `bulkRun` thực thi (`chat.functions.ts`) — chỉ tiêu thụ kết quả phân loại.
- Logic parse chi tiết (`parseFileCore`).

## Rủi ro & câu hỏi mở

- **Token cost**: tăng snippet 4k→8k và bắt buộc AI mọi PDF có thể tăng ~50% chi phí phân loại. Vẫn rẻ hơn parse sai → post nhầm.
- **Render PDF→PNG** trong Worker runtime: cần kiểm tra `pdfjs-dist` đã có chưa; nếu không thì bỏ bước E, chỉ cắt 3 trang đầu.

Sau khi sếp duyệt mình sẽ làm theo thứ tự A → B → C → F → G (D, E để pha 2 nếu cần).
