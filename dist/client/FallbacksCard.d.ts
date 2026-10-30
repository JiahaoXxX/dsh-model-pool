/**
 * Fallbacks settings card — the `fallbacks` plugin card on the web
 * Plugins page (spec §4). Registered into the `plugins.bundle.config` keyed
 * slot (key `dsh-llm-fallbacks`, the bundle package name, alongside
 * the upstream bash/agent-loop/web-search cards and the advisor card, in
 * registration order); owner props are empty and all data flows
 * through {@link FallbacksSettingsController}.
 *
 * FLAT rebuild (plan fallbacks-web-ux-alignment T3, the advisor PR #98
 * pattern): the collapsible card chrome is gone — no header button, no
 * rotating chevron, no dirty "unsaved" pill, no card-local open state, no
 * bordered `<li>` box. The page already renders the plugin title/description
 * above the card (the `locale/*.json` meta files the host resolves per UI
 * language), so the notices, the form, and the section actions directly
 * beneath it in the official flat settings-form language (reference §3):
 * fields at
 * 12px vertical padding with 0.5px hairline separators, 34px inputs on the
 * 0.5px l4 border, per-section Discard + Save pairs on the section
 * headings. The card is ALWAYS open —
 * nothing needs card-level disclosure state; the degraded /
 * error / read-only / migration notices render flat atop the form (the
 * unavailable notice stays always-visible per KD-G5 — the documented
 * divergence from the advisor, whose unavailable card renders nothing: the
 * fallbacks skeleton stays the USABLE last-known form and saves are
 * attempted).
 *
 * The config-level `enabled` switch is REMOVED (T2, breaking): there is no
 * checkbox row and no `enabled.off` hiding — all fields render
 * unconditionally; the Plugins-page row toggle is the master switch and the
 * runtime gates read content presence (`isFallbackActive`).
 *
 * PER-SECTION Save/Discard return beside each section heading (plan
 * fallbacks-card-section-ux, the maintainer's live-host feedback reversing
 * the flat plan's one-document model): the scroll-to-save cost of ONE
 * bottom Save outweighed it. Each section's Save writes ONLY that section's
 * fields (patch = the last ACCEPTED config with the section's fields
 * replaced — the ride-along protection, PR #62 UX round 3), gated by that
 * section's dirty term and validation bucket only (KD-U1: save =
 * `!sectionDirty || saving || !writable`, discard = `!sectionDirty ||
 * saving`; Save additionally carries `!writable` — W-1, qc2 fix wave: the
 * dirty-implies-writable assumption does not hold for this in-place-draft
 * store). Violations render live under their OWNING section heading, and a
 * store write failure renders under the section whose Save was last
 * clicked (`lastSaveSection`). Discard is kept — our staged edits survive
 * refresh, the advisor's documented divergence from the official
 * no-discard form — a pure client-side revert of THAT section's editors to
 * the last accepted config.
 *
 * The form body is the two-block editing surface (spec §8): the 6 top-level
 * scalar fields (trigger codes / revert policy / three numeric fields), the
 * `rootChain` block (block 1 — the root agent's single chain, no key input),
 * and the roles block (block 2 — declared role entity cards from
 * `roles.list` plus the rule rows from `roles.rules`, whose role field is a
 * dropdown bound to the declared ids + the built-in `inherit`, same-page
 * live). Row-level disclosures that are CONTENT keep their expand/collapse:
 * the time-slot row cards and the role entity cards (with the seeded
 * persona briefs) stay collapsible — a read-only view forces them open so
 * the configs stay reachable. The 主代理 / 子代理 / 高级选项 group labels
 * are semantic `<h2>` headings (T1); 高级选项 is a content-level disclosure
 * collapsed by default (T3 — same expand/collapse contract as the rows, a
 * read-only view forces it open).
 *
 * Validation: id format/reserved word/duplicates, undeclared rule role
 * references, illegal selectors, and a role with no chain entries (no model
 * config) block the write (the Save disabled gate) with per-section banners
 * + inline red borders / hints (never touching the store error path); a
 * non-empty `state.legacyKeys` renders the migration banner at the top.
 * The reset-to-defaults affordance is GONE from the card (PR #62 UX
 * round 3) — the gateway RPC `fallbacks/reset` and the store
 * `resetToDefaults()` stay as host APIs, only the card UI was removed.
 *
 * The AC-7 read-only status block (recent-switch summary, D-5) stays at the
 * bottom, flat.
 *
 * Presentation is ui-primitives-free (T4, advisor parity + reference §4
 * risk): Button/Tooltip and the five icon imports are replaced by
 * self-drawn styled elements — inline SVG icons (plus / trash / chevron /
 * grip) and the CSS `data-tip` tooltip bubble (the card's existing
 * icon-button pattern); every color resolves through a `--dsw-alias-*`
 * token so the card adapts to the light/dark theme.
 */
import type { ReactNode } from 'react';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { FallbacksSettingsController, type FallbacksSettingsState } from './fallbacks-store.ts';
/** Injected dependencies of {@link FallbacksCard} (slot `inject`). */
export interface FallbacksCardInjected {
    /** The card store (loaded on mount, refreshed on pushed invalidations). */
    controller: FallbacksSettingsController;
    /** Bare snapshot source the renderer binds as `useSnapshot`. */
    hooks: {
        snapshot: import('@deepseek-ai/dsh-client-store').SnapshotStore<FallbacksSettingsState>;
    };
}
/** Props delivered by the slot outlet: runtime share + locale seat + inject face. */
export type FallbacksCardProps = PropsRuntime<'plugins.bundle.config'> & PropsLocale<'fallbacks'> & InjectFace<FallbacksCardInjected>;
/**
 * Render the Fallbacks settings card inside the plugin-config section —
 * flat: the notices, the form, and the section action pairs directly under
 * the page's plugin title/description, with no chrome of our own.
 * @param props - slot-delivered injected dependencies and the synthesized t seat.
 * @returns the card.
 */
export declare function FallbacksCard({ controller, useSnapshot, t }: FallbacksCardProps): ReactNode;
