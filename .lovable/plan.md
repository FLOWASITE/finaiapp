## Kế hoạch: Đổi tên "Sổ AI" → "Inbox AI" trong codebase

### Mô tả
Thống nhất tên gọi trong toàn bộ codebase và giao tiếp: dùng **Inbox AI** thay cho **Sổ AI** (tên cũ).

### Thay đổi

| File | Dòng | Nội dung cũ | Nội dung mới |
|------|------|-------------|--------------|
| `src/lib/ai/inbox-types.ts` | 1 | `Shared (client + server) types for Sổ AI.` | `Shared (client + server) types for Inbox AI.` |
| `src/lib/ai/inbox-reason.server.ts` | 2 | `Sổ AI — heuristic builder...` | `Inbox AI — heuristic builder...` |

### Lưu ý
- Chỉ là sửa comment/JSDoc, không ảnh hưởng logic runtime.
- Từ đây về sau, mọi trao đổi và tài liệu đều dùng thuật ngữ **Inbox AI**.