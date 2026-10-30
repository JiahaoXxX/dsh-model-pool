/**
 * Session-header subagent role badge (plan subagent-role-badge T3; durable
 * channel plan role-based-subagent-adoption Task 3b): a compact read-only pill
 * in `conversation.session.header.actions` showing which Subagent role the
 * viewed session's dispatch resolved, hovering as `role → latest request route`.
 *
 * Contract notes (verified 2026-09-09 against the harness checkout):
 * - The slot is `kind: 'list'`, `scope: 'session'`, owner props an empty marker
 *   (`ConversationHeaderActionOwnerProps`, `children?: never`) — the header
 *   renders occupants with `renderSlot(..., {})`, so ALL data flows through the
 *   session standard kit.
 * - Every `scope: 'session'` occupant receives the session standard kit
 *   (`useSession` + `useProjection`; ui-session `src/client/index.ts:112-119`,
 *   merged into the runtime share by ui-slots' `PropsRuntime`). The compiled
 *   peer types do not carry that merge into this plugin's typecheck program
 *   (ui-session is deliberately not a plugin peer), so both seats are read
 *   STRUCTURALLY and guarded — a version-skewed host without them renders
 *   nothing, never throws.
 * - Data: the host's `fallbacksSubagentRole` projection (Task 3b), folded
 *   server-side out of the child's own durable log — the ONE role source. The
 *   session kit binds the hook to the VIEWED session (`binding.session.
 *   projections.faceOf(key)`), so no `sessionId` plumbing, no effect, no state,
 *   and no polling: a settled child's follow opening snapshot already carries
 *   the value, and a running child's change frame updates the pill. An absent
 *   key (host without the unit, or no notice row) reads as "no pill".
 * - Hook order is render-independent (Task 3b L2 review C-1): the seat is a real
 *   hook, so BOTH projection reads are unconditional and only their derived
 *   values are guarded — a conditional second read would change the hook count
 *   on the very re-render that publishes a running child's role.
 * - The hover route comes from the host's EXISTING `modelSelection` projection
 *   (`lastUsed` — the route of the LATEST recorded request), NOT from the
 *   dispatch-time route: it is a separate, richer fact, and the label says so.
 * - Render-only discipline (C4 pattern, same as `ConversationFallbackSwitch`):
 *   the badge contributes a view; no message construction, no model-context
 *   injection. Degrade-never-crash: a missing/foreign projection value or an
 *   `inherit` role renders `null` — the actions row collapses cleanly.
 */
import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Props delivered by the actions slot outlet: runtime share + locale seat. */
export type SubagentRoleBadgeProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'fallbacks'>;
/**
 * Render the viewed session's dispatch-resolved role badge.
 * @param props - composed slot props (the session-kit `useProjection` seat is
 *   read structurally — see the module docblock).
 * @returns the badge element, or `null` when there is nothing to show.
 */
export declare function SubagentRoleBadge(props: SubagentRoleBadgeProps): ReactNode;
