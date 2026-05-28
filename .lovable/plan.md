# Đề xuất Fin — Rà soát & Làm lại UI

## 1. Luồng hạch toán hiện tại (tóm tắt sau khi đọc code)

```
Hoá đơn (XML/PDF) ─▶ Trích xuất ─▶ engine.server.ts
                                       │
        ┌──────────────────────────────┼────────────────────────────┐
        ▼                              ▼                            ▼
  vendor_template            learned_lines (memory)         classify_rule + ai_fallback
  (≥3 lần đã hạch)           (ai_line_classifications)      (rules.ts + Gemini)
        │                              │                            │
        └──────────────┬───────────────┴────────────────────────────┘
                       ▼
         JournalProposalDTO {entries, confidence, band,
                              warnings, signals, alternatives,
                              applied_rules, source}
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
   /categorize    inbox sheet      Chat dock
   ProposalCard   ProposalCard     JournalProposalCard
                                    (derive thủ công, lệch DTO)
```

**Phát hiện chính**
- Engine xuất DTO chuẩn (`src/lib/categorize/types.ts`) nhưng **2 component hiển thị song song** và **lệch nhau**:
  - `src/components/categorize/ProposalCard.tsx` — đầy đủ DTO (signals, alternatives, warnings, TSCĐ gate, sửa tay).
  - `src/components/chat/invoice/journal-proposal-card.tsx` — tự `deriveLinesFromAction()` từ input của `ai_actions`, **không dùng DTO**, không biết `band`, `alternatives`, `applied_rules`, `signal_features` → KTV thấy 2 trải nghiệm khác nhau cho cùng 1 đề xuất.
- **Vi phạm quy tắc lõi "1 Fin duy nhất"**: card hiện gắn nhãn "Mẫu NCC / Học từ memory / Luật phân loại / AI suy luận", tiêu đề "Vì sao **AI** đề xuất" — lộ 6-agent ra giao diện chính.
- **Bài toán phân loại 152/153/156/211/213/242/6xx** (knowledge gốc) bị chôn dưới `AccountKindBadge` nhỏ cạnh số TK; không có "1-click đổi loại mặt hàng" trên từng dòng.
- **Confidence band** (`auto/review/manual`) đã có trong DTO nhưng UI **không dùng** để dẫn dắt hành động — vẫn chỉ là chip %.
- **Feedback "Đây không phải X"** chỉ có ở chat card; ProposalCard chính chỉ có "Bỏ qua" → vòng học Fin (`learning/calibrate.server.ts`) thiếu tín hiệu chất lượng cao từ queue.
- **Sửa tay** dùng `<Input>` thô cho mã TK + số tiền → không có account-combobox (đã có sẵn `account-combobox.tsx`), không auto-rebalance Nợ/Có, dễ lệch.
- **Multi-entry** (rule cat-009 tách bút toán) hiển thị stack dọc, không phân tab — khó so khớp tổng.

## 2. Mục tiêu redesign

1. **Hợp nhất** thành 1 component `FinProposalCard` dùng cho cả /categorize, inbox sheet và chat dock. Chat dock cũng phải đọc DTO (qua proposal_id) chứ không derive nữa.
2. **Giọng Fin thống nhất** — thay mọi "AI"/"vendor_template"/"learned_lines" bằng câu nói của Fin ở ngôi thứ nhất.
3. **Phân loại mặt hàng làm trung tâm** — mỗi dòng Nợ có chip Kind to, đổi 1 chạm.
4. **Band → hành động rõ ràng** — header đổi màu + verb đổi (Tự ghi / Xem qua rồi duyệt / Cần KTV duyệt).
5. **Feedback chất lượng cao** — "Đây không phải …" với reason picker, đẩy thẳng vào `feedback.functions.ts`.
6. **Sửa tay an toàn** — account-combobox + auto-rebalance tổng Nợ = tổng Có.

## 3. Cấu trúc card mới (1 layout, 3 mật độ)

```text
┌─────────────────────────────────────────────────────────────────┐
│  [Mua vào]  CÔNG TY TUYỀN HƯNG PHÚ · #00002847 · 28/05         │
│  Tổng 5.222.880 ₫                                               │
│                                                                  │
│  ╭───────────────────────────────────────────────────────────╮  │
│  │ ●  Fin đề nghị TỰ GHI SỔ          (Tin cậy 92% · band:auto)│ │
│  │    "Tôi nhớ NCC này — đã hạch toán 7 lần cùng mẫu."        │ │
│  ╰───────────────────────────────────────────────────────────╯  │
│                                                                  │
│  Bút toán                                                       │
│  ┌──┬──────┬─────────────┬──────────────────────┬────────────┐ │
│  │Nợ│ 156  │[Hàng hoá ▾] │ Bánh tráng các loại  │ 4.836.000  │ │
│  │Nợ│ 1331 │[VAT 8% ▾]   │ Thuế GTGT đầu vào    │   386.880  │ │
│  │Có│ 331  │[Phải trả ▾] │ TUYỀN HƯNG PHÚ       │ 5.222.880  │ │
│  └──┴──────┴─────────────┴──────────────────────┴────────────┘ │
│   ▸ Đổi loại mặt hàng: [Hàng hoá] [NVL 152] [CCDC 153]         │
│     [TSCĐ 211] [Trả trước 242] [Dịch vụ 6xx]                   │
│                                                                  │
│  ⚠ HĐ > 20tr — Fin sẽ tự khớp khi sao kê đến                   │
│                                                                  │
│  Vì sao Fin chọn ▾    Hoán đổi nhanh ▾                          │
│                                                                  │
│  [✓ Duyệt & ghi sổ]  [✎ Sửa]  [Đây không phải hàng hoá ▾]  ⋯  │
└─────────────────────────────────────────────────────────────────┘
```

**Header band** (thay chip % đơn lẻ):
- `auto` (≥85%): viền/nền xanh, verb "Fin đề nghị **tự ghi sổ**", nút chính "Duyệt".
- `review` (60–84%): viền hổ phách, verb "Fin muốn bạn **xem qua rồi duyệt**".
- `manual` (<60%): viền xám đậm, verb "Fin chưa chắc — **cần KTV chốt**", disable duyệt nhanh, ép mở Sửa.

**Câu nói của Fin** (thay nhãn source kỹ thuật, map 1-1):
| source DTO | Fin nói |
|---|---|
| `vendor_template` | "Tôi nhớ NCC này — đã hạch toán {n} lần cùng mẫu." |
| `learned_lines` | "Tôi học từ {n} dòng tương tự trong trí nhớ." |
| `classify_rule` | "Tôi áp luật {cat-xxx} của TT200." |
| `ai_fallback` | "NCC mới — tôi suy luận từ mô tả mặt hàng." |
| `manual` | "Bạn đã chỉnh tay — tôi sẽ học từ lần này." |

**Chip Kind trên từng dòng Nợ**: dropdown 6 lựa chọn (Hàng hoá 156 / NVL 152 / CCDC 153 / TSCĐ HH 211 / TSCĐ VH 213 / Trả trước 242 / Dịch vụ 6xx). Đổi chip → tự đổi `account_code` mặc định + đánh dấu `user_override_kind` (đã có trong `resolve-line-kind.server.ts` L0) → gửi feedback để Fin học.

**"Vì sao Fin chọn"** (collapsible, thay 2 vùng signals + applied_rules hiện tại):
- Top-3 signals dạng chip xanh/hổ phách + weight.
- Rule áp dụng dạng link sang `/ai/memory` (giữ logic cũ).
- Không dùng từ "AI" trong nhãn.

**"Hoán đổi nhanh"** (thay khối Alternatives):
- Chip ngang cuộn — `Nợ 6427 / Có 331 · 88%`, `Nợ 153 / Có 331 · 74%` …
- Click 1 phát = thay entries + bật cờ `edit` (đã có).

**Feedback "Đây không phải …"**:
- Nút mặc định: "Đây không phải {kind hiện tại}".
- Dropdown reason: `wrong_kind` / `wrong_account` / `wrong_vendor_mapping` / `wrong_vat` / `other` + text option.
- Gửi vào `src/lib/feedback/feedback.functions.ts` (đã có) → calibrate giảm weight signal liên quan.

**Sửa tay**:
- Thay `<Input>` mã TK bằng `account-combobox.tsx` (đã có).
- Thêm helper "Cân Nợ/Có" tự tính dòng cuối.
- Nếu Kind = TSCĐ/CCDC/Trả trước → gợi ý mở `TscdConfirmDialog` (đã có) trước khi duyệt.

**Multi-entry (cat-009)**:
- Nếu `entries.length > 1` → tabs "Bút toán 1 · 2 · 3 (tổng khớp ✓/✗)" thay vì stack.

## 4. Việc triển khai (theo thứ tự)

1. **Component mới `src/components/categorize/FinProposalCard.tsx`** — port toàn bộ logic từ `ProposalCard.tsx`, áp layout & voice mới.
2. **Đổi nhãn nguồn → câu Fin nói** trong 1 helper `finVoice(source, hits)`.
3. **Header band** — component nhỏ `BandCallout` đọc `dto.band`.
4. **Chip Kind trên dòng** — tái dùng `AccountKindBadge` + popover 6 lựa chọn; persist override + gửi feedback.
5. **Chat dock**: sửa `journal-proposal-card.tsx` để **nhận `proposal_id` thật** và render `<FinProposalCard embedded />` thay vì derive thủ công. Giữ fallback derive cho action chưa có proposal.
6. **Bỏ component cũ** `ProposalCard.tsx` (chuyển import ở `/categorize` và `inbox-item-sheet.tsx`).
7. **Feedback "Đây không phải"** trên cả /categorize (hiện đang thiếu) — gắn vào `feedback.functions.ts` có sẵn.
8. **Account combobox + auto-rebalance** trong chế độ Sửa.
9. **Multi-entry tabs**.
10. QA: chạy lại 1 đề xuất TUYỀN HƯNG PHÚ và 1 hoá đơn dịch vụ marketing để xác nhận voice + band + kind chip đúng.

## 5. Không đụng tới (giữ nguyên)

- `engine.server.ts`, `calibration.server.ts`, `feedback.functions.ts`, DTO schema, `categorize.functions.ts` (approve/skip/list), `TscdConfirmDialog`.
- DB schema — đã có `user_override_kind`, `item_resolution_log`, `feedback_events`.
- Trang `/ai/memory > Agent của Fin` (tab nâng cao) vẫn được phép gọi tên 6 agent — chỉ card chính đổi giọng.

## 6. Câu hỏi cần chốt trước khi build

1. Có muốn **bỏ hẳn** `JournalProposalCard` cũ trong chat hay giữ làm fallback cho `ai_actions` không gắn proposal?
2. Voice của Fin: dùng ngôi **"Tôi"** (như mock trên) hay **"Fin"** xưng tên? Knowledge mặc định "Fin" là tên trợ lý.
3. Chip Kind đổi 1 chạm — chỉ áp cho **dòng Nợ TK kho/CP** (152/153/156/211/213/242/6xx) hay cho mọi dòng?
