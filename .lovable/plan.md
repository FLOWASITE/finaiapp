
# Plan: Tab "Agent của Fin" trong Trí nhớ AI

## Phạm vi MVP

Frontend-only với mock data (`sampleAgents`). Chưa wire backend/realtime — phase 2 sẽ làm SSE và persist settings vào DB.

## Cấu trúc file mới

```
src/types/agent.ts                                       # Types: Agent, AgentSettings, OrchestrationFlow
src/data/sampleAgents.ts                                 # 6 agents mock + orchestrationFlow
src/components/ai-memory/agents/AgentGrid.tsx            # Grid 2 cột
src/components/ai-memory/agents/AgentCard.tsx            # Card + status dot
src/components/ai-memory/agents/StatusDot.tsx            # Dot + pulse animation
src/components/ai-memory/agents/AgentDetailDrawer.tsx    # Sheet right, 5 tabs
src/components/ai-memory/agents/tabs/OverviewTab.tsx
src/components/ai-memory/agents/tabs/SettingsTab.tsx     # mode, confidence profile, schedule, notify
src/components/ai-memory/agents/tabs/RulesTab.tsx
src/components/ai-memory/agents/tabs/ActivityTab.tsx
src/components/ai-memory/agents/tabs/DependenciesTab.tsx
src/components/ai-memory/agents/OrchestrationFlow.tsx    # Horizontal flow + arrows
src/components/ai-memory/agents/ActivityFeed.tsx         # Cross-agent feed
src/components/ai-memory/agents/DisableConfirmDialog.tsx
src/routes/_app/ai/memory/agents.tsx                     # Route mới (sub-tab thứ 6)
```

## Tích hợp với Trí nhớ AI hiện có

- Thêm tab "Agent của Fin" vào `ai-memory-tabs.tsx` (sub-tab thứ 6, sau Bối cảnh DN).
- Route mới `/ai/memory/agents` (hoặc giữ trong tabs hiện hữu — sẽ dùng tabs state, không tạo route riêng nếu các tab khác cũng dùng state-tab).
- Deep-link agent qua query param `?agent=extract` thay vì nested route (đơn giản, không cần đụng routeTree).

## Layout trang

1. **WarningBanner (info)** — "Bạn không cần xem tab này để dùng Fin..."
2. **StatsBar** — `online/6`, tasks hôm nay, accuracy TB, nút Orchestrator settings (disabled placeholder).
3. **AgentGrid** — 6 cards (2 cột desktop, 1 cột mobile).
4. **OrchestrationFlow** — horizontal flow với arrows (sequential `→`, parallel `⇉`, optional dashed). Vertical trên mobile.
5. **ActivityFeed** — cross-agent log với agent tag màu riêng, filter theo agent/result.
6. **AgentDetailDrawer** — Sheet 640px, 5 tabs.

## Design tokens (thêm vào styles.css)

Thêm semantic tokens cho 6 agent colors + status dot colors:
```
--agent-extract, --agent-categorize, --agent-reconcile, --agent-tax, --agent-alert, --agent-report
--status-online, --status-working, --status-warning, --status-error, --status-idle
```
Không hard-code hex trong components — dùng `bg-[hsl(var(--agent-extract-bg))]` hoặc CSS vars inline.

## Behavior chi tiết

- **Status dot "working"**: pulse animation 1.5s loop (CSS `@keyframes`).
- **Settings tab** giữ đủ 3 confidence profile cards (Nghiêm ngặt 95% / Cân bằng 85% / Linh hoạt 70%) + slider; chọn preset auto-set slider.
- **Disable agent có `feeds_into.length > 0`**: mở `DisableConfirmDialog` liệt kê chính xác agents bị ảnh hưởng.
- **OrchestrationFlow node click**: scroll smooth tới agent card + ring highlight 2s.
- **Activity feed**: mock "live" bằng `setInterval` 5s prepend item giả (tùy chọn — sẽ làm nếu nhanh).
- **Form**: react-hook-form + zod, optimistic local update (chưa POST API).

## Permission gating

Mock đơn giản: kiểm tra `useCurrentUser().roles` — nếu không có `ktt`/`cfo`/`owner`/`superadmin` thì show upgrade prompt. Không chặn cứng — tab vẫn render nhưng overlay.

## Phase 2 (không làm trong lần này)

- Persist settings vào DB (`agents_settings` table)
- Realtime activity via Supabase Realtime
- Custom instructions editor (Monaco)
- Wire vào orchestrator thật

---

Sau khi bạn duyệt, tôi sẽ build theo thứ tự: types → sample data → tokens → Grid/Card → Drawer (Overview + Settings) → OrchestrationFlow → ActivityFeed → Rules/Dependencies/Activity tabs → Disable dialog → permission gate.
