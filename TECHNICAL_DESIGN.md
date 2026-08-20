# WEConverge — TECHNICAL_DESIGN.md

- 版本：1.1.0-advisory / 2026-08-20（纯咨询权威：`docs/spark/2026-08-20-weconverge-pure-advisory-design.md`，Owner-approved）+ D-08 correction (AC-L02 RETIRED → AC-A18)
- 历史基线：1.0.0 / 2026-08-19（原文保留于本文第 13 章及以后（§13+）作为历史追溯，除以 `> **咨询层…**` 标注的补充外无删除/重写；§0–12 为咨询层，冲突处以咨询层为准）
- 上游：`PRD.md v1.1.0-advisory`、`SPEC.md v1.1.0-advisory`、`docs/spark/2026-08-20-weconverge-pure-advisory-design.md`（含 D-08）
- 权威顺序：Owner 显式决定 D-01..D-08 > PRD/SPEC 咨询层 > 历史基线 > 本文件咨询层 > 本文件历史层
- 权威代码目录：`J:\PigeonYang\tools\weconverge`

> **实施说明**：本文第 0–12 章为现行咨询技术设计；第 13 章及以后（§13+）为 v1.0.0 历史设计保留追溯（除显式标注的补充外无删除/重写）。

---

## 0. 咨询层修订记录

| 决定 | 历史设计条款 | 咨询层处置 |
|---|---|---|
| D-01 | §3 唯一决策入口自动派发 `explore_in_parallel` via `newSession({parentSession})` | 退役自动派发；`weconverge_decide` 窄化为父-effort/缺口/手动授权；常规探索由父原生 `task` 发射 |
| D-02 | §6 成本硬护栏（Max/并发/波次/去重/紧凑强制） | 退役为咨询观察（`status`/audit 观测，不阻断） |
| D-03 | §5 effort 阶梯自动 Max 阻断 | 仅父 effort 阶梯保留强制 |
| D-04 | §5 `ResolvedRouteV1.resolvedEffort: xhigh` 可证明 | 修订为 SOURCE GAP |
| D-05 | §6 CP-001 自动外部探索可派发 | 退役为观察 |
| D-06 | §8 Runtime 每父会话一运行时 | 修订为单活 full runtime + 有界 tombstones；`session_switch` 销毁旧 runtime |
| D-07 | §11/§12 ladder 完整性 PASS | 退役；以分层验收替代 |
| D-08 | §12 AC-L02 最终 Provider payload 回读（启用后首个 generation 的 `before_agent_start` systemPrompt 必须在最终 Provider payload 中可回读验证） | **RETIRED (never PASS)** — Provider-wire payload 内省非 Extension 职责；下游 OMP 组装为官方 `before_agent_start.systemPrompt` hook 合同，超出 WEConverge 边界；替代为 AC-A18 确定性官方 hook 握手（enabled 确定性返回精确有界 policy 块、同 generation fingerprint 复用、disabled 无 policy、≤60 tokens、无 Provider 调用/回读） |
### 0.2 设计选择（Owner-approved 2026-08-20 + D-08）


1. **纯咨询**：无 task override/wrapper、`ctx.invokeTool(task)`、阻断、输入变异、取消、自动派发、强制 `weconverge_decide` 前置。
2. **紧凑 `before_agent_start` 策略**：唯一主动塑形机制为 `BeforeAgentStartEventResult.systemPrompt`（≤60 tokens / parent Provider request，generation-scoped）。
3. **仅观察**：公开 `tool_call`/`tool_result`/`task:subagent:*` 观察，不拦截；观察者 fail-open。
4. **模型感知**：按 `modelRoles`/`task.agentModelOverrides` 作模型相关 Max 咨询标注，无全局 Max 禁令。
5. **四类事实分类**：`requested/expected/observed/inferred/source_gap` 永不混淆。
6. **单活运行时 + 有界墓碑**：public session-delete 为 SOURCE GAP。
7. **Decide 仅用于父-effort 与正式缺口**：常规探索不经 `weconverge_decide`。
8. **父模型成本为主**：常规探索零 Extension 诱发 Provider 调用，直接原生 `task` 批处理，无轮询。
9. **确定性官方 hook 握手 (D-08 / AC-A18)**：`before_agent_start` handler 在 enabled 时确定性返回精确有界 policy 块、同 generation fingerprint 复用、disabled 无 policy、≤60 tokens；下游 Provider payload 组装为 OMP 官方合同，不检验、不以行为 canary 证明。
## 1. 架构总览（咨询层 — 现行）

```
                         OMP 主会话 (Agent / modelRoles / Task 派发 — 事实源)
                                       │ 事件 + 工具调用
                                       ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │  WEConverge Extension (OMP 用户级 Extension, junction 安装)        │
  │                                                                    │
  │  [OMP wiring] src/extension.ts（咨询接线）                         │
  │    - before_agent_start → systemPrompt (≤60 tokens, generation-scoped) │
  │    - pi.on("tool_call") / pi.on("tool_result")  观察 requested / SingleResult[] │
  │    - pi.events.on("task:subagent:lifecycle|progress|event") 观察子生命周期 │
  │    - registerTool("weconverge_decide")  窄化：仅 raise_effort / source_gap / blocked / 手动授权 │
  │    - registerCommand on|off|status|reset  仅本地咨询状态         │
  │    - pi.appendEntry("weconverge_audit", AuditEventV1) + 自有版本化原子文件 │
  │         │ 仅把 OMP 事实与用户输入交给 core，不自建调度总线        │
  │         ▼                                                          │
  │  [Pure Core] src/core/*  (零运行时 OMP 依赖，可确定性单测)        │
  │    policy · state · evidence · taxonomy · decide · audit · ledger · config │
  │    观察器 fail-open (≤5ms, 无 await/IO)；事实分类永不混淆         │
  │         ▲  适配器仅实现 readbackActual / setSessionEffort（会话级） │
  │         │  不实现 ctx.invokeTool(task) / preflightEffort / emitChild │
  └──────────────────────────────────────────────────────────────────┘
```

**铁律（咨询层）**：不建立第二套 Agent/Task/并发/回传/取消/结果装配基础设施（PRD REQ-101/REQ-109）。`explore_in_parallel` 的真实子 Agent 由父模型直接发射原生 `task` 承担；WEConverge 仅负责咨询策略、观察、事实分类、审计与墓碑追踪；无 public session-delete 事件，不以轮询或私文件扫描弥补。

---

## 2. 模块与 CAP 映射（咨询层 — 现行）

| 模块 | 文件 | 覆盖 CAP-A | 说明 |
|---|---|---|---|
| 类型 | `src/core/types.ts` | — | SPEC §4 全量类型 + §4.1-A 事实分类类型（`FactLabel/LabeledFact/AdvisoryObservedRouteV1`）、§4.5 咨询层状态修订 |
| 配置 | `src/core/config.ts` | CAP-A06/A11 | 默认配置（SPEC §5.1）+ 范围校验；咨询限制与能力→角色期望映射；`modelRoles` 只读 |
| 状态机 | `src/core/state.ts` | CAP-A05/A07/A09 | `createInitialState/newGeneration/reset/modelSwitch/off/restore`；generation 作用域；单活 full runtime + 有界 tombstones |
| 策略注入 | `src/core/policy.ts` | CAP-A01 | `buildPolicyPrompt()` 生成 ≤60 tokens 咨询策略；generation-scoped 去重 |
| 观察器 | `src/core/observer.ts` | CAP-A02 | `tool_call/tool_result/task:subagent:*` 同步观察，fail-open，≤5ms 预算 |
| 事实分类 | `src/core/taxonomy.ts` | CAP-A03 | `labelFact()` 四类分离；`relativeCostTier` 不冒充 `resolvedEffort` 断言 |
| 证据 | `src/core/evidence.ts` | CAP-A04 | `validateEvidenceRefs`：拒绝纯模型自述；`raise_effort` 证据门 |
| 决策 | `src/core/decision.ts` | CAP-A04/A05 | 窄化 `weconvergeDecide`：`raise_effort` / `report_source_gap` / `report_blocked` / 手动授权；`version==1` 与幂等；fail-closed 仅此窄门 |
| 审计 | `src/core/audit.ts` | CAP-A10 | 分层 `requested/expected/observed/inferred/source_gap`、脱敏、自由文本 ≤200 chars |
| 账本 | `src/core/ledger.ts` | CAP-A04 | decisionId 幂等、generation 单调、canonical payload 散列 |
| 接线 | `src/extension.ts` | CAP-A01/A02/A07/A09/A10/A11 | OMP 公开 API 咨询接线：`before_agent_start` + 观察订阅 + 窄化 decide + 命令；不 wrap `task` |

> 历史模块表保留于 §14；现行模块表以本节为准。

---

## 3. 策略注入（SPEC CAP-A01, PRD REQ-100 — 含 D-08 AC-A18）

- 通过 `before_agent_start` 返回 `BeforeAgentStartEventResult { systemPrompt: string[] }`。
- 内容：English、咨询性、≤60 tokens / parent Provider request，一条 directive + 两条 bullets + 字面量 `task(context, tasks:[≤2])`。
- 触发：`session_start`/`session_switch`/`off→on` 各一次 generation-scoped 注入事件；计费按每 parent Provider request 含该 policy 计（最坏 `≤60×T`，实际缓存/折扣为 SOURCE GAP）。
- 可被模型忽略；无强制后效；失败仅记 `health: degraded`，不二次注入。
- **D-08 确定性握手 (AC-A18)**：注册的公共 `before_agent_start` handler 在 enabled 时确定性返回精确有界 WEConverge policy 块；同 generation 复用相同 content/fingerprint；disabled 返回无 policy；token ≤60；无需 Provider 调用/回读；下游 OMP 组装为官方 hook 合同，不检验。
---

## 4. 观察器与事实分类（SPEC CAP-A02/A03, PRD REQ-102/103/110）

- 订阅：`pi.on("tool_call")` / `pi.on("tool_result")` / `pi.events.on("task:subagent:lifecycle|progress|event")`。
- `tool_call` 记 `requested`（`agent/effort/taskPreview`）；`tool_result` 记 `SingleResult[]`；`task:subagent:*` 记 lifecycle/progress/event 观测字段（`childId/agent/parentToolCallId/sessionFile/status/resolvedModel?`）。
- 全部 handler 同步观察，永不返回 `{block:true}`、不变异 `input`、不取消、不变异。
- 预算：≤5 ms，无 `await`/IO/网络；持久状态在 lifecycle 事件时缓存读取。
- 事实分类：`requested / expected / observed / inferred / source_gap` 永不混淆；`relativeCostTier` 标注 `inferred` 且附 note "not probative of actual Provider wire effort"；`resolvedEffort` 为 `source_gap` 直至公开 API 暴露。

---

## 5. 决策窄门（SPEC CAP-A04/A05, PRD REQ-104/105）

- `weconverge_decide(ConvergenceDecisionV1)` 仅保留：
  1. `raise_effort`（满足 `medium→high→xhigh` 阶梯 + `reasoning_depth_insufficient` + confirmed evidence + 方向有效 + `effort∈{medium,high}` + 新验证尝试 + session-local 可写可读回）；
  2. `report_source_gap`（完整 `missingFact/requiredSource/impact`）；
  3. `report_blocked`（confirmed evidence + `noSafeAlternativeReason`）；
  4. 显式手动授权。
- 常规探索不经此门：父直接 `task(context, tasks:[≤2])`，Extension 观察为准。
- 幂等：`decisionId` 在同一 `sessionId/generation` 内唯一；同 id 同 payload 返首次，同 id 异 payload 拒绝。
- 返回：`accepted|rejected|blocked|source_gap` 含 `generation/decisionId/auditEventId/effectiveAction/createdChildIds`（窄门下 `createdChildIds` 恒空）。

---

## 6. 运行时与生命周期（SPEC CAP-A07, PRD REQ-109）

- **单活 full runtime**：任意时刻恰好一个 active full runtime（当前 `sessionId#generation`），含 policy injector / observer / state keeper / command handlers。
- **有界 detached tombstones**：迟到子结果以最小记录保留（`childId/parentToolCallId/sessionFile/status/resolvedModel?/truncatedPreview≤200`），不含 handler、不占总线；每 generation 最多 2 个，超限丢弃最老。
- **Switch 销毁旧 runtime**：成功 `session_switch` 销毁旧 full runtime；不保留跨 generation 句柄。
- **Public session-delete 为 SOURCE GAP**：无删除通知，tombstone 以有界保留回收。
- **Phase 语义（咨询，源于观察）**：`disabled → baseline → executing → external_exploration (observed tool_call) → integrating (observed tool_result) → source_gap/blocked (仅经 weconverge_decide 正式报告) → degraded/completed`。

---

## 7. 命令与状态（SPEC CAP-A09, PRD REQ-112）

`registerCommand` 注册 `weconverge on|off|status|reset`：

- `on`：持久 `enabled=true`，后续新任务生效；当前空闲可建新 baseline，不追溯注入已发 systemPrompt。
- `off`：持久 `enabled=false`；`before_agent_start` 返回 `undefined`；observer 对新 `task` 观察记为 `advisory-detached`；不取消远端子；将观察到的 running children 记为 detached tombstones（用户 children 不触碰）；恢复 owned effort 并读回。
- `status`：只读；精确展示 `enabled/phase/baselineModel:Effort/currentModel:Effort/effortOwner/selectedDirection/alternativeDirectionIds/explorationWave(observed)/activeChildren(observed)/lastDecision(仅窄门)/restoreState/health/sourceGaps/priceTelemetry: SOURCE GAP/advisoryNote: pure advisory — no enforcement`；未知值显 `unknown/SOURCE GAP`。
- `reset`：清空当前 generation 咨询状态并重建干净 baseline，保留 audit，不改 `enabled`；`--no-session` 下记 `health: degraded`。

---

## 8. 审计与持久化（SPEC CAP-A10/A11, PRD REQ-111/113）

- 每条 `weconverge_audit` 经 `pi.appendEntry` + 版本化自有文件双轨持久化；`sessionManager.getBranch()` 扫描重放，`--no-session` 为 `degraded`。
- 每条事件分层记录：`requested{agent,effort,taskPreview}/expected{role,relativeCostTier}/observed{resolvedModel,resolvedEffort:source_gap,lifecycle,progress}/inferred{relativeCostTierNote}/sourceGaps[]/restoreResult/health/isDetachedTombstone?`，自由文本 ≤200 chars + 脱敏（凭据/隐藏推理/完整父上下文）。
- 无轮询：全部子证据经 `tool_result` details 与 `task:subagent:*` push 到达。

---

## 9. 配置（PRD REQ-106/113, SPEC CAP-A06/A11）

- OMP 权威：`modelRoles` / `task.agentModelOverrides` 只读不写；WEConverge 仅参考其作咨询期望。
- 用户咨询配置：

```yaml
roles:
  integrator: current          # parent session model
  cheap_worker: task           # OMP Task role alias @task
  mechanical_worker: sonic     # alias @sonic
  researcher: scout            # alias @scout
  reviewer: reviewer           # alias @reviewer
  frontend_specialist: designer

cost_tiers:
  current: 2
  task: 1
  sonic: 1
  scout: 1
  reviewer: 1
  designer: 2

capabilities:
  cheap_worker: task
  mechanical_worker: sonic
  researcher: scout
  reviewer: reviewer
  frontend_specialist: designer

# 以下为咨询值，不作强制门
# maxParallelExplorers: 2  # advisory
# maxExplorationWaves: 2   # advisory
```

- 模型感知 Max：按能力对应 resolved model 是否为 Max-capable 作 `inferredMaxCapable/observedIsMax` 标注，不阻断原生 `task`；`relativeCostTier` 不冒充 wire effort。

---

## 10. 成本（PRD REQ-115, SPEC CAP-A08/AC-C）

- 常规探索零 Extension 诱发 Provider 调用：父直接批处理原生 `task(context, tasks:[≤2])`，OMP 负责并发与装配，无轮询。
- Generation-scoped 策略 token：每 generation 注入事件一次，计费按每 request 含 policy 计（最坏 `≤60×T`，实际缓存/折扣为 SOURCE GAP）。
- 子输出不保证：policy 建议紧凑，实际长度由 OMP/子模型决定；audit 仅对其副本截断。
- 窄门 `weconverge_decide` 仅在 `raise_effort` / `report_source_gap` / `report_blocked` / 手动授权时产生单次父 tool 调用成本。

---

## 11. 机械验证（CAP-A08 机械层）

`src/core/*` 零运行时 OMP 依赖，由 `test/mechanical.test.ts` 与 `test/extension.integration.test.ts` 在 fake `ExtensionAPI` 下确定性覆盖 AC-A01..A18 / AC-C01..C03：策略有界性、官方 hook 握手确定性（AC-A18: enabled 确定性返回有界 policy 块、同 generation fingerprint 复用、disabled 无 policy、≤60 tokens、无 Provider 回读）、五类分离、observer fail-open、decide 窄门、父 effort 阶梯、tombstone 有界、audit 脱敏截断等。

---

## 12. 真实 OMP 观察验收（CAP-A08 真实层）

真实验证通过安装后的 OMP Extension 与真实会话事件**观察**（非强制派发）：

- AC-A18：**确定性官方 hook 握手**（D-08 新增，机械层）：注册的公共 `before_agent_start` handler 在 enabled 时确定性返回精确有界 policy 块、同 generation 复用相同 content/fingerprint、disabled 返回无 policy、≤60 tokens、无 Provider 调用/回读（downstream OMP 组装为官方合同，不检验）；
- AC-L01：junction 安装与加载；
- AC-L02：**RETIRED (never PASS) per D-08** — 原“`before_agent_start` 在 generation 始端注入可观测且可在最终 Provider payload 中回读”已退役；Provider-wire payload 内省非职责，下游组装为 OMP 官方 hook 合同，超出 WEConverge 边界；其缺失不记为产品 SOURCE GAP；历史文本保留于本行，active 门为 AC-A18；
- AC-L03：`tool_call/tool_result/task:subagent:*` 在有发射时可观测；
- AC-L04：`off` 语义；
- AC-L05：`session_switch` 销毁旧 runtime 与恢复读回。

`priceTelemetry: SOURCE GAP` 为唯一诚实价格陈述；`resolvedEffort` 恒为 `source_gap` 直至公开 API 暴露。**D-08**：Provider payload 缺失不记为产品 SOURCE GAP；不以模型是否实际遵从 policy 的行为 canary 作为 AC-A18 证明。
---

## 13. 历史技术设计（v1.0.0 保留追溯 — 不作为咨询层实施依据）
> 以下为 2026-08-19 v1.0.0 历史设计保留（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写），仅供追溯；与咨询层冲突处以 §0–12 为准。
### 13.1 架构总览（历史）

```
                          OMP 主会话 (Agent / 模型角色 / Task 派发 — 事实源)
                                        │ 事件 + 工具调用
                                        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  WEConverge Extension (OMP 用户级 Extension, junction 安装)        │
   │                                                                    │
   │  [OMP wiring] extension.ts                                        │
   │    - registerTool("weconverge_decide")   ← 唯一逻辑决策入口       │
   │    - registerCommand on|off|status|reset                          │
   │    - pi.on(session_start|session_shutdown|session_switch|...)     │
   │    - pi.appendEntry 持久化审计 / 自有原子文件持久化 enabled        │
   │         │ 仅把 OMP 事实与用户输入交给 core，不自建调度总线        │
   │         ▼                                                          │
   │  [Pure Core] src/core/*  (零运行时 OMP 依赖，可确定性单测)        │
   │    config · state · evidence · route · cost · decision · audit · ids │
   │         ▲ 注入的 OMP 适配器（resolveRole / readbackActual /        │
   │         │ setSessionEffort / emitChild）只在 wiring 层实现        │
   └──────────────────────────────────────────────────────────────────┘
```

**铁律（历史）**：不建立第二套 Agent/Task/并发/回传基础设施（REQ-004）。`explore_in_parallel` 的真实子 Agent 由 OMP 既有 `newSession({parentSession})` 承担（CP-001），WEConverge 只负责能力解析、护栏、审计与 child 追踪；若运行环境无法经公开 API 派发/读回 child，则对应自动路由保持 BLOCKED，不伪造。

### 13.2 模块与 CAP 映射（历史）

| 模块 | 文件 | 覆盖 CAP | 说明 |
|---|---|---|---|
| 类型 | `src/core/types.ts` | — | SPEC §4 全部类型（`SemanticAction`/`DifficultyType`/`Effort`/`Phase`/`Integrity`/`EvidenceRefV1`/`ConvergenceDecisionV1`/`ResolvedRouteV1`/`SessionStateV1`/`AuditEventV1`/`ConfigV1`） |
| 配置 | `src/core/config.ts` | CAP-001/008 | 默认配置（SPEC §5.1）+ 范围校验（maxParallelExplorers 1..2、maxExplorationWaves 1..2、capabilities、relativeCostTiers、effortCostTiers） |
| 状态机 | `src/core/state.ts` | CAP-002/006/012 | `createInitialState`/`newGeneration`/`reset`/`modelSwitch`/`off`/`restore`，全部 session-local |
| 证据 | `src/core/evidence.ts` | CAP-004/009 | `validateEvidenceRefs`：拒绝纯模型自述；要求 `kind∈{omp_event,tool_result,verification,child_result}` + `integrity:confirmed` 锚点 |
| 路由 | `src/core/route.ts` | CAP-007 | `resolveCapability`→role；`preflight`（Max 拒绝）；`buildResolvedRoute`（requested/resolved 严格分离） |
| 成本 | `src/core/cost.ts` | CAP-008 | 并发≤2、波次≤2、effort≤xhigh、同证据集合去重、候选比较（补齐能力优先，再比相对成本） |
| 决策 | `src/core/decision.ts` | CAP-003/004/005/006/009 | `weconvergeDecide`：schema 校验 → idempotency → evidence → 困难→动作 → 护栏 → 状态转换 → 审计 |
| 审计 | `src/core/audit.ts` | CAP-011 | `appendAudit` + 脱敏（禁写隐藏推理/凭据/完整父上下文） + 序列化 |
| 账本 | `src/core/ledger.ts` | CAP-013/014 | 决策 id 幂等、generation 单调、任务台账不可变追加 |
| 接线 | `src/extension.ts` | CAP-001/002/010/012/014 | OMP 公开 API 接线；注入 OMP 适配器 |

### 13.3 唯一决策入口（历史）

`weconverge_decide(ConvergenceDecisionV1)` 是唯一逻辑入口，映射为 OMP `registerTool`。事件顺序：`decision_received → decision_validated|decision_rejected → action_started → OMP actual events → action_terminal`。

### 13.4 Effort 状态机（历史）

纯函数 `transitionEffort(current, requested)`：`medium→high→xhigh` 合法；`medium→xhigh`/`high→max`/`xhigh→max`/`unknown→*` 拒绝。

### 13.5 路由与实际读回（历史）

- 适配器接口：`resolveRole / preflightEffort / readbackActual`
- `buildResolvedRoute` 严格分离 `requestedRole` 与 `resolvedAgent/resolvedModel/resolvedEffort`

### 13.6 成本护栏（历史）

`cost` 模块集中校验：额外 LLM=0、child≤2/波、波≤2、effort≤xhigh 等。

### 13.7 完整性维度（历史）

`routingIntegrity`/`taskOutcome`/`sourceGaps`/`blockedReason`/`restoreState`/`health` 互相独立。

### 13.8 生命周期与恢复（历史）

`session_start` / `session_shutdown` / `session_before_switch` 等边界恢复 owned effort。

### 13.9 命令与状态（历史）

`registerCommand` 注册 `weconverge on|off|status|reset`。

### 13.10 审计与脱敏（历史）

`appendAudit` 记录 SPEC §16.1 全部事件类型；`sanitize` 过滤等。

### 13.11 机械验证（历史）

`src/core/*` 零运行时 OMP 依赖，由 `test/mechanical.test.ts` 覆盖 AC-001..044。

### 13.12 真实 OMP 验收（历史）

junction 安装 → 真实 smoke AC-101..115。

### 13.13 REQ→CAP→AC 追溯（历史）

完全继承 SPEC §20 的 43 个 REQ 映射。

### 13.14 禁区保证（历史）

代码仅写项目内 `src/ test/ docs/ *.md *.json *.ts` 与 junction。不碰禁区。
