/**
 * Bundled preset role declarations (plan fallbacks-preset-roles Task 1;
 * trimmed 7 → 5 by the seed-source-provenance plan, D4).
 *
 * Derivation: distilled from the omp bundled agent prompts —
 * `packages/coding-agent/src/prompts/agents/{scout,reviewer,security-reviewer}.md`
 * and `task.md` (task/sonic share the body; frontmatter injected in
 * `src/task/agents.ts`) — snapshot date 2026-08-16. Each persona is a
 * concise distillation (frontmatter description + core directives), NOT a
 * verbatim copy of the full prompt; the frozen text lives in spec
 * `fallbacks-preset-roles-spec.md` §9.2 (implementer SSOT). `designer` and
 * `librarian` were removed from the bundled set; rows persisted by earlier
 * versions survive untouched (they read back with source `user`).
 *
 * Pure data module: no io, no side effects, no classes. Types import only
 * `./seeds.ts` — no `@deepseek-ai/*` imports (bundle purity gate).
 */
import type { SeedDeclaration } from './seeds.ts';
/** The 5 bundled omp-style preset roles (spec §9.1 shape, §9.2 personas). */
export declare const presetRoles: readonly SeedDeclaration[];
