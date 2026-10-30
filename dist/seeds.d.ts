/**
 * Role-seeds domain module (plan fallbacks-role-seeds Task 1).
 *
 * A companion plugin declares `[{ id, persona }]` seeds; this module
 * validates each id AS DECLARED (`ROLE_ID_PATTERN`, reserved `inherit`),
 * merges the declarations into the role taxonomy with immutable-id /
 * override / revert semantics, and writes through a narrow IO seam
 * (`SeedsIo`). It is free of `@deepseek-ai/*` value imports (bundle
 * purity gate) — the client may type-only import from here.
 *
 * State model (spec §9.2) — two stores, strictly separated:
 * 1. operator config rows (persisted; a seeded role is a plain
 *    `roles.list` row `{ id, persona }`), and
 * 2. an in-memory per-apply seed registry keyed by PRODUCER LABEL
 *    (`bundled` | set name | `external`), each slice holding that
 *    producer's current id → `{ persona, set }` declarations. Declare =
 *    replacement PER PRODUCER: a declare replaces only its own slice, so
 *    the plugin's bundled presets stay `bundled` even when a companion
 *    merge-preserves them into its own batch (plan
 *    seeds-source-and-persona-width, Decisions #1).
 * `seeded` / `personaOverridden` / `source` are DERIVED at read time, never
 * stored — a config round-trip cannot orphan an override (AC-3), and
 * provenance rides the in-memory registry only, so it can never churn a
 * settings write.
 *
 * Resolution precedence (Decisions #2): `bundled` wins for any id the
 * plugin's own preset self-declare currently declares; otherwise the most
 * recent non-bundled producer declaring the id wins (its set name, or
 * `external` when unnamed); no live declaration ⇒ `user`. Unnamed producers
 * share the `external` slice (Decisions #3); `{ set }` is the remedy.
 *
 * Materialization (spec §9.2): append `{ id, persona }` (two keys only,
 * R4) / attach row untouched / at-default tracking / override preserved +
 * `'persona-source'` conflict / omitted id drops from the declaring
 * producer's slice while the row stays (R2). Tracking is driven by the
 * id's RESOLVED effective default — `prior` = resolved before the
 * declare, `incoming` = resolved after the candidate slice commit — so a
 * producer that is not the resolution winner for an id it declares never
 * rewrites the row (F-001). No delta → no settings write (idempotent,
 * AC-1). Compute → write → commit registry: a failed write throws and
 * leaves the registry unchanged (retry-safe).
 *
 * @module dsh-llm-fallbacks/seeds
 */
import { type FallbackStrategy, type FallbacksConfig, type FallbacksConfigLogger, type FallbacksRoles } from './config.ts';
/** A seed declaration from a companion plugin (spec §9.1). */
export interface SeedDeclaration {
    id: string;
    persona: string;
}
/**
 * Per-row provenance label (spec §2). The fixed labels: `bundled` (the
 * plugin's own bundled preset self-declare), `external` (a companion
 * declare without a set name — or with an invalid one, degraded), `user`
 * (no live declaration). Any other value is a declared set name; the
 * reserved names can never be declared as a set, so the fixed labels are
 * unambiguous.
 */
export type SeedSource = 'bundled' | 'external' | 'user' | (string & {});
/**
 * Optional provenance for one `declare()` call (spec §2) — the PUBLIC
 * options face (a companion's registered set name). This is also the type
 * of the `FallbacksService.declareSeeds` second parameter: consumers can
 * never label a declare `bundled` (reserved).
 */
export interface SeedsDeclareOptions {
    /**
     * Registered set name — trimmed. Empty after trim, non-string, or a
     * reserved value (`bundled` / `user` / `external`) warns once and
     * degrades the batch to the unnamed `external` source; the seeds still
     * apply (a bad label must never drop roles).
     */
    set?: string;
}
/**
 * The manager-level declare options — the public face plus the INTERNAL
 * bundled marker for the plugin's own preset self-declare. Module-internal
 * (never exported, never re-exported from the package root): only the
 * preset child call site passes `bundled`, and only a structurally-checked
 * object literal at that — the type itself is not nameable by consumers.
 */
interface SeedsInternalDeclareOptions extends SeedsDeclareOptions {
    /** INTERNAL — bundled preset self-declare provenance. Not a consumer option. */
    bundled?: true;
}
/**
 * Why one declared id was skipped (spec §9.1). Per-id skip + warn, never
 * coercion — valid siblings in the same batch still apply (AC-5).
 */
export type SeedSkipReason = 'invalid-id' | 'reserved-id' | 'duplicate-in-batch';
/**
 * A loud, non-destructive conflict (AC-2): never silently duplicated or
 * merged.
 */
export interface SeedConflict {
    id: string;
    /** Existing row persona differs from the seed default — operator override retained, never overwritten. */
    kind: 'persona-source';
}
/** Structured result of one `declare()` (spec §9.1) — the readable status channel. */
export interface SeedDeclareOutcome {
    applied: string[];
    skipped: Array<{
        id: string;
        reason: SeedSkipReason;
    }>;
    conflicts: SeedConflict[];
}
/** Effective role readback entry (spec §9.1) — `chain`/`fallback` passthrough (R4). */
export interface EffectiveRole {
    /** The config row id (raw declared form). */
    id: string;
    /** Effective row persona. */
    persona: string;
    /** Passthrough — never touched by seeds (R4). */
    chain?: string[];
    /** Passthrough — never touched by seeds (R4). */
    fallback?: FallbackStrategy;
    /** Id is in the live declaration set (trimmed row-id match). */
    seeded: boolean;
    /** `seeded` && row persona !== current seed default. */
    personaOverridden: boolean;
    /** Where the row's seed state comes from (read-time derived, never persisted) — `user` iff not seeded. */
    source: SeedSource;
    /** Present iff seeded. */
    seedPersona?: string;
}
/** Service readback (b): effective taxonomy with seed annotations. */
export interface EffectiveRolesReadback {
    roles: EffectiveRole[];
}
export type SeedRevertFailReason = 'not-seeded' | 'row-absent' | 'settings-unavailable';
export interface SeedRevertOutcome {
    reverted: boolean;
    /** Restored current seed default — present iff reverted. */
    persona?: string;
    reason?: SeedRevertFailReason;
}
/** Gateway wire entry (card badge state, spec §9.4). */
export interface SeedsWireStatus {
    id: string;
    overridden: boolean;
    /**
     * Provenance label (spec §2) — additive and OPTIONAL on the wire: a
     * gateway predating the field (version skew) sends entries without it;
     * consumers treat a missing label as "no badge".
     */
    source?: SeedSource;
}
/**
 * The narrow IO seam this module writes through — keeps `src/seeds.ts`
 * free of `@deepseek-ai/*` value imports (bundle purity gate).
 */
export interface SeedsIo {
    /** Fresh composed config read (the same source the gateway reads). */
    read(): FallbacksConfig;
    /** Persist a full `{ list, rules }` to the settings user layer. */
    writeRoles(roles: FallbacksRoles): Promise<void>;
}
/**
 * In-memory per-apply seed manager (spec §9.2): declare / readback /
 * revert over the operator config through a `SeedsIo` seam. Created in
 * `apply()` (per-apply, no module-level global) with a structured logger;
 * warn messages carry the `llm-fallbacks: seeds:` prefix (spec §9.7).
 */
export declare class FallbacksSeedManager {
    private readonly logger;
    /**
     * Per-producer declaration registry: producer label (`bundled` | set
     * name | `external`) → that producer's current slice. A declare replaces
     * only its own slice; an empty batch drops the slice.
     */
    private registry;
    /** Monotonic declare counter — "most recent producer" for resolution precedence. */
    private declareSeq;
    constructor(logger: FallbacksConfigLogger);
    /**
     * Declare seeds with replacement semantics PER PRODUCER — the batch is
     * the producer's FULL current declaration set; ids omitted from the
     * batch drop out of that producer's slice while their rows remain (R2).
     * Other producers' slices are untouched, so a companion merge-preserving
     * the bundled presets into its own batch never re-labels them (Decisions
     * #1).
     *
     * `options` labels the whole batch's provenance (spec §2), resolved once
     * per call: an invalid set name warns once and degrades to the unnamed
     * `external` case — the seeds still apply.
     *
     * Per-id validation AS DECLARED (spec §9.3): non-string / pattern miss /
     * reserved `inherit` / duplicate-in-batch → skip + warn; valid siblings
     * still apply (AC-5). Materializes per spec §9.2 against the id's
     * RESOLVED effective default before/after the candidate slice commit
     * (at-default tracking follows the resolution winner — a producer that
     * is not the winner for an id it declares never rewrites the row),
     * writes only when the computed `{ list, rules }` differs from the
     * current composed roles (idempotent, AC-1), and commits the slice only
     * after a successful write (compute → write → commit; retry-safe). An
     * empty batch drops the producer's slice.
     */
    declare(seeds: readonly SeedDeclaration[], io: SeedsIo, options?: SeedsInternalDeclareOptions): Promise<SeedDeclareOutcome>;
    /**
     * Resolve one id's live declaration across producer slices (spec §2,
     * Decisions #2): the bundled preset self-declare wins for any id it
     * currently declares; otherwise the most recent non-bundled producer
     * declaring the id wins (its set name, or `external` when unnamed); no
     * live declaration ⇒ `undefined` (the row reads `user`). Single place —
     * `effectiveRoles`, `wireStatus`, and `revert` can never disagree. The
     * optional `registry` argument resolves against a CANDIDATE registry
     * (the declaring slice already replaced) — the same precedence, used by
     * `declare` to compute the post-commit effective default for tracking.
     */
    private resolveDeclared;
    /**
     * Readback (b) — sync, derived: every config row annotated with
     * `seeded` / `personaOverridden` / `seedPersona` (trimmed row-id
     * membership in the live declaration set; persona inequality) plus the
     * row's provenance `source` (spec §2): the winning producer's label per
     * `resolveDeclared`, or `user` when no live declaration covers the row.
     * Nothing override-shaped is stored, so a config round-trip cannot
     * orphan state.
     */
    effectiveRoles(io: SeedsIo): EffectiveRolesReadback;
    /** Card badge state (spec §9.4): seeded rows, with the override flag and the provenance label. */
    wireStatus(io: SeedsIo): SeedsWireStatus[];
    /**
     * Revert one id to the CURRENT declared seed default (AC-3) — resolved
     * through the same precedence as the readbacks, so a preserved bundled id
     * reverts to the bundled persona, never a companion's copy. Writes
     * persona only — the row is otherwise copied verbatim (R4). Ids with no
     * live declaration (`not-seeded`) or with a deleted row (`row-absent`)
     * return a non-reverted outcome without throwing; a failed settings
     * write propagates loudly (spec §9.1).
     */
    revert(id: string, io: SeedsIo): Promise<SeedRevertOutcome>;
    private warnSkip;
}
export {};
