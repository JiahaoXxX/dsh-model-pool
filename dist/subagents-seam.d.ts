/**
 * Dispatch-seam role resolution + per-child record (plan
 * role-based-subagent-adoption Task 1).
 *
 * The seam is the documented cordis service-read waterfall
 * (`Events['internal/get']`, `@deepseek-ai/cordis`
 * `lib/types/events.d.ts`): a listener wraps the `subagents` service VALUE on
 * read and returns a prototype-delegating wrapper whose `start` /
 * `startContinuable` resolve the dispatch role from the incoming request
 * BEFORE delegating. The real service object is never mutated; readers of the
 * `subagents` service transparently receive the wrapper.
 *
 * Role source (plan Global Constraints): the child request's prompt carries
 * the Assignment header field `**Execute as**: <id>` — dsh role binding is
 * prompt-only. {@link resolveDeclaredRoleFromAssignment} is the ONE pure
 * resolution point; it canonicalizes exactly like the existing trimmed-id
 * map (trim, drop ONE leading `@`, case-insensitive match against the
 * declared trimmed ids) and returns the DECLARED RAW id. Undeclared, absent,
 * `inherit`, or ambiguous declarations resolve to `undefined` = no role.
 *
 * The resolution reads the Assignment HEADER region only, never the whole
 * prompt (Task 1 CF-2): the region ends at the first Assignment body marker,
 * and when the prompt carries NO marker it is bounded to the LEADING HEADER
 * BLOCK — the first paragraph plus every following paragraph that opens with
 * header material, ending at the prompt's first prose paragraph. So a
 * `**Execute as**: <id>` line quoted inside a body paragraph can never shape a
 * resolution (it is outside the region) even though mstar's canonical dispatch
 * text carries no body marker at all. Inside the region the engine's pinned
 * ambiguity rule stands unchanged: the DISTINCT DECLARED ids must collapse to
 * exactly one, else the dispatch is a no-op — never a first-occurrence pick.
 *
 * Per-child record: the wrapped start's RESULT carries the child session id —
 * `start` resolves to a `SubagentRun` (`id` IS the published child session id
 * for a local run) and `startContinuable` to a `ContinuableStart` (`childId`).
 * The record `{ role, at, firstNoticePending }` is keyed by that id (Task 3
 * reads it to emit the one role notice row). A result carrying only a
 * `jobId` — a registry job id, NOT a session id — is never keyed: the child is
 * correlated instead through the parent-owned `subagent/catalog` session event
 * `{ childId, label }` joined on the delegating parent + request label.
 *
 * Persona delivery (plan Task 2): the SAME single resolution point merges the
 * declared role's `roles.list[].persona` (trimmed, non-empty) into the
 * request's NATIVE `persona` slot — the slot the runtime composes as the
 * scoped `deployment:persona-prefix` system-prompt section on the child. The
 * source is the RESOLVED ROLE only, so delivery is chain-independent: a
 * `chain: []` role gets its persona exactly like a chained one (no routing
 * state is read). Both native start surfaces are covered, with the gate each
 * one's fail-loud contract needs (measured on the installed
 * `@deepseek-ai/dsh-subagent`): the one-shot `start` REJECTS a
 * request carrying `persona` for a provider whose
 * `getProvider(name).capabilities.persona` is not `true` (`lib/index.js:3284,3340-3363`,
 * `assertCapabilities`), so the merge pre-checks that flag; the continuable
 * surface is composed by the continuation manager, which applies
 * `request.persona` unconditionally (`lib/index.js:1691`) and is gated by
 * the provider's `prepareContinuable` presence instead (`lib/index.js:3316-3319`).
 * A gate miss skips the persona with ONE contained debug log — never a failed
 * start. An explicit caller `persona` WINS (the slot is filled only when it is
 * absent), and every skip path returns the caller's OWN request object, so the
 * native call stays byte-identical.
 *
 * In-session notice row (plan Task 3): the SAME install point registers the
 * `agent/pre-step` emitter (`./role-notice.ts`) over the record map it owns, so
 * the role is announced once in the child's own session. Its per-agent
 * `noticeEmitted` marker is exposed here for the caller's cleanup sites: the
 * plugin dispose effect clears it, while `agent/disposed` deliberately KEEPS it
 * (CF-6 — the marker is SESSION-stable and bounded, because a continuable
 * child's durable session survives its activation).
 *
 * Durable role visibility (plan Task 3b): the SAME install point registers the
 * host-side session projection unit (`./role-projection.ts`) that folds that
 * notice row out of the child's own log, so the session-header badge can show
 * the role for a settled child and after a host restart — a read of the SAME
 * single write primitive, never a second one.
 *
 * Multi-fiber composition (CF-5): the record map and the notice marker are
 * ROOT-shared, while only the `internal/get` wrapper (+ the catalog listener it
 * feeds) is single-owner. Every applied fiber registers its OWN notice emitter
 * and projection unit and reports its ownership structurally
 * (`SubagentSeam.ownsWrapper`), so a disposing fiber cannot silently take the
 * role surfaces down with it.
 *
 * Degrade-never-crash: an absent/reshaped service, an unexpected result
 * shape, or any throwing bookkeeping degrades to the native path with at most
 * ONE contained debug log — a dispatch is never affected.
 *
 * @module dsh-llm-fallbacks/subagents-seam
 */
import type { Context } from '@deepseek-ai/cordis';
import { type FallbacksRole } from './config.ts';
/**
 * The cordis service-read waterfall event the seam registers on. Referenced
 * ONCE (registration) so a future cordis rename is a one-line change here.
 */
export declare const SUBAGENT_SEAM_EVENT = "internal/get";
/** The service name the seam wraps (`ctx.subagents`). */
export declare const SUBAGENT_SEAM_SERVICE = "subagents";
/**
 * One dispatch-resolved per-child record (Task 3 reads it to emit exactly one
 * role notice row per child session).
 */
export interface SubagentSeamRecord {
    /**
     * The DECLARED RAW role id resolved at the dispatch seam.
     *
     * Authoritative-role precedence (CF-10, documented rather than resolved by
     * re-branding): a `startContinuable` resume re-keys the child and may resolve
     * a DIFFERENT declared role, and this field is then rewritten while the
     * durable notice row the child's session already carries keeps the FIRST role.
     * The projection deliberately reads the notice row, so the durable role is the
     * child's announced identity and this record is only the LIVE dispatch hint
     * (what the next start / the resume fallback would use). The two can therefore
     * disagree after a re-dispatch until the child is disposed; no consumer may
     * treat the record as the durable role.
     */
    role: string;
    /** When the record was written (epoch ms). */
    at: number;
    /**
     * `true` until the child's role notice row has been emitted (Task 3). A
     * later write for the SAME child session preserves an already-cleared
     * marker, so a repeat dispatch/resume cannot produce a second notice row.
     * The root-shared `noticeEmitted` set is the SESSION-stable half of that
     * guarantee (it survives `agent/disposed`); this field is the per-record half
     * that a resume rewrite preserves.
     */
    firstNoticePending: boolean;
    /**
     * `true` when the role DECLARES a persona and that persona was NOT delivered
     * (Task 2's capability gate declined it, or no provider was registered to
     * carry it). Absent when there was nothing to report: the persona was
     * delivered, the caller set one (explicit intent wins), the role declares
     * none, or no persona source is wired. Task 3 appends
     * ` (persona not applied)` on `true` only.
     *
     * STICKY (Task 3 review Minor 4): a record rewrite (a `startContinuable`
     * resume re-keys the child) can only ADD this verdict, never clear it. A
     * resume recomputes the merge outcome on its own surface — and that surface
     * legitimately returns `false` when it delivers the CALLER's persona or when
     * its own merge degrades — but neither retroactively installs the role's
     * DECLARED persona on the dispatch that already reported it missing. The
     * child's one notice row is a claim about that dispatch, so the first `true`
     * survives; a later `false` is simply not recorded.
     */
    personaNotApplied?: boolean;
}
/** One consumed prompt content block (`@deepseek-ai/dsh-llm` `ContentBlock` text members). */
export interface SubagentPromptBlockView {
    readonly type: string;
    readonly text?: string;
}
/**
 * Structural view of the one-shot start request (consumed fields only): the
 * `prompt` is the role-extraction source, `label` + `parent` are the
 * catalog-correlation join key, and `persona` is the NATIVE per-child persona
 * slot the role persona is merged into (plan Global Constraints: an explicit
 * caller value wins). The wrapper forwards the request object itself, so every
 * other field reaches the service unchanged.
 */
export interface SubagentStartRequestView {
    readonly prompt?: readonly SubagentPromptBlockView[];
    readonly label?: string;
    readonly parent?: {
        readonly session?: {
            readonly id?: string;
        };
    };
    readonly persona?: string;
}
/**
 * Structural view of the continuable start spec (consumed fields only):
 * `childId` is the caller-reserved identity a resume already carries, used as
 * the record fallback when the resume request has no Assignment header.
 */
export interface ContinuableStartSpecView {
    readonly provider: string;
    readonly label?: string;
    readonly childId?: string;
    readonly request: SubagentStartRequestView;
}
/** Options for {@link installSubagentSeam}. */
export interface SubagentSeamOptions {
    /**
     * Live declared-role id map (trimmed id → DECLARED RAW id), read per start
     * so a settings change is observed without a re-install.
     */
    roleIds: () => ReadonlyMap<string, string>;
    /**
     * Live declared roles (`roles.list`) — the persona source, read per start so
     * a settings/persona edit is observed without a re-install. Absent ⇒ the
     * seam only records roles (no persona delivery).
     */
    roles?: () => readonly FallbacksRole[];
    /** Contained debug sink (at most one line per contained degrade). */
    debug?: (message: string) => void;
}
/** The installed seam (Task 3 surface + explicit teardown). */
export interface SubagentSeam {
    /**
     * Per-child records keyed by the child SESSION id (the wrapped start's
     * result id). ROOT-shared (CF-5): every fiber applied over the same root reads
     * the same map. Mutable by design: Task 3 clears `firstNoticePending` after
     * emitting the notice.
     */
    readonly records: Map<string, SubagentSeamRecord>;
    /**
     * Per-agent marker of children whose role notice row was already emitted
     * (mirrors the runtime's `dispatchInjected`): the in-memory half of Task 3's
     * once-per-child guarantee, also ROOT-shared. SESSION-stable (CF-6): it is
     * deliberately NOT cleared on `agent/disposed` — a continuable child's durable
     * session survives the activation, so clearing the marker would let a
     * re-activation resume append a second notice row to the same log. It is
     * bounded (`NOTICE_EMITTED_LIMIT`) and cleared only in the plugin dispose
     * effect.
     */
    readonly noticeEmitted: Set<string>;
    /**
     * `true` when THIS install owns the root-scoped `internal/get` wrapper (plus
     * the catalog-correlation listener it feeds) — the only part that must have a
     * single owner. `false` on a later fiber over the same root, which still
     * registers its OWN notice emitter and projection unit. The callers' dedupe
     * branch reads THIS field (CF-5): a structured marker, never a thrown
     * message.
     */
    readonly ownsWrapper: boolean;
    /** Stop intercepting service reads (the owning fiber's teardown also does). */
    dispose(): void;
}
/**
 * Cap on un-correlated claims (a `jobId`-only result whose catalog event never
 * arrives). Bounded insertion-order eviction — recency-ordered, because a
 * re-claimed hot key is re-inserted (`beginCorrelation` deletes before it sets),
 * so the busiest claim can never be the one evicted.
 *
 * @internal Exported for the bound test (mirrors `subagentSeamOf`): the value is
 * not part of the plugin's public surface, but a test that hardcoded 64 could
 * not tell the real bound from a stale copy.
 */
export declare const PENDING_CORRELATION_LIMIT = 64;
/**
 * PURE dispatch-role resolution (plan Global Constraints): read the Assignment
 * header field `**Execute as**: <id>` from `prompt` and return the DECLARED
 * RAW role id, or `undefined` when nothing resolves. Never throws.
 *
 * - absent / empty / body-quoted-only → `undefined`
 * - `inherit` (the reserved "no specific role" id) → `undefined`
 * - undeclared id → `undefined` (never invent a role)
 * - several DISTINCT declared ids in the header region → `undefined`
 *   (ambiguous); repeats of the same declared id (e.g. `coder` and `@CODER`)
 *   still resolve
 *
 * @param prompt - the Assignment text carried by the child request's prompt.
 * @param roleIds - the declared trimmed-id map (`trimmed id → declared raw id`).
 */
export declare function resolveDeclaredRoleFromAssignment(prompt: string, roleIds: ReadonlyMap<string, string>): string | undefined;
/**
 * PURE, chain-independent persona lookup (plan Task 2 / Global Constraints):
 * the DECLARED `persona` of `roleId`, trimmed, and only when it is still
 * non-empty after the trim — a blank persona is NO persona. `roleId` is the
 * DECLARED RAW id the seam already resolved, so this is an exact id match, not
 * a second canonicalization pass.
 *
 * Only `id` and `persona` are read: no `chain`, no `rootChain`, no routing
 * state — a `chain: []` role's persona resolves exactly like a chained one's.
 *
 * @param roles - the live declared roles (`roles.list`).
 * @param roleId - the DECLARED RAW role id resolved at the seam.
 */
export declare function personaForRole(roles: readonly FallbacksRole[], roleId: string): string | undefined;
/**
 * @internal Test seam (mirrors `chainHeads`): the seam installed on
 * `ctx`, if any. Not part of the plugin's public surface — lets tests read and
 * seed the per-child record map without reaching into the installation
 * closure. `undefined` when no seam is installed.
 */
export declare function subagentSeamOf(ctx: Context): SubagentSeam | undefined;
/**
 * Install the dispatch seam on `ctx`: wrap every `subagents` service read and
 * resolve + record the dispatch role per start, and register this fiber's role
 * surfaces (the notice emitter + the projection unit).
 *
 * Never throws for a multi-fiber apply (CF-5): a fiber whose root already owns
 * the `internal/get` wrapper gets a seam with `ownsWrapper: false` — it shares
 * the root's record map / notice marker (so exactly one notice row is written
 * per child) and still installs its OWN notice emitter and projection unit, so
 * neither surface dies when another fiber of the same root disposes.
 *
 * Returns the seam (the shared record map Task 3 reads, the ownership marker,
 * plus an idempotent `dispose` that withdraws THIS fiber's registrations). The
 * `internal/get` listener is owned by this module; callers that rely on the
 * fiber teardown alone may ignore `dispose`.
 */
export declare function installSubagentSeam(ctx: Context, options: SubagentSeamOptions): SubagentSeam;
