# WEConverge — TECHNICAL_DESIGN.md

- 版本：1.0.0 / 2026-08-19
- 上游：PRD.md、SPEC.md、docs/spark/2026-08-19-weconverge-design.md、CAPABILITY_PROBE.md
- 权威顺序：PRD §1（design > PRD > SPEC > 本文件 > PLAN > 台账）。本文件不得改写上游行为合同。

## 1. 架构总览

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

**铁律**：不建立第二套 Agent/Task/并发/回传基础设施（REQ-004）。`explore_in_parallel` 的真实子 Agent 由 OMP 既有 `newSession({parentSession})` 承担（CP-001），WEConverge 只负责能力解析、护栏、审计与 child 追踪；若运行环境无法经公开 API 派发/读回 child，则对应自动路由保持 BLOCKED，不伪造。

## 2. 模块与 CAP 映射

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

## 3. 唯一决策入口（SPEC §9.0）

`weconverge_decide(ConvergenceDecisionV1)` 是唯一逻辑入口，映射为 OMP `registerTool`。事件顺序：`decision_received → decision_validated|decision_rejected → action_started → OMP actual events → action_terminal`。

- `decisionId` 在同一 `sessionId/generation` 内唯一：相同 id+相同 payload 重试 → 返回首次结果，不重复副作用（AC-042）；相同 id+不同 payload → 拒绝。
- 返回枚举：`accepted | rejected | blocked | source_gap`，含 `generation`、`decisionId`、`auditEventId`、`effectiveAction`、`createdChildIds`。
- 未通过 schema/证据/成本/capability 前，**不产生** Agent、effort 或 Provider 副作用（fail-closed）。

## 4. Effort 状态机（SPEC §11）

纯函数 `transitionEffort(current, requested)`：`medium→high→xhigh` 合法；`medium→xhigh`/`high→max`/`xhigh→max`/`unknown→*` 拒绝。提升前置：困难类型=reasoning_depth_insufficient、有 confirmed evidence、当前方向有效、当前 effort∈{medium,high}、上次提升后已完成新验证尝试、OMP 适配器可 session-local 设定并读回（CP-005 PASS）。`max` 永不出现在自动目标集。

## 5. 路由与实际读回（SPEC §12，CP-003/CP-004）

- 适配器接口（仅接线层实现）：
  - `resolveRole(capability) -> role | null`：查 `config.capabilities`；缺失→SOURCE GAP，不回退（REQ-071/AC-021）。
  - `preflightEffort(role) -> Effort | "blocked" | "unavailable"`：CP-003 BLOCKED → 返回 `unavailable`，自动路由 BLOCKED。
  - `readbackActual() -> {model, effort} | null`：主会话经 `current()`/`getThinkingLevel()`（CP-006 PASS）；child 经会话头（CP-004 child BLOCKED → `null`，记 SOURCE GAP）。
- `buildResolvedRoute` 严格分离 `requestedRole` 与 `resolvedAgent/resolvedModel/resolvedEffort`；OMP 未提供→`null/unknown + source_gap`（REQ-064/AC-022）。

## 6. 成本护栏（SPEC §13）

`cost` 模块集中校验：额外 LLM=0、child≤2/波、波≤2、effort≤xhigh、同 evidence 集合拒绝重复动作、每个增量动作须有 expectedNewInformation+successCriterion、子包不含完整父上下文、不接收 AI token 预算、不周期反思、价格缺失=SOURCE GAP。候选比较：先剔除不能补齐能力的动作，再比 `relativeCostTier`；成本缺失→SOURCE GAP，不猜测（AC-036/AC-023）。

## 7. 完整性维度（SPEC §14）

`SessionStateV1` 中 `routingIntegrity`/`taskOutcome`/`sourceGaps`/`blockedReason`/`restoreState`/`health` **互相独立**，任一不得推导另一（AC-032）。价格 SOURCE GAP ≠ routing failed；child failed ≠ parent BLOCKED；routing PASS ≠ task completed。

## 8. 生命周期与恢复（SPEC §7/§17）

- `session_start`：读 enabled；若 enabled 且空闲→建新 baseline（读回 actual model/effort，失败留 SOURCE GAP）；新 generation 清空前任务证据/波次/child（AC-003）。
- `session_shutdown`/`session_stop`：恢复 owned effort 并读回，记 `restoreState`（AC-026/AC-111/AC-114）。
- `session_before_switch`/`session_switch`：先恢复旧 ownership → `generation++` → 清空旧模型状态 → 新 baseline（AC-039/AC-110）。
- `off`：持久 enabled=false，停止新动作，恢复 owned effort，running WEConverge child 标记 `detached`（不终止用户 child）（AC-038/AC-111）。
- `reset`：不改 enabled，恢复当前 generation，重建干净 baseline，不删审计（AC-002）。

## 9. 命令与状态（SPEC §15）

`registerCommand` 注册 `weconverge on|off|status|reset`。非法参数→usage，零状态变化（AC-029）。`status` 只读，未知字段显 `unknown`/`SOURCE GAP`（AC-028）。

## 10. 审计与脱敏（SPEC §16）

`appendAudit` 记录 SPEC §16.1 全部事件类型；`sanitize` 过滤隐藏推理/凭据/完整父上下文（AC-030）；写入失败→health=degraded，不阻断普通 OMP（AC-031）。持久化双轨：会话内 `appendEntry` + 扩展自有版本化原子文件（CP-009 PASS）。

## 11. 机械验证（CAP-013）

`src/core/*` 零运行时 OMP 依赖，由 `test/mechanical.test.ts` 用 `tsx`（managed Node）确定性覆盖 AC-001..044。OMP 适配器以可注入桩模拟，包括 `unavailable`/`max`/读回失败等，确保 BLOCKED/SOURCE GAP 路径真实触发而不伪造。

## 12. 真实 OMP 验收（CAP-014）

junction 安装到 `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → 权威源码（AC-101 安装维）。真实 smoke AC-101..115 须由可驱动的 OMP 运行时执行；本沙箱无可驱动运行时，相关项环境级 BLOCKED（见 ACCEPTANCE.md），不伪造。

## 13. REQ→CAP→AC 追溯（与 SPEC §20 一致，无新增/删减）

完全继承 SPEC §20 的 43 个 REQ 映射（REQ-001..083，注意 REQ-007 不在索引但仍须满足；索引覆盖 REQ-001..006,010..083）。本实现不改变该映射。机械测试覆盖 AC-001..044；真实 smoke 覆盖 AC-101..115。

## 14. 禁区保证

代码仅写：项目内 `src/ test/ docs/ *.md *.json *.ts` 与 OMP 用户 Extension 目录的 junction。**不碰** `J:\OhMyPi` 核心、`J:\PigeonYang\harness\WeOMP`、`config.yml`、Agent/Provider/全局 effort 配置、凭据、MCP、历史日志（REQ-083/AC-113）。
