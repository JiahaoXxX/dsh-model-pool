/**
 * The `fallbacks` settings schema (schemastery), mirroring
 * {@link FallbacksConfig}.
 *
 * Host-only module: `Config` is the schemastery schema the settings section
 * validates/composes against, and `@deepseek-ai/schemastery` is an
 * `@deepseek-ai/*` RUNTIME value import — it must never enter the client
 * bundle, because the web loader module table cannot answer that require
 * (build-time externals drift, 20260815: the client bundle previously
 * externalized `@deepseek-ai/schemastery` and the web settings card failed
 * to load). The client half consumes `FallbacksConfig` and the other
 * config types from `./config.ts` type-only, so the schema stays here, out
 * of the client module graph.
 *
 * Object fields are optional by default in schemastery; `.default()` fills
 * the spec defaults, `.required()` keeps mandatory fields. Unknown keys are
 * RETAINED by the composition (verified plan Task 1 Step 1) — that is what
 * lets `detectLegacyKeys` flag two-block-era leftovers (`chains` /
 * `roles.default`) on the composed object at startup (warn + gateway
 * `legacyKeys`, see `src/index.ts` apply()).
 *
 * Current host contract: the whole schema is marked `volatile` (the host
 * retired `installSection` — the Loader entry Config IS the settings
 * section now, and `SettingsForms.update` only accepts volatile paths, so
 * the marker is what keeps the gateway/card write path legal). One marker
 * on the ROOT object makes every field live-editable and hands `apply` a
 * single identity-stable config reference the Loader commits saves into
 * (no remount per save). The marker rides the generic `.extra()` writer —
 * the exact bytes `.volatile()` writes in newer schemastery — because the
 * dev-time schemastery resolved from the lockfile can predate that sugar;
 * the `Meta` augmentation below declares the field the peer range admits
 * at its upper end.
 *
 * @module dsh-llm-fallbacks/schema
 */
import z from '@deepseek-ai/schemastery';
import type { FallbacksConfig } from './config.ts';
declare module '@deepseek-ai/schemastery' {
    namespace Schemastery {
        interface Meta {
            /** Live-editable marker read by the Loader / `SettingsForms`. */
            volatile?: boolean;
        }
    }
}
export declare const Config: z<FallbacksConfig>;
