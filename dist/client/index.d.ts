/**
 * dsh-llm-fallbacks client half: registers the Fallbacks card into the
 * Plugins page `plugins.bundle.config` keyed slot (key = bundle package name
 * `dsh-llm-fallbacks`).
 *
 * Wiring (mirrors dsh-advisor):
 * - Registers the `fallbacks` locale dictionaries (zh/en).
 * - Constructs the card's own store over the connection: the fallbacks
 *   config rides the plugin's gateway channel (`connection.rpc` →
 *   `/api/fallbacks/get|set|reset`), while `settings/describe` (writable +
 *   namespace directory), the provider/model catalog, and the switch-history
 *   tail page ride the typed `ctx.remote` namespaces (`ConnectionHandle`
 *   dropped `api`; see `fallbacks-store.ts`).
 * - Registers the `plugins.bundle.config` card `key: 'dsh-llm-fallbacks'`
 *   (bundle package name) with a business-only inject face
 *   ({@link FallbacksSettingsController} + hooks.snapshot); the old
 *   Settings-nav section registration stays removed.
 * - Refreshes the store on pushed invalidations — the forwarded remote
 *   events `settings/document-updated` (ns-filtered to the fallbacks
 *   namespace; refetches the descriptor + recent-switch summary) and
 *   `llm/adapters-updated` (refetches only the provider/model catalog), plus
 *   the client `connection/reset` (refetches all three) — and follows the
 *   current session (`sessions.list`) so the status block's recent-switch
 *   summary tracks the session being viewed (spec §2.5 D-5). `sessions` is
 *   an optional reflection read (S-g): a host without the session service
 *   leaves the switches face in its empty ready state.
 *
 * @module dsh-llm-fallbacks/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export type { FallbacksCardInjected, FallbacksCardProps } from './FallbacksCard.tsx';
export type { GeneralFallbacksRowInjected, GeneralFallbacksRowProps } from './GeneralFallbacksRow.tsx';
export type { ConversationFallbackSwitchProps, FallbacksSwitchChatData, } from './ConversationFallbackSwitch.tsx';
export type { SubagentRoleBadgeProps } from './SubagentRoleBadge.tsx';
export type { FallbacksSettingsState } from './fallbacks-store.ts';
export { FallbacksSettingsController, FALLBACKS_SETTINGS_NS } from './fallbacks-store.ts';
/**
 * Required services (cordis fiber inject); registrations wait on the slot
 * declaration. `uiConversation` is declared because the D1 Definition
 * registration reads the service directly (`ctx.uiConversation.events.register`
 * at the bottom of `apply` — explicit fiber-ordering parity with the
 * ui-workflow-run precedent, whose inject list includes it for the same
 * direct read). Cordis would still provide the service synchronously on
 * apply, but the declaration makes the dependency honest. `sessions` is
 * deliberately NOT injected (S-g): a non-web host without the dsh-session
 * client service must not hang the fiber waiting for it — the wiring reads
 * it reflectively and degrades to the switches empty state when absent
 * (`setCurrentSession` never called, `loadSwitches` ready with an empty
 * array, which the store already supports).
 *
 * The host's dotted-namespace contract: each client Remote namespace is a
 * child-fiber service named `remote.<ns>` (upstream `remoteServiceKey`), and
 * the traceable proxy forwards `ctx.remote.llm` / `.settings` / `.session`
 * to those context properties — consumers MUST declare the dotted names
 * here or the fiber walk throws `cannot get property "remote.llm" without
 * inject`. `remote` stays for the `$on` invalidation face.
 */
export declare const inject: string[];
/**
 * Register the `fallbacks` dictionaries and the plugin-config card once the
 * `plugins.bundle.config` declaration is on the ledger.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
