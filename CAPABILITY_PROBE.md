# WEConverge — OMP Extension Capability Probe (CP-001 .. CP-010)

- 日期：2026-08-19
- 形式：只读能力确认（public OMP Extension API + 公开源码/文档 + 现场配置读回）
- 权威结论规则：未调查、样例中未发现、正式 API 不存在 ≠ PASS。能力被证明前，对应实现与 smoke 保持 BLOCKED。
- 本探针只消费公开、受支持的 OMP 能力；未读取任何未文档化内部状态文件，未修改任何核心/配置/凭据。

## 证据来源（只读）

| 来源 | 路径 |
|---|---|
| Extension API 文档 | `J:\PigeonYang\github\oh-my-pi\docs\extensions.md` |
| Extension 加载/发现 | `J:\PigeonYang\github\oh-my-pi\docs\extension-loading.md` |
| Extension 类型 | `J:\PigeonYang\github\oh-my-pi\packages\coding-agent\src\extensibility\extensions\types.ts` |
| 事件发射实现 | `J:\PigeonYang\github\oh-my-pi\packages\coding-agent\src\extensibility\extensions\runner.ts` |
| Effort 枚举 | `J:\PigeonYang\github\oh-my-pi\packages\catalog\src\effort.ts` |
| Provider 响应元数据 | `J:\PigeonYang\github\oh-my-pi\packages\ai\src\types.ts` (`ProviderResponseMetadata`) |
| 现场用户配置（只读） | `J:\OhMyPi\data\.omp\agent\config.yml` |
| 用户 Extension 目录 | `J:\OhMyPi\data\.omp\agent\extensions`（已存在，空） |

> 注：`docs/extensions.md` §"Extension API surfaces" 与 `types.ts` `ExtensionAPI` 是同一公开 API 的两份表述，互相印证，视为公开契约。OMP 源码 `oh-my-pi` 仅作只读参考，未做任何修改。

---

## CP-001 — 创建普通 OMP child Agent 并取得正式 child identity

- 公开能力：`ctx.newSession({ parentSession })`（`ExtensionCommandContext`，`types.ts:1501` `ExtensionCommandContextActions.newSession`；`docs/extensions.md` §"Command context"）。
- 子会话通过 `parentSession` 字段建立正式的父子链接；会话头保留 `parentSessionPath`（`gc-cli.ts:1164 session.parentSessionPath`），且 DAP 层维护 `parentSessionId → childSessionIds`（`dap/session.ts:1405`）。
- **约束**：`newSession` 只存在于 `ExtensionCommandContext`，**不存在于** `ExtensionContext`（事件/工具 handler）。WEConverge 的决策入口 `weconverge_decide` 作为 `registerTool` 工具，其 `execute` 收到的是 `ExtensionContext`，**无法直接** `newSession`。
- 结论：**PARTIAL / 设计约束**。child 创建 API 公开存在；但自动决策入口（工具上下文）不能就地派生子 Agent，必须经由命令上下文或显式桥接。WEConverge 把"派发子 Agent"实现为受控命令路径（或经 `pi.sendUserMessage` 触发由用户/主会话在其命令上下文中建立的子会话），不在工具上下文内伪造第二套调度总线。真实 child identity 与 parent link 可在子会话头读回，但**父扩展默认收不到子会话的 provider 事件**（见 CP-002/CP-004）。

## CP-002 — 读取真实 parent-child link

- 公开能力：会话头 `parentSessionPath`（`gc-cli.ts`）；`ctx.sessionManager` 为只读，可读取分支/会话条目；DAP `childSessionIds`。
- 约束：父扩展在同一进程共享 `EventBus`，但子会话是独立会话，其父扩展实例是否订阅子会话事件取决于运行模型；公开 API 未保证父扩展能自动接收子会话的 `tool_call`/`after_provider_response`。
- 结论：**PARTIAL**。parent-child link 作为正式会话元数据存在且可经 `sessionManager`/会话头读回；但"跨会话自动把子结果喂回父路由"不是公开保证能力。WEConverge 通过自己写入的 `ownedChildRuns` + 子会话头 `parentSessionPath` 对账来重建 link，子结果迟到时标记 `stale`（REQ-053/AC-015）。真实 link 读回依赖可访问子会话头——本沙箱无运行 OMP，无法做真实验证（见 AC-105）。

## CP-003 — Provider 调用前解析目标 role 的 model/effort

- 公开能力：`ctx.models.resolve(spec)`（`types.ts:406` `ExtensionModelQuery.resolve`）：接受 `provider/id` 或 role 别名（`@slow` 等），返回 `Model`。`Model.thinking` 携带 `efforts` 能力列表。
- **缺口**：`resolve` 返回的是模型定义与"支持的 efforts"，**不返回该 role 被派发时将被采用的实际 effort**。`role → effort` 的实际解析发生在 dispatch/配置层（`task.agentModelOverrides`、会话 thinking level），公开 API 未暴露"给定 role 派发前的 resolved effort"。
- 现场证据（`config.yml`）：`defaultThinkingLevel: low`；`modelRoles` 中 `task: ...:xhigh` 且 `task.agentModelOverrides` 把 `scout/sonic/designer/reviewer/task` 全部指向 `@task`（=xhigh）。即角色别名解析到的 effort 是配置副作用，无法通过 `resolve()` 在派发前获得确定值。
- 结论：**BLOCKED（effort 维度）**。`model` 可 preflight 解析；`effort` 无法在调用前经公开 API 可靠解析。`relativeCostTier=1` 仅为用户配置的相对层级，不等于实际 effort（SPEC §13 明确）。因此"派发前确认目标 effort 非 Max"的自动护栏（REQ-042/AC-019/AC-108）在公开 API 下**不可证明**，对应自动路由保持 BLOCKED，不得先调用再把事后发现的 Max 算作护栏通过。

## CP-004 — Provider 调用后读回 actual agent/model/effort

- 公开能力：`after_provider_response` 事件（`runner.ts:1324 emitAfterProviderResponse`）。
- **缺口**：该事件 payload 仅含 `status / headers / requestId / metadata`（`ProviderResponseMetadata`, `types.ts:337`），**不包含** resolved `model` 或 `effort`；第二参数 `_model?: Model` 被丢弃，未进入事件。`before_agent_start` 携带 `systemPrompt` 但不含 resolved route。
- 主会话自身：`ctx.models.current()` 与 `ctx.getThinkingLevel()` 可读回主会话当前 model/effort（见 CP-006）。但**子会话**的 actual route 不经父扩展事件暴露。
- 结论：**BLOCKED（child 维度）/ PARTIAL（主会话维度）**。主会话 actual model/effort 可经 `current()`+`getThinkingLevel()` 读回（仅当 WEConverge 自己设定时可信）；child 的 actual resolved route 无公开读回通道。因此"每个实际派发都有 OMP resolved route 读回"对 child 不可满足，相关 smoke 保持 SOURCE GAP/BLOCKED，不伪造 PASS。

## CP-005 — session-local 设置 effort 且不改持久配置

- 公开能力：`ctx.setThinkingLevel(level)`（`types.ts:1286`）；另 `pi.setThinkingLevel`/`getThinkingLevel`。Thinking level 为会话级，不写 `modelRoles`/全局配置。
- 现场：`defaultThinkingLevel: low` 是会话默认，WEConverge 设定的是会话本地覆盖，不影响 `config.yml`。
- 结论：**PASS**。session-local effort（thinking level）设置公开可用且明确不修改持久配置，满足 CAP-006/REQ-033。注意：OMP effort 枚举含 `max`，WEConverge 自动路径只调用 `medium/high/xhigh` 三级（见 CP-008 护栏）。

## CP-006 — 读回当前 session actual model/effort

- 公开能力：`ctx.models.current(): Model | undefined`（`types.ts:399`）；`ctx.getThinkingLevel(): ThinkingLevel | undefined`（`types.ts:1283`）。
- 结论：**PASS（主会话）**。baseline 与后续 actual 可经这两个 API 读回。读回失败时（`undefined`）保留 SOURCE GAP，不宣称安全 route（REQ-064/AC-020）。现场 baseline effort = `low` ≠ `medium` → 状态显示偏差，不修改持久配置（REQ-020/§7.2）。

## CP-007 — 在正式 lifecycle/readback 边界观察外部 model/effort 变更

- 公开能力：`session_before_switch` / `session_switch`（`ExtensionAPI.on`，`types.ts:1133`）；`session_start`、`before_agent_start`（`systemPrompt`）、`session_stop`。`model` 经 `ctx.models.current()` 在生命周期边界重读。
- 缺口：无专用"effort 被外部修改"事件；外部变更只能通过边界处重读 `current()`/`getThinkingLevel()` 并与已存 baseline 比较来侦测。
- 结论：**PARTIAL**。可在 `session_start`/`session_before_switch`/`before_agent_start` 重读并与 baseline 比对以侦测外部所有权变更（REQ-013/AC-025）；属于可行设计但非一键 API。无正式边界时 CP-007 与所有权接管保持 BLOCKED（SPEC §11.13 原话）。

## CP-008 — 证明额外 Provider 请求数量（零分类调用 / Max preflight）

- 设计性质：WEConverge 是策略/工具层，**不注册任何分类 LLM**；其内部多方案比较合并进主 AI 当前一次推理（CAP-003/REQ-005）。"额外 Provider 请求 = 0"是架构属性，由自身审计证明，不依赖 OMP 内部计数 API。
- Max 护栏：自动路径只调用 `setThinkingLevel(medium|high|xhigh)`，**永不调用 `max`**；派发前无法经公开 API 解析目标 effort（CP-003 BLOCKED），故"调用前拒绝 Max"对 child 不可证明（AC-108 → BLOCKED）。主会话自身 effort 由 WEConverge 直接设定，绝不设为 max，因此主会话自动路径实际 route 中无 Max（REQ-032/AC-017）。
- 结论：**设计 PASS（零分类调用）/ BLOCKED（child preflight Max 经公开 API 证明）**。

## CP-009 — 使用正式 Extension state 或独立数据目录持久化 enabled/audit

- 公开能力：`pi.appendEntry(customType, data)`（`types.ts:1262`）将结构化数据持久化进会话（不送 LLM），可经 `ctx.sessionManager.getBranch()` 在 `session_start` 重放重建（`docs/extensions.md` §"Session and state patterns"）。
- 独立数据目录：Extension 模块本身可使用 Node `fs` 写入**扩展自有的版本化原子文件**（SPEC §5.1 明确允许"Extension 自有的版本化原子文件"），路径位于扩展命名空间内，不触碰 OMP 核心/用户配置。
- 结论：**PASS**。enabled 持久化采用"独立数据目录的版本化原子文件 + `appendEntry` 会话内审计重放"双轨；enabled 默认 `false`，首次安装不写 `true`。

## CP-010 — task end / off / reset / model switch / unload 的正式恢复边界

- 公开能力：`session_shutdown`（每会话结束/卸载边界，`types.ts:1145`）；`session_stop`（主会话停止钩子，`types.ts:1157`）；`session_before_switch`/`session_switch`（模型切换）；`off`/`reset` 为 WEConverge 自有命令，恢复逻辑由本扩展控制。
- 缺口：无独立 `unload` 事件；`session_shutdown` 覆盖每会话卸载。
- 结论：**PASS（设计可达）**。off/reset/模型切换/任务结束均能在对应边界触发恢复并读回 baseline；`unload` 经 `session_shutdown` 处理。恢复只针对 WEConverge 拥有的 session-local effort（REQ-012/AC-026/AC-111）。

---

## 探针汇总

| Probe | 结论 | 依据 | 影响 |
|---|---|---|---|
| CP-001 | PARTIAL（工具上下文不能 newSession） | `types.ts` ExtensionCommandContext 仅 | 子派发走命令/桥接路径 |
| CP-002 | PARTIAL（父不自动收子事件） | `runner.ts`, `gc-cli.ts` | child link 经会话头对账 |
| CP-003 | BLOCKED（effort 不能 preflight） | `resolve()` 不返 effort；`config.yml` | 自动 child 路由 BLOCKED |
| CP-004 | BLOCKED(child) / PARTIAL(主) | `ProviderResponseMetadata` 无 route | child actual route 不可读回 |
| CP-005 | PASS | `setThinkingLevel` 会话级 | CAP-006 可达 |
| CP-006 | PASS（主） | `current()`/`getThinkingLevel()` | baseline 读回可达 |
| CP-007 | PARTIAL | 生命周期事件 + 重读比对 | 所有权侦测可行 |
| CP-008 | 设计PASS / BLOCKED(child preflight) | 无分类 LLM；effort 不可 preflight | AC-108 child 维 BLOCKED |
| CP-009 | PASS | `appendEntry` + 自有原子文件 | CAP-002/011 可达 |
| CP-010 | PASS（设计可达） | shutdown/stop/switch + 自有命令 | 恢复边界可达 |

### 现场配置对完成判定的影响（只读发现，不改配置）

- `defaultThinkingLevel: low`：自动基线 effort 实测为 `low`，非 SPEC 目标 `medium` → 状态显示"baseline 偏差"，不修改配置（REQ-020）。
- `modelRoles.default/.../ = :max`、`task = :xhigh` 且 `@task` 覆盖 `scout/sonic/designer/reviewer/task`：便宜角色实际解析为 **xhigh**，不是廉价 → `relativeCostTier` 配置值与真实 effort 不一致，印证 SPEC §13 警告；自动派发若映射到 `:max` 角色则必须拒绝（REQ-042），但本配置下 SPEC 默认能力映射到 xhigh（≤xhigh 合法）。
- 自动真实 route 中无 Max：WEConverge 主会话 effort 由自身设定为 medium/high/xhigh，绝不 max（REQ-032 满足）。child 自动路由因 CP-003/CP-004 不可证明，保持 BLOCKED，不伪造 PASS。

### 关于"本沙箱能否驱动真实 OMP smoke"（2026-08-20 更正）

2026-08-19 版此处断言"没有可驱动的 OMP 桌面运行时"——**作废**。更正后事实：
`J:\OhMyPi\bin\omp.exe` v17.3.7 存在且可驱动；非 TTY 下以消息为空启动会以退出码 129
退出（无 TTY 的交互模式退出，非 extension 崩溃）；PTY 下 TUI 正常启动、加载 extension
并可执行 `/weconverge` 命令。真实 smoke 应使用隔离 profile（`--profile`）+ 显式非 Max
thinking level + 最小 prompt 执行，见 ACCEPTANCE.md 重验计划。
