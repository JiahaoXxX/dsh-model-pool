/**
 * Time-slot rows for `fallbacks` (plan fallbacks-timeslots Task 1, pins
 * P4–P6): frozen preset windows, the official all-day conformance
 * guard, and the pure `resolveEffectiveChain` / `resolveSlotState`
 * resolver.
 *
 * Pure module — no `@deepseek-ai/*` runtime imports: the client card
 * imports the row types type-only (mirroring `config.ts`) and the runtime
 * wires these helpers at request time (Task 2). Malformed rows NEVER
 * throw: they warn ONCE per row instance (through `console.warn` — the
 * resolver's 3-argument contract has no logger parameter) and are
 * skipped; a legacy non-empty non-conforming `rootChain` keeps the
 * legacy failure walk verbatim (P6).
 *
 * @module dsh-llm-fallbacks/time-slots
 */
import type { FallbacksConfig } from './config.ts';
/** Official all-day selectors — the ONLY legal tails (length 1, XOR):
 * Flash (the current official default) and Pro, both selectable. The Pro
 * tail id is the catalog id verbatim: the official default catalog
 * still serves `deepseek-v4-pro` alongside `deepseek-flash`, so the card's Pro radio is selectable. `deepseek-v4-flash` stays retired (dropped
 * from the catalog); a hand-written legacy `deepseek-official/deepseek-pro`
 * tail — never catalog-served nor selectable — is just a non-legal tail
 * that degrades through the existing nonconforming walk. */
export declare const OFFICIAL_FLASH = "deepseek-official/deepseek-flash";
export declare const OFFICIAL_PRO = "deepseek-official/deepseek-v4-pro";
/** The two official all-day tail ids (XOR — exactly one legal tail). */
export declare const OFFICIAL_ALL_DAY_IDS: readonly ["deepseek-official/deepseek-flash", "deepseek-official/deepseek-v4-pro"];
/** Whether `id` is one of the two official all-day tail ids. */
export declare function isOfficialAllDayId(id: string): boolean;
/** The four frozen preset ids (exact strings, spec lock). */
export declare const PRESET_IDS: readonly ["liang-peak", "liang-valley", "glm-peak", "glm-valley"];
export type PresetId = (typeof PRESET_IDS)[number];
/** A frozen UTC+8 window: `start ≤ t < end`, wrap-midnight when `start > end`. */
export interface SlotWindow {
    /** Window start, `HH:mm` (24h). */
    start: string;
    /** Window end, `HH:mm` — EXCLUSIVE (a window contains `t` iff the day
     * matches AND (`start ≤ end` ? `start ≤ t < end` : `start ≤ t || t < end`)). */
    end: string;
    /** Day mask: 0=Sunday … 6=Saturday. Omitted/empty = every day. */
    days?: number[];
}
/** One extra time-slot row (P4 storage shape; `chain` is always editable). */
export interface SlotRowConfig {
    kind: 'preset' | 'custom';
    /** Preset id — required for `kind: 'preset'`; windows live in
     * {@link PRESETS}, never stored. */
    preset?: PresetId;
    /** Custom-only: window start `HH:mm`. */
    start?: string;
    /** Custom-only: window end `HH:mm` (exclusive; may wrap midnight). */
    end?: string;
    /** Custom-only: day mask 0=Sunday…6=Saturday; omitted/empty = all days. */
    days?: number[];
    /** Custom-only display name (PR #62 feedback round, collapsed rows). */
    name?: string;
    /** Models for this row (editable even on preset rows). */
    chain: string[];
}
/** Frozen preset definition (P4): windows are code constants, never stored. */
export interface PresetDefinition {
    windows: readonly SlotWindow[];
    /** `true` = matches iff the peak windows do NOT match (valley derives
     * from its peak — no duplicated window enumerations that can drift). */
    complement: boolean;
    /** Display label for the status strip / settings card. */
    label: string;
}
/**
 * Frozen preset windows (UTC+8). `liang-peak` and `glm-peak` are
 * Monday–Friday only (day mask `[1, 2, 3, 4, 5]`); their valleys are the
 * `complement: true` of the corresponding peak (weekends included).
 */
export declare const PRESETS: Record<PresetId, PresetDefinition>;
/**
 * All-day conformance (P6): the all-day chain is conforming when its LAST
 * entry (the tail — the card's 默认模型 panel) is exactly one official
 * model — Flash or Pro (XOR). Leading entries (the card's 默认降级链 block)
 * are the ordered walk before that last-resort fallback. An empty chain or
 * a chain whose tail is not an official model (the retired
 * `deepseek-v4-flash` and the never-served legacy
 * `deepseek-official/deepseek-pro` included) keeps slot rows inert and
 * refuses the virtual-row
 * delegate; the legacy failure walk over the raw chain stays
 * verbatim.
 */
export declare function isAllDayConforming(chain: readonly string[]): boolean;
/**
 * Effective chain for a root request at `now` (P5): the FIRST extra row
 * whose descriptor contains `now` (stored order) — that row's `chain`
 * REPLACES the all-day chain (never concatenated); no match ⇒ `rootChain`
 * (the all-day row, always last and required). Malformed rows warn once
 * and are skipped; never throws.
 *
 * P6 (qc1 F-001): without a conforming all-day the slot rows are inert, so
 * this IS the raw `rootChain` — the gate lives in {@link resolveSlotState},
 * the single source every slot surface (this, the 分时切换 log, the
 * `/fallbacks` strip, the virtual adapter delegate, its served-route anchor)
 * reads.
 */
export declare function resolveEffectiveChain(config: FallbacksConfig, now: Date, tz: string): string[];
/**
 * Slot winner + display label (P5): drives 分时切换 detection (per-root-agent
 * last-winner marker, in-process only) and the card / `/fallbacks` status
 * strip. `winner` is the matching row or `'all-day'`; `label` names the
 * slot (frozen preset label or `custom HH:mm-HH:mm`).
 *
 * P6 gate (qc1 F-001): without a conforming all-day
 * (`isAllDayConforming(config.rootChain)`) the winner is ALWAYS `'all-day'`
 * — a legacy multi-model (or empty) chain earns no slot rows, so every
 * surface fed by this resolver reports the inert state and routing stays on
 * the raw `rootChain` (the legacy walk verbatim).
 */
export declare function resolveSlotState(config: FallbacksConfig, now: Date, tz: string): {
    winner: SlotRowConfig | 'all-day';
    label: string;
};
