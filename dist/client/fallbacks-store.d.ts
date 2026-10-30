/**
 * Fallbacks settings controller — the client half's own store (slot owner
 * props are empty; data rides this store, per the `plugins.bundle.config`
 * card contract).
 *
 * Read path: the fallbacks config rides the plugin's own gateway channel —
 * `connection.rpc.call('/api', 'fallbacks/get', { args: {} })` — NOT the
 * apiproxy wire: after the settings-exposure patches are gone the
 * `fallbacks` namespace is absent from `settings.describe` on every host
 * (like `advisor` is). `settings.describe({})` is still called, but only
 * for the top-level `writable` flag (host read-only mode) and the namespace
 * directory (the configured-provider join reads model-provider namespaces).
 * A `get` that does not resolve (transport down / gateway not ready / no
 * settings service on the host) is NOT a page error — `state.present` goes
 * false and the section keeps the usable defaults skeleton (KD-G5).
 *
 * Write path: `save(next)` → `rpc.call('/api', 'fallbacks/set', { args: {
 * patch: next } })` (the full edited config is the patch — a merge with all
 * keys present is a full overwrite); `resetToDefaults()` →
 * `rpc.call('/api', 'fallbacks/reset', { args: {} })` (the host clears the
 * user layer via `settings.replace(ns, {})` — the removal path a merge
 * cannot express). The gateway channel has NO revision guard: any
 * `set`/`reset` failure (business rejection or transport) surfaces its
 * message in `state.error` for the section's error banner (KD-G3 — the old
 * `settings-conflict` branch is gone).
 */
import type { LlmConfigurableProvider, ModelCatalog, ModelProviderGroup, SessionFollowFrame, SessionFollowRequest, SessionId, SettingsDescribeValue, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client';
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import { type FallbackStrategy, type FallbacksConfig, type FallbacksRole, type FallbacksRoleRule, type FallbacksRoles } from '../config.ts';
import type { SlotRowConfig } from '../time-slots.ts';
import type { FallbacksSwitchEventData } from '../events.ts';
import type { SeedsWireStatus } from '../seeds.ts';
/** The plugin's settings namespace on the host wire (settings/document-updated ns filter). */
export declare const FALLBACKS_SETTINGS_NS = "fallbacks";
/** Single-page history read for the status block (spec §2.5 D-5: `HISTORY_PAGE_MESSAGES`-sized). */
export declare const SWITCHES_HISTORY_PAGE = 50;
/** How many recent switches the status block renders (spec §2.5 D-5: N=5). */
export declare const RECENT_SWITCH_LIMIT = 5;
/**
 * One recent `fallbacks/switch` event as the status block renders it: the
 * durable payload plus the raw event's ordering key and time (the payload
 * itself carries no seq/time — spec §5 table).
 */
export interface FallbacksSwitchSnapshot extends FallbacksSwitchEventData {
    /** Event seq within the session (newest-first ordering key). */
    seq: number;
    /** Event time, Unix epoch milliseconds. */
    time: number;
}
/**
 * The status block's derived "current effective model" (spec §2.5 D-6) — a
 * **display value** derived from configuration + recent switches, never a
 * live route probe.
 */
export type EffectiveModelView = 
/** ① An inactive config (nothing configured) or an empty rootChain. */
{
    kind: 'unavailable';
}
/** ② The most recent switch's target (`to`). */
 | {
    kind: 'switched';
    provider: string;
    model: string;
}
/** ③ No switches yet: the config's primary target (first chain entry). */
 | {
    kind: 'config';
    provider: string;
    model: string;
};
/** Fallbacks settings-row snapshot. */
export interface FallbacksSettingsState {
    status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
    error: string | null;
    /** Whether the provider allows writes at all (describe top-level flag). */
    writable: boolean;
    /** The resolved configuration (last accepted gateway response, or the defaults skeleton). */
    config: FallbacksConfig;
    /**
     * Whether the `fallbacks/get` gateway channel resolved on the last load.
     * `false` = channel unreachable (transport down / gateway not ready / no
     * settings service) → the section keeps the usable skeleton (KD-G5).
     */
    present: boolean;
    /**
     * Legacy (two-block-era) config keys the gateway detected on the composed
     * source (`get().legacyKeys` / the post-write `set`/`reset` response,
     * spec §9): non-empty → the migration banner renders. The wire field is
     * authoritative — the client never guesses legacy status on its own
     * (detectLegacyClientKeys is a test-only fallback). A `set`/`reset`
     * response WITHOUT the field (older gateway) keeps the last accepted
     * value — only a `get` may settle legacy truth (W-1/F-1: a save merges
     * over the user layer, so it cannot delete legacy keys).
     */
    legacyKeys: string[];
    /**
     * Seeded-role badge state (spec §9.4): one entry per live seed, with the
     * gateway's override verdict. The wire field is authoritative — absent on
     * an old response it keeps the last accepted value (the `legacyKeys`
     * honest rule: only a `get` may settle seed truth).
     */
    seeds: SeedsWireStatus[];
    /** Provider/model directory snapshot (spec §2.5 D-4). */
    catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
    /** Catalog read diagnostic: whole-load failure or per-provider lookups. */
    catalogError: string | null;
    /** Configurable-provider directory (`llm/listConfigurableProviders`). */
    providers: LlmConfigurableProvider[];
    /**
     * The provider dropdown's offer set: catalog providers whose settings
     * profile resolves, with the Models page's `configured` join semantics
     * (spec §2.5 — see {@link configuredProvidersOf}). Unconfigured directory
     * providers never appear as options.
     */
    configuredProviders: LlmConfigurableProvider[];
    /** Model catalog groups (`session/modelCatalog`). */
    groups: readonly ModelProviderGroup[];
    /** Bumped on every accepted catalog read; drives row re-classification. */
    catalogEpoch: number;
    /** Recent-switch summary (spec §2.4 R-4a / §2.5 D-5). */
    switchesStatus: 'idle' | 'loading' | 'ready' | 'error';
    /** Switch-read diagnostic (wire message); null when none. */
    switchesError: string | null;
    /** Most recent `fallbacks/switch` events of the current session, newest first. */
    switches: FallbacksSwitchSnapshot[];
    /**
     * Host subagent-model-selection policy (spec D4 / T5). `undefined` when
     * the gateway omitted the additive field (old payload / policy off) —
     * the card hides the status area and never renders an active allowlist.
     */
    subagentPolicy: SubagentPolicyView | undefined;
}
/** Source label of the effective subagent chain head (spec D4). */
export type SubagentPolicyHeadSource = 'authorized' | 'injected';
/** One exact route on the additive `subagentPolicy` wire field. */
export type SubagentPolicyRoute = {
    provider: string;
    model: string;
};
/**
 * Client-side view of the additive host-policy payload. Structural twin of
 * the gateway wire type — parsed from unknown, never imported from host
 * modules (`src/client/**` consumes policy only via the gateway channel).
 */
export type SubagentPolicyView = {
    state: 'enabled';
    allowedModels: SubagentPolicyRoute[];
    head?: {
        route: SubagentPolicyRoute;
        source: SubagentPolicyHeadSource;
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
 * Shape-guard the additive `subagentPolicy` wire field (T5). Malformed
 * payloads resolve to `undefined` (hide the status area) — the store never
 * throws on an old or misshapen field (old-payload tolerance).
 */
export declare function parseSubagentPolicyWire(value: unknown): SubagentPolicyView | undefined;
/**
 * The provider dropdown's offer set (spec §2.5 D-4): catalog providers whose
 * settings profile resolves in the describe namespaces — the Models page's
 * `configured` predicate (`ui-models` store.ts): a provider is configured
 * when its settings namespace exists AND either it addresses the whole
 * section (`settingsPath` empty) or its profile path resolves in the resolved
 * value. Directory-only (unconfigured) providers never become options; the
 * section still renders existing values for them (read-back + annotation) so
 * nothing is lost on save.
 */
export declare function configuredProvidersOf(providers: readonly LlmConfigurableProvider[], namespaces: ReadonlyMap<string, SettingsNamespaceView>): LlmConfigurableProvider[];
/**
 * Fold the redacted descriptor value into a complete {@link FallbacksConfig}:
 * missing optional fields take spec §4 defaults; gross type mismatches throw
 * so the UI can surface a broken descriptor instead of mis-rendering.
 */
export declare function parseFallbacksConfig(value: unknown): FallbacksConfig;
/**
 * Row-level selection state of one provider/model cell (spec §2.5 D-3):
 * a catalog id, an out-of-catalog raw value read back from the server, or
 * nothing (empty / "any"). Serialization always writes the raw string, so an
 * outside value is preserved verbatim — round-trip lossless.
 */
export type CatalogSelection = {
    kind: 'catalog';
    id: string;
} | {
    kind: 'outside';
    raw: string;
} | null;
/** The catalog faces row conversions classify raw values against (D-4). */
export interface CatalogLookup {
    providers: readonly LlmConfigurableProvider[];
    groups: readonly ModelProviderGroup[];
}
/** The raw selector string a selection serializes to ('' when empty). */
export declare function selectionToRaw(selection: CatalogSelection): string;
/**
 * Classify a raw provider value against the catalog: a catalog route id is a
 * catalog selection, anything else is an outside value kept verbatim.
 */
export declare function classifyProvider(raw: string, catalog: CatalogLookup | undefined): CatalogSelection;
/**
 * Classify a raw model value under its provider against the catalog: a model
 * id advertised by that provider is a catalog selection, anything else is an
 * outside value kept verbatim.
 */
export declare function classifyModel(provider: string, raw: string, catalog: CatalogLookup | undefined): CatalogSelection;
/**
 * Extract the most recent `fallbacks/switch` events from one history page
 * (spec §2.5 D-5): drop packed chunk runs, filter by event type, order by
 * `seq` descending, take at most `limit`. Single-page read — fewer than
 * `limit` events show as-is; no multi-page backfill (Non-Goal).
 */
export declare function extractRecentSwitches(entries: readonly SessionEventLikeEntry[], limit?: number): FallbacksSwitchSnapshot[];
/**
 * Derive the "current effective model" (spec §2.5 D-6): ① inactive (nothing
 * configured — the removed `enabled` switch re-keyed to `isFallbackActive`)
 * / empty rootChain → unavailable; ② a recent switch exists → the latest
 * one's `to`; ③ otherwise → the config's primary target. A **display
 * value** — never a live route probe.
 *
 * INTENTIONAL D-6 CONTRACT RETENTION: after the AC-2 trim (plan
 * fallbacks-settings-visibility Task 2) the settings card's status block no
 * longer consumes this derivation, and no other production code imports it —
 * it is retained (NOT dead code to delete) as the spec §2.5 D-6 derived-value
 * surface, pinned by `tests/fallbacks-store.spec.ts` (D-6 display-value
 * contract). Keep both exports until the spec derivation is removed or gains
 * a real consumer.
 */
export declare function deriveEffectiveModel(config: FallbacksConfig, switches: readonly FallbacksSwitchSnapshot[]): EffectiveModelView;
/** One chain selector row: provider + model (or wildcard). */
export interface ChainSelectorRow {
    /** `provider/*` wildcard entry: the model part is absent. */
    wildcard: boolean;
    provider: CatalogSelection;
    /** Null when wildcard (or the entry carries no model part). */
    model: CatalogSelection;
}
/** Serialize one selector row to its wire string (`provider/model` | `provider/*`). */
export declare function selectorRowToRaw(row: ChainSelectorRow): string;
/**
 * One rootChain row in the editor: the root agent's single fallback chain
 * (block 1 of the two-block model) as an ordered selector list. There is no
 * key input — the row IS the chain.
 */
export interface RootChainRow {
    selectors: ChainSelectorRow[];
}
/** Project the rootChain entries into editable rows (one flat chain row). */
export declare function rootChainToRows(rootChain: readonly string[], catalog?: CatalogLookup): RootChainRow[];
/** Rebuild the rootChain from edited rows; rows with no usable selector drop out. */
export declare function rowsToRootChain(rows: readonly RootChainRow[]): string[];
/**
 * One extra time-slot row in the editor (plan fallbacks-timeslots Task 3):
 * preset rows freeze their windows (read-only summary, models-only edits);
 * custom rows edit start/end/days + chain. `kind` rides the wire VERBATIM —
 * a hand-written YAML row with an unknown kind reads back as a custom-shaped
 * row and serializes back unchanged, so the dirty check stays quiet (save
 * validation rejects it).
 */
export interface SlotEditorRow {
    kind: string;
    /** Frozen preset id — preset rows only (windows are code constants). */
    preset?: string;
    /** Custom rows: window start `HH:mm` text. */
    start: string;
    /** Custom rows: window end `HH:mm` text. */
    end: string;
    /** Custom rows: day mask 0=Sunday…6=Saturday; [] = every day. */
    days: number[];
    /** Custom rows: display name (PR #62 feedback round — collapsed rows). */
    name: string;
    /** UI-only collapse state — never serialized (dropped by rowsToTimeSlots). */
    collapsed: boolean;
    selectors: ChainSelectorRow[];
}
/** Project the time-slot rows into editable rows (chain selectors classified). */
export declare function timeSlotsToRows(timeSlots: readonly SlotRowConfig[], catalog?: CatalogLookup): SlotEditorRow[];
/** Rebuild the time-slot rows from edited rows; blank selectors drop out.
 * `kind` rides verbatim (a hand-written unknown kind reads back unchanged;
 * save validation rejects it) — the cast asserts the trusted editor shape.
 * `days` is ALWAYS serialized ([] included): schemastery composes absent
 * array fields as `[]`, so the composed config every card load accepts
 * carries `days` on every row — the draft must too, or a clean card would
 * read back dirty. */
export declare function rowsToTimeSlots(rows: readonly SlotEditorRow[]): SlotRowConfig[];
/**
 * One declared-role row in the editor (block 2 `roles.list`): identity
 * fields + the role's own chain selector list + its append strategy.
 * `prompt`/`permissions` are schema-reserved for the next iteration
 * (fallbacks-explicit-role-tool) — they never enter row editing this round.
 */
export interface RoleRow {
    id: string;
    persona: string;
    selectors: ChainSelectorRow[];
    fallback: FallbackStrategy;
    /** UI-only collapse state — never serialized (dropped by rowsToRoles). */
    collapsed: boolean;
    /**
     * UI-only seeded-persona brief disclosure (plan role-card-seeded-ux) —
     * never serialized (dropped by rowsToRoles). Only seeded rows render the
     * affordance (a read-only single-line brief + the expandable full text);
     * ordinary rows ignore the flag.
     */
    personaOpen: boolean;
}
/** Project the declared roles into editable rows (chain selectors classified). */
export declare function rolesToRows(roles: readonly FallbacksRole[], catalog?: CatalogLookup): RoleRow[];
/** Rebuild the declared roles from edited rows; empty selectors drop out. */
export declare function rowsToRoles(rows: readonly RoleRow[]): FallbacksRole[];
/**
 * Rebuild the declared roles from edited rows, re-attaching the
 * schema-reserved `prompt`/`permissions` fields from the last accepted
 * config by role id — they never round-trip through rows this round, so
 * without the merge a save would silently drop them (T2 reviewer minor
 * #2). The id trim matches {@link rowsToRoles}; a row whose id matches no
 * original role (a freshly added one) keeps no extras. Key order mirrors
 * `parseFallbacksConfig` so a clean draft's JSON dirty comparison never
 * flags it.
 */
export declare function mergeRoleExtras(rows: readonly RoleRow[], originalRoles: readonly FallbacksRole[]): FallbacksRole[];
/**
 * The `roles.rules` role dropdown's offer set — the ONLY data source for the
 * rule rows' role selector: the built-in `'inherit'` target plus every
 * declared `roles.list` id, in declaration order (a role added/removed on
 * the same page is reflected immediately).
 */
export declare function ruleRoleOptions(roles: Pick<FallbacksRoles, 'list'>): string[];
/**
 * Client-side legacy fallback detection (spec §9). The gateway's
 * `legacyKeys` wire field is authoritative for the migration banner; this is
 * a defensive fallback for configs that already passed wire normalization
 * yet still carry a `roles.rules` reference to an undeclared role id — the
 * only two-block-era leftover that can survive the wire (the removed
 * `chains`/`roles.default` keys never ride it).
 */
export declare function detectLegacyClientKeys(config: FallbacksConfig): string[];
/**
 * One role-rule row in the editor (PR #62 feedback: no origin control —
 * rules are subagent-only; a persisted wire `origin` is ignored).
 */
export interface RoleRuleRow {
    provider: CatalogSelection;
    model: CatalogSelection;
    role: string;
}
/** Project the role rules into editable rows (provider/model classified). */
export declare function rulesToRows(rules: readonly FallbacksRoleRule[], catalog?: CatalogLookup): RoleRuleRow[];
/** Rebuild the role rules from edited rows; empty provider/model drop out. */
export declare function rowsToRules(rows: readonly RoleRuleRow[]): FallbacksRoleRule[];
/**
 * The settings Remote namespace face the fallbacks store reads
 * (`ctx.remote.settings`; api-settings-controller `@Remote` methods).
 */
export interface FallbacksSettingsRemote {
    /** Redacted describe: provider writability plus the namespace directory. */
    describe(): Promise<RemoteResult<SettingsDescribeValue>>;
}
/**
 * The llm Remote namespace face the fallbacks store reads
 * (`ctx.remote.llm`; dsh-llm `@Remote` methods).
 */
export interface FallbacksLlmRemote {
    /** Declared configurable-provider directory, registered or dormant. */
    listConfigurableProviders(): Promise<RemoteResult<LlmConfigurableProvider[]>>;
}
/**
 * The session Remote namespace face the fallbacks store reads
 * (`ctx.remote.session`; api-session-controller `@Remote` methods).
 */
export interface FallbacksSessionRemote {
    /** Host-generation model catalog: provider groups plus per-provider failures. */
    modelCatalog(): Promise<RemoteResult<ModelCatalog>>;
    /**
     * Live event stream for one durable session address; the opening snapshot
     * frame carries the tail page this store reads, then the stream is
     * cancelled (successor of the apiproxy `sessions.history` unary —
     * `session/page` needs the follow opening frame's cursor, so a cold tail
     * read goes through the follow opening).
     */
    follow(request: SessionFollowRequest, signal?: AbortSignal): AsyncIterable<SessionFollowFrame>;
}
/**
 * The generated Remote namespaces the fallbacks store consumes, as one
 * structural face. The mount boundary casts `ctx.remote` once — the same
 * pattern as the session-controller client's `ctx.remote as unknown as
 * SessionRemotes` — because the generated `TypertRemoteNamespaceMap` merge
 * ships with the host's build, not with the linked package types.
 */
export interface FallbacksRemote {
    readonly settings: FallbacksSettingsRemote;
    readonly llm: FallbacksLlmRemote;
    readonly session: FallbacksSessionRemote;
}
/** Controller joining Settings reads, writes, and pushed invalidations. */
export declare class FallbacksSettingsController {
    private readonly api;
    private readonly rpc;
    /** Snapshot consumed by the section through `useSyncExternalStore`. */
    readonly store: SnapshotStore<FallbacksSettingsState>;
    /** Read guard: a newer load() supersedes an older one's publish. */
    private readGeneration;
    /**
     * Write guard: save()/resetToDefaults() completions ALWAYS publish unless
     * dispose() invalidated them — an overlapping read must never discard a
     * successful write's accept() (audit F1).
     */
    private writeGeneration;
    private catalogGeneration;
    private switchesGeneration;
    /** Every settings namespace from the last describe, keyed by ns — the configured-provider join's other input. */
    private namespaces;
    private currentSession;
    /**
     * The store's dispose signal (qc3 F-003): created alongside the store
     * lifecycle, threaded into every `session.follow` call, aborted once in
     * {@link dispose} — a follow opening still mid-await at plugin unload
     * (HMR / fiber dispose, or a wedged gateway stream) is cancelled promptly
     * instead of staying open until the mount abort or socket failure.
     */
    private readonly followAbort;
    /**
     * @param api - the Remote namespace faces the store reads (settings
     *   describe `writable` + namespace directory, llm provider directory,
     *   session model catalog + follow tail page) — `ctx.remote` cast once at
     *   the mount boundary.
     * @param rpc - the connection's generic RPC caller for the host gateway
     *   channel (`/api`), injected from the connection handle.
     */
    constructor(api: FallbacksRemote, rpc: ClientConnectionRpc);
    /**
     * Refresh the page snapshot. Latest request wins. `settings.describe`
     * still runs — it supplies the top-level `writable` flag (host read-only
     * mode) and the namespace directory (the configured-provider join's other
     * input) — but the fallbacks config itself rides the gateway channel:
     * `rpc.call('/api', 'fallbacks/get', { args: {} })`. The two reads are
     * independent and run in PARALLEL (Promise.all — one round trip per
     * refresh, not two). The `fallbacks` namespace is NOT expected in describe
     * anymore (it is off the apiproxy boundary post-patch); a describe failure
     * remains a hard `error` (the form cannot render provider/model options
     * without the directory), while a get failure is NOT a page error —
     * `present` goes false and the section keeps the usable skeleton (KD-G5).
     * @returns nothing; {@link store} carries success or failure.
     */
    load(): Promise<void>;
    /**
     * Refresh the provider/model catalog (`llm/listConfigurableProviders` +
     * `session/modelCatalog`), an
     * independent read path with its own generation guard so it can run
     * parallel to {@link load} without clobbering it (spec §2.5 D-4).
     * Per-provider lookup failures ride `catalogError` as a diagnostic without
     * failing the sound groups; a whole-load failure lands `catalogStatus:
     * 'error'` and never blocks the rest of the form.
     * @returns nothing; {@link store} carries success or failure.
     */
    loadCatalog(): Promise<void>;
    /**
     * Record the current session the status block reads (spec §2.5 D-5). Once
     * the block has been read once, its summary follows session switches
     * immediately; an idle block only records the id — the section's mount
     * effect performs the first read.
     * @param sessionId - the session whose history is summarized; undefined
     *   (no current session) resolves to the empty state.
     */
    setCurrentSession(sessionId: SessionId | undefined): void;
    /**
     * Read the recent-switch summary for the current session (spec §2.5 D-5):
     * one tail page (`maxMessages` = {@link SWITCHES_HISTORY_PAGE}) read from
     * the `session/follow` opening snapshot — the host has no unary tail-page
     * read (`session/page` needs the follow opening frame's cursor), so the
     * stream is cancelled right after its first frame —
     * `fallbacks/switch` events extracted newest-first capped at
     * {@link RECENT_SWITCH_LIMIT}. No current session → honest empty ready
     * state (no RPC); a read failure lands `switchesStatus: 'error'` and never
     * touches the settings state (the form keeps editing/saving normally).
     * @returns nothing; {@link store} carries success or failure.
     */
    loadSwitches(): Promise<void>;
    /**
     * Persist the full edited configuration through the gateway channel
     * (`/api/fallbacks/set`). The full config is sent as a MERGE patch (guide
     * §9) — keys the new schema cannot express (legacy `chains` /
     * `roles.default` in the user layer) survive the write, which is why the
     * gateway returns POST-WRITE `legacyKeys` and the banner stays honest
     * (W-1/F-1). The merge has no revision guard: any failure (business
     * rejection or transport) surfaces its message in `state.error` for the
     * section's error banner and the form stays editable for retry (KD-G3).
     * @param next - the complete edited configuration.
     */
    save(next: FallbacksConfig): Promise<void>;
    /**
     * Reset to composition defaults through the gateway channel
     * (`/api/fallbacks/reset` — the fallbacks-specific third method; the host
     * clears the user layer via `settings.replace(ns, {})`, the removal path a
     * merge cannot express). Same error handling as {@link save} (KD-G3).
     */
    resetToDefaults(): Promise<void>;
    /** Stop in-flight responses from publishing after plugin disposal. */
    dispose(): void;
    /**
     * Publish a settled load: `status` ready, `writable` from describe, and —
     * only when the gateway returned a REAL config — `present` true and
     * `state.config` replaced with the parsed value. A get that did not
     * resolve (`config === undefined`) lands `present` false and keeps the
     * last accepted config (the defaults skeleton on a first load) — the
     * draft seed invariant (I-1): a transient channel-down must never seed
     * the form with defaults over real server truth. `legacyKeys` rides the
     * same publish: the wire field drives the migration banner. save/reset
     * pass the POST-WRITE value (W-1/F-1) — or the previous value when the
     * response omits the field, so a write can never clear the banner
     * against server truth; only a real `get` may. `seeds` (spec §9.4)
     * follows the same honest rule: the wire badge field is authoritative
     * only when a real config resolved — a transient channel-down keeps the
     * last accepted badge state.
     */
    private accept;
    private fail;
}
/**
 * Refetch after reconnect / settings change only when the section has already
 * opened once.
 * @param controller - the fallbacks settings controller.
 */
export declare function refreshFallbacksIfLoaded(controller: FallbacksSettingsController): void;
/**
 * Refetch the catalog after `llm/adapters-updated` only when it has already
 * been opened once (the catalog twin of {@link refreshFallbacksIfLoaded}).
 * @param controller - the fallbacks settings controller.
 */
export declare function refreshCatalogIfLoaded(controller: FallbacksSettingsController): void;
/**
 * Refetch the recent-switch summary after `settings/document-updated`
 * (fallbacks ns) / `connection/reset` only when the status block has already
 * been read once
 * (the switches twin of {@link refreshFallbacksIfLoaded}).
 * @param controller - the fallbacks settings controller.
 */
export declare function refreshSwitchesIfLoaded(controller: FallbacksSettingsController): void;
