/**
 * T1 (plan llm-fallbacks-settings-gateway) + T3 (plan fallbacks-role-seeds) —
 * host-side `fallbacks` config gateway: the `/api/fallbacks/get` +
 * `/api/fallbacks/set` + `/api/fallbacks/reset` + `/api/fallbacks/revert-seed`
 * endpoints.
 *
 * Transport: the typertGateway `/api` interceptor is the single host-wide RPC
 * slot (a plugin must NOT `connection.rpc.intercept('/api')` again — it would
 * throw). The service declares a typertGateway binding (via the
 * `TypertRemoteService` base — kept ONLY for its `typertRemote` binding, which
 * dispatch's `validateBinding` requires on the live service) and the
 * endpoints are registered EXPLICITLY through
 * `ctx.typert.register(fallbacksTypertContribution())` (see `apply` in
 * `src/index.ts`) — NOT via `@Remote` SRC markers: SRC discovery reads
 * `remoteMethods()`, a module-private WeakMap in `@deepseek-ai/dsh-typert-protocol`,
 * so a locally-linked plugin whose peers resolve outside the host
 * installation never shares that table with the host typertGateway (zero
 * claimed endpoints, `/api/fallbacks/*` 404). The explicit
 * `TypertRegistry.register` path writes the invocation descriptors into
 * `ctx.typert.local`, which `claimsEndpoint` checks FIRST, so claim +
 * dispatch work regardless of module identity. The payload contract is
 * exactly one plain-object `args` field whose keys are the method parameter
 * names (`get()` → `{ args: {} }`; `set(patch)` → `{ args: { patch } }`;
 * `reset()` → `{ args: {} }`).
 *
 * Data: `get` reads the `FallbacksSettingsBridge` source — the same live
 * composed config the runtime reads (schema defaults → plugin-row base →
 * profile patch). There is NO hard-gate resolver (unlike advisor's
 * `resolveAdvisorConfig`): the fallbacks decision path runs at
 * `agent/request` time in `src/index.ts`, so the gateway returns the raw
 * composed config. There is NO config-level `enabled` key on the contract
 * (plan fallbacks-web-ux-alignment T2): the Plugins-page row toggle is the
 * master switch, the runtime gates read content presence
 * (`isFallbackActive` in `src/config.ts`), and a stored `enabled:` line is
 * tolerated-and-stripped ({@link LEGACY_KEYS} — never read, never
 * re-persisted).
 * `set` validates the patch against the `Config` schema first (unknown-key
 * rejection unchanged — the settings service itself is non-strict and would
 * merge the unknown key through), then writes the plugin's profile-entry
 * section in-process via `ctx.settings.update` (the `SettingsForms` form
 * service; the host replaced the namespace registry — the write lands in
 * the active profile's patch under {@link FALLBACKS_PROFILE_ENTRY} and the
 * Loader commits it into the plugin's live config reference), and returns
 * the new composed value. `reset` (fallbacks-specific third method —
 * advisor has only get/set) clears the entry's patch section via
 * `ctx.settings.replace(ns, {})`: `set` is merge-only and cannot express
 * "reset to composition defaults" (sending default VALUES as a patch would
 * pin stale defaults into the patch). Every read response (get/set/reset)
 * carries the additive `seeds: SeedsWireStatus[]` badge state (spec §9.4) and
 * `revert-seed` exposes revert-to-current-seed-default for one id — both
 * delegate to the per-apply `FallbacksSeedManager` passed into the
 * constructor (single point of truth, no copied manager logic).
 *
 * The settings service is OPTIONAL (no settings service → the bridge source
 * stays the entry, `get` still works; `set`/`reset` fail with a clear
 * error — KD-G5 fallback). The gateway captures the service through a
 * conditional `ctx.inject(['settings'], ...)` child (the same activation
 * pattern as the plugin apply's own settings child), because `ctx.settings`
 * is only resolvable from a fiber that declares it.
 *
 * The returned config is normalized to the typertGateway JSON wire boundary:
 * only schema-declared keys cross the wire, and absent values are OMITTED,
 * never present-as-undefined (the gateway's result validation rejects
 * undefined values).
 *
 * @module dsh-llm-fallbacks/gateway
 */
import type { Context } from '@deepseek-ai/cordis';
import { type SettingsNamespace } from '@deepseek-ai/dsh-settings';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { FallbacksConfig } from './config';
import type { FallbacksSeedManager, SeedRevertOutcome, SeedsWireStatus } from './seeds';
/**
 * The `fallbacks` service/typert namespace identity (`fallbacks`): the cordis
 * service key, the typert namespace under `/api/fallbacks/*`, and the settings
 * identity under the legacy dsh API. Current settings writes target the
 * PROFILE ENTRY id instead (see {@link FALLBACKS_PROFILE_ENTRY}); the branded
 * `SettingsNamespace` type the old service APIs constrained on survives as the
 * type this constant carries.
 */
export declare const FALLBACKS_SETTINGS_NAMESPACE: SettingsNamespace;
/**
 * The plugin's profile ENTRY id — the settings-write target on the current dsh host:
 * `SettingsForms` keys every form and write by the Loader entry id
 * (`entry.options.id`), and this plugin's bundle row ships `id: llm-fallbacks`
 * (`bundle/cordis.patch.yml`), so `settings.update('llm-fallbacks', …)` edits
 * exactly this plugin's section of the active profile patch. The section IS
 * the Loader entry config now (schema defaults → bundle row base → profile
 * patch), so a write is visible to the runtime through the same live config
 * reference `apply()` reads — no separate registration step.
 */
export declare const FALLBACKS_PROFILE_ENTRY = "llm-fallbacks";
/** One exact child LLM route on the additive `subagentPolicy` wire field (T5). */
export type SubagentPolicyRoute = {
    provider: string;
    model: string;
};
/**
 * Additive `/api/fallbacks/get` host-policy snapshot (spec D4 / T5).
 * Omitted only when the snapshot is unwired (3-arg constructor) so older
 * clients and gateway unit tests keep a byte-identical `{ config,
 * legacyKeys, seeds }` payload. A wired snapshot always emits the field —
 * `{ state: 'disabled' }` included — so a write after an enabled get cannot
 * keep-last an allowlist. Never written through `set`/`reset`.
 */
export type SubagentPolicyWire = {
    state: 'enabled';
    allowedModels: SubagentPolicyRoute[];
    head?: {
        route: SubagentPolicyRoute;
        source: 'authorized' | 'injected';
    };
    blockedAttempt?: {
        at: number;
        route: SubagentPolicyRoute;
        reason: string;
    };
} | {
    state: 'disabled';
} | {
    state: 'unprovable';
};
/**
 * Live host-policy snapshot the gateway projects onto the wire. Built in
 * `apply()` from the SAME T1 reader the override paths use — no second
 * policy source. Optional: the 3-arg constructor (gateway unit tests)
 * omits the field entirely.
 */
export type SubagentPolicySnapshotFn = () => {
    policy: {
        state: 'disabled';
    } | {
        state: 'enabled';
        allowedModels: readonly SubagentPolicyRoute[];
    } | {
        state: 'unprovable';
    };
    head?: {
        route: SubagentPolicyRoute;
        source: 'authorized' | 'injected';
    };
    blockedAttempt?: {
        at: number;
        route: SubagentPolicyRoute;
        reason: string;
    };
};
/**
 * The live configuration source for the gateway (guide §7 — the same bridge
 * shape the runtime reads through). `source()` returns the live composed
 * config (schema defaults → plugin-row base → profile patch). The
 * gateway reads it LIVE on every call, so no change notification is needed
 * (the bridge stays minimal: source + the settings write channel; the dead
 * `onChange` fan-out was removed in the QC fix wave — nothing subscribed).
 */
export interface FallbacksSettingsBridge {
    source(): FallbacksConfig;
}
/** Patch shape accepted by `fallbacks.set` — any subset of the config keys. */
export type FallbacksConfigPatch = Partial<FallbacksConfig>;
/**
 * The wire response of every read (get/set/reset — W-1/F-1): the normalized
 * config plus `legacyKeys` plus the additive `seeds` badge state (spec §9.4,
 * legacyKeys precedent — old clients ignore it).
 */
export interface FallbacksReadResult {
    config: FallbacksConfig;
    legacyKeys: string[];
    seeds: SeedsWireStatus[];
    /**
     * Host subagent-model-selection policy (spec D4). Additive — old readers
     * ignore it; omitted only when no snapshot is wired. A wired snapshot
     * always carries the field (`disabled` included) so keep-last cannot
     * retain an allowlist after policy-off.
     */
    subagentPolicy?: SubagentPolicyWire;
}
/** The `fallbacks/revert-seed` response — a read result plus the revert outcome. */
export interface FallbacksRevertResult extends FallbacksReadResult {
    outcome: SeedRevertOutcome;
}
/**
 * The host-side `fallbacks` config gateway (`/api/fallbacks/get` +
 * `/api/fallbacks/set` + `/api/fallbacks/reset`). Registered as the cordis
 * service key `'fallbacks'` (namespace defaults to the service key). The
 * `TypertRemoteService` base is kept ONLY for its `typertRemote` binding —
 * the typertGateway's dispatch `validateBinding` requires the visible binding
 * on the live service (a pure instance property, no module-private state).
 * Endpoints are registered EXPLICITLY through
 * `ctx.typert.register(fallbacksTypertContribution())` (see `apply` in
 * `src/index.ts`) instead of `@Remote` SRC markers (see the module docblock
 * for why).
 */
export declare class FallbacksConfigGateway extends TypertRemoteService {
    private readonly bridge;
    /** The per-apply seed manager — single point of truth for seed state (spec §9.4). */
    private readonly seeds;
    /** The live settings service once the optional inject child activates. */
    private settings;
    /**
     * Optional host-policy snapshot (T5). When omitted the additive
     * `subagentPolicy` field is absent on every read — the 3-arg constructor
     * used by gateway unit tests stays byte-identical to the pre-T5 payload.
     */
    private readonly subagentPolicy;
    /**
     * @param ctx - owning context (the plugin fiber's ctx inside `apply`).
     * @param bridge - the same `FallbacksSettingsBridge` the runtime reads, so
     *   get/set/reset always operate on the live composed config.
     * @param seeds - the per-apply `FallbacksSeedManager` constructed in
     *   `apply()` — the gateway delegates badge state and revert to it (no
     *   copied manager logic), through the io seam built over this bridge.
     * @param subagentPolicy - live host-policy snapshot from `apply()`; omit
     *   to leave the additive field off the wire.
     */
    constructor(ctx: Context, bridge: FallbacksSettingsBridge, seeds: FallbacksSeedManager, subagentPolicy?: SubagentPolicySnapshotFn);
    /**
     * Read the current composed config (schema defaults → entry base → profile
     * patch). No hard-gate resolver (ADR-2): the raw composed config is
     * the wire value. The removed `enabled` key never crosses the wire (the
     * read whitelist drops it — the snapshot-strip half of LEGACY_KEYS).
     * @returns the wire-normalized composed config plus `legacyKeys` — legacy
     *   two-block-era fields (`chains` / `roles.default` / undeclared rule
     *   role refs) detected on the composed source (schemastery retains them,
     *   plan Task 1 Step 1), so the client can show a migration banner (spec
     *   §9, incremental field — old clients ignore it) — plus the additive
     *   `seeds` badge state (spec §9.4, legacyKeys precedent — old clients
     *   ignore it).
     */
    get(): FallbacksReadResult;
    /**
     * Validate a config patch and write it to the plugin's profile-entry section
     * (live — the runtime reads the same composed source through the Loader; no
     * restart needed).
     * @param patch - any subset of the config keys; unknown keys (top-level
     *   and nested under `roles`) are rejected before anything is written.
     * @returns the NEW composed config plus `legacyKeys` detected on the
     *   POST-WRITE composed source (W-1/F-1): `set` is a config MERGE, so a
     *   legacy patch section (`chains` / `roles.default`) survives a new-shape
     *   save — the response must keep reporting it, or the client banner
     *   would clear against server truth — plus the post-write `seeds` badge
     *   state (same W-1/F-1 rule as `legacyKeys`). Same shape as `get`.
     * @throws when the patch fails `Config` validation, or when no settings
     *   service is composed (KD-G5: the write channel is unavailable).
     */
    set(patch: FallbacksConfigPatch): Promise<FallbacksReadResult>;
    /**
     * Clear the fallbacks profile-entry section so the composition defaults
     * reapply (`settings.replace(ns, {})` — the in-process removal path a
     * merge-only `set` cannot express).
     * @returns the new composed config plus `legacyKeys` on the post-write
     *   source — `replace` drops the patch section, but legacy keys carried by
     *   the entry base survive and are correctly re-reported (W-1/F-1) — plus
     *   the post-write `seeds` badge state (clearing the patch section also
     *   clears the materialized seed rows, so the honest response reports the
     *   emptied state; the registry survives and the next declare re-materializes).
     * @throws when no settings service is composed (KD-G5: the write channel
     *   is unavailable).
     */
    reset(): Promise<FallbacksReadResult>;
    /**
     * Revert one seeded role to its CURRENT declared seed default (AC-3, spec
     * §9.4) — the gateway half of surface (c), delegating to the same manager
     * the service method uses (single point of truth). Business failures are
     * values, never throws: a non-seeded id or a deleted row returns
     * `{ reverted: false, reason }` without writing. The only throw is the
     * KD-G5 settings-unavailable path, and only when a write is actually
     * needed (an idempotent revert at the default needs no channel).
     * @param id - the seeded role id; matched by trimmed id against the
     *   registry (row matching, spec §9.3).
     * @returns the post-write read result (config / legacyKeys / seeds — the
     *   write happened before this read, W-1/F-1) plus the revert `outcome`.
     * @throws TypeError when `id` is not a string; Error when the settings
     *   write channel is unavailable (KD-G5).
     */
    revertSeed(id: string): Promise<FallbacksRevertResult>;
    /**
     * Read the live composed config and normalize it to the typertGateway JSON
     * wire boundary. Containment (guide §10): a malformed stored patch section
     * that the non-strict settings schema let through (e.g. an unknown key)
     * must never fail the RPC — only schema-declared keys cross the wire, and
     * absent values are omitted, never present-as-undefined (the result
     * validator rejects undefined values). The `roles` object is additionally
     * normalized to its declared `list`/`rules` fields: legacy nested keys
     * (e.g. `roles.default`) that schemastery retains on the composed source
     * never leak past the wire boundary (reviewer finding T1 Important #1 —
     * a consumer like Task 2's parseFallbacksConfig would misread them),
     * even though `legacyKeys` still reports them.
     */
    private readConfig;
    /**
     * The wire response of every read (get/set/reset — W-1/F-1): the
     * normalized config plus `legacyKeys` detected on the live composed
     * source plus the additive `seeds` badge state. set/reset must report the
     * POST-WRITE source: the config merge retains legacy patch-section keys,
     * so a save cannot clear them — the honest response keeps the migration
     * banner until a get agrees; `seeds` follows the same rule (post-write
     * badge state, W-1/F-1).
     */
    private readResult;
    /**
     * The io seam the seed manager writes through (spec §9.1): `read` walks
     * the same live bridge source the gateway reads; `writeRoles` persists a
     * full `{ list, rules }` to the plugin's profile-entry section — both
     * arrays always computed from a fresh composed read, so the write stays
     * correct under the settings merge's array-replace semantics and never
     * touches operator rules. The write channel fails with the same KD-G5
     * message as set/reset when no settings service is composed. Built fresh
     * per call so the mutable settings capture is read at call time (the
     * inject child swaps it when the settings service appears/disappears).
     */
    private seedsIo;
}
/**
 * Reject a patch the `Config` schema cannot express: non-object input, unknown
 * top-level keys (schemastery merges them silently — the settings service
 * would accept them), and schema type violations — plus the Task 3 semantic
 * guards the permissive schema deliberately does not carry: nested `roles`
 * keys, `timeSlots` row shapes (unknown preset ids, duplicate presets, preset
 * rows carrying windows, non-`HH:mm` custom bounds, out-of-range days, empty
 * chains), and the all-day `rootChain` head conformance.
 *
 * Exported (plan fallbacks-tui-settings Task 1): the TUI settings section's
 * JSON-field `parse` mirrors the gateway save rules through this single
 * validator (it internally routes `timeSlots` → {@link validateTimeSlotsPatch}),
 * so an invalid draft blocks the TUI save exactly like a rejected gateway
 * patch. No shared-module extraction — the two-keyword diff is the minimal
 * change.
 */
export declare function validateConfigPatch(patch: unknown): void;
/**
 * The explicit typert contribution for the `fallbacks` gateway endpoints —
 * registered via `ctx.typert.register(...)` (see `apply` in `src/index.ts`).
 * The descriptors mirror exactly what the former SRC discovery derived from
 * the `@Remote` markers (`src:<ns>#<endpoint>` identity shape, direct
 * receiver, JSON wire params with `src-json` codec), so the host
 * typertGateway claim + dispatch behavior is the same — the only difference
 * is the registration does not depend on the module-private `remoteMethods`
 * marker table, which a locally-linked plugin can never share with the host
 * installation (see the module docblock).
 */
export declare function fallbacksTypertContribution(): TypertContribution;
