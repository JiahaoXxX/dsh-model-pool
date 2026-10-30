/**
 * Route identity and allowlist intersection on resolved candidates (plan
 * dsh-012-subagent-routing T2; spec D1 ∩ D2).
 *
 * Pure, host-free module: plain route data in, results out. Route identity is
 * the EXACT provider string plus the EXACT model string — no aliasing, no
 * case-folding, no catalog-id substitution (spec Terms). Intersections run on
 * RESOLVED candidates (concrete provider+model after the chain candidate
 * pipeline); this module never resolves chains or expands wildcards — the
 * caller passes already-resolved candidates in.
 *
 * Fail-closed direction: an empty allowlist contains nothing and an empty
 * intersection yields `undefined` — the caller must skip the
 * plugin-originated route rather than fall back to an unproven one (spec D1).
 * Never throws.
 *
 * @module dsh-llm-fallbacks/route-allowlist
 */
import type { PolicyRoute } from './subagent-policy.ts';
/** One resolved chain candidate: a selector anchored to a concrete model id. */
export type ResolvedCandidate = {
    readonly provider: string;
    readonly model?: string;
};
/**
 * Normalize resolved chain candidates into detached plain routes. Candidates
 * without a concrete model id are dropped (they are not routes); every
 * surviving entry is a fresh object, so the result never aliases the
 * caller's candidate list.
 */
export declare function resolvedRoutes(candidates: readonly ResolvedCandidate[]): PolicyRoute[];
/**
 * Whether the route is on the allowlist under exact route identity: both the
 * provider and the model strings must equal an allowed route exactly.
 */
export declare function routeOnAllowlist(route: PolicyRoute, allowedModels: readonly PolicyRoute[]): boolean;
/**
 * The first resolved candidate that is on the allowlist, preserving the
 * candidate order (the chain's first in-allowlist entry wins), or `undefined`
 * when the intersection is empty — the caller then skips the inject / switch
 * and the host seed stands (spec D1 ∩ D2).
 */
export declare function firstAllowedCandidate(resolved: readonly PolicyRoute[], allowedModels: readonly PolicyRoute[]): PolicyRoute | undefined;
