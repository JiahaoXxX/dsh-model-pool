/**
 * Durable role visibility for the session-header badge (plan
 * role-based-subagent-adoption Task 3b) — ONE host-side session projection unit
 * folding the role out of the child's OWN durable log.
 *
 * Data source = Task 3's notice row, the plugin's single write primitive: the
 * fold reads the child's committed `user/message` events, keeps the one whose
 * provenance is ours (`source.kind` is the producer-declared
 * ROLE_NOTICE_SOURCE_KIND, or the V3→V4-migrated form of a legacy row —
 * `ROLE_NOTICE_LEGACY_SOURCE_KINDS`), and parses the role out of its
 * **content text** (`[role: <id>]`). No second write path, no new event type,
 * no plugin-owned store: the projection is a pure READ of the log, and the
 * host's projection cache checkpoints every registered unit at session
 * creation, `turn/end` and disposal — so a settled child (served as an
 * unpublished observation whose `projections` ride the follow opening
 * snapshot) and a post-restart view both work with nothing of ours on disk.
 *
 * NEVER `source.summary`: summaries are truncated at
 * `CONTEXT_SUMMARY_MAX_CHARS = 120` (`@deepseek-ai/dsh-llm` `message.ts`,
 * applied by `boundContextSummary`) while a role id has no length bound in the
 * settings schema — a long id would be CUT there and the pill would name a role
 * that does not exist. The content blocks are unbounded, so the content text is
 * the only correct source; the row's provenance is what makes the pre-filter
 * cheap.
 *
 * Mount-only + STRUCTURAL: the registry and the unit contract are consumed as
 * the local structural views below and this module value-imports no host seam,
 * so the host calls INTO us. The declared
 * `@deepseek-ai/dsh-session-projection` peerDependency (Task 3b L2 review M-2)
 * serves the in-process Step-0 spec, which builds the REAL registry — being the
 * real registry is the whole point of that proof — not a runtime import here
 * (the badge reads its seat structurally for the same reason).
 * The runtime shape relied on — `register({ key, stateSchema, init, apply,
 * wire: { viewSchema, view }, stateVersion })` → unregister disposer — is the
 * documented `ProjectionDefinition` contract of
 * `@deepseek-ai/dsh-session-projection`
 * (`lib/types/index.d.ts:38-80,150-152`); only `.parse` is ever called on the
 * schemas (`lib/index.js:255,305,422`).
 *
 * @module dsh-llm-fallbacks/role-projection
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { type RoleProjectionValue } from './role-projection-key.ts';
/**
 * The `.parse` face the registry uses on a definition's `stateSchema` /
 * `wire.viewSchema` (a structural stand-in for the peer's `ZodType`, so this
 * module needs no zod import and no new peer).
 */
interface ProjectionValueSchema<T> {
    parse(value: unknown): T;
}
/**
 * One registered projection unit, as this plugin declares it (the consumed
 * subset of the host's `ProjectionDefinition`): `init` and `apply` are PURE and
 * SYNCHRONOUS, `state` is plain JSON (the persisted-checkpoint precondition),
 * and `wire` publishes the client-visible value.
 */
export interface RoleProjectionUnit {
    readonly key: string;
    readonly stateSchema: ProjectionValueSchema<RoleProjectionState | null>;
    init(header: unknown, inheritedEventCount: number): RoleProjectionState | null;
    apply(state: RoleProjectionState | null, event: SessionEvent): RoleProjectionState | null;
    readonly stateVersion: number;
    readonly wire: {
        readonly viewSchema: ProjectionValueSchema<RoleProjectionValue>;
        view(state: RoleProjectionState | null): RoleProjectionValue;
    };
}
/**
 * The host fold state: the fork boundary the fold was initialized with, plus the
 * resolved role once an OWN notice row has landed (`role` absent until then).
 * An OBJECT, not a bare string, because the registry's publication rule is
 * reference identity (`Object.is`) — the fold must be able to prove it left the
 * state untouched, and that proof is only meaningful for a value the fold could
 * otherwise re-allocate.
 *
 * `inheritedEventCount` is part of the state, not a closure constant: the
 * registry hands `init` the exact fork-inherited prefix length and then folds
 * the WHOLE log into `apply`, so the boundary has to survive into every `apply`
 * call (and into a persisted checkpoint row) for the fold to skip an ancestor's
 * events.
 */
export interface RoleProjectionState {
    /**
     * The exact fork-inherited prefix length `init` was handed: events with
     * `seq < inheritedEventCount` belong to the ANCESTOR the child was seeded
     * from, never to the child.
     */
    readonly inheritedEventCount: number;
    /** The DECLARED RAW role id, verbatim (padding included); absent until then. */
    readonly role?: string;
}
/**
 * The registry face this plugin uses (`ctx.sessionProjections`): the
 * client-visible `register` overload plus the read faces the in-process proof
 * reads. Structural on purpose — see the module header.
 */
export interface RoleProjectionRegistryView {
    register(unit: RoleProjectionUnit): () => void;
}
/**
 * The projection state/version. Bump `stateVersion` whenever the fold changes —
 * v2 added the fork boundary (`inheritedEventCount`), so a v1 checkpoint row is
 * NOT re-usable and must be refolded from the log.
 */
export declare const ROLE_PROJECTION_STATE_VERSION = 2;
/**
 * The ONE role projection unit (plan Task 3b).
 *
 * `init` records the fork boundary and nothing else (a child's own log carries
 * no role yet), `apply` skips every event BELOW that boundary — the seeded
 * prefix is the ANCESTOR's log, and the plan pins "child whose notice never
 * landed: no pill, never a wrong pill" — and otherwise folds last-wins over our
 * own notice rows, returning the SAME state reference for every event it does
 * not use (the registry's `Object.is` rule: an unchanged reference produces zero
 * downstream work and no client publication) — including a repeated notice with
 * the same role, which is what makes the fold idempotent under a replay.
 *
 * The boundary carries into the state because the registry calls `apply` with
 * the WHOLE log (including the fork prefix) on every rung: `buildCell`,
 * `drive`'s late-registration fold and `restore` all fold from `init` forward.
 * The host's own sibling unit in the same tree does exactly this
 * (`@deepseek-ai/dsh-subagent` `subagentCatalogProjectionDefinition`:
 * `init: (_header, inheritedEventCount) => ({ inheritedEventCount })` and
 * `apply: … || event.seq < state.inheritedEventCount → return state`).
 */
export declare const roleProjectionUnit: RoleProjectionUnit;
/** Options for {@link installRoleProjection}. */
export interface RoleProjectionOptions {
    /** Contained debug sink (at most ONE line per contained degrade). */
    debug?: (message: string) => void;
}
/**
 * Register {@link roleProjectionUnit} on `ctx.sessionProjections` through the
 * same conditional-inject idiom the plugin already uses for `settings` / `llm` /
 * `typert`: the child activates only when the registry is composed, so a
 * composition without it keeps the key absent and the badge renders nothing
 * (capability absence — never a dispatch failure, never a crash).
 *
 * Registration is an effect on the child fiber: a second apply over the same
 * root registers the SAME key at the SAME `stateVersion`, which the registry
 * counts (one unit, the key survives until the last holder unloads) — so this
 * needs no dedupe of its own, and a reshaped registry that refuses the
 * registration degrades with one contained debug line.
 *
 * @param ctx - the plugin fiber's context.
 * @param options - contained debug sink.
 * @returns the disposer that withdraws the child (and with it the key).
 */
export declare function installRoleProjection(ctx: Context, options?: RoleProjectionOptions): () => void;
export {};
