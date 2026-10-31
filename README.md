# dsh-model-pool

> **dsh-model-pool 0.1.0 — a fork of `dsh-llm-fallbacks` 0.6.5.** Two deliberate divergences:
> 1. The upstream rule "the all-day chain must end with exactly one official model
>    (`deepseek-official` Flash/Pro)" is **removed** — any `provider/model` entry may lead
>    or tail the pool, and the chain is driven entirely by your own configuration.
> 2. The virtual picker row is named **`ModelPool / Auto`** (upstream: `FallbacksChain / Auto`).
>    Internal identifiers keep their upstream names on purpose: settings namespace
>    `fallbacks:`, profile row id `llm-fallbacks`, cordis service `fallbacks`.
>
> Two additions on top of 0.6.5: the virtual row advertises the **union of the pool's
> reasoning tiers**, so 推理强度 (reasoning effort) is selectable in the picker, and each
> delegated request is pinned to the **nearest tier the actual head accepts**.


[English](README.md) | [中文](README.zh-CN.md)

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)
![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.2-4B32C3.svg)
![fork](https://img.shields.io/badge/fork%20of-dsh--llm--fallbacks%200.6.5-orange.svg)

Automatic provider/model fallback chains for dsh (DeepSeek Harness): when an agent's LLM requests keep failing — retries exhausted, auth errors, quota exceeded, rate limiting (429) — the plugin switches provider/model along the fallback chain for the current role, and the current step/turn continues on the target model: tasks are not interrupted by model problems.

The point of this fork is that **the pool is entirely yours**: workbuddy → qoder → trae, or any other order, in whatever mix of providers you actually have configured. Nothing in the chain has to be an official DeepSeek model.

Works in both dsh front ends: the **web** profile (Settings → Plugins → Model pool card) and the **dsh-tui** terminal profile (`/fallbacks` session diagnostics, `/fallbacks config` readback, and the `/settings` fallbacks section for editing).

## Time slots

Time slots rotate the **effective root chain** by wall-clock windows: each slot row carries its own fallback chain, and the first row whose window contains the current moment replaces the all-day chain for the next root request — the all-day chain stays as the last resort when no slot matches. Peak and valley windows can therefore use different chains while the failure walk (fallback switch) remains untouched.

Four frozen UTC+8 presets (windows are code constants; preset rows lock `tz` to Asia/Shanghai):

| Preset | Window |
|---|---|
| `liang-peak` | Monday–Friday 09:00–12:00 and 14:00–18:00 |
| `liang-valley` | every other UTC+8 time (complement of Liang Peak) |
| `glm-peak` | Monday–Friday 14:00–18:00 |
| `glm-valley` | every other time (complement of GLM Peak) |

GLM Peak and GLM Valley are offered in the card picker only when `zai-coding-cn` is configured.

The first extra row whose window contains the current moment (in `fallbacks.tz`, default Asia/Shanghai) wins; no match → the all-day `rootChain`. Slot rotation is a routing seed, not a failure decision: it applies on the next root request, consumes no cooldown, and is logged as a time-slot switch — failure walks keep fallback switch. Full semantics → [Time-slot presets](#time-slot-presets).

## Quick start

### Install

This is a self-hosted fork — it is not on npm. Install it from a git URL, a local directory, or a packed tarball; the package ships a **prebuilt `dist/`** and declares no `prepare`/`postinstall` script, so nothing compiles or downloads on the target machine and pnpm's build-approval gate never triggers.

**From a git repository** (the way to share it — `github:owner/repo`, a full `git+https://…` URL, and a local clone path all work):

```sh
dsh plugin --profile web add github:<owner>/dsh-model-pool      # web profile
dsh plugin --profile dsh-tui add github:<owner>/dsh-model-pool  # dsh-tui terminal profile
```

In **DSH Desktop** the same spec goes into the Plugins page install box (exact absolute paths and `github:owner/repo` are both accepted; a *relative* path is not — the host rejects it with "a local path must be absolute"). Restart DSH Desktop afterwards: the plugin bundle is loaded at startup, so a browser refresh alone is not enough.

**From a local directory or tarball** (no git needed):

```sh
dsh plugin --profile web add C:\path\to\dsh-model-pool            # directory containing package.json
dsh plugin --profile web add C:\path\to\dsh-model-pool-0.1.0.tgz  # packed tarball
```

A directory install is a *path* install: the host requires a readable `package.json` with a `name` and a `dsh.bundle` — this package has both. Nothing builds either way.

> **Do not run this alongside the official `dsh-llm-fallbacks`.** The profile row id `llm-fallbacks` is shared on purpose (the settings namespace, cordis service and typert endpoint all use it), so two rows with that id in one profile is a conflict. Uninstall the official one first.

Pin a version with `@<version>` on a registry spec. The plugin ships **localized metadata** (title/description for the Plugins-page detail view, English + 简体中文) and an **icon** — both declared in the package (`locale/*.json` + `icon.svg`) and picked up by the host automatically.

### Configuration surfaces

The plugin's settings live in a shared `fallbacks:` namespace, editable from three surfaces:

| Surface | What it is | Notes |
|---|---|---|
| **Web settings card** | Settings → Plugins → Model pool | Full GUI editor for the `fallbacks:` namespace; writes the shared settings document |
| **`$DSH_HOME/settings.yaml`** | `fallbacks:` section in the dsh settings document | The shared source of truth — the same file the web card writes; readable and editable everywhere, including scripted setups |
| **TUI `/settings`** | fallbacks section in the dsh-tui settings screen | dsh-tui ≥ v0.8.5; native fields for simple keys, JSON text fields for complex structures (see [dsh-tui profile (terminal)](#dsh-tui-profile-terminal)) |

Pick the surface that matches your front end: web users get the card, terminal users get `/settings`, and the YAML file works everywhere. (`/fallbacks` and `/fallbacks config` are diagnostics — read-only views, not edit surfaces.)

### Minimal configuration

Add a `fallbacks:` section to the shared settings document (`$DSH_HOME/settings.yaml` — see [Configuration surfaces](#configuration-surfaces)):

```yaml
fallbacks:
  rootChain:               # the pool: walked in this order, first entry is the head
    - workbuddy/glm-5.3                # tried first
    - qoder-global/qfmodel             # after QUOTA / RATE_LIMIT / AUTH
    - trae-cn/doubao-seed-1.6         # last resort
  timeSlots:               # optional: rotate the effective root chain by wall-clock windows
    - kind: preset         # frozen UTC+8 window; only the chain is editable
      preset: liang-peak   # Monday–Friday 09:00–12:00 and 14:00–18:00
      chain:
        - qoder-global/qfmodel
    - kind: custom         # custom window (may wrap midnight)
      name: evening        # optional display name
      start: '22:00'
      end: '02:00'
      days: [1, 5]         # optional; omitted/empty = every day (0=Sunday…6=Saturday)
      chain:
        - openai/gpt-4o
  roles:                   # optional: declare role entities, then reference them from rules
    list:
      - id: reviewer       # unique id; "inherit" is reserved
        persona: Code-review subagents
        chain:
          - openai/gpt-4o-mini
        fallback: inherit-root   # role chain first, then the inherited rootChain
    rules:                 # subagent-only: rules never match root requests
      - role: reviewer     # all subagents → the reviewer role
  pools:                   # optional: extra, independent pools, each its own picker row
    - id: glm-5.3          # becomes ModelPool/glm-5.3 in the picker
      chain:
        - zai-coding-cn/glm-5.3
        - workbuddy/deepseek-v4.1-flash
```

Build the section up in five steps:

**1. Configure content.** There is **no feature switch** in the section — the plugin intervenes exactly when something is configured: a non-empty `rootChain`, at least one `pools` row, at least one `timeSlots` row, or one declared role. An empty section is a complete no-op, and the Plugins-page row toggle is the master switch (disabling the plugin row stops it entirely).

**2. Set the all-day `rootChain`.** The entries ARE the pool: they are walked in order when a request fails, so the first entry is the head (the model requests normally go to) and the rest are the fallbacks, in order. There is no separate "Default model" slot and no official-model requirement — any `provider/model` entry is legal in any position, as long as the chain is non-empty.

> **Validation**: the only structural rule left is that `rootChain` holds at least one entry — an empty pool is rejected on save (unless `pools` declares at least one pool, in which case a named pool is enough content). Selector syntax is `provider/model`. A wildcard entry (a bare model or bare provider) is accepted inside the chain but cannot serve as the *head*, because the virtual route needs an exact `provider/model` to dispatch to; the delegate serves the **first dispatchable exact** entry of the effective chain and skips wildcard rows. The plugin does not probe catalog availability at save time — an entry that is not currently catalog-served is accepted and merely fails over when reached, so a temporarily unconfigured provider never blocks a save.

**3. Add `timeSlots` (optional).** Rows rotate the effective root chain by wall-clock windows. Preset rows use frozen UTC+8 windows (only their chain is editable; while a preset row exists, `tz` locks to `Asia/Shanghai`); custom rows take `start`/`end` (may wrap midnight) and an optional `days` list. The first row whose window contains the current moment wins; no match → the all-day `rootChain`. Rotation is a routing seed — it applies on the next root request and consumes no cooldown (see [Time slots](#time-slots)).

**4. Add `roles` (optional, YAML/TUI only).** Declare role entities in `roles.list` (id, persona, chain, optional `fallback` policy), then map subagents to them with `roles.rules`. Rules never match root requests — with no rule match (or on a root request) the built-in `inherit` role applies and appends the `rootChain`. Roles are routing config, not pool config, so the settings card no longer edits them: author them here or in the TUI `/settings` fallbacks section. Existing rows are preserved untouched through a card save — the card simply never renders them.

**5. Add `pools` (optional).** Each row is an independent pool with its own picker row (`ModelPool/<id>`). A named pool walks only its own chain and throws when exhausted instead of continuing into `rootChain` — see [Named pools](#named-pools).

Field-by-field reference (role entities, fallback strategies, rules, selector syntax, preset roles, time-slot presets) is in the sections below — this README is the reference for the fork.

> **Upgrade note (breaking, behavior change)**: the config-level `enabled` switch is **removed** — a stored section still carrying `enabled: true/false` loads cleanly (the key is ignored and stripped on the next save), but the switch no longer gates anything. If you relied on `enabled: false` to keep the plugin inert, empty the section (or disable the plugin row on the Plugins page) instead.

### Verify

Save the config and restart the session, then type `/fallbacks` — the read-only in-session diagnostics (origin, resolved role, chain, recent fallback switches, cooldown status). In a dsh-tui profile, `/fallbacks config` reads back the composed configuration; see [dsh-tui profile (terminal)](#dsh-tui-profile-terminal).

## Features

- **Automatic fallback for root and subagents**: any agent switches down the chain to the next available provider/model on model failure — no manual model switching.
- **Two-block config**: `rootChain` for the root agent; declared role entities (`roles.list`) referenced by `roles.rules` (or the built-in `inherit`).
- **Chain as root primary from the picker**: whenever the plugin has content configured, the host model picker (web and TUI alike) shows a virtual `ModelPool` / `Auto` row — selecting it uses the configured chain as the root primary (the chain needs a dispatchable exact head for the delegation to succeed); selecting a real model keeps fallback-only (see [ModelPool in the model picker](#modelpool-in-the-model-picker)).
- **Named pools**: optional `fallbacks.pools` rows declare extra, fully independent pools that each appear as their own `ModelPool/<id>` row in the picker (`glm-5.3 → WorkBuddy`). Selecting one binds the session to that pool alone: it walks only its own chain and fails when exhausted rather than continuing into `rootChain`, so a named pool is a hard routing boundary rather than an extension of the shared chain (see [Named pools](#named-pools)).
- **Time slots**: optional `fallbacks.timeSlots` rows rotate the effective root chain by wall-clock windows in the config-level `tz` timezone (default `Asia/Shanghai`) — four frozen UTC+8 presets (`liang-peak` / `liang-valley` / `glm-peak` / `glm-valley`, windows are code constants, models-only edits) or custom `start`/`end`/`days` windows. The first matching row wins; the all-day row is always last. A slot change applies on the **next** root request and is logged as a **time-slot switch** — a routing seed, never a failure decision: it consumes no cooldown and does not count against `maxSwitchesPerStep`. Failure walks keep the **fallback switch** copy (see [Time-slot presets](#time-slot-presets)).
- **Dispatch-time role resolution**: on a subagent's first request its role is resolved in three stages — explicit (`agentPreset` matches a declared role id) → deterministic rules (matching either the recorded pair or the served head — see [ModelPool in the model picker](#modelpool-in-the-model-picker)) → LLM auto-match from the declared role taxonomy (`fallbacks.roleAutoMatch`, default `true`). The resolved role's chain-head model is injected into the first request and recorded via an explicit `role → model` log line (no durable `fallbacks/switch` event is written — issue #52 stop-write); set `roleAutoMatch: false` to disable the LLM auto-match stage (the explicit `agentPreset` stage still applies — with no explicit role this reproduces the previous rules-only behavior). The settings card always renders an **Enable role auto-match** switch (default `true`) to toggle it — the schema default applies even to legacy configs that never declared the key.
- **Role persona on the child (chain-independent)**: when a subagent's dispatch declares a role this plugin knows (the `**Execute as**: <id>` field of its Assignment), that role's `persona` is installed on the child as its own persona — the role is the child's identity, not only a routing decision, and delivery does not depend on routing: a role with an empty `chain` gets its persona exactly like a chained one (the chain only picks the model). A persona the caller already set is never overwritten; a provider that cannot carry a persona skips it and the dispatch runs natively.
- **Role announced inside the subagent's own session**: a child dispatched with a declared role gets exactly one plugin notice row in its own session, naming the role it was dispatched as — `[role: <id>]`, with ` (persona not applied)` when the role declares a persona that was skipped — written once at the child's first non-empty pre-step, never for a root session and never for `inherit`/unresolved dispatches. The row is a durable transcript row, so the role stays readable in the child's session after it settles.
- **Subagent role badge**: when a subagent is **dispatched with a declared role** — the `**Execute as**: <id>` field of its Assignment, the same declaration that carries the persona, and the badge's ONLY source (policy on or off) — its session shows a compact role badge next to the session's agent-preset (mode) chip in the web session header; hover shows `role → latest request route` (the route of the newest recorded request, not the dispatch-time route). Only the DECLARED header is read, so a child whose role came from another stage (`agentPreset` match, a role rule, or the LLM auto-match) but which declares no Assignment header is still routed as that role yet shows **no** badge — the badge never reports a role inferred after the fact. `inherit`/unresolved sessions render no badge. The badge is durable: it is read from the child's own session record, so it is still shown for a **settled** subagent session and **after a host restart**.
- **Context-window-aware fallback**: `triggerCodes` accepts any dsh failure code, including `CONTEXT_WINDOW_EXCEEDED` — a request too big for the current model fails over to a candidate with a **larger** context window (candidates that cannot fit either are skipped), and because the route itself is healthy the switch is request-scoped: no cooldown, no half-open probe burned (see [Fallback triggers](#fallback-triggers-triggercodes)).
- **Cooldown and revert**: failed / switched-away models are not re-selected during cooldown; `revertPolicy: cooldown-expiry` returns to the primary model automatically.
- **Transient failures get a soft bench, and success releases it**: a failure the Harness itself calls retryable (`TIMEOUT`, `TRANSPORT`, `RATE_LIMIT`, `SERVER`, `EMPTY_RESPONSE`, …) benches a route for one minute rather than the whole `cooldownMs`; a definite verdict (`QUOTA_EXHAUSTED`, `MODEL_NOT_FOUND`, `INVALID_API_KEY`, …) keeps the full window. Any completed answer from a benched route drops its bench immediately — in `timer` mode too, so a working provider is never stuck out the window (see [A transient failure gets a soft bench](#a-transient-failure-gets-a-soft-bench) and [A success releases the bench immediately](#a-success-releases-the-bench-immediately)).
- **Manual choice wins**: a concrete model you picked yourself that is not the all-day chain head is left alone — its failures pass through to llm-retry / the original error with no switch, no cooldown and no retry override. Only the virtual `ModelPool/*` rows, the current chain head, and subagent dispatches are pool-owned (see [A manual model choice is never overridden](#a-manual-model-choice-is-never-overridden)).
- **Reset cooldowns and connectivity test**: two buttons on every chain-status strip, scoped to the chain above them — one releases that chain's benches, the other probes that chain's routes with a one-token request and benches only the ones that answer with a definite provider-side failure, so a timeout or rate limit never buries a healthy source (see [Reset and connectivity test](#reset-and-connectivity-test)).
- **Drag-and-drop priority**: chain rows carry a grip handle; the list order is the routing priority, on the root chain and on every named pool (see [Priority order is drag-and-drop](#priority-order-is-drag-and-drop)).
- **Host subagent model policy (dsh 0.1.2)**: when the host `subagent-model-selection` policy is enabled, its allowlist is a hard constraint on every plugin-originated subagent route — an explicit authorized spawn route stays the chain head (role-inject skipped), inheritance inject heads and failure-switch targets are intersected with the effective allowlist, and an empty intersection skips the inject/switch (warn log + read-only card warning; no out-of-allowlist request is ever sent). A present-but-unreadable policy fails closed. Policy off/absent → inject and failure-switch selection exactly as 0.3.5. Override `reasoningEffort` follows the upstream routeChanged rule on every path (same route → keep; route change → drop unless explicit). See [Host subagent model policy](#host-subagent-model-policy-dsh-012).
- **Half-open recovery (opt-in)**: `recovery: half-open` makes recovery evidence-driven — an expired cooldown leaves the route half-open for one logged probe instead of restoring the preference; consecutive failures escalate the suppression duration (×2 per failure, capped at 1 h); an observed completion closes the circuit and fully restores the preference. `revertPolicy: 'never'` keeps the mechanism inert; state is session-scoped in-memory (a restart resets). YAML-only — the default `timer` keeps every existing behavior byte-identical. Accepted values: `timer` (default) | `half-open`.
- **Visible behavior**: every switch is recorded in an info-level log line (from/to/role/reason) — no silent model switching. The plugin writes **no** durable `fallbacks/switch` session events (issue #52: the apply()-time event-type registration was proven ineffective, and a session containing that event could refuse to load after a dsh restart). Sessions written by much older plugin versions may still contain such rows; this plugin neither writes nor repairs them.
- **Safety valves**: `maxSwitchesPerStep` caps switches per step and `alwaysModeRetryCap` caps always-mode retries — chain loops cannot amplify latency.
- **No-config no-op**: with nothing configured the plugin behaves exactly like not being installed — content presence is the gate (see [Minimal configuration](#minimal-configuration)).

## dsh-tui profile (terminal)

In a dsh-tui profile the plugin has three operator surfaces, with a strict duty split:

- **`/fallbacks`** — what happened this session: origin, resolved role, effective chain, recent fallback switches, cooldown status (half-open marker rows when `recovery: half-open` is active). Read-only.
- **`/fallbacks config`** — what is configured: composed-config readback (trigger codes, root chain, time slots, timezone, roles, role rules, cooldown, revert policy, safety valves, presets, role auto-match). Read-only apart from the one action command **`/fallbacks config revert-seed <role-id>`**, which restores a seeded role's persona to its declared seed default — the web settings card no longer shows role rows at all (no revert affordance), so the command is that action's only surface.
- **`/settings`** — the edit surface. The plugin registers a **fallbacks** section with full parity to the `fallbacks` config namespace — and, unlike the web card, it still edits `roles.list` and `roles.rules` (the card dropped the roles surface; this section keeps it): booleans (`roleAutoMatch`) render as toggles, selects (`presets`, `revertPolicy`) as pickers, and numbers (`cooldownMs`, `maxSwitchesPerStep`, `alwaysModeRetryCap`) as numeric inputs; complex structures (`rootChain`, `pools`, `timeSlots`, `roles.list`, `roles.rules`) are JSON text fields and `triggerCodes` a comma-separated text field. Invalid drafts (bad JSON, an empty `rootChain`, malformed time-slot rows) block the save — the section never corrupts the config.

**Requirements**: the `/settings` fallbacks section needs **dsh-tui ≥ v0.8.5** (commit `c51661f` or later on `main`; the settings seam shipped in v0.8.0, the groups shape + validation in v0.8.5). On an older dsh-tui the section is absent, and file editing remains the only TUI edit surface.

File editing still works everywhere: the shared `$DSH_HOME/settings.yaml` (`fallbacks:` section — the same file the web card writes) for global settings, or the profile patch `~/.dsh/profiles/dsh-tui/cordis.patch.yml` (`config:` overrides on the plugin row) for dsh-tui-specific values. A patch row **replaces** the targeted row's whole `config` — restate every field you want to keep (schema defaults fill the rest).

## ModelPool in the model picker

Whenever the plugin has content configured (a non-empty `rootChain`, at least one `pools` row, at least one `timeSlots` row, or one declared role), it registers a virtual provider, **ModelPool**, with one catalog row per configured chain: **Auto** for the root chain, plus one row per [named pool](#named-pools). The web profile and dsh-tui both see the rows: they share the same adapter catalog, so the rows need no settings-page wiring or host patch (it is independent of the `/settings` fallbacks section, which edits configuration rather than the picker catalog). An empty `rootChain` does not hide the Auto row as long as other content is configured — the label falls back to a bare `Auto` and `stream()` refuses with `EMPTY_EFFECTIVE_CHAIN`; with nothing at all configured there is no row.

Selecting **ModelPool / Auto** uses the configured chain as the root **primary**: the request stays on the virtual pair and the adapter's thin delegate dispatches the effective chain's first exact `provider/model` at request time, so the fallback engine degrades from that head as usual. Serving the selection unchanged (instead of rewriting the route to the head) is also what keeps the host's model-change notice quiet: the recorded route equals the session selection, so the notice appears once on a genuine selection change rather than being re-armed on every step. Selecting any real catalog model keeps the v0.2.2 fallback-only behavior — the session model is primary and the chain engages only after it fails.

There is **no `rootMode` switch** — no config key, YAML field, settings toggle, or gateway flag. The mode is the session's `{provider, model}` selection itself: `ModelPool` = chain primary; any real model = fallback-only.

Notes:

- **Picker label**: the Auto row's catalog `name` (what the composer trigger shows) is live — `Auto: glm-5.3[all-day]`, `Auto: qfmodel[Liang Peak]` (the head's catalog display name, not the model id); the id stays `Auto`. A named pool's row is labelled `<pool id> → <the provider currently in use>`, e.g. `glm-5.3 → WorkBuddy`; the label follows the chain down as soon as the head is benched (see [Chain status](#chain-status-which-entry-is-cooling-down)). Bare `Auto` when the chain has no dispatchable exact head. The row re-reads itself when the chain state changes; also refresh by reopening the picker.
- **Thin delegate on every origin**: the row is served by the same `stream()` delegate for the root agent and for a subagent session that inherits the selection — subagent role resolution and injection keep their semantics apart from one deliberate widening: dispatch-time rule matching accepts **either** the recorded pair or the served head (a superset of the previous matching, so a rule keyed on the real head keeps matching), and the virtual row is never a second routing engine. A subagent that inherits the selection still routes through the chain head.
- **Head requirement**: a delegation succeeds as long as the effective chain contains at least one exact `provider/model` entry — the delegate serves the first one it can parse. Conditions that make the pool inert: an empty `rootChain` (save is blocked), or `stream()` throwing `EMPTY_EFFECTIVE_CHAIN` / `UNDISPATCHABLE_EFFECTIVE_HEAD` when the chain holds only wildcard rows. Deactivating the plugin (the Plugins-page row switch, or clearing all configured content) hides the row again (slot-row/chain edits never churn registration).
- **Stale selection**: if the row disappears (plugin deactivated) while `ModelPool / Auto` is selected, the session keeps showing it as the current model with `routable: false` — pick a real model from the catalog to continue (host-native catalog semantics).
- **Capabilities and retry policy follow the head**: the row's model metadata (context window, modalities, reasoning) mirrors the current effective head, and `providerRetryPolicy` returns **that head's** policy — so a user's `llm-deepseek.retryPolicy` applies on this route too, not the permissive default. The host captures the policy once at registration, so a later policy edit or a slot-driven head-provider rotation shows up only after the plugin re-registers. Retry events are keyed by the virtual provider — the route the runtime actually sees.

## Named pools

Named pools give a single plugin mount **several independent pools**, each with its own chain and its own row in the model picker. Where the root chain (`Auto`) is one pool shared by every session, a named pool is a separate, self-contained routing contract:

```yaml
fallbacks:
  rootChain: ["deepseek-official/deepseek-v4-pro"]
  pools:
    - id: glm-5.3
      chain: ["zai-coding-cn/glm-5.3", "workbuddy/deepseek-v4.1-flash"]
    - id: ours
      chain: ["qoder/dfmodel", "trae/deepseek-v4.1-flash"]
```

The picker then offers three rows: `Auto`, `glm-5.3 → GLM Coding Plan`, `ours → Qoder`. Picking one selects the whole pool as the session's routing contract.

- **Id rules**: `/^[a-z0-9][a-z0-9._-]{0,31}$/` (lowercase letter or digit first, then letters/digits/`-`/`.`/`_`, max 32 chars). `auto` is reserved — the built-in Auto row already represents the root chain. Ids must be unique; the first duplicate row wins and the rest warn.
- **A pool never merges with the root chain.** Selecting `ModelPool/ours` walks `ours`'s chain only. When every entry in it has failed the request **fails** — it does not continue into `rootChain`. That is the point of a named pool: a hard boundary, not an extension of the shared chain.
- **Pool head = first exact entry.** The chain is walked in order; the first parseable `provider/model` is the head, and the picker label is built from that provider's display name. An empty or wildcard-only pool throws `EMPTY_EFFECTIVE_CHAIN` naming the pool (`llm-fallbacks: pool "ours" has no dispatchable entries`), which is why the card refuses to save one.
- **No self-routing**: a pool entry may not point at `ModelPool` — that would make the pool serve itself.
- **Reasoning tiers are per pool.** Each row advertises the union of the tiers its own chain accepts (same rule as Auto: no `defaultEffort` is forced, and a requested tier is coerced to the nearest one the served head accepts).
- **Session memory**: a session served by a pool keeps that pool as its fallback tail. Without this the engine would silently revert to `rootChain` after the first switch, which would quietly cross the boundary described above.
- **Empty section = complete no-op.** With no `pools` rows the plugin behaves exactly as before: one `Auto` row, `rootChain` only.

In the card the **Named pools** section sits right after the default pool's chain editor and before **Advanced**: one collapsible card per pool with an id input and a chain editor (the same row editor as the root chain), plus an add button. It has its own Save/Discard pair and its own validation bucket, so a bad pool id blocks only that section's save.

## Chain status (which entry is cooling down)

Every chain editor — the default pool's and each named pool's — carries a read-only **chain status** strip above it. It lists the entries in routing order with a state dot, so "first source exhausted, second one answering" is visible at a glance without reading logs:

```
Chain status                          In use: Qoder · dfmodel
● 1. Qoder · dfmodel                  In use
● 2. Trae · deepseek-v4.1-flash       Cooling down · back in 42s
● 3. WorkBuddy · deepseek-v4.1-flash  Standby
```

- **In use** (green) is the entry the engine would dispatch to right now — the effective head after skipping benched entries.
- **Cooling down** (amber) is benched and shows when it returns. A bench is normally a timer; with `recovery: "half-open"` it reads **Probing** instead, and `revertPolicy: "never"` shows **Disabled** because that entry is out for the rest of the session.
- **Standby** (grey) is a healthy entry further down the chain.
- When *every* entry is benched the strip says so and the engine still tries the first entry directly — that is how a fully-benched chain recovers instead of dead-ending.

The strip refreshes every 5 seconds and after every settings change. It is strictly derived from the plugin's own observed request errors: the state is per-agent and never persisted, so a fresh session starts with no cooling entries. Providers do not publish a cross-plugin status API, so each provider's own status detection (WorkBuddy's account pool, Qoder's quota) stays inside that provider — the pool only learns about a failure when a request actually fails.

The picker label follows the same state: a named pool renders `glm-5.3 → <the provider currently in use>`, and the label moves down the chain as soon as the head is benched.

### Reset and connectivity test

Every chain-status strip carries its own two buttons, and they act on **that chain only**: the default strip's buttons cover the root chain (or the time-slot chain currently in force), and each named pool's buttons cover that pool's chain.

- **Reset cooldowns** (重置冷却) drops the benches that chain owns — per-agent cooldowns, half-open probe records, and benches discovered by a connectivity test — and re-reads the status. Use it after a provider outage you know has cleared, instead of waiting out `cooldownMs`. A route that also appears in another chain is released there too, because a bench belongs to the provider route rather than to the chain that happened to notice the failure.
- **Test connectivity** (检测连通) sends a one-token request to each route of that chain and benches the ones that answer with a definite failure. A dead source is therefore out of the way before your next real request, instead of costing you a failed turn.

Probing one chain never blocks another: each strip tracks its own run and keeps its own tally, so a long probe on `glm-5.3` leaves the default chain's buttons usable.

A connectivity test is deliberately **conservative about what counts as evidence**. A timeout, an abort, a transport blip, or a rate limit says nothing about whether a route can serve, so benching on one would bury a healthy provider for the whole cooldown window. Such codes are retried once and, if still inconclusive, reported as *inconclusive* and **not benched**:

```
Tested 5 routes: 3 reachable, 1 benched, 1 inconclusive (not benched)
```

Only a provider-side verdict (`QUOTA_EXHAUSTED`, `MODEL_NOT_FOUND`, `INVALID_API_KEY`, `AUTH`, `PERMISSION_DENIED`, …) puts a route on a full cooldown. The full transient list is `TIMEOUT`, `ABORTED`, `TRANSPORT`, `NETWORK_ERROR`, `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`, `EHOSTUNREACH`, `ENETUNREACH`, `RATE_LIMITED`, `RATE_LIMIT`, `RATE_LIMIT_EXCEEDED`, `TOO_MANY_REQUESTS`, `OVERLOADED`, `OVERLOADED_ERROR`, `UNAVAILABLE`, `SERVER`, `SERVER_ERROR`, `INTERNAL_ERROR`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `UPSTREAM_ERROR`, `EMPTY_RESPONSE`, `ACCOUNT_SIGNED_OUT`. (`RATE_LIMIT`, `SERVER`, `TIMEOUT`, `TRANSPORT` and `EMPTY_RESPONSE` are exactly the codes the Harness itself treats as retryable — `DEFAULT_RETRYABLE_CODES` in @deepseek-ai/dsh-llm.)

Global benches use the same `cooldownMs` as route failures, so a probe result and a real failure age out together.

### A transient failure gets a soft bench

The same reasoning applies to failures you did not probe for — the ones the engine sees while routing a real request. A `TIMEOUT` or a `RATE_LIMIT` on the head is not evidence that the source is broken, so it earns a **soft bench of one minute**, not a full `cooldownMs`:

- `TRANSIENT_BENCH_MS` is 60 s. A failure whose code is in the transient list above benches the route for `min(cooldownMs, 60 s)`, so shrinking `cooldownMs` below a minute also shrinks the soft bench.
- Definite verdicts (`QUOTA_EXHAUSTED`, `MODEL_NOT_FOUND`, `INVALID_API_KEY`, `AUTH`, a rotated key, …) keep the full `cooldownMs` — retrying those in a minute would only burn another turn.
- A request-scoped failure (`CONTEXT_WINDOW_EXCEEDED`) never touches the cooldown at all.
- An always-mode retry-cap decision carries no failure code, so it keeps the full window.

### A success releases the bench immediately

A bench is not a promise to stay down. Whenever the plugin sees a completed assistant message from a route it has benched, that bench is dropped right away and the provider returns to the head of the chain on the next request. This works in `timer` mode too, not only with `recovery: "half-open"` — a real answer is proof the source is alive, and waiting out the remaining timer when you already have that proof is exactly the kind of misdiagnosis this avoids.

`revertPolicy: "never"` is the exception: it is an explicit request to keep a failed entry out for the rest of the session, so a success does not override it.

### Priority order is drag-and-drop

Both the root chain and each named pool's chain are ordered lists, and the order *is* the priority: the first non-benched entry is what you get. Rows can be dragged by the grip handle on the left — pool cards by their header grip, chain entries by the grip in the entry footer — and the change is a normal unsaved edit, so it goes through the section's Save button like any other edit. Dragging is disabled while the settings are read-only.

### A manual model choice is never overridden

The pool engines act only on the routes they own. If you pick a **concrete** model in the picker that is not the head of the all-day chain, the plugin treats it as a deliberate manual choice and lets its failures pass straight through to llm-retry / the original error: no switch, no cooldown, no retry override. Backing off from a manual pick is exactly the hijack this behaviour removes.

What still counts as pool-owned: the virtual `ModelPool/Auto` row and every `ModelPool/<pool id>` row (those *are* routing contracts, so failures there are what the engine is for), any concrete route that happens to be the current all-day chain head, and any subagent session (its route comes from role injection, not from a human click).


## Time-slot presets

Time slots are introduced in the [featured overview](#time-slots) above; this section is the reference. Time-slot rows rotate the **effective root chain** by wall-clock windows — useful for peak/valley pricing without confusing wall-clock rotation with failure fallback. The copy split is strict: slot rotation logs and UI say **time-slot switch**; the failure walk keeps **fallback switch**; the conversation notice Model downgraded stays on the failure path only.

- **Match order**: at every root request, the first extra row whose window contains the current moment (in `fallbacks.tz`, default `Asia/Shanghai` / UTC+8) wins — that row's chain **replaces** the all-day chain. No row matches → the all-day `rootChain` is used. The all-day row is always last and **required** to be non-empty, but any provider/model may sit anywhere in it.
- **Presets** (frozen, not user-editable): `liang-peak` = Monday–Friday 09:00–12:00 **and** 14:00–18:00; `liang-valley` = every other UTC+8 time; `glm-peak` = Monday–Friday 14:00–18:00; `glm-valley` = every other time. One preset id = one row; the card picker never offers a duplicate.
- **Custom rows**: `start` / `end` (`HH:mm`, may wrap midnight) + optional `days` (0=Sunday…6=Saturday; omitted/empty = every day) + models.
- **Next-request apply**: a slot boundary crossing never preempts an in-flight step — the new row takes effect on the next root request. Rotation is mount-only: info log + card/`/fallbacks` status line, no durable switch event.
- **Flat settings card** (the official Plugins-page form language): the card is always open — no collapsible chrome and no feature switch — and each section carries its own **Save/Discard** pair that writes that section of the validated draft. The **Default pool** section (the card's own heading for the shared root chain — `默认池` in Chinese) groups the **Time slots** rows (add preset / add custom / remove / reorder by buttons or **drag**; preset rows show a read-only window summary and edit models only; custom rows carry an editable name; the **timezone picker** lives here and **locks to Asia/Shanghai while any preset row exists**, since preset windows are frozen UTC+8 constants) and the **Model pool (fallback chain)** editor, which edits the *whole* `rootChain`. Rows are collapsible to name + first model (content disclosure). There is no separate "Default model" panel in this fork — the official-tail slot it edited no longer exists, so every entry is an ordinary chain row. There is no `timeSlots.enabled` master switch (adding a row is the opt-in) and no `rootMode` control. The **子代理 / Subagents** section is gone from the card: roles and role rules are routing config, editable only in YAML or the TUI `/settings` section.

## Preset roles

The plugin ships **5 bundled generic subagent roles** out of the box — `reviewer` / `scout` / `security-reviewer` / `sonic` / `task` — declared automatically on `apply` as seeded `roles.list` rows (`{ id, persona }`): idempotent, and never overwriting an operator persona. They appear in the `/fallbacks config` role summary, ready for `roles.rules` to reference. (The settings card no longer renders role rows — see [Minimal configuration](#minimal-configuration) step 4; edit roles in YAML or the TUI `/settings` section instead.) (`designer` and `librarian` are no longer bundled: rows saved by earlier versions keep their persona and now show source `user` as ordinary editable rows only when no live producer still declares the id, even though the operator never wrote them; a companion's live declaration keeps them seeded and read-only with source `external` when unnamed or its registered set name otherwise.)

- **Switch**: `fallbacks.presets` — `'bundled'` (default) declares the preset roles on apply; `'none'` disables the automatic declaration (already-materialized rows stay).
- Source attribution: each row carries a source (`preset` / `user` / `external`); the source badge and the per-row editability described above apply to the YAML/TUI surfaces.

## Agent presets (plugin composition)

Agent **presets** are a dsh feature for composing plugins — they are declarative child-plugin lists a user can apply as a set, and they carry **no** model fields of their own. This plugin needs no preset-specific configuration: because a preset composes plugins, the fallback applies **wherever the plugin's row is mounted** — a preset that includes the `llm-fallbacks` row (name `dsh-model-pool`) gives that preset's sessions the same pool and roles configured for the plugin.

Two composition caveats:

- **A user preset override replaces the entire child list** (no merge): a preset that omits the plugin row silently unmounts the plugin for sessions using that preset. Restate every plugin row you want to keep.
- **Preset-scoped chain configs are possible by mounting the row inside a preset**: the plugin row's `config:` overrides in a preset composition produce a chain configuration that applies to that preset's sessions only (patch rows replace the whole `config`, so restate every field).

## Fallback triggers (`triggerCodes`)

`fallbacks.triggerCodes` is a plain list of dsh failure codes, and **any** code the harness can report is accepted — not only the three defaults (`AUTH` / `QUOTA` / `RATE_LIMIT`). A failure whose code is not listed passes straight through to llm-retry or to the original error, exactly as if the plugin were not installed. Retryable failures (5xx / `TRANSPORT` / `TIMEOUT` / `EMPTY_RESPONSE`) need no extra entries: llm-retry backs them off first and the failure enters the chain decision the same way once that budget is exhausted.

### Context-window rejections

A request larger than the model's context window is reported as `CONTEXT_WINDOW_EXCEEDED` — dsh core's canonical code for a provider 400 "maximum context length". It is not a retryable code, so list it explicitly to fail over to a larger-context model:

```yaml
fallbacks:
  triggerCodes:
    - AUTH
    - QUOTA
    - RATE_LIMIT
    - CONTEXT_WINDOW_EXCEEDED  # fail over when the request does not fit
  rootChain:
    - workbuddy/glm-5.3          # walked first
    - qoder-global/qfmodel       # after a quota / rate-limit / auth failure
    - trae-cn/doubao-seed-1.6    # last resort (any model is legal here)
```

**Ordering — the fallback runs before compaction.** With `CONTEXT_WINDOW_EXCEEDED` in `triggerCodes`, this plugin's `agent/request-error` listener handles the rejection **before** the harness's compaction plugin gets to compact: the conversation moves to the fallback model on the first overflow, and the context is never compacted. Leave the code out of `triggerCodes` if you would rather have compaction tried first.

**Request-scoped switching.** A context-window rejection says the *request* was too big, not that the route is unhealthy. Such a switch is **request-scoped**: the from-route is recorded as failed for the current step (so the step does not bounce straight back to it) and still counts against `maxSwitchesPerStep`, but it is **not** put on cooldown for `cooldownMs` and does not feed the half-open recovery counter — the next, shorter prompt goes to the primary model as usual, and no half-open probe is spent on a route that never failed. Every other trigger code stays **route-scoped** (cooldown + recovery bookkeeping) exactly as before.

**Candidates that cannot fit are skipped.** On a context-window walk the chain skips any candidate whose advertised context window is not larger than the failing model's — falling over from a 128k model to an 8k one would only fail again. Windows come from the host model catalog: the catalog row's `contextWindow` when it carries one, otherwise `llm.resolveModelInfo(provider, model)`'s `context.contextWindow`. A model that discloses no window either way is kept as a candidate, so a provider without capacity metadata never empties a chain. Skipped candidates are named in the switch log line as `skipped: context-window`.

## Host subagent model policy (dsh 0.1.2)

dsh 0.1.2 adds host-side child-model selection for subagents: a `subagent-model-selection` settings allowlist, a per-session `subagent/model-selection-policy` event, and spawn-time `provider/model/reasoning_effort` routing. The plugin reconciles with it under one runtime arbiter — plugin roles/chains remain the failure-recovery layer the host does not provide.

**Policy read (per session)**: the session `subagent/model-selection-policy` event wins; otherwise the `subagent-model-selection` settings service when `enabled`. Missing service / `enabled: false` / no event → policy off.

When the policy is **enabled**:

- **Authorized head preserved (skip inject)**: a subagent spawned with an explicit `provider`+`model` (spawn options, durable `request/header`, or a `model/selection` selection) keeps that route as its chain head — role-inject is skipped and the authorized route is never overwritten at the first request; the plugin chain applies only from failure time onward. Pure inheritance (no explicit selection fields) is **not** an authorized route.
- **Allowlist-constrained inject**: pure inheritance still resolves a role in the three stages above, but the injected chain head is plugin-originated and must be on the effective allowlist — the first resolved in-allowlist candidate wins. Empty intersection → inject is skipped and the host seed stands (warn log).
- **Allowlist-constrained failure switching**: after a triggering failure, the resolved candidates (wildcards already expanded; cooldown / step-failed / same-as-current filters already applied) are intersected with the allowlist in walk order. Empty intersection → **no switch**, no out-of-allowlist request, a warn log plus an in-memory blocked-attempt record (no durable session write — issue #52 stands).
- **Fail-closed**: a present-but-malformed policy event, or enabled settings with an unreadable route list, disables plugin-originated injects and switches for that session (warn log); the host seed and non-switch behavior are untouched.
- **No card surface (this fork)**: the settings card no longer renders the policy block — it lived in the removed **Subagents** section. The host policy is still enforced exactly as described here (warn log, blocked switch, fail-closed); it just has no read-only panel in the card any more. The in-session `/fallbacks` diagnostic and the warn log remain the way to see it.
- **Virtual-route carve-out**: a subagent explicitly spawned on the plugin's virtual provider (`ModelPool` / `Auto`) is user-authorized for that route (spec D2 — explicit selection). The virtual adapter's internal delegation of its requests to the configured effective chain head is that route's documented purpose and is outside D1's selection semantics — D1 governs provider/model selection the plugin makes, not delegation inside an explicitly chosen virtual route — so the delegated head is not allowlist-filtered.

When the policy is **disabled or absent**, inject and failure-switch **selection** are unchanged from 0.3.5 (no allowlist filter, no authorized-route skip).

**Effort rule (policy-independent)**: `reasoningEffort` on every override path (role-inject, failure switch, always-cap switch) follows the upstream 0.1.2 `routeChanged` rule — an unchanged provider+model route keeps the seed effort; a route change drops it unless an effort is explicitly named for the override (explicit always survives). A stale effort is never carried into a different provider.

In this fork the virtual `ModelPool / Auto` route participates too: its advertised tiers are the **union** of what the pool's routes declare, and each delegated call is pinned to the nearest tier the actual head accepts, so a tier chosen in the picker survives a fallback to a head with a different tier set.

## Mount-only (no dsh modification)

The plugin installs as a **pure mount**: one `dsh.bundle.patch` row in the profile, a `dsh.client.inject` list for the web UI, and its own remote endpoints (`dsh-model-pool#fallbacks/get`, `…/set`, `…/reset`, `…/revert-seed`, registered through the host's `typert` service). Nothing patches the DSH installation, there is no postinstall step, and DSH upgrades never require re-patching. Stale leftover patches from an older patched install are harmless.

## Version compatibility

`peerDependencies` pin `@deepseek-ai/*` at `^0.2.0-rc.2`, `cordis` at `^4.0.2`, `schemastery` at `^3.18.2`, `react` at `^18.2.0`; `engines.node` is `>=22`. On a host outside that range, DSH refuses to enable the plugin and prints the exact `dsh plugin --profile <profile> allow-version <name>@<version> --dsh-version <runtimeVersion> --accept-risk` command that overrides the check — run it only if you accept the risk, since the plugin reaches into internals that a different host version may have moved.

## Documentation

This README is the reference for the fork. There is no separate `docs/` tree: the sections above (Time slots, Quick start, Configuration surfaces, ModelPool in the model picker, Time-slot presets, Preset roles, Agent presets, Fallback triggers, Host subagent model policy, Mount-only) cover the `fallbacks` namespace, selector syntax and card usage end to end.

If you are the one *publishing* this fork rather than using it, see [PUBLISHING.md](PUBLISHING.md) — how to push it to a git host, why the repo installs without building, and how to ship a change to `dist/`.

## License

Released under the **MIT** License — see [LICENSE](LICENSE). The LICENSE file is authoritative for copyright and license terms.
