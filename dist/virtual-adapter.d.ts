/**
 * Virtual `ModelPool/Auto` LLM adapter (plan fallbacks-virtual-chain
 * Task 1, technical pins P1–P3; PR #62 feedback round): a mount-only
 * catalog row that makes the configured effective chain selectable as the
 * session **primary** in the host model picker, without patching dsh or
 * dsh-TUI (web and TUI share the adapter catalog).
 *
 * Wiring (P2): `installFallbacksAdapter` installs ONE conditional
 * `ctx.inject(['llm'])` child — absent `llm` service (test harness) is a
 * clean no-op, and fiber unload ⇒ the child's disposer unregisters the
 * route. Registration is an idempotent transition-reconcile on COMMITTED
 * config snapshots: register when nothing is configured → something is
 * (`isFallbackActive` — content presence, plan fallbacks-web-ux-alignment
 * T2), unregister on the reverse, driven by the settings `onChange` hook
 * (the returned reconcile thunk, wired by `apply()`) plus child activation.
 * The row is visible whenever something is configured — a non-conforming
 * all-day chain does NOT hide it (PR #62 feedback); conformance still gates
 * a successful delegate (`effectiveHeadOf` below refuses a non-conforming
 * all-day). The registration gate is `isFallbackActive` content presence
 * (`rootChain` / `timeSlots` / declared roles): a slot-row edit that flips
 * that gate (e.g. removing the only slot while `rootChain` and roles are
 * empty) intentionally churns registration — the content-presence contract
 * (plan fallbacks-web-ux-alignment T2), not churn to design away; do NOT
 * re-narrow the condition to ignore `timeSlots`. Conformance-only chain
 * edits still never churn (conformance gates the delegate, not the row).
 *
 * Adapter behavior (P1/P3): `listModels` advertises exactly the one virtual
 * row; `stream()` is a THIN single-hop delegate to the effective chain head
 * through the host LLM runtime — no chain walk, no cooldown/caps/revert
 * bookkeeping, no state writes (a failure inside the delegate surfaces at
 * `agent/request-error`, where the existing engine walks from there).
 * `resolveModel` proxies the current effective head's metadata when
 * resolvable (modalities/context-window/reasoning follow the head) with a
 * permissive default otherwise — never throws. `providerRetryPolicy` and
 * `imageRequestPricing` mirror the same head for the host-captured retry
 * policy and the token meter — also never throwing.
 *
 * @module dsh-llm-fallbacks/virtual-adapter
 */
import type { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, type GenerateOptions, type LlmImageRequestPricing, type LlmModelInfo, type LlmResolvedModelInfo, type LlmRuntime, type ResolvedRetryPolicy, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { type FallbacksConfig } from './config.ts';
/** Provider route of the virtual adapter (exact string, spec lock). */
export declare const FALLBACKS_PROVIDER = "ModelPool";
/**
 * Model id of the virtual catalog row (exact string, spec lock). "Auto" is
 * the hardcoded picker id (not i18n — user decision 2026-08-18). The
 * catalog `name` the host picker renders is dynamic — see
 * {@link pickerDisplayName} (`Auto: <model>[<slot>]`).
 */
export declare const FALLBACKS_CHAIN_MODEL = "Auto";
/**
 * `LlmError` code: the effective chain is empty — the virtual route has no
 * head to delegate to (P1 guard).
 */
export declare const EMPTY_EFFECTIVE_CHAIN_CODE = "EMPTY_EFFECTIVE_CHAIN";
/**
 * `LlmError` code: the effective chain head is not a dispatchable real pair
 * (non-conforming all-day, wildcard selector, malformed selector, or a
 * self-route back to `ModelPool/*` — the P1 recursion guard).
 */
export declare const UNDISPATCHABLE_HEAD_CODE = "UNDISPATCHABLE_EFFECTIVE_HEAD";
/** `LlmError` code (defensive): the `llm` runtime disappeared mid-flight. */
export declare const LLM_UNAVAILABLE_CODE = "LLM_UNAVAILABLE";
/** One dispatchable exact head: `provider/model`. Wildcards are never seeds (P3). */
export interface EffectiveHead {
    provider: string;
    model: string;
}
/**
 * The FIRST DISPATCHABLE exact head of a chain — the single definition of
 * "effective head" (F-001) shared by the virtual adapter's delegate paths and
 * the routing engine's served-route anchor (`anchorServedRoute` in
 * `src/index.ts`). Walks the SAME chain `resolveEffectiveChain` produces,
 * skipping entries that can never
 * be dispatched: malformed selectors (config-warning path), `provider/*`
 * `provider/*` wildcards (no real pair), and self-routes back to
 * `ModelPool/*` (the P1 recursion guard). `undefined` when the chain
 * is empty or no entry is dispatchable.
 */
export declare function firstDispatchableExactHead(chain: readonly string[]): EffectiveHead | undefined;
/**
 * The effective chain head at `now` (P1): the first DISPATCHABLE exact head
 * of the SAME `resolveEffectiveChain` the routing engine uses — thin
 * config+clock entry into the shared {@link firstDispatchableExactHead} (no
 * divergent skip/walk rules). `undefined` when the chain is empty or no
 * entry is dispatchable (wildcard, self-route to `ModelPool/*`,
 * malformed selector).
 *
 * Conformance gate (REMOVED in this fork — dsh-model-pool): there is no
 * official-model requirement; `effectiveHeadOf` returns the first dispatchable
 * exact head of the effective chain, and only an empty chain or an
 * undispatchable entry (wildcard / malformed / self-route to `ModelPool/*`)
 * earns no primary semantics (the picker row stays visible whenever the pool
 * has content).
 */
export declare function effectiveHeadOf(config: FallbacksConfig, now: Date): EffectiveHead | undefined;
/**
 * Host picker label: `Auto: <displayName>[<slot>]`.
 * Display name first so the trigger stays readable and platforms stay
 * distinguishable (catalog `name`, not the model id). Bare `Auto` when
 * there is no dispatchable head. Slot label from {@link resolveSlotState}.
 * @param modelDisplayName - catalog/resolved name; falls back to the id.
 */
export declare function pickerDisplayName(config: FallbacksConfig, now?: Date, modelDisplayName?: string): string;
/**
 * The virtual adapter (P1/P3). `stream()` is a thin head-delegate, never a
 * second routing engine: no chain walk, cooldown, caps, revert bookkeeping,
 * or state writes live here — those stay in the `agent/request` /
 * `agent/request-error` listeners. Exported so the defensive guard paths
 * the registration lifecycle cannot reach (a registered route whose `llm`
 * vanished mid-teardown) stay unit-testable by direct construction.
 */
export declare class ModelPoolAdapter extends LlmAdapter {
    private readonly readConfig;
    private readonly getLlm;
    constructor(readConfig: () => FallbacksConfig, getLlm: () => LlmRuntime | undefined);
    /** Minimal honest descriptor (P3) — the provider route IS the display name. */
    providerInfo(provider: string): {
        id: string;
        name: string;
    };
    /** Advisory catalog: one virtual row; `name` is the live picker label. */
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /**
     * Proxy the current effective head's model metadata when resolvable (P3):
     * modalities/context-window/reasoning follow the head — the truthful
     * answer for the CURRENT head. Permissive default otherwise; never throws.
     */
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /**
     * Route-accurate retry attribution: the virtual row declares no policy of
     * its own — the virtual `provider` argument is intentionally ignored. The
     * host captures `adapter.providerRetryPolicy(provider) ??
     * resolveRetryPolicy(void 0, …)` ONCE, when a route is registered, so
     * answering here with the SAME policy the concrete head route declared
     * (e.g. a user's `llm-deepseek.retryPolicy`, including `mode: 'always'`)
     * keeps retries behaving exactly as they do on the head `stream()`
     * dispatches. Never throws: an unresolvable head, a vanished `llm`, or an
     * unregistered head provider degrades to `undefined` — the host's own
     * default. That last arm matters: the runtime's lookup THROWS `NO_ADAPTER`
     * for an unknown provider, and this call happens inside the plugin's
     * `registerAdapter`, so an escaping throw would take the whole virtual
     * route down instead of just degrading its policy.
     */
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
    /**
     * Route-accurate image pricing: the virtual row has no
     * pricing of its own — the virtual `provider`/`model` arguments are
     * intentionally ignored. Resolves the SAME effective head `stream()`
     * dispatches and delegates through the runtime lookup, so the token
     * meter gets exactly the answer the concrete route's adapter would give
     * (including `undefined`). Never throws: an unresolvable head, a
     * vanished `llm`, or a throwing delegate degrades to `undefined` — the
     * token meter's neutral estimate.
     */
    imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
    /**
     * Thin head-delegate (P1): resolve the effective chain head and dispatch
     * that REAL pair through the host LLM runtime. Throws an explicit
     * `LlmError` only when there is no real pair to delegate to: an empty
     * effective chain, an undispatchable head (wildcard / malformed /
     * self-route — the recursion guard), or a vanished `llm` runtime. The
     * runtime normalizes the throw into a terminal error finish chunk, so the
     * documented listener-order degradation stays graceful instead of a hard
     * outage.
     */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/**
 * Install the virtual adapter registration lifecycle (P2).
 *
 * @param ctx - the plugin context.
 * @param readConfig - live config reader (the same `source()` the runtime
 *   reads, so reconcile always sees COMMITTED composed snapshots).
 * @returns the reconcile thunk — call it from the settings `onChange` hook
 *   (child activation runs one reconcile on its own).
 */
export declare function installFallbacksAdapter(ctx: Context, readConfig: () => FallbacksConfig): () => void;
