# dsh-model-pool

> **dsh-model-pool 0.1.0 —— fork 自 `dsh-llm-fallbacks` 0.6.5。两处刻意的分歧：**
> 1. 上游「全天链必须以恰好一个官方模型（`deepseek-official` Flash/Pro）收尾」的规则
>    已**移除**——任何 `provider/model` 条目都可以居首或收尾，整条链完全由你自己的配置驱动。
> 2. 选择器虚拟行更名为 **`ModelPool / Auto`**（上游为 `FallbacksChain / Auto`）。
>    内部标识有意保留上游名字：settings 命名空间 `fallbacks:`、profile 行 id
>    `llm-fallbacks`、cordis 服务名 `fallbacks`。
>
> 在 0.6.5 之上另有两处新增：虚拟行广播整个池的**推理强度并集**，因此选择器里
> 可选推理强度；每个被委托的请求都会钉到**实际链头接受的最接近档位**。


[English](README.md) | [中文](README.zh-CN.md)

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)
![dsh](https://img.shields.io/badge/dsh-0.2.0--rc.2-4B32C3.svg)
![fork](https://img.shields.io/badge/fork%20of-dsh--llm--fallbacks%200.6.5-orange.svg)

dsh（DeepSeek Harness）的自动模型降级链：当某个 agent 的模型请求持续失败（重试耗尽、权限、配额超限、限流 429）时，插件按当前角色沿链切换 provider/model，当前 step/turn 在目标模型上继续完成——任务不因模型问题中断。

本 fork 的要点是**池子完全由你决定**：workbuddy → qoder → trae，或任意其它顺序、任意你实际配置了的 provider 组合。链里没有任何一项必须是官方 DeepSeek 模型。

两个 dsh 前端均可用：**web** profile（设置 → 插件配置 → 模型池 卡片）与 **dsh-tui** 终端 profile（`/fallbacks` 会话诊断、`/fallbacks config` 回读，以及 `/settings` 中的 fallbacks 区块用于编辑）。

## 峰谷无忧

峰谷无忧（分时切换）按墙钟窗口轮换**生效 root 链**：每个时段槽行拥有自己的 fallback 链，第一个窗口包含当前时刻的行将在下一个 root 请求取代全时段链——无行命中时，全时段链作为兜底保持在最后。峰谷窗口因此可以使用不同的模型链，而失败降级路径（降级切换）保持不变。

四个冻结的 UTC+8 预设（窗口为代码常量；存在预设行时 `tz` 锁定 Asia/Shanghai）：

| 预设 | 窗口 |
|---|---|
| `liang-peak` | 周一至周五 09:00–12:00 与 14:00–18:00 |
| `liang-valley` | 其它所有 UTC+8 时间（Liang Peak 的补集） |
| `glm-peak` | 周一至周五 14:00–18:00 |
| `glm-valley` | 其余时间（GLM Peak 的补集） |

GLM 峰与 GLM 谷仅在已配置 `zai-coding-cn` 时出现在设置卡选择器中。

每个 root 请求时刻，第一条窗口包含当前时刻（按 `fallbacks.tz`，默认 Asia/Shanghai）的额外行生效；无行命中 → 全时段 `rootChain`。分时切换是路由种子而非失败决策：在下一个 root 请求生效、不消耗冷却，日志记为**分时切换**；失败降级保持**降级切换**。完整语义 → [分时槽预设（分时切换）](#分时槽预设分时切换)。

## 快速开始

### 安装

这是一个自托管 fork——不在 npm 上。可从 git URL、本地目录或打包好的 tarball 安装；包内附带**已构建的 `dist/`**，且未声明 `prepare`/`postinstall` 脚本，因此目标机既不编译也不下载任何东西，pnpm 的构建审批环节也不会触发。

**从 git 仓库安装**（分享给它人的方式——`github:owner/repo`、完整的 `git+https://…` URL、以及本地 clone 路径都可用）：

```sh
dsh plugin --profile web add github:<owner>/dsh-model-pool      # web profile
dsh plugin --profile dsh-tui add github:<owner>/dsh-model-pool  # dsh-tui 终端 profile
```

在 **DSH Desktop** 中，同样的 spec 填进插件页的安装框（绝对路径与 `github:owner/repo` 都被接受；*相对*路径不行——宿主会以 "a local path must be absolute" 拒绝）。装完**重启 DSH Desktop**：插件 bundle 在启动时加载，只刷新浏览器不够。

**从本地目录或 tarball 安装**（不需要 git）：

```sh
dsh plugin --profile web add C:\path\to\dsh-model-pool            # 含 package.json 的目录
dsh plugin --profile web add C:\path\to\dsh-model-pool-0.1.0.tgz  # 打包好的 tarball
```

目录安装属于 *path* 安装：宿主要求一个可读的 `package.json`，且带 `name` 与 `dsh.bundle`——本包两者都有。两种方式都不需要构建。

> **不要与官方 `dsh-llm-fallbacks` 同时运行。** profile 行 id `llm-fallbacks` 是有意共用的（settings 命名空间、cordis 服务、typert 端点都沿用它），同一 profile 里出现两个该 id 的行即冲突。先卸载官方那个。

registry spec 可加 `@<version>` 钉版本。插件自带**本地化元数据**（插件页详情视图的标题/描述，英文 + 简体中文）与**图标**——均以包内声明（`locale/*.json` + `icon.svg`）交由宿主自动读取。

### 配置界面

插件的设置存在于共享的 `fallbacks:` 命名空间中，可通过三个界面编辑：

| 界面 | 是什么 | 说明 |
|---|---|---|
| **Web 设置卡** | 设置 → 插件配置 → 模型池 | `fallbacks:` 命名空间的完整 GUI 编辑器；写入共享设置文档 |
| **`$DSH_HOME/settings.yaml`** | dsh 设置文档中的 `fallbacks:` 分节 | 共享的事实源——与 Web 卡写入的是同一个文件；任何场景（包括脚本化配置）都可读写 |
| **TUI `/settings`** | dsh-tui 设置界面中的 fallbacks 区块 | 需要 dsh-tui ≥ v0.8.5；简单键用原生字段，复杂结构用 JSON 文本字段（见 [dsh-tui profile（终端）](#dsh-tui-profile终端)） |

按你的前端选择入口：web 用户用设置卡，终端用户用 `/settings`，YAML 文件处处可用。（`/fallbacks` 与 `/fallbacks config` 是诊断命令——只读视图，不是编辑入口。）

### 最小配置

在共享设置文档（`$DSH_HOME/settings.yaml`——见 [配置界面](#配置界面)）中添加 `fallbacks:` 分节：

```yaml
fallbacks:
  rootChain:               # 池子本体：按此顺序走链，第一项即链头
    - workbuddy/glm-5.3                # 最先尝试
    - qoder-global/qfmodel             # QUOTA / RATE_LIMIT / AUTH 之后
    - trae-cn/doubao-seed-1.6         # 最后兜底
  timeSlots:               # 可选：按墙钟窗口轮换生效 root 链
    - kind: preset         # 冻结的 UTC+8 窗口；仅链可编辑
      preset: liang-peak   # 周一至周五 09:00–12:00 与 14:00–18:00
      chain:
        - qoder-global/qfmodel
    - kind: custom         # 自定义窗口（可跨午夜）
      name: evening        # 可选显示名称
      start: '22:00'
      end: '02:00'
      days: [1, 5]         # 可选；缺省/空 = 每天（0=周日…6=周六）
      chain:
        - openai/gpt-4o
  roles:                   # 可选：先声明角色实体，再由规则引用
    list:
      - id: reviewer       # 唯一 id；"inherit" 为保留字
        persona: 代码审查子代理
        chain:
          - openai/gpt-4o-mini
        fallback: inherit-root   # 先走角色链，再追加继承的 rootChain
    rules:                 # 仅对子代理生效：规则不匹配 root 请求
      - role: reviewer     # 所有 subagent → reviewer 角色
  pools:                   # 可选：额外的独立池，各自在选择器占一行
    - id: glm-5.3          # 在选择器中即 ModelPool/glm-5.3
      chain:
        - zai-coding-cn/glm-5.3
        - workbuddy/deepseek-v4.1-flash
```

按五个步骤逐步构建：

**1. 配置内容。** 本分节**没有功能开关**——只要配置了内容（非空 `rootChain`、至少一条 `pools` 行、至少一条 `timeSlots` 行、或一个已声明角色），插件即介入；空分节完全 no-op。插件页的行开关是总开关（停用插件行即完全停止）。

**2. 配置全时段 `rootChain`。** 这些条目**就是**池子：请求失败时按顺序走链，因此第一项是链头（请求平时落到的模型），其余依次是降级目标。没有单独的「默认模型」槽位，也没有官方模型要求——任意 `provider/model` 条目可以放在任意位置，唯一约束是链非空。

> **校验**：仅存的结构性规则是 `rootChain` 至少一项——空池在保存时被拒绝（若 `pools` 至少声明了一个池，则命名池也足以构成内容）。selector 语法为 `provider/model`。通配符条目（裸模型或裸 provider）在链内被接受，但**不能**充当**链头**，因为虚拟路由需要一个精确的 `provider/model` 才能派发；薄委托服务生效链中**第一个可派发的精确条目**并跳过通配符行。插件在保存时不探测目录可用性——当前目录里没有服务的条目照样被接受，只是走到它时才降级，因此暂时未配置的 provider 绝不会阻塞保存。

**3. 添加 `timeSlots`（可选）。** 各行按墙钟窗口轮换生效 root 链。预设行使用冻结的 UTC+8 窗口（仅链可编辑；存在预设行时 `tz` 锁定 `Asia/Shanghai`）；自定义行使用 `start`/`end`（可跨午夜）与可选的 `days` 列表。第一个窗口包含当前时刻的行生效；无行命中 → 全时段 `rootChain`。分时切换是路由种子——在下一个 root 请求生效、不消耗冷却（见 [峰谷无忧](#峰谷无忧)）。

**4. 添加 `roles`（可选，仅 YAML/TUI）。** 在 `roles.list` 中声明角色实体（id、persona、chain、可选的 `fallback` 策略），再用 `roles.rules` 把 subagent 映射到角色。规则绝不匹配 root 请求——未命中规则（或 root 请求）时由内置 `inherit` 角色兜底，追加 `rootChain`。角色属于路由配置而非池配置，因此设置卡不再编辑它们：在此处或 TUI 的 `/settings` fallbacks 区块中书写。已有行经由卡片保存时原样保留——卡片只是从不渲染它们。

**5. 添加 `pools`（可选）。** 每条 `pools` 行是一个独立的池，在选择器里占一行（`ModelPool/<id>`）。命名池只走自己的链，用尽即抛错，不会接着走 `rootChain`——见 [命名池](#命名池)。

逐字段参考（角色实体、fallback 策略、规则、selector、预设角色、分时槽预设）见下文各节——本 README 就是这个 fork 的参考文档。

> **升级提示（破坏性变更）**：配置级 `enabled` 开关已**移除**——存量配置仍携带 `enabled: true/false` 时可正常加载（该键被忽略，下次保存时剥离），但不再起任何门控作用。如果你靠 `enabled: false` 保持插件惰性，请改为清空分节（或在插件页停用该行）。

### 验证

保存配置并重启会话，然后键入 `/fallbacks`——只读的会话内诊断（来源、解析角色、链、最近降级切换、冷却状态）。在 dsh-tui profile 中，`/fallbacks config` 回读组合配置；见 [dsh-tui profile（终端）](#dsh-tui-profile终端)。

## 能力一览

- **root / subagent 自动降级**：任意 agent 在模型故障下按链切换到下一个可用 provider/model，无需手动换模型。
- **两块制配置**：`rootChain` 管 root 代理；声明式角色实体（`roles.list`）供 `roles.rules` 引用（或内置 `inherit`）。
- **选择器里把链当主模型**：只要插件配置了内容，宿主模型选择器（web 与 TUI 一致）即出现虚拟 `ModelPool` / `Auto` 行——选中它即以配置的链作为 root 主模型（需要可派发的精确链头才能成功委托）；选真实模型则保持 fallback-only（见 [模型选择器中的 ModelPool](#模型选择器中的-modelpool)）。
- **命名池**：可选的 `fallbacks.pools` 行声明额外的、完全独立的池，每个池各自以 `ModelPool/<id>` 行的形式出现在选择器中（`glm-5.3 → WorkBuddy`）。选中即把会话绑定到该池：只走它自己的链，用尽即失败，而不会接着走 `rootChain`；因此命名池是硬路由边界，不是共享链的延伸（见 [命名池](#命名池)）。
- **峰谷无忧（分时切换）**：可选的 `fallbacks.timeSlots` 行按墙钟窗口（配置级 `tz` 时区，默认 `Asia/Shanghai`）轮换 root 生效链——四个冻结的 UTC+8 预设（`liang-peak` / `liang-valley` / `glm-peak` / `glm-valley`，窗口为代码常量、仅模型链可编辑），或自定义 `start`/`end`/`days` 窗口。第一条命中的行生效；全时段行固定最后。时段切换在**下一个** root 请求生效，日志记为**分时切换**——路由种子而非失败决策：不消耗冷却、不计入 `maxSwitchesPerStep`。失败降级保留**降级切换**文案（见 [分时槽预设（分时切换）](#分时槽预设分时切换)）。
- **派发时角色解析**：在 subagent 的首次请求上，其角色按三个阶段解析——显式（`agentPreset` 匹配已声明角色 id）→ 确定性规则（匹配记录 pair 或实际服务的链头——见 [模型选择器中的 ModelPool](#模型选择器中的-modelpool)）→ LLM 自动匹配（从已声明角色体系中选择，`fallbacks.roleAutoMatch` 默认 `true`）。解析出的角色的链头模型注入首次请求，并以显式 `role → model` 日志行记录（不写 durable `fallbacks/switch` 事件——issue #52 停写）；设 `roleAutoMatch: false` 仅关闭 LLM 自动匹配阶段（显式 `agentPreset` 阶段仍生效——无显式角色时即复现原有仅规则行为）。设置卡总是渲染「启用角色自动匹配」开关（默认 `true`）以切换之——即使是从未声明过该键的旧配置，schema 默认值同样生效。
- **角色人格注入到子代理（与链无关）**：当 subagent 的派发声明了本插件已知的角色（Assignment 的 `**Execute as**: <id>` 字段）时，该角色的 `persona` 会安装为子代理自身的人格——角色就是子代理的身份，而不只是路由决策；注入与路由无关：`chain` 为空的角色与带链角色的人格注入完全一致（链只负责选模型）。调用方已设置的人格永不覆盖；宿主 provider 无法承载人格时跳过注入，派发照常原生运行。
- **角色在子代理自己的会话中声明**：声明了角色的派发会让子代理自身的会话得到恰好一条插件 notice 行，写明它被派发为哪个角色——`[role: <id>]`，当角色声明了人格但被跳过时追加 ` (persona not applied)`——在子代理首个非空 pre-step 写入一次，root 会话以及 `inherit`/未解析角色的派发永不写入。该行是持久轨迹行，子代理结束后角色仍可在其会话中读到。
- **子代理角色徽标**：当 subagent 被**声明了角色地派发**——即其 Assignment 中的 `**Execute as**: <id>` 字段，也就是承载人格的同一处声明，并且是徽标的**唯一**来源（策略开或关皆同）——时，其会话在 Web 会话头部的标题旁显示一个紧凑的角色徽标；悬停显示 `role → 最近一次请求的路由`（最近一条已记录请求的路由，而非派发时的路由）。由于只读取被声明的头部字段，通过其他阶段解析出角色（`agentPreset` 匹配、role 规则或 LLM 自动匹配）但**未**在 Assignment 头部声明角色的子代理仍会按该角色路由，却**不**显示徽标——徽标绝不报告事后推断的角色。`inherit`/未解析角色的会话不显示徽标。徽标是持久的：它读取子代理自身的会话记录，因此**已结束的子代理会话**与**宿主重启之后**仍然显示。
- **上下文窗口感知降级**：`triggerCodes` 接受任意 dsh 失败码，包括 `CONTEXT_WINDOW_EXCEEDED`——请求超出当前模型上下文时，降级到上下文窗口**更大**的候选（装不下的候选被跳过）；由于路由本身健康，该切换是请求级的：不冷却、不浪费半开探针（见 [降级触发码](#降级触发码triggercodes)）。
- **冷却与回主**：被切离/失败的模型在冷却期内不再入选；`revertPolicy: cooldown-expiry` 冷却到期后自动回主模型。
- **一次性失败软冷却，成功即解除**：宿主自己判定为可重试的失败码（`TIMEOUT`、`TRANSPORT`、`RATE_LIMIT`、`SERVER`、`EMPTY_RESPONSE` 等）只把该条源软冷却一分钟，而不是整个 `cooldownMs`；确定结论（`QUOTA_EXHAUSTED`、`MODEL_NOT_FOUND`、`INVALID_API_KEY` 等）仍保留完整窗口。被冷却的路由只要真的答出一次完整回复，冷却立刻解除——`timer` 模式下同样生效，可用的 provider 永远不会被白关满整个窗口（见 [一次性失败只软冷却](#一次性失败只软冷却) 与 [一旦成功立刻解除冷却](#一旦成功立刻解除冷却)）。
- **手动选择优先**：你自己选的具体模型（不是全天链链头时）不会被改写——它的失败原样交给 llm-retry / 原始错误：不切换、不冷却、不改写重试。只有虚拟行 `ModelPool/*`、当前链头、以及子代理派发才属于池拥有（见 [手动选择永不被改写](#手动选择永不被改写)）。
- **重置冷却与检测连通**：每条链路状态条上都有一对按钮，作用范围仅限它上面那条链——一个只释放该链的冷却，另一个只对该链的源发一次一 token 请求、并只冷却那些给出确定 provider 侧失败的源，因此超时或限流不会埋掉一个健康的源（见 [重置冷却与检测连通](#重置冷却与检测连通)）。
- **拖拽定优先级**：链条目带拖动手柄；列表顺序就是路由优先级，根链与每个命名池均然（见 [优先级即顺序（可拖动）](#优先级即顺序可拖动)）。
- **宿主子代理模型策略（dsh 0.1.2）**：当宿主 `subagent-model-selection` 策略启用时，其允许列表对每个插件发起的 subagent 路由都是硬约束——显式授权的派发路由保持为链头（跳过角色注入），继承注入的链头与失败切换目标都与生效允许列表求交集，交集为空则跳过注入/切换（warn 日志 + 只读卡片警告；绝不发送允许列表之外的请求）。策略存在但不可读时 fail-closed。策略关闭/缺省时，注入与失败切换的选择与 0.3.5 完全一致。覆盖路径上的 `reasoningEffort` 遵循上游 routeChanged 规则（同路由 → 保留；跨路由 → 除非显式指定否则丢弃）。见 [宿主子代理模型策略](#宿主子代理模型策略dsh-012)。
- **半开恢复（可选）**：`recovery: half-open` 让恢复以证据驱动——冷却到期后路由进入 **half-open**，以一次记录探针（logged probe）放行，而不是直接恢复首选；连续失败使抑制时长按 **×2** 逐次升级、**1 小时**封顶；观察到完成即闭合回路、完全恢复首选。`revertPolicy: 'never'` 使该机制完全失效；状态为会话级内存态（重启即重置）。仅 YAML 配置——默认 `timer` 保持所有既有行为逐字节一致。可取值：`timer`（默认）| `half-open`。
- **行为可见**：每次切换以 info 级日志行（from/to/role/reason）记录——无静默换模型。插件**刻意不写** durable `fallbacks/switch` 会话事件（issue #52——apply() 时的事件类型注册被证伪无效，含该事件的会话在 dsh 重启后可能拒绝加载）。更早版本的插件写下的会话仍可能含此类行；本插件既不写入、也不修复它们。
- **安全阀**：`maxSwitchesPerStep` 限制每 step 切换次数、`alwaysModeRetryCap` 限制 always 模式重试——链循环不会放大延迟。
- **无配置回归（no-op）**：未配置任何内容时行为与未安装插件完全一致——内容在否即门控（见 [最小配置](#最小配置)）。

## dsh-tui profile（终端）

在 dsh-tui profile 中，插件有三个操作面——职责严格区分：

- **`/fallbacks`** —— 本次会话发生了什么：来源、解析角色、生效链、最近降级切换、冷却状态（`recovery: half-open` 生效时显示 half-open 标记行）。只读。
- **`/fallbacks config`** —— 配置了什么：组合配置回读（触发码、根链、分时槽、时区、角色、角色规则、冷却、回主策略、安全阀、预置、角色自动匹配）。除唯一的动作命令 **`/fallbacks config revert-seed <role-id>`** 外只读——该命令把某个 seed 角色的 persona 还原为已声明的默认（Web 设置卡已完全不显示角色行、不提供还原入口，此命令是该动作的唯一入口）。
- **`/settings`** —— 编辑界面。插件注册 **fallbacks** 区块，与 `fallbacks` 配置命名空间完全对齐——并且与 Web 设置卡不同，它仍然编辑 `roles.list` 与 `roles.rules`（卡片已移除角色编辑面，此区块保留）：布尔（`roleAutoMatch`）渲染为开关、下拉（`presets`、`revertPolicy`）为选择器、数值（`cooldownMs`、`maxSwitchesPerStep`、`alwaysModeRetryCap`）为数字输入；复杂结构（`rootChain`、`pools`、`timeSlots`、`roles.list`、`roles.rules`）为 JSON 文本字段，`triggerCodes` 为逗号分隔文本字段。非法草稿（JSON 解析失败、空 `rootChain`、分时行畸形）会阻止保存——区块绝不写入损坏配置。

**版本要求**：`/settings` 的 fallbacks 区块需要 **dsh-tui ≥ v0.8.5**（`main` 上 commit `c51661f` 及以后；settings seam 于 v0.8.0 引入，groups 结构与校验于 v0.8.5 引入）。更旧的 dsh-tui 没有该区块，文件编辑仍是 TUI 唯一编辑面。

文件编辑在任意情况下仍然可用：全局设置写共享的 `$DSH_HOME/settings.yaml`（`fallbacks:` 分节——与 Web 卡写的是同一个文件）；dsh-tui 专属覆盖写 profile patch `~/.dsh/profiles/dsh-tui/cordis.patch.yml`（插件行上的 `config:` 覆盖）。注意：patch 行会**整体替换**目标行的整个 `config`——想保留的字段都要写全（schema 默认值补齐其余）。

## 模型选择器中的 ModelPool

只要插件配置了内容（非空 `rootChain`、至少一条 `pools` 行、至少一条 `timeSlots` 行、或一个已声明角色），它就注册一个虚拟 provider **ModelPool**，每个已配置的链各占一行：根链对应 **Auto**，另加每个[命名池](#命名池)一行。web profile 与 dsh-tui 都能看到这些行：两者共享同一个 adapter catalog，无需设置页接线或宿主补丁（它与 `/settings` 的 fallbacks 区块相互独立——区块编辑的是配置，不是选择器目录）。只要其它内容仍在，空 `rootChain` **不会**隐藏 Auto 行——文案退化为裸 `Auto`，`stream()` 以 `EMPTY_EFFECTIVE_CHAIN` 拒绝服务；完全没有任何内容时才没有这一行。

选择 **ModelPool / Auto** = 把配置的链作为 root **主模型**：请求保留在虚拟对上，由 adapter 的薄委托在请求时刻派发到生效链的第一个精确 `provider/model`，失败后由降级引擎从该链头照常沿链切换。之所以让选择原样下发（而不是把路由改写成链头），也正是为了不让宿主的模型变更提示被反复触发：落盘的路由与会话选择一致，因此该提示只在**选择真的发生变化**时出现一次，而不再每一步重新注入。选择任何真实目录模型则保持 v0.2.2 的 fallback-only 行为——会话模型为主，链只在它失败后介入。

**没有 `rootMode` 开关**——没有配置键、YAML 字段、设置开关或 gateway 标志。模式就是会话的 `{provider, model}` 选择本身：`ModelPool` = 链为主模型；任意真实模型 = fallback-only。

注意：

- **选择器文案**：目录行的 `name`（composer 触发器显示）是动态的——`Auto: glm-5.3[all-day]`、`Auto: qfmodel[Liang Peak]`（用链头的 catalog 显示名，不是 model id）；id 仍是 `Auto`。命名池的行文案为 `<池 id> → 当前正在使用的 provider`，例如 `glm-5.3 → WorkBuddy`；链头一旦冷却，标签会顺着链往下走（见 [链路状态](#链路状态哪一条正在冷却)）。链中没有可派发的精确链头时只显示裸 `Auto`。链路状态变化时该行会自行重读；重新打开选择器亦可刷新。
- **全来源同一个薄委托**：root 代理与继承了该选择的 subagent 会话由同一个 `stream()` 薄委托服务——subagent 的角色解析与注入语义不变，只有一处刻意的放宽：派发时规则匹配接受**记录 pair 或实际服务的链头**（此前匹配的超集，因此以真实链头为键的规则仍能命中），虚拟行绝不是第二个路由引擎。继承了该选择的 subagent 仍经链头路由。
- **链头要求**：只要生效链里存在至少一个精确 `provider/model` 条目，委托就能成功——薄委托服务它能解析的第一个。让池子惰性的情形：`rootChain` 为空（保存被阻止），或链中只有通配符行时 `stream()` 抛 `EMPTY_EFFECTIVE_CHAIN` / `UNDISPATCHABLE_EFFECTIVE_HEAD`。停用插件（插件页行开关，或清空全部已配置内容）后该行隐藏（slot/链编辑不会触发注册抖动）。
- **过期选择**：行消失（插件停用）而会话仍选中 `ModelPool / Auto` 时，会话继续把它显示为当前模型，但 `routable: false`——从目录选一个真实模型即可继续（宿主原生目录语义）。
- **能力与重试策略跟随链头**：该行的模型元数据（上下文窗口、模态、推理）镜像当前生效链头，`providerRetryPolicy` 返回**该链头的**策略——因此用户配置的 `llm-deepseek.retryPolicy` 在这条路由上同样生效，不再退回宽松默认。宿主在注册时一次性捕获该策略，因此之后修改策略、或分时槽导致链头 provider 轮换，都只有在插件重新注册后才会反映。重试事件按虚拟 provider 记账——即运行时实际看到的路由。

## 命名池

命名池让**一个插件挂载**同时提供**多个互相独立的池**，每个池有自己的链、并在模型选择器里占独立一行。根链（`Auto`）是所有会话共享的一个池；命名池则是各自独立、自成一体的路由契约：

```yaml
fallbacks:
  rootChain: ["deepseek-official/deepseek-v4-pro"]
  pools:
    - id: glm-5.3
      chain: ["zai-coding-cn/glm-5.3", "workbuddy/deepseek-v4.1-flash"]
    - id: ours
      chain: ["qoder/dfmodel", "trae/deepseek-v4.1-flash"]
```

选择器于是出现三行：`Auto`、`glm-5.3 → GLM Coding Plan`、`ours → Qoder`。选中其一即以整个池作为该会话的路由契约。

- **id 规则**：`/^[a-z0-9][a-z0-9._-]{0,31}$/`（首字符为小写字母或数字，其后为字母/数字/`-`/`.`/`_`，最长 32 字符）。`auto` 为保留字——内置 Auto 行已代表根链。id 必须唯一；重复行只有第一条生效，其余告警。
- **命名池绝不与根链合并。** 选中 `ModelPool/ours` 只在 `ours` 的链内切换。当该链全部条目都失败时请求**直接失败**——它不会接着走 `rootChain`。这正是命名池的意义：硬边界，而不是共享链的延伸。
- **链头 = 第一个精确条目。** 链按顺序走，第一个可解析的 `provider/model` 即链头，行文案由该 provider 的显示名构成。空池或只有通配符的池会抛出 `EMPTY_EFFECTIVE_CHAIN` 并指明池名（`llm-fallbacks: pool "ours" has no dispatchable entries`），因此设置卡不允许保存这样的池。
- **不可自路由**：池内条目不能指向 `ModelPool`——那会让池服务自己。
- **推理强度按池独立。** 每一行声明的是它自己那条链所接受档位的并集（与 Auto 同一规则：不强制 `defaultEffort`，请求的档位会被强制到实际服务的链头所接受的最近一档）。
- **会话记忆**：由某个池服务的会话会把这个池当作自己的降级尾链。否则引擎会在第一次切换后悄悄退回 `rootChain`，等于无声地越过上面那条边界。
- **空分节 = 完全 no-op。** 没有 `pools` 行时插件行为与之前完全一致：只有 `Auto` 一行，只走 `rootChain`。

在设置卡中，**命名池**区块紧跟在默认池的链编辑器之后、**进阶**之前：每个池一张可折叠卡片，含 id 输入框与链编辑器（与根链相同的行编辑器），底部另有添加按钮。它拥有独立的保存/放弃按钮对与独立的校验桶，因此某个池 id 非法只会阻止该区块保存。

## 链路状态（哪一条正在冷却）

每个链编辑器——默认池的和每个命名池的——上方都有一条只读的**链路状态**条。它按路由顺序列出各条目并带状态点，所以「第一个源已耗尽、第二个正在作答」一眼可见，不用翻日志：

```
链路状态                              使用中：Qoder · dfmodel
● 1. Qoder · dfmodel                  使用中
● 2. Trae · deepseek-v4.1-flash       冷却中 · 42 秒后恢复
● 3. WorkBuddy · deepseek-v4.1-flash  备用
```

- **使用中**（绿）是引擎此刻真正会派的条目——跳过已冷却条目之后的生效链头。
- **冷却中**（琥珀）处于冷却并显示恢复时间。冷却通常是定时；`recovery: "half-open"` 时显示**待探测**，`revertPolicy: "never"` 时显示**已停用**，因为该条目在本会话内不再回来。
- **备用**（灰）是链上更靠后的健康条目。
- 当**所有**条目都在冷却时，状态条会明说，而引擎仍会直接试第一个条目——这正是整条链全部冷却时还能自行恢复的原因，而不是死等。

状态条每 5 秒刷新一次，设置变更后也会立即刷新。它完全来自插件自己观察到的请求错误：状态按 agent 隔离且从不持久化，所以新会话一开始没有任何冷却条目。各家 provider 并不对外提供跨插件的状态 API，因此它们自己的状态检测（WorkBuddy 的账号池、Qoder 的额度）只在各自插件内部生效——模型池只有在请求真正失败后才会知道。

选择器标签跟随同一状态：命名池渲染为 `glm-5.3 → 当前正在使用的 provider`，链头一被冷却，标签就自动换成链上下一条。

### 重置冷却与检测连通

每条链路状态条都自带一对按钮，作用范围**只限它上面那条链**：默认链的按钮只管根链（若有分时槽命中，就是当前生效的分时链），每个命名池的按钮只管该池自己的链。

- **重置冷却**：清掉该链拥有的冷却——按 agent 的冷却、半开探测记录、以及连通性检测发现的冷却——然后重新读取状态。某个源出过一次故障但你确知已经恢复时，用它比等满 `cooldownMs` 更省事。若某个路由同时出现在别的链里，那里的冷却也会一起释放：冷却是挂在 provider 路由上的，不挂在「谁先发现故障」的那条链上。
- **检测连通**：对该链的每个源各发一次一 token 的请求，把明确失败的源立刻冷却掉。这样死源在你下一次真实请求之前就已经被跳过，而不是先浪费一轮失败。

检测一条链不会挡住另一条：每条状态条各自记录自己的运行状态与统计，因此对 `glm-5.3` 的长检测不会让默认链的按钮变灰。

检测对「什么算证据」刻意**保守**。超时、主动中断、传输抖动、限流都不足以证明某个源不能服务——照此冷却会让一个健康的 provider 白白坐满整个冷却窗口。这类码会重试一次，仍无定论就记为**未判定**并且**不冷却**：

```
已检测 5 条：3 条连通，1 条已冷却，1 条未判定（未计入冷却）
```

只有 provider 侧给出的确定结论（`QUOTA_EXHAUSTED`、`MODEL_NOT_FOUND`、`INVALID_API_KEY`、`AUTH`、`PERMISSION_DENIED` 等）才会真正把一条源打入完整冷却。完整的一次性码表为 `TIMEOUT`、`ABORTED`、`TRANSPORT`、`NETWORK_ERROR`、`ECONNRESET`、`ECONNREFUSED`、`ETIMEDOUT`、`ENOTFOUND`、`EAI_AGAIN`、`EHOSTUNREACH`、`ENETUNREACH`、`RATE_LIMITED`、`RATE_LIMIT`、`RATE_LIMIT_EXCEEDED`、`TOO_MANY_REQUESTS`、`OVERLOADED`、`OVERLOADED_ERROR`、`UNAVAILABLE`、`SERVER`、`SERVER_ERROR`、`INTERNAL_ERROR`、`BAD_GATEWAY`、`SERVICE_UNAVAILABLE`、`UPSTREAM_TIMEOUT`、`UPSTREAM_ERROR`、`EMPTY_RESPONSE`、`ACCOUNT_SIGNED_OUT`。（其中 `RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`、`EMPTY_RESPONSE` 正是宿主自己判定为可重试的那一组，见 @deepseek-ai/dsh-llm 的 `DEFAULT_RETRYABLE_CODES`。）

全局冷却与路由失败共用同一个 `cooldownMs`，所以探测结论与真实失败的过期节奏一致。

### 一次性失败只软冷却

同一条道理也适用于你没有主动检测的那些失败——引擎在真实请求中看到的失败。链头上出现一次 `TIMEOUT` 或 `RATE_LIMIT`，并不足以说明这个源坏了，因此它只换来**一分钟的软冷却**，而不是整个 `cooldownMs`：

- `TRANSIENT_BENCH_MS` 为 60 秒。失败码属于上面那张一次性码表时，冷却时长为 `min(cooldownMs, 60 秒)`；把 `cooldownMs` 调到一分钟以下，软冷却也随之变短。
- 确定结论（`QUOTA_EXHAUSTED`、`MODEL_NOT_FOUND`、`INVALID_API_KEY`、`AUTH`、密钥被吊销等）保留完整 `cooldownMs`——这类问题一分钟后重试只会再浪费一轮。
- 请求级失败（`CONTEXT_WINDOW_EXCEEDED`）完全不触碰冷却。
- 常开模式触到重试上限时的那次决策不带失败码，因此保留完整窗口。

### 一旦成功立刻解除冷却

冷却不是「必须蹲满」的承诺。只要插件看到某条已被冷却的路由产出了完整的 assistant 消息，就会立刻解除该条冷却，下一次请求它又回到链头。这条在 `timer` 模式下同样生效，不只是 `recovery: "half-open"`——真实的回答就是「这个源还活着」的证据，既然已经拿到证据还要干等剩下的计时，正是这里要避免的那种误诊。

`revertPolicy: "never"` 是例外：它明确要求把一个失败条目排除到会话结束，因此成功不会覆盖它。

### 优先级即顺序（可拖动）

根链与每个命名池的链都是有序表，而顺序**就是**优先级：第一条未被冷却的条目就是实际使用的条目。行左侧有拖动手柄——池卡片用标题栏的手柄，链条目用条目底部的手柄——拖动产生的是一次普通的未保存修改，因此和其它编辑一样通过该区块的保存按钮生效。设置为只读时不可拖动。

### 手动选择永不被改写

模型池只在它自己拥有的路由上动手。如果你在选择器里选了一个**具体**模型、且它不是全天链的链头，插件就把它视为有意的手动选择，让失败原样交给 llm-retry / 原始错误：不切换、不冷却、不改写重试。把手动选择撬走，正是这一行为要消除的那个毛病。

仍属于「池拥有」的情形：虚拟行 `ModelPool/Auto` 与每个 `ModelPool/<池 id>`（它们本身就是路由契约，在它们上面失败正是引擎的职责）、恰好等于当前全天链链头的具体路由，以及任何子代理会话（它的路由来自角色注入，不是人点的）。

## 分时槽预设（分时切换）

峰谷无忧在[首页专题](#峰谷无忧)中介绍，本节是完整参考。分时槽行按墙钟窗口轮换**生效 root 链**——适合按峰谷切换模型，且不会把墙钟轮换误认为故障降级。文案严格区分：时段轮换的日志与 UI 用**分时切换**；失败降级保持**降级切换**；会话内「模型已降级」提示只出现在失败路径。

- **匹配顺序**：每个 root 请求时刻，第一条窗口包含当前时刻（按 `fallbacks.tz`，默认 `Asia/Shanghai` / UTC+8）的额外行生效——该行的模型链**取代**全时段链；无行命中则用全时段 `rootChain`。全时段行固定最后且**必须非空**，但任意 provider/model 都可以放在其中任意位置。
- **预设**（冻结，不可编辑窗口）：`liang-peak` = 周一至周五 09:00–12:00 **与** 14:00–18:00；`liang-valley` = 其它所有 UTC+8 时间；`glm-peak` = 周一至周五 14:00–18:00；`glm-valley` = 其余时间。一个预设 id 对应一行；设置卡的选择器不会重复提供已添加的预设。
- **自定义行**：`start` / `end`（`HH:mm`，可跨午夜）+ 可选 `days`（0=周日…6=周六；缺省/空 = 每天）+ 模型。
- **下一请求生效**：时段边界跨越绝不打断进行中的 step——新行在下一个 root 请求生效。轮换仅挂载生效：info 日志 + 设置卡/`/fallbacks` 状态行，无 durable 切换事件。
- **平铺设置卡**（官方插件页表单语言）：卡片始终展开——无可折叠外壳、无功能开关——每个区块各自带 **保存/放弃** 按钮对，只写入通过校验的那一份草稿。**默认池**区块下分两块——**分时槽设置**（额外行：添加预设 / 添加自定义 / 删除 / 按钮或**拖拽**排序；预设行只读展示窗口摘要、仅可编辑模型链；自定义行带可编辑名称；**时区选择器**在此区块内，只要存在预设行就**锁定 Asia/Shanghai**——预设窗口是冻结的 UTC+8 常量）与**模型池（降级链）**编辑器，后者编辑的是**整条** `rootChain`。行可折叠为「名称 + 首个模型」（内容级折叠）。本 fork **没有**单独的「默认模型」面板——它编辑的官方链尾槽位已不存在，每个条目都是普通链行。没有 `timeSlots.enabled` 总开关（添加行即开启），也没有 `rootMode` 控件。卡片中的**子代理**区块已移除：角色与角色规则属于路由配置，只能在 YAML 或 TUI 的 `/settings` 区块中编辑。

## 预设角色（Preset roles）

插件内置 **5 个通用子代理角色**，开箱即用——`reviewer` / `scout` / `security-reviewer` / `sonic` / `task`——`apply` 时自动以 seeded `roles.list` 行（`{ id, persona }`）声明：幂等，且绝不覆盖 operator 同名 persona。它们出现在 `/fallbacks config` 的角色摘要中，可直接被 `roles.rules` 引用。（设置卡已不再渲染角色行——见 [最小配置](#最小配置)第 4 步；请改在 YAML 或 TUI 的 `/settings` 区块中编辑角色。）（`designer` 与 `librarian` 不再内置：早期版本保存的行保留其 persona，现在只有在没有任何生产者仍声明其 id 时才显示 source `user` 并成为普通可编辑行——尽管 operator 并未写过这些行；伴随插件仍在声明的行会继续保持 seeded 只读状态，source 为未命名时的 `external`，或其已注册集合名。）

- **开关**：`fallbacks.presets`——`'bundled'`（默认）在 apply 时声明预设角色；`'none'` 关闭自动声明（已物化行保留）。
- 来源标注：每行带来源（`preset` / `user` / `external`）；上段所述来源徽标与逐行可编辑性适用于 YAML/TUI 界面。

## Agent 预设（插件组合）

Agent **preset** 是 dsh 的插件组合机制——一份声明式的子插件行清单，用户可整组启用；preset 本身**不携带任何模型字段**。本插件无需 preset 专属配置：preset 组合的是插件，因此 fallback 生效于**插件行被挂载的每一处**——包含 `llm-fallbacks` 行（name `dsh-model-pool`）的 preset，其会话即享有同一套池与角色配置。

两条组合注意事项：

- **用户 preset 覆盖会整体替换子插件清单**（无合并）：遗漏了本插件行的 preset 会在使用该 preset 的会话中静默卸载本插件。想保留的插件行都要重新写全。
- **preset 级链配置可通过把插件行挂进 preset 实现**：preset 组合中插件行的 `config:` 覆盖会形成仅作用于该 preset 会话的链配置（patch 行整体替换 `config`，字段要写全）。

## 降级触发码（`triggerCodes`）

`fallbacks.triggerCodes` 是一份 dsh 失败码列表，**任何**宿主可上报的失败码都被接受——不限于三个默认值（`AUTH` / `QUOTA` / `RATE_LIMIT`）。未列出的失败码原样透传给 llm-retry 或原始错误，与未安装插件完全一致。可重试型失败（5xx / `TRANSPORT` / `TIMEOUT` / `EMPTY_RESPONSE`）无需额外条目：llm-retry 先行退避，预算耗尽后同样进入链决策。

### 上下文窗口超限（context-window）

请求超出模型上下文窗口时，上报的失败码是 `CONTEXT_WINDOW_EXCEEDED`——dsh 内核对 provider 400 "maximum context length" 的规范码。它不是可重试码，需显式列出，才能降级到上下文更大的模型：

```yaml
fallbacks:
  triggerCodes:
    - AUTH
    - QUOTA
    - RATE_LIMIT
    - CONTEXT_WINDOW_EXCEEDED  # 请求装不下时降级
  rootChain:
    - workbuddy/glm-5.3          # 最先走
    - qoder-global/qfmodel       # 配额 / 限流 / 权限失败之后
    - trae-cn/doubao-seed-1.6    # 最后兜底（这里放任何模型都合法）
```

**顺序——降级先于压缩。** 只要 `triggerCodes` 含 `CONTEXT_WINDOW_EXCEEDED`，本插件的 `agent/request-error` 监听就会**先于**宿主压缩插件处理该拒绝：首次超限即把会话切到 fallback 模型，上下文完全不会被压缩。若更希望先尝试压缩，就不要把该码列入 `triggerCodes`。

**请求级切换。** 上下文超限说明**这一次请求**太大，而不是路由不健康。此类切换是**请求级（request-scoped）**：from 路由仍记入本 step 的失败集合（本 step 不会立刻弹回该模型）、仍计入 `maxSwitchesPerStep`，但**不**进入 `cooldownMs` 冷却、也不累加半开恢复计数器——下一条更短的提示词照常走主模型，不会在从未故障的路由上浪费一次半开探针。其余触发码一律保持**路由级（route-scoped）**（冷却 + 恢复记账），与既有行为一致。

**装不下的候选被跳过。** 上下文超限走链时，凡是已知上下文窗口不大于失败模型的候选一律跳过——从 128k 模型降到 8k 只会再失败一次。窗口取自宿主模型目录：目录行自带 `contextWindow` 时取之，否则取 `llm.resolveModelInfo(provider, model)` 的 `context.contextWindow`。两处都未公开窗口的模型保留为候选，因此缺少容量元数据的 provider 绝不会把链清空。被跳过的候选在切换日志行中标注 `skipped: context-window`。

## 宿主子代理模型策略（dsh 0.1.2）

dsh 0.1.2 为 subagent 增加了宿主侧的子模型选择：`subagent-model-selection` 设置允许列表、每会话的 `subagent/model-selection-policy` 事件、派发时的 `provider/model/reasoning_effort` 路由。插件在单一运行时仲裁点下与之协调——插件的角色/链仍是宿主不提供的失败恢复层。

**策略读取（按会话）**：会话 `subagent/model-selection-policy` 事件优先；否则读取 `subagent-model-selection` 设置服务（`enabled` 时）。服务缺失 / `enabled: false` / 无事件 → 策略关闭。

策略**启用**时：

- **授权链头保留（跳过注入）**：以显式 `provider`+`model` 派发的 subagent（派发 options、durable `request/header`、或 `model/selection` 选择）将该路由保持为链头——跳过角色注入，授权路由在首次请求上绝不被覆盖；插件链仅从失败时刻起生效。纯继承（无显式选择字段）**不是**授权路由。
- **允许列表约束注入**：纯继承仍走三阶段角色解析，但注入的链头由插件发起、必须在生效允许列表内——按序取第一个已解析且在列表内的候选。交集为空 → 跳过注入，保留宿主种子路由（warn 日志）。
- **允许列表约束失败切换**：触发码失败后，已解析候选（通配符已展开；冷却 / 本步已失败 / 与当前相同等过滤已应用）按走链顺序与允许列表求交集。交集为空 → **不切换**、不发送允许列表之外的请求，记 warn 日志 + 内存态 blocked-attempt 记录（不写 durable 会话事件——issue #52 不变）。
- **Fail-closed**：策略事件存在但载荷畸形，或设置启用但路由列表不可读 → 该会话的插件注入与切换全部禁用（warn 日志）；宿主种子与非切换行为不受影响。
- **卡片不再展示（本 fork）**：设置卡不再渲染策略区块——它原本位于已被移除的**子代理**区块内。宿主策略的强制行为与上述完全一致（warn 日志、阻止切换、fail-closed），只是卡片上不再有只读面板。要看策略状态仍靠会话内 `/fallbacks` 诊断与 warn 日志。
- **虚拟路由例外**：显式指定插件虚拟 provider（`ModelPool` / `Auto`）派发的 subagent，即为该路由的用户授权（spec D2——显式选择）。虚拟 adapter 将其请求内部委托给配置的生效链头，是该路由的既定用途，不属于 D1 的选择语义——D1 约束的是插件做出的 provider/model 选择，而不是显式所选虚拟路由内部的委托——被委托的链头不经允许列表过滤。

策略**关闭或缺省**时，注入与失败切换的**选择**与 0.3.5 一致（无允许列表过滤、无授权路由跳过）。

**Effort 规则（与策略无关）**：所有覆盖路径（角色注入、失败切换、always 上限切换）上的 `reasoningEffort` 遵循上游 0.1.2 的 `routeChanged` 规则——provider+model 路由不变则保留种子 effort；路由变化且未显式指定 effort 则丢弃（显式指定的 effort 永远保留）。陈旧的 effort 绝不会被带入另一个 provider。

在本 fork 中虚拟 `ModelPool / Auto` 路由同样参与：它广播的档位是池中各路由所声明档位的**并集**，且每次委托都钉到实际链头接受的最接近档位，因此在选择器里选定的档位可以在降级到档位集合不同的链头后继续成立。

## 纯挂载（零 dsh 修改）

插件以**纯挂载**方式安装：profile 里一条 `dsh.bundle.patch` 行、一份给 web UI 的 `dsh.client.inject` 清单，加上它自有的远端端点（`dsh-model-pool#fallbacks/get`、`…/set`、`…/reset`、`…/revert-seed`，经宿主 `typert` 服务注册）。它不打补丁到 DSH 安装目录、没有 postinstall 步骤，DSH 升级永不需重打。旧版打补丁安装遗留的补丁无害。

## 版本兼容性

`peerDependencies` 将 `@deepseek-ai/*` 钉在 `^0.2.0-rc.2`、`cordis` 在 `^4.0.2`、`schemastery` 在 `^3.18.2`、`react` 在 `^18.2.0`；`engines.node` 为 `>=22`。宿主超出该范围时，DSH 会拒绝启用插件，并打印覆盖该检查的确切命令 `dsh plugin --profile <profile> allow-version <name>@<version> --dsh-version <runtimeVersion> --accept-risk`——只有在接受风险时才执行，因为插件触及的内部结构可能已被不同宿主版本移动。

## 文档

本 README 就是这个 fork 的参考文档，没有单独的 `docs/` 目录：上述各节（峰谷无忧、快速开始、配置界面、模型选择器中的 ModelPool、分时槽预设、预设角色、Agent 预设、降级触发码、宿主子代理模型策略、纯挂载）已完整覆盖 `fallbacks` 命名空间、selector 语法与卡片用法。

如果你是**发布**这个 fork 的人而不是使用它，看 [PUBLISHING.md](PUBLISHING.md)——怎么推到 git 托管、为什么这份仓库装起来不需要构建、以及改完 `dist/` 之后怎么发版。

## 许可

本项目以 **MIT** 许可证发布，全文见 [LICENSE](LICENSE)。版权与许可条款以 LICENSE 文件为准。
