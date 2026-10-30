/**
 * dsh-llm-fallbacks host half (plan Task 3: settings + waterfall + state
 * machine + events).
 *
 * Cordis function plugin mounted by the profile bundle patch row
 * `llm-fallbacks` (see `bundle/cordis.patch.yml`), composed AFTER llm-retry.
 *
 * Wiring:
 * - `fallbacks` settings via the Loader entry Config (the current host contract: the
 *   volatile `Config` schema in `src/schema.ts` IS the settings section;
 *   `apply` reads the Loader's live config reference, and the
 *   `settings/document-updated` listener re-derives the runtime caches —
 *   the old `installSection` setSource/onChange contract, spec §4).
 * - `agent/request-error` waterfall: inactive config (`isFallbackActive`) /
 *   code ∉ `triggerCodes`
 *   (**always mode included**) → `next()`; otherwise resolve role + chain,
 *   and when a candidate survives the filter (current / cooldown /
 *   step-failed / `provider/*`-missing-id) write the pending switch +
 *   cooldown + failure bookkeeping, then return
 *   `{ kind: 'retry' }` (own recovery, no `next()`).
 * - `agent/request` waterfall: apply a pending switch after `await next()`
 *   (provider/model override; the inherited `reasoningEffort` follows the
 *   upstream routeChanged rule — dropped on a route change unless explicitly
 *   named, preserved on a same-route override; spec D3); a
 *   root-origin `ModelPool/Auto` seed is served UNCHANGED (plan
 *   model-change-notice-loop Task 1 — the route the loop serves and records
 *   must equal the session selection, otherwise the host `model-selection`
 *   notice is re-armed on every step; the virtual adapter's `stream()`
 *   delegate is what reaches the chain head); then the always-mode cap check
 *   (count `llm/retry` events for the current turn/step/provider; ≥
 *   `alwaysModeRetryCap` → same decision path, reason `always-cap` —
 *   ADR-2).
 * - Per-agent state (`FallbackStateStore`): `agent/disposed` removes it,
 *   `agent/status` idle prunes per-step state defensively, plugin dispose
 *   clears everything (spec §6 — no residual state).
 *
 * @module dsh-llm-fallbacks
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import { detectLegacyKeys, validateFallbacksConfig, type FallbacksConfig } from './config.ts';
import { Config } from './schema.ts';
import { resolveChain } from './chains.ts';
import { resolveRole } from './roles.ts';
import { FallbackStateStore, type BlockedSwitchAttempt, type EffectiveChainHead } from './state.ts';
import { type EffectiveRolesReadback, type SeedDeclaration, type SeedDeclareOutcome, type SeedRevertOutcome, type SeedsDeclareOptions } from './seeds.ts';
/** The plugin row id mounted by the profile bundle patch. */
export declare const name = "llm-fallbacks";
/**
 * Declarative service metadata (cordis `Plugin.Base.provide`, read by
 * loaders/tooling). The actual registration happens in `apply()` via
 * `ctx.provide('llm-fallbacks', …)` — the static array never registers
 * anything by itself.
 */
export declare const provide: readonly ["llm-fallbacks"];
/**
 * The named cordis service `ctx.get('llm-fallbacks')` exposes while the
 * plugin is applied: the pure-function library surface + `name`/`version`
 * metadata, plus the three ADDITIVE role-seed methods (spec §9.1, plan
 * fallbacks-role-seeds T2). Deliberately no state BEARING FIELDS (no
 * stateStore, no event emitters, no filter helpers) — the seed methods are
 * closures over the per-apply `FallbacksSeedManager`, so state stays behind
 * the closure and dies with the fiber (spec §9.5).
 */
export interface FallbacksService {
    /** Matches the plugin `name`. */
    name: 'llm-fallbacks';
    /** Package.json version string (module-load snapshot). */
    version: string;
    resolveRole: typeof resolveRole;
    resolveChain: typeof resolveChain;
    validateFallbacksConfig: typeof validateFallbacksConfig;
    detectLegacyKeys: typeof detectLegacyKeys;
    /**
     * (a) Declare the companion's FULL current seed set (replacement semantics,
     * spec §9.1). The optional `options.set` records the batch's registered
     * provenance set name (read back as the rows' `source`); there is
     * deliberately no way to label a declare `bundled` — reserved for the
     * plugin's own preset self-declare.
     */
    declareSeeds(seeds: readonly SeedDeclaration[], options?: SeedsDeclareOptions): Promise<SeedDeclareOutcome>;
    /** (b) Sync readback — effective taxonomy with seed annotations. */
    getEffectiveRoles(): EffectiveRolesReadback;
    /** (c) Revert one id to the CURRENT declared seed default. */
    revertSeededPersona(id: string): Promise<SeedRevertOutcome>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** The fallbacks service while the plugin is applied; `undefined` otherwise. */
        'llm-fallbacks'?: FallbacksService;
    }
}
export { Config };
/** The plugin's composition config — the `fallbacks` settings schema (spec §4). */
export type Config = FallbacksConfig;
export type { FallbackSwitchReason, FallbacksSwitchEventData } from './events.ts';
export type { AgentFallbackState, BlockedSwitchAttempt, FallbackStateStore, PendingSwitch, StepFailures, SwitchScope } from './state.ts';
/** @internal T5 test-seam types (mirrors `BlockedSwitchAttempt`; not public API). */
export type { ChainHeadSource, EffectiveChainHead } from './state.ts';
export { resolveRole, type AgentLike, type Origin, } from './roles.ts';
export { annotateCandidates, createCandidateFilter, hasWildcardEntry, resolveCandidate, resolveChain, resolveChainViews, selectCandidates, type AnnotatedCandidate, type CandidateFilterOptions, type CandidateSkipReason, type FailingModel, } from './chains.ts';
export { defaultFallbacksConfig, detectLegacyKeys, INHERIT_ROLE_ID, ROLE_ID_PATTERN, validateFallbacksConfig, type FallbacksConfig, type FallbacksConfigLogger, type FallbacksRole, type FallbacksRoles, type FallbacksRoleRule, type FallbackStrategy, type RevertPolicy, type RecoveryPolicy, } from './config.ts';
export { parseSelector, SelectorError, type Selector, } from './selectors.ts';
export { FallbacksSeedManager, type EffectiveRole, type EffectiveRolesReadback, type SeedConflict, type SeedDeclaration, type SeedDeclareOutcome, type SeedRevertFailReason, type SeedRevertOutcome, type SeedSkipReason, type SeedSource, type SeedsDeclareOptions, type SeedsIo, type SeedsWireStatus, } from './seeds.ts';
export { presetRoles } from './presets.ts';
/**
 * @internal Test seam (T3 review Minor 3): the per-agent fallback state store
 * of the plugin applied to `ctx` — last apply wins. Not part of the plugin's
 * public surface; lets tests assert the no-op purity invariant (a plain
 * request must not grow the store) without reaching into the closure.
 */
export declare function stateStore(ctx: Context): FallbackStateStore | undefined;
/**
 * @internal Test seam (mirrors `stateStore`): the per-agent blocked-switch
 * attempts recorded by the T3 allowlist gate for the plugin applied to `ctx`
 * (spec D1; in-memory only, issue #52). Not part of the plugin's public
 * surface; lets tests (and the T5 gateway projection) read blocked attempts
 * without reaching into the closure. `undefined` when no plugin is applied.
 */
export declare function blockedAttempts(ctx: Context): ReadonlyMap<string, BlockedSwitchAttempt> | undefined;
/**
 * @internal Test seam (mirrors `blockedAttempts`): the per-agent effective
 * chain heads recorded by the T2 inject path (source `authorized` |
 * `injected`) for the plugin applied to `ctx` (spec D4 / T2 M3). Not part
 * of the plugin's public surface; lets tests and the T5 gateway projection
 * read the head without reaching into the closure. `undefined` when no
 * plugin is applied.
 */
export declare function chainHeads(ctx: Context): ReadonlyMap<string, EffectiveChainHead> | undefined;
/**
 * Count durable `llm/retry` events for the current (turn, step, provider) in
 * **always mode** (ADR-2; spec §2 clause 5). Normal-mode retries belong to
 * llm-retry's bounded budget and must not preempt the fallback, so only
 * `mode: 'always'` events count toward `alwaysModeRetryCap` (T3 review
 * Minor 2 — the real event carries the discriminator, llm-retry types.ts).
 *
 * Fast path (T3 review Minor 4): the session log is append-ordered, so the
 * scan runs backwards and stops at the first event older than the target
 * (turn, step) — a long session's earlier turns are never scanned.
 *
 * Exported for direct unit testing of the counting + fast path.
 */
export declare function countRetryEvents(session: Session, turn: number, step: number, provider: string): number;
/**
 * The live config reference the Loader hands `apply` for a
 * volatile Config schema: an identity-stable `{ get }` view (cosmokit's
 * `Volatile` protocol) whose snapshot the Loader re-commits on every form
 * save, so reading `.get()` per call is the authoritative live composed
 * config. Detected STRUCTURALLY on purpose — the protocol is duck-shaped and
 * the dev-time schemastery resolved from the lockfile can predate it, in
 * which case the plain composed object arrives exactly as before.
 */
interface LiveConfigRef {
    get(): unknown;
}
export declare function apply(ctx: Context, config?: FallbacksConfig | LiveConfigRef): void;
