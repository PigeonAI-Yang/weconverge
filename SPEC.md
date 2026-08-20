# WEConverge SPEC

- 状态：Advisory normative baseline v1.1.0-advisory — Owner-approved pure advisory (2026-08-20)
- 历史基线：v1.0.0 (2026-08-19) 原文保留于本文第 1–12 章作为历史记录（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写），仅通过本文第 0 章与第 13 章以后的咨询层显式覆盖
- 咨询权威：`docs/spark/2026-08-20-weconverge-pure-advisory-design.md` (Owner-approved 2026-08-20)
- 历史基线：`docs/spark/2026-08-19-weconverge-design.md`
- 上游：`PRD.md v1.1.0-advisory`（含 §0 咨询层）
- 适用范围：WEConverge v1 OMP 用户级 Extension — 咨询层为现行实施依据

> **实施说明**：本文第 0 章与第 13 章以后为现行咨询规范；第 1–12 章为 v1.0.0 历史规范保留（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写），冲突处以咨询层为准（见 §0.2）。

---

## 0. 咨询层修订记录

### 0.1 权威与覆盖规则

1. 历史层（§1–12, v1.0.0）保留（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写），仅作追溯；咨询层（§0, §13+）为现行规范。
2. 任一历史 `CAP/AC` 的强制语义（block/mutation/cancel/auto-dispatch/pre-provider Max proof/强制并发·波次·去重·紧凑输出）退役必须在 §0.2–§0.3 显式列出；未列入者继续有效。
3. 咨询层新增能力为 `CAP-A01..A08`，新增验收为 `AC-A01..A17`（机械/状态）、`AC-L01..L05`（真实 OMP 观察）、`AC-C01..C03`（成本）；历史 `AC-001..044` / `AC-101..115` 中被 §0.3 列为 `RETIRED` 的项永不按 PASS 呈现。
4. `REQ→CAP→AC` 映射：历史映射保留于 §12；现行映射为 §13.6（`REQ-100..115 → CAP-A → AC-A/L/C`）。

### 0.2 D-01..D-07 显式覆盖

| 决定 | 历史条款 | 咨询层处置 |
|---|---|---|
| D-01 | SPEC §6-10 / CAP-005 / TECHNICAL_DESIGN §3：`weconverge_decide` 为唯一逻辑门并自动派发 | 退役自动派发；`weconverge_decide` 窄化为父-effort/正式缺口/手动授权（CAP-A04） |
| D-02 | SPEC §5.2 / TECHNICAL_DESIGN §6：自动成本强制（Max/并发/波次/去重/紧凑） | 退役为咨询观察（CAP-A06） |
| D-03 | SPEC §11 / §4.2 / CAP-006：effort 阶梯自动 Max 阻断 | 仅父 effort 阶梯保留强制（CAP-A05）；子/自动 Max 阻断退役 |
| D-04 | SPEC §4.4 / §13：`ResolvedRouteV1.resolvedEffort` 可证明 | 修订为 SOURCE GAP（§1.4 咨询层类型） |
| D-05 | SPEC §6.1 CP-001 / CAP-001：Extension 可派发外部探索 | 退役为观察；探索仅由父原生 `task` 派发（CAP-A02） |
| D-06 | Runtime：每父会话一运行时 + 父子链追踪 | 修订为单活 full runtime + 有界 tombstones（CAP-A07） |
| D-07 | SPEC §22 / ACCEPTANCE：AC-105/107/108 阶梯完整性 PASS 门 | 退役；以 §13 三层分立验收替代（CAP-A08） |

### 0.3 旧强制 AC 退役清单（RETIRED — 不得按 PASS）

`AC-010` (外部探索证据门强制拒绝)、`AC-011`/`AC-012` (并发/波次强制拒绝)、`AC-013` (子包强制最小化)、`AC-016..018` 的子/自动阶梯部分、`AC-019`/`AC-108` 的 pre-provider Max 强制拒绝、`AC-105`/`AC-107` 的 Extension 派发成功证据。现行替代见 §13。

---

## 1. 规范解释

`必须`、`不得`、`只有`、`始终`为强制合同；`建议`不构成验收门。

本 SPEC 只能细化上游，不能删除、放宽或重新解释上游硬约束。若实现所需 OMP 正式 API 不存在，相关能力为 `BLOCKED`；不得读取未文档化文件、修改持久配置、猜测运行事实或降低验收来“完成”。

每个 PRD `REQ` 必须同时满足：

1. 至少映射一个 `CAP`；
2. 至少映射一个可证伪 `AC`；
3. 验收证据满足该 AC 指定的证据层级。

任一 REQ 缺少映射、测试或真实读回，即为 SPEC/实现退化。

> **咨询层补充**：PRD 咨询层 `REQ-100..115` 的映射见 §13.6；历史 `REQ-001..083` 的映射保留不删（§12），现行验收以 §13 为准。

## 2. 事实层级

从强到弱：

1. OMP 正式事件、命令结果和 resolved route 读回；
2. Extension 确定性状态与审计记录；
3. 机械测试；
4. 模型输出或自然语言说明。

低层级证据不得覆盖高层级事实。模型声称“已派发 Luna/High”不能证明实际 route；请求字段也不能证明 resolved route。

> **咨询层事实分类（现行）**：任何路由/成本陈述必须标注 `requested / expected / observed / inferred / source_gap` 五类之一，且永不混淆。`relativeCostTier` 永不冒充 `resolvedEffort`。

## 3. 能力索引

### 3.1 历史能力索引（v1.0.0 保留追溯）

| CAP | 能力 | PRD 需求 |
|---|---|---|
| CAP-001 | Extension 边界与安装 | REQ-001..006、REQ-083 |
| CAP-002 | 持久启用与任务隔离 | REQ-010..013 |
| CAP-003 | 策略注入与内部搜索 | REQ-005、REQ-020..021、REQ-045 |
| CAP-004 | 语义决策合同 | REQ-024..026、REQ-050..052 |
| CAP-005 | 外部探索与子 Agent | REQ-022..023、REQ-027、REQ-044、REQ-053 |
| CAP-006 | Effort 状态机与所有权 | REQ-030..033、REQ-042 |
| CAP-007 | 角色解析与实际路由 | REQ-040..043、REQ-064、REQ-071 |
| CAP-008 | 成本护栏 | REQ-026、REQ-032、REQ-043..045 |
| CAP-009 | 完整性与结果语义 | REQ-041、REQ-050..053、REQ-064 |
| CAP-010 | 命令与状态 | REQ-060..061 |
| CAP-011 | 审计与脱敏 | REQ-062..064 |
| CAP-012 | 生命周期恢复与失败 | REQ-012..013、REQ-053、REQ-070..071 |
| CAP-013 | 机械验证 | REQ-080、REQ-082 |
| CAP-014 | 真实 OMP 验收 | REQ-006、REQ-081..083 |

### 3.2 咨询层能力索引（v1.1-advisory — 现行）

| CAP | 能力 | PRD 需求 | 备注 |
|---|---|---|---|
| CAP-A01 | 紧凑策略注入 (compact policy injection) | REQ-100 | `before_agent_start` ≤60 tokens / parent Provider request, generation-scoped |
| CAP-A02 | 纯咨询与仅观察 (pure advisory / observation-only) | REQ-101..103 | 无 wrapper/block/mutation/cancel/auto-dispatch；订阅 `tool_call/tool_result/task:subagent:*`；fail-open |
| CAP-A03 | 事实分类 (fact taxonomy) | REQ-110 | `requested/expected/observed/inferred/source_gap` 永不混淆 |
| CAP-A04 | 窄化决策门 (parent-effort-only decide) | REQ-105, REQ-114 | `weconverge_decide` 仅 `raise_effort` / `report_source_gap` / `report_blocked` / 手动授权 |
| CAP-A05 | 父 effort 阶梯与所有权 (parent-effort ladder) | REQ-104, REQ-114 | `medium→high→xhigh` 仅父 effort；session-local，不改持久配置 |
| CAP-A06 | 模型感知 Max 与咨询限制 (model-aware Max / advisory limits) | REQ-106..108 | 无全局 Max 禁令；限制为咨询值 |
| CAP-A07 | 运行时与墓碑生命周期 (runtime/tombstone) | REQ-109 | 单活 full runtime + 有界 detached tombstones；`session_switch` 销毁旧 runtime |
| CAP-A08 | 分层验收 (mechanical / live / cost separation) | REQ-100..115 | 机械/真实/成本三层分立，替代旧 §22 ladder 门 |
| CAP-A09 | 命令与状态（咨询化） | REQ-112 | `on/off/status/reset` 仅本地咨询状态 |
| CAP-A10 | 审计与脱敏（分层） | REQ-111 | 分层审计、脱敏、截断 |
| CAP-A11 | 配置与恢复（咨询） | REQ-113 | `modelRoles` 权威；`enabled` 双轨持久化；恢复仅 owned effort |

历史 CAP-001..014 保留追溯；现行实现以 CAP-A01..A11 为准，冲突处以后者为准。

## 4. 规范数据类型

### 4.1 枚举

```ts
type SemanticAction =
  | "continue_current"
  | "activate_alternative"
  | "delegate_bounded_work"
  | "invoke_specialist"
  | "explore_in_parallel"
  | "raise_effort"
  | "report_source_gap"
  | "report_blocked";

type DifficultyType =
  | "path_unclear"
  | "reasoning_depth_insufficient"
  | "domain_mismatch"
  | "bounded_mechanical_work"
  | "alternative_ready"
  | "source_missing"
  | "proven_blocker";

type Effort = "medium" | "high" | "xhigh" | "max" | "unknown";

type Phase =
  | "disabled"
  | "baseline"
  | "executing"
  | "external_exploration"
  | "integrating"
  | "source_gap"
  | "blocked"
  | "completed"
  | "degraded";

type Integrity =
  | "confirmed"
  | "partial"
  | "source_gap"
  | "blocked"
  | "failed"
  | "stale"
  | "degraded";
```

`max` 只用于识别并标注实际路由，绝不是自动状态机 `raise_effort` 的合法目标（咨询层：原生 `task` 的 Max 仅为观察标注）。

### 4.1-A 咨询层事实分类类型（新增，现行）

```ts
type FactLabel = "requested" | "expected" | "observed" | "inferred" | "source_gap";

/** 任何路由/成本/模型陈述必须携带 FactLabel，且永不提升 */
interface LabeledFact<T> {
  value: T;
  label: FactLabel;
  provenance: string; // 事件或配置来源
  note?: string;      // 例如 "not probative of actual Provider wire effort"
}
```

- `requested` — `tool_call` 实发参数（`requested.agent`, `requested.effort: lo|med|hi|auto|undefined`, `requested.task` 预览）。
- `expected` — 配置期望（`capability → role`, `relativeCostTier`）。
- `observed` — 公开 `tool_result` / `task:subagent:*` / `getThinkingLevel` 回读到的字段。
- `inferred` — 基于 `cost_tiers`/命名启发式的推断，显式标记 `inferred`。
- `source_gap` — 公开 API 不可得（如 `resolvedEffort`, `providerPrice`, `providerBilling`, `actualEffortPerChild`）。

### 4.2 证据引用

```ts
interface EvidenceRefV1 {
  id: string;
  kind: "omp_event" | "tool_result" | "verification" | "child_result";
  summary: string;
  observedAt: string;
  sourceId: string;
  failureSignature?: string;
  integrity: "confirmed" | "partial";
}
```

证据必须指向可读回事件或结果。纯模型判断不能成为唯一 `EvidenceRefV1`。

### 4.3 语义决策

```ts
interface ConvergenceDecisionV1 {
  version: 1;
  decisionId: string;
  action: SemanticAction;
  difficultyType: DifficultyType;
  obstacle: string;
  evidenceRefs: string[];
  expectedNewInformation: string;
  successCriterion: string;
  alternativeId?: string;
  capability?: string;
  noSafeAlternativeReason?: string;
  sourceGap?: {
    missingFact: string;
    requiredSource: string;
    impact: string;
  };
  probes?: Array<{
    directionId: string;
    question: string;
    minimalTask: string;
    falsifier: string;
  }>;
}
```

不得包含 token 数量、Provider ID 或 model ID。`capability` 是如 `frontend`、`research` 的逻辑能力，由配置解析到 OMP 角色。

> **咨询层（CAP-A04）：** 该契约仅适用于 `weconverge_decide` 窄路径；常规探索不经此契约，直接以原生 `task` 参数为准。

### 4.4 路由事实

```ts
interface ResolvedRouteV1 {
  requestedRole: string | null;
  resolvedAgent: string | null;
  resolvedModel: string | null;
  resolvedEffort: Effort;
  parentAgentId: string | null;
  childAgentId: string | null;
  source: "omp" | "unavailable";
  integrity: "confirmed" | "source_gap";
}
```

请求值与 resolved 值不得共用字段。OMP 未提供时必须为 `null/unknown + source_gap`。

> **咨询层修订（REQ-107, CAP-A06）：** 在公开 Extension 面未暴露稳定 `resolvedEffort` 前，`resolvedEffort` 必须为 `"unknown"` 且 `integrity: "source_gap"`；`observed.resolvedModel` 后缀仅为 `inferred` 佐证，不等同于已证明 effort。

### 4.4-A 咨询层观察路由（新增，现行）

```ts
interface AdvisoryObservedRouteV1 {
  requested: { agent: string | null; effort: string | null; taskPreview: string | null; label: "requested" };
  expected: { role: string | null; relativeCostTier: number | null; label: "expected" };
  observed: {
    resolvedModel: string | null;
    resolvedEffort: "unknown"; // 恒为 source_gap 直至公开 API 暴露
    lifecycleStatus: string | null;
    resolvedModelSuffixIsMax?: boolean; // 推断，仅 advisory
    label: "observed";
  };
  inferred: { relativeCostTierNote: string; maxCapable?: boolean; label: "inferred" };
  sourceGaps: string[]; // 如 ["resolvedEffort","providerPrice","providerBilling"]
}
```

### 4.5 任务状态

```ts
interface SessionStateV1 {
  schemaVersion: 1;
  generation: number;
  enabledAtStart: boolean;
  phase: Phase;
  baselineModel: string | null;
  baselineEffort: Effort;
  currentModel: string | null;
  currentEffort: Effort;
  effortOwnedByExtension: boolean;
  selectedDirection: string | null;
  alternativeDirectionIds: string[];
  evidence: EvidenceRefV1[];
  automaticWavesUsed: 0 | 1 | 2;
  explorationWave: number;
  ownedChildRuns: Array<{
    childAgentId: string;
    generation: number;
    status: "running" | "terminal" | "detached" | "stale";
  }>;
  manualExplorationGrant: {
    generation: number;
    extraWaves: number;
    maxParallel: number;
    expiresAt: "task_end";
  } | null;
  lastDecision: ConvergenceDecisionV1 | null;
  routingIntegrity: "unverified" | "confirmed" | "source_gap" | "failed";
  taskOutcome:
    | "not_started"
    | "in_progress"
    | "passed"
    | "failed"
    | "partial"
    | "blocked";
  sourceGaps: string[];
  blockedReason: string | null;
  restoreState: "not_needed" | "pending" | "restored" | "failed";
  health: "ok" | "degraded";
}
```

新任务必须创建新的 `generation` 和空状态，不能复制前任务证据。

> **咨询层状态修订（CAP-A07, REQ-109）：**
> - `automaticWavesUsed` 在咨询层为**观察计数**（父发射 `task` 批次数），不作强制上限；
> - `ownedChildRuns` 为观察到的子运行（`childId/parentToolCallId/sessionFile/status/observedModel`），不代表 Extension 拥有调度权；
> - `lastDecision` 仅对 `weconverge_decide` 窄路径非 null；
> - `health: degraded` 覆盖观察器 fail-open 与持久化失败；
> - `sourceGaps` 恒含 `priceTelemetry: SOURCE GAP` 与 `resolvedEffort` 相关 gap；
> - Tombstones（`detached` 迟到结果）以附录形式有界保留，不计入 active runtime。

## 5. 配置合同

### 5.1 持久设置

```yaml
schemaVersion: 1
enabled: false
maxParallelExplorers: 2
maxExplorationWaves: 2
capabilities:
  cheap_worker: task
  mechanical: sonic
  research: scout
  review: reviewer
  frontend: designer
relativeCostTiers:
  current: 2
  task: 1
  sonic: 1
  scout: 1
  reviewer: 1
  designer: 2
effortCostTiers:
  medium: 2
  high: 3
  xhigh: 4
```

强制约束：

- 首次安装 `enabled=false`；
- `maxParallelExplorers` 合法范围为 1..2；
- `maxExplorationWaves` 合法范围为 1..2；
- 配置可降低但不能提高自动硬上限；
- 配置只保存 OMP 角色名和相对成本，不保存模型凭据；
- 未配置能力不得任意回退；
- 持久写入必须使用 OMP 正式 Extension 状态能力或 Extension 自有的版本化原子文件；不得写 OMP 核心配置。

当前任务内人工扩大探索上限必须来自 OMP 正式用户确认事件，并绑定 session、generation、extraWaves、maxParallel 与 `expiresAt=task_end`。没有可确认该事件的正式 API 时，扩大能力不可用。授权在 off、reset、model switch 或 task end 时失效，不得写回自动默认值，也不得解除 Max 禁令。

> **咨询层配置补充（CAP-A06, REQ-106/108）：**
> - `maxParallelExplorers` / `maxExplorationWaves` 为**咨询值**，展示于 `status`、记录于 audit，不在工具边界强制；
> - `capabilities` / `relativeCostTiers` 为期望映射（`expected`），不证明 wire effort；
> - 模型感知 Max：按 `modelRoles` / `task.agentModelOverrides` 是否指向 Max-capable 模型作咨询标注，不阻断原生 `task`。

## 6. CAP-001 Extension 边界与安装

1. 权威源码必须只有 `J:\PigeonYang\tools\weconverge`。
2. OMP Extension 安装入口必须是 junction 并读回目标。
3. Extension 只能调用 OMP 正式公开能力。
4. 不得修改 OMP 核心、WeOMP、用户项目、Provider 配置、全局 effort 或 Agent 配置。
5. 不得创建第二套 Agent 调度器、消息总线或结果数据库。
6. API 能力缺失必须在 capability probe 中显式呈现；关键能力缺失时实现验收 BLOCKED。

> **咨询层补充（CAP-A02, REQ-101）：** 本条第 5 点在咨询层扩展为：不得调用 `ctx.invokeTool("task")`、不得包裹/阻断/变异 `task`，不得创建第二并发·取消·结果层；`weconverge_decide` 不得自动派发。

### 6.1 实现前 capability probe

在技术设计和编码前，必须通过公开 OMP Extension 类型、文档或最小真实调用逐项确认：

| Probe | 必须证明的正式能力 | 缺失后果 |
|---|---|---|
| CP-001 | 创建普通 OMP child Agent，并取得正式 child identity | CAP-005/CAP-014 BLOCKED |
| CP-002 | 读取真实 parent-child link | 外部探索 route PASS BLOCKED |
| CP-003 | Provider 调用前解析目标 role 的 model/effort | 自动 child/specialist 路由 BLOCKED |
| CP-004 | Provider 调用后读回 actual agent/model/effort | route PASS BLOCKED |
| CP-005 | session-local 设置 effort 且不改持久配置 | CAP-006 BLOCKED |
| CP-006 | 读回当前 session actual model/effort | baseline、提升与恢复 BLOCKED |
| CP-007 | 在正式 lifecycle/readback 边界观察外部 model/effort 变更 | 所有权接管 BLOCKED |
| CP-008 | 证明额外 Provider 请求数量 | 零分类调用与 Max preflight smoke BLOCKED |
| CP-009 | 使用正式 Extension state 或独立数据目录持久化 enabled/audit | 持久启用或审计分别 BLOCKED |
| CP-010 | task end、off、reset、model switch、unload 的正式恢复边界 | 对应恢复与 ownership smoke BLOCKED |

`未调查`、`样例中未发现`和`正式 API 不存在`都不能按 PASS 处理；在能力被证明前，对应实现与 smoke 保持 BLOCKED。不得以 Extension 自身意图审计、OMP 未文档化数据库/session 文件、历史日志推断或修改用户配置替代这些 probe。

> **咨询层 probe 处置（v1.1-advisory）：** CP-003/CP-004 的 child effort/route 不可得在咨询层记为**预期 SOURCE GAP**，不按 BLOCKED 阻塞观察验收；替代证据为 `tool_result` / `task:subagent:*` 观察（见 §13.4）。

## 7. CAP-002 持久启用与任务隔离

### 7.1 启动

- Extension load 只读取 `enabled`，不创建 Agent、不改变 model/effort。
- `enabled=false` 时 phase 为 `disabled`，除命令外不注入策略或注册自动动作。
- `enabled=true` 只影响 load 后新开始的任务；不得把历史任务当作新任务自动接管。

### 7.2 新任务

新任务开始时：

1. 创建新的 generation；
2. 从 OMP 读回 actual model/effort 作为 baseline；
3. 清空方案、证据、波次、child 和 lastDecision；
4. baseline 为 Medium 时进入 `baseline`；
5. baseline 非 Medium 时不改持久配置，状态显示偏差；
6. baseline 无法读回时保留 SOURCE GAP，禁止自动 effort 提升。

> **咨询层补充（CAP-A04/A05）：** 第 6 点的“禁止自动 effort 提升”仅适用于 `weconverge_decide raise_effort`；原生 `task` 观察不受此限。

### 7.3 关闭与 reset

`off` 持久关闭并执行恢复；`reset` 不改变持久 enabled，只恢复当前 generation 并重建干净 baseline。两者都不得删除历史审计。

`off` 不终止用户创建的 Agent。对 WEConverge 自己派发且仍运行的 child，必须标记 `detached`，停止让其结果参与新路由；迟到结果只保留审计。`on` 在当前没有执行中的任务时可以立即建立新 baseline；当前任务正在执行时只持久启用后续新任务，不中途接管。

> **咨询层修订（CAP-A07, REQ-109/112）：** `off` 将**观察到的**运行中子任务标记 `detached`（有界 tombstones），不尝试取消；迟到结果仅审计。`off` 后 observer 对新 `task` 的观察记为 advisory-detached。

## 8. CAP-003 策略注入与内部搜索

启用任务的策略块必须：

1. 位于 OMP 允许的 Extension 指令位置，不覆盖项目规则和 Agent 角色；
2. 告知 AI 优先使用当前主模型、Medium、单 Agent；
3. 对非平凡任务要求至少两个本质不同方向、一个选中方向和备用标识；
4. 明确简单任务可直接执行；
5. 禁止输出完整隐藏推理，只要求简短决策摘要；
6. 禁止 token 预算、默认并发、周期性反思和自动 Max；
7. 不触发任何额外 LLM 请求。

“本质不同”至少满足一项：关键假设不同、证据源不同、验证方式不同。措辞变化不计数。

> **咨询层修订（CAP-A01, REQ-100）：**
> - 策略注入仅通过 `before_agent_start → systemPrompt: string[]` 返回，内容为 English、咨询性、≤60 tokens / parent Provider request，含 `task(context, tasks:[≤2])` 引用；
> - 注入为 generation-scoped 事件（`session_start`/`session_switch`/`off→on`），计费按每 parent Provider request 含该 policy 计（最坏 `≤60×T`，实际缓存/计费为 SOURCE GAP）；
> - 策略可被模型忽略，无强制后效。

## 9. CAP-004 语义决策与收敛门

### 9.0 决策入口、幂等与顺序

首版只暴露一个逻辑决策入口 `weconverge_decide(ConvergenceDecisionV1)`；技术设计只能把它映射到 OMP 正式 Agent tool，不得增加第二条旁路。`decisionId` 在同一 session/generation 内唯一：相同 ID 和相同 payload 重试必须返回第一次结果且不重复动作；相同 ID、不同 payload 必须拒绝。

返回必须区分 `accepted`、`rejected`、`blocked`、`source_gap`，并包含 generation、decisionId、auditEventId、effectiveAction 和已创建的正式 child IDs。事件顺序必须为 `decision_received → decision_validated|decision_rejected → action_started → OMP actual events → action_terminal`。未通过 schema、证据、成本或 capability probe 前不得产生 Agent、effort 或 Provider 副作用。

> **咨询层修订（CAP-A04, REQ-105）：** 本节仅适用于 `weconverge_decide` 窄路径（`raise_effort` / `report_source_gap` / `report_blocked` / 手动授权）。常规外部探索不经此入口，直接以原生 `task` + 观察为准；经此入口的事件顺序与幂等、fail-closed 语义保留。

### 9.1 决策校验

每一个提交给 WEConverge 的决策，包括 `continue_current`，都必须包含非空 obstacle、至少一个可读 evidenceRef、expectedNewInformation 和 successCriterion。增加资源的动作至少引用一个 confirmed evidence；字段不全的决策必须拒绝，不能靠默认值补齐。

`report_blocked` 还必须引用至少一个 confirmed evidence，并提供非空 `noSafeAlternativeReason`，证明允许范围内的安全替代已排除。`report_source_gap` 必须提供完整 `sourceGap`，说明缺失事实、所需来源和影响。任一字段缺失时不得进入 blocked/source_gap phase。

> **咨询层修订：** 本节校验仅适用于 `weconverge_decide` 窄路径。

### 9.2 有效不收敛证据

至少符合一项：

- 改变实现后同一归一化 failure signature 再次出现；
- 两个本质不同的 Medium 尝试未通过同一验收；
- 关键假设被 OMP tool result 或 verification 证伪；
- 两个子 Agent 返回互相冲突的 confirmed evidence。
- 基于至少一个 confirmed evidence 明确指出当前缺少的具体能力，并给出下一动作将新增的可验证信息和 falsifier。

最后一类不是纯模型自述：它必须锚定已观察事实，并能被后续动作证伪。以下不能单独通过门槛：一次命令错误、任务看似复杂、上下文较大、token 消耗较高、无 evidence anchor 的模型自述、缺权限/输入/日志/外部状态。

### 9.3 困难到动作的首选映射

| difficultyType | 首选动作 |
|---|---|
| path_unclear | explore_in_parallel |
| reasoning_depth_insufficient | raise_effort |
| domain_mismatch | invoke_specialist |
| bounded_mechanical_work | delegate_bounded_work |
| alternative_ready | activate_alternative |
| source_missing | report_source_gap |
| proven_blocker | report_blocked |

该表不是固定分类器。除 `source_missing` 和 `proven_blocker` 外，AI 可以选择其他语义动作，但仍必须证明该动作能补齐当前能力、带来新信息，并通过证据与成本护栏。例如方向不明但已有可验证备用方案时可先 `activate_alternative`，深度不足但实为领域缺口时可 `invoke_specialist`。

`source_missing` 不得触发 Agent 或 effort 增量，必须先 `report_source_gap`；`proven_blocker` 只有满足 §9.1 的确证证据与无安全替代合同才能 `report_blocked`。被拒绝的组合记录 `decision_rejected`，不能悄悄改成另一个动作。

> **咨询层修订（CAP-A04/A02）：** 本表在 `weconverge_decide` 窄路径保留；常规探索的 `explore_in_parallel` / `invoke_specialist` / `delegate_bounded_work` 在咨询层体现为父模型直接发射原生 `task` 的意图，不经 `weconverge_decide` 映射。

## 10. CAP-005 外部探索与子 Agent

### 10.1 派发门

`explore_in_parallel` 只有同时满足以下条件才可派发：

1. 通过 CAP-004 不收敛门；
2. probes 数量为 1..配置并发上限；
3. 每个 directionId 唯一；
4. question、minimalTask、falsifier 非空；
5. 方向在关键假设或验证方法上独立；
6. 当前 wave 未超过配置上限；
7. 目标角色可解析且不是 Max。

### 10.2 最小任务包

子 Agent 只接收：目标问题、必要事实、允许的只读/实验范围、falsifier、返回格式和父任务标识。不得默认传递完整对话、完整父上下文或要求完成整个实现。

### 10.3 波次

- wave 1 最多 2 个并行 Agent；
- wave 2 必须引用 wave 1 新产生的失败或冲突证据；
- 自动 wave 3 不存在；
- 上限后只能换方案、专业角色、逐级 effort、SOURCE GAP、BLOCKED 或人工授权。

### 10.4 子结果

结果必须区分 confirmed、partial、failed、source_gap。子 Agent 永不设置父任务 completed。父 Agent generation、phase 或 model 已变化时，结果标记 stale，不能触发自动决策。

> **咨询层整节处置（CAP-A02/A06/A07, REQ-101/108/109）：** §10.1–10.4 的强制派发门、最小包强制校验、硬波次上限与 `completed` 门在咨询层**退役为观察**：
> - 外部探索仅由父模型以原生 `task` 发射，Extension 观察 `tool_call` / `tool_result` / `task:subagent:*`；
> - `maxParallelExplorers / maxExplorationWaves / tasks.length / falsifier / 去重` 为咨询值，仅记录 `observed`，不拒绝；
> - 子包建议最小化，不强制截断；
> - stale 通过有界 tombstones 记录。

## 11. CAP-006 Effort 状态机与所有权

### 11.1 合法转换

```text
medium -> high -> xhigh
```

不存在 `medium -> xhigh`、`high -> max` 或 `xhigh -> max` 自动转换。

> **咨询层修订：** 本阶梯仅适用于 `weconverge_decide raise_effort`（CAP-A05）。

### 11.2 提升前置条件

`raise_effort` 必须满足：

1. difficultyType 为 reasoning_depth_insufficient；
2. CAP-004 不收敛证据成立；
3. 当前方向仍有效；
4. 当前 effort 为 medium 或 high；
5. 上次提升后已完成一个新验证尝试；
6. OMP 正式 API 能做 session-local 改变并读回。

任一不满足则拒绝。当前 effort 为 xhigh 时返回自动上限；为 max 时标记配置冲突；为 unknown 时 SOURCE GAP。

### 11.3 所有权

WEConverge 只在成功写入并读回后设置 `effortOwnedByExtension=true`。用户或其他组件改变 model/effort 后，Extension 必须在下一个 OMP 正式 lifecycle/readback 边界检测到变化时放弃所有权、标记 degraded、建立新 baseline，不覆盖外部值。若没有可观察该变化的正式边界，CP-007 与所有权接管能力 BLOCKED；不得监听未文档化配置或 session 文件绕过。

### 11.4 恢复

任务结束、off、reset、卸载或模型切换时，仅在仍拥有 effort 时恢复 baseline 并读回。恢复失败保留实际状态，标记 degraded，不修改持久配置补偿。

## 12. CAP-007 角色解析与实际路由

1. AI 请求逻辑 capability，不请求 Provider/model ID。
2. capability 解析为配置中的 OMP role。
3. role 不存在时返回 SOURCE GAP，不回退。
4. 派发前必须通过正式 preflight 读取 resolved model 与 effort；任一无法确认则该自动路由 BLOCKED，preflight effort 为 Max 时拒绝。
5. 派发后必须从 OMP 事件读回 resolved agent/model/effort 与真实 parent-child link。
6. 若 OMP 只能在 Provider 调用后提供 effort，首版不得以“事后发现 Max”为可接受行为；CP-003 和该自动路由能力 BLOCKED，直至存在调用前护栏。
7. 任何 route PASS 都必须基于 actual resolved route；请求值只能显示为 requested。

> **咨询层修订（CAP-A06, REQ-106/107）：**
> - 第 4、6 点的 pre-provider `resolvedEffort` 强制门在咨询层退役；`resolvedEffort` 为 SOURCE GAP；
> - 原生 `task` 的 Max 仅作 `observedIsMax` 咨询标注，不阻断；
> - 能力→角色解析保留，但为 `expected` 事实，不证明 wire effort。

## 13. CAP-008 成本护栏

- 默认额外 LLM 调用为 0；
- 默认子 Agent 为 0；
- 自动并发≤2，自动波次≤2；
- 自动 effort≤xhigh；
- 相同 evidence 集合不得重复同一增量动作；
- 每个增量动作必须有 expectedNewInformation 与 successCriterion；
- 子 Agent 不复制完整父上下文；
- 不接受 AI 生成的 token 数字预算；
- 不进行固定周期反思；
- 价格/余额/额度缺失显示 SOURCE GAP，不阻断基于相对成本的合法路由，也不冒充货币成本。
- `relativeCostTier=1` 仅表示用户配置的相对层级，不证明该 route effort 低于 Max，也不能绕过 preflight 护栏。

当两个以上动作都通过语义与证据门槛时，必须先剔除不能补齐所缺能力的动作，再比较配置中的预计相对成本。专业角色与下一档 effort 都可解决同一能力缺口时，选择较低层级；层级相同时依次偏好零新增 Provider 调用、单个有界专业调用、提高 effort，最后才是并行探索。候选、剔除原因、成本层级和最终选择必须进入审计。成本层级缺失时不得猜测，形成 SOURCE GAP；若无法确定更便宜的合法候选，保持当前路径或请求用户选择。

> **咨询层修订（CAP-A06, REQ-108/115）：** 本节硬护栏在咨询层转为咨询值（`status`/audit 观察），不在工具边界强制；`raise_effort` 的 effort 上限仍保留。

---

## 13. 咨询层规范（v1.1-advisory — 现行）

### 13.1 CAP-A01 紧凑策略注入

启用任务必须通过 `before_agent_start` 返回 `BeforeAgentStartEventResult { systemPrompt: string[] }`：
- 内容 ≤60 tokens / parent Provider request，English，咨询性，含 directive + 2 bullets + `task(context, tasks:[≤2])`；
- generation-scoped 注入事件（`session_start`/`session_switch`/`off→on`），计费按每 request 含 policy 计（最坏 `≤60×T`，实际缓存/计费为 SOURCE GAP）；
- 可被模型忽略，无强制后效。

### 13.2 CAP-A02 纯咨询与仅观察

- 不覆盖/包裹/阻断/变异/取消原生 `task`；不调用 `ctx.invokeTool("task")`；不要求 `weconverge_decide` 前置；
- 订阅 `pi.on("tool_call")` / `pi.on("tool_result")` / `pi.events.on("task:subagent:lifecycle|progress|event")` 进行同步观察；
- `tool_call` 记 `requested`，`tool_result` 记 `SingleResult[]`，`task:subagent:*` 记 lifecycle/progress/event 观测字段；
- 观察者 fail-open（CAP-A02.3）：handler 预算 ≤5 ms、无 `await`/IO/网络；异常仅记 `health: degraded` + `sourceGaps`，不阻断 OMP。

### 13.3 CAP-A03 事实分类（Fact taxonomy — never conflated）

任何陈述必须标注 `requested / expected / observed / inferred / source_gap` 且永不提升。`relativeCostTier` 为 `inferred`，永不冒充 `resolvedEffort`。呈现 `expected` 为 `observed` 或 `inferred` 为 `observed` 即为失败。

### 13.4 CAP-A04 窄化决策门（Parent-effort-only decide）

`weconverge_decide` 仅保留：
- `raise_effort`（满足 CAP-A05 前置 + §9.1 evidence + `expectedNewInformation`/`successCriterion`/`obstacle`）；
- `report_source_gap`（完整 `missingFact/requiredSource/impact`）；
- `report_blocked`（`confirmed` evidence + `noSafeAlternativeReason`）；
- 显式手动授权/手动探索许可。
`version` 必须 `== 1`，`decisionId` 在同一 `sessionId/generation` 内唯一（同 id 同 payload 幂等返回，同 id 异 payload 拒绝）。非常规探索不经此门。

### 13.5 CAP-A05 父 effort 阶梯与所有权

- 合法自动转换：`medium → high → xhigh`，每次一级、需新验证尝试、`max` 非目标；
- 仅在 `weconverge_decide raise_effort` 生效；前置见 §11.2；
- 成功写入并读回后 `effortOwnedByExtension=true`；外部变更在下一 lifecycle/readback 边界放弃所有权并 `degraded`；
- 恢复仅针对 owned effort，读回确认，失败记 `restoreState: failed|degraded`，不改持久配置。

### 13.6 CAP-A06 模型感知 Max 与咨询限制

- 全局自动 Max 禁令退役；按 `modelRoles`/`task.agentModelOverrides` 的能力路由作模型感知咨询标注：`inferredMaxCapable` / `observedIsMax`，不阻断原生 `task`；
- `maxParallelExplorers / maxExplorationWaves / tasks.length ≤2 / falsifier / 去重` 为咨询值：展示于 `status`、记录于 audit 的 `observed`，不拒绝、不截断。

### 13.7 CAP-A07 运行时与墓碑生命周期

- 单活 full runtime（`sessionId#generation`），含 injector/observer/state keeper/command handlers；
- 有界 minimal detached tombstones：迟到子结果记 `childId/parentToolCallId/sessionFile/status/resolvedModel?/truncatedPreview≤200`，不含 handler；
- `session_switch` 销毁旧 full runtime；public session-delete 为 SOURCE GAP，以每 generation 最多 2 个 tombstones、超限丢弃最老的方式回收。

### 13.8 CAP-A08 分层验收（Mechanical / Live / Cost — separated, never mixed）

验收分三层，互不混用：

1. **Mechanical (deterministic)** — `src/core/*` 在 fake `ExtensionAPI` 下：生命周期/phase、generation 作用域、decide 窄门（`version==1`、父-effort 前置）、事实分类、audit 脱敏/截断、`off`/detached/tombstone、observer fail-open；
2. **Live OMP (observed)** — 真实 junction 加载、命令序列、`before_agent_start` 在 generation 始端注入可观测、`tool_call/tool_result/task:subagent:*` 在有发射时可观测、child `resolvedModel` 在有 progress 时可观测、`restoreState` 在 `setThinkingLevel` 成功时可读回；`priceTelemetry: SOURCE GAP` 为唯一诚实价格陈述；
3. **Cost (token economics)** — generation-scoped policy token 计数、父合成成本 per exploration batch、子输出长度观测值；以实测 turn 转录为准，不以合成 preflight 计数冒充。

`COMPLETE` 仅当三层对咨询合同分别成立，且无退役 AC 被标记 PASS。

## 14. CAP-009 完整性与结果语义

### 14.1 独立维度

状态必须分别包含：

- `routingIntegrity`：actual route 是否确认；
- `taskOutcome`：任务是否通过验收；
- `sourceGaps`：缺失事实列表；
- `blockedReason`：确证不可行原因；
- `restoreState`：临时状态是否恢复；
- `health`：Extension 是否 degraded。

一个维度不得推导另一个维度。价格 SOURCE GAP 不等于 routing failed；子任务 failed 不等于父任务 BLOCKED；routing PASS 不等于 task completed。

### 14.2 SOURCE GAP

必须具体写明缺失字段、需要的来源、缺失影响和不受影响的结论。缺权限、输入或外部事实时停止自动加算力。

### 14.3 BLOCKED

只有必要路径已被 confirmed evidence 证明不可执行，且允许范围内无安全替代时使用。尚未尝试、API 未调查或仅成本较高不能宣称 BLOCKED。

---

## 15. CAP-010 命令与状态（历史）

### 15.1 命令

```text
/weconverge on
/weconverge off
/weconverge status
/weconverge reset
```

- `on`：原子写入 enabled=true；不改全局 OMP 配置。
- `off`：原子写入 enabled=false，停止新自动动作并执行恢复。
- `status`：只读，不触发 Agent、模型调用或状态转换。
- `reset`：恢复当前 generation 并重建干净状态，不改变 enabled，不删审计。
- 非法参数：返回 usage，零状态变化。

### 15.2 状态输出

至少包含：enabled、phase、generation、baseline model/effort、actual model/effort、effort owner、selected direction、wave、active children、last decision、routing integrity、restore state、health、source gaps、price telemetry。

未知值显示 `unknown` 或 `SOURCE GAP`，不得省略后造成“已确认”的错觉。

> **咨询层修订（CAP-A09, REQ-112）：** 命令仅为本地咨询状态转换：`off` 不取消远端子任务（标记 detached）、`reset` 保留 audit、`status` 只读且必须含 `advisoryNote: pure advisory — no enforcement` 与 `priceTelemetry: SOURCE GAP`；非法参数零副作用。

## 16. CAP-011 审计与脱敏

### 16.1 事件

```ts
interface AuditEventV1 {
  schemaVersion: 1;
  timestamp: string;
  sessionId: string;
  generation: number;
  parentAgentId: string | null;
  eventType: string;
  action: SemanticAction | null;
  difficultyType: DifficultyType | null;
  evidenceSummary: string[];
  expectedNewInformation: string | null;
  successCriterion: string | null;
  requestedRole: string | null;
  resolvedRoute: ResolvedRouteV1 | null;
  relativeCostTier: number | null;
  result: Integrity;
  sourceGaps: string[];
  restoreResult: string | null;
}
```

必须记录决策接收/拒绝、派发、resolved route、child terminal、effort change、所有权丢失、恢复和命令。

不得记录完整隐藏推理、完整 prompt/父上下文、Provider key、Authorization、cookie 或认证材料。自由文本必须经过现有脱敏策略；审计写入失败显示 degraded，但不得阻塞普通 OMP。

> **咨询层修订（CAP-A03/A10, REQ-111）：** 审计必须分层标注 `requested/expected/observed/inferred/source_gap`，`relativeCostTier` 为 `inferred` 且附 note "not probative of actual Provider wire effort"；`resolvedEffort` 为 `source_gap` 直至公开 API 暴露；自由文本截断 ≤200 chars；凭据/隐藏推理/完整父上下文脱敏。

## 17. CAP-012 生命周期恢复与失败

### 17.1 会话恢复

恢复已存在的任务时，Extension 必须按 session/generation 和单调事件顺序读取自己已持久化的审计事件，验证 schema 后重放为 SessionState，再与 OMP 当前 actual model/effort、child terminal 状态核对。模型文字不得参与重建。审计缺失、损坏、顺序断裂或与 actual 冲突时，状态为 degraded/SOURCE GAP，停止新增自动资源，普通 OMP 任务继续。

### 17.2 模型切换

模型切换必须先恢复仍拥有的旧 effort，再 generation++，并原子清空旧模型的 evidence、selectedDirection、alternativeDirectionIds、explorationWave、lastDecision、manualExplorationGrant 和 active routing ownership。旧 child 标记 detached/stale；随后为新模型读回并建立 baseline。

| 事件/失败 | 规范行为 | 咨询层备注（v1.1-advisory） |
|---|---|---|
| Extension load 失败 | 普通 OMP 继续，记录可见加载错误 | 同左 |
| 策略注入失败 | 本任务停止自动动作并 degraded；普通 OMP 任务继续 | 咨询层：记 `degraded`，不二次注入同一 generation |
| 角色不存在 | SOURCE GAP，不任意回退 | 同左 |
| resolved Max | Provider 调用前拒绝，cost_guard_conflict | **咨询层：** 原生 `task` 的 Max 仅作 `observedIsMax` 标注，不拒绝；仅 `raise_effort` 目标为 Max 时拒绝 |
| 子 Agent 创建失败 | failed，主 AI 可选择其他合法动作 | 咨询层：为 OMP 观测失败，非 Extension 派发失败 |
| 子 Agent 超时 | partial + 已有证据，停止等待 | 同左（观测） |
| effort 写入/读回失败 | 保持 actual，degraded | 同左 |
| model switch | 恢复旧 ownership，清空旧模型状态，generation++，新 baseline | 同左（CAP-A07） |
| 外部 model/effort 变更 | 放弃 ownership，不覆盖 | 同左 |
| off/reset/task end/unload | 停止新动作，恢复 owned effort，读回 | 咨询层：`off` 不取消远端子，标记 detached tombstone |
| off 时仍有 WEConverge child | 标记 detached，不终止；迟到结果只审计 | 咨询层：为观察到的 running children |
| 迟到 child | stale，只审计 | 咨询层：有界 tombstone ≤2/generation |
| 价格/额度不可读 | price SOURCE GAP，其他维度独立 | 同左（恒为 SOURCE GAP） |
| 审计写入失败 | degraded，不阻断 OMP，不伪造记录 | 同左 |

任何错误路径都不得无限重试、无限派发或修改 OMP 持久配置做补偿。

## 18. CAP-013 机械验收

每项必须是确定性测试，不能调用真实付费模型：

| AC | 验收 | 咨询层处置 |
|---|---|---|
| AC-001 | 新安装 enabled=false，零策略注入、零派发、零 effort 变化 | 保留（AC-A01 覆盖策略有界性） |
| AC-002 | on 跨新任务保持；空闲时建立 baseline；off 停止自动动作并恢复 | 保留（off 语义见 CAP-A07） |
| AC-003 | 新 generation 不继承前任务证据、波次、方案或 child | 保留 |
| AC-004 | 简单任务允许直接执行，无额外 LLM/Agent | 保留 |
| AC-005 | 非平凡任务保存选中方向和至少一个本质不同备用标识 | 保留（咨询建议） |
| AC-006 | 决策 schema 拒绝 token、Provider ID、model ID，且缺任一必填决策字段时拒绝 | 保留为 `weconverge_decide` 窄门 |
| AC-007 | 单次工具错误、主观复杂、上下文大均不能通过升级门 | 保留为 `raise_effort` 门 |
| AC-008 | 缺权限/输入/日志只产生 SOURCE GAP，不派发、不升 effort | 保留为 `raise_effort` 门；原生 `task` 不适用 |
| AC-009 | 非首选但能补齐能力且通过证据/成本门的动作可接受；source_missing 增量动作和未确证 proven_blocker 被拒绝 | 保留为 `weconverge_decide` 门 |
| AC-010 | 外部探索没有 confirmed evidence 时被拒绝 | **RETIRED** — 咨询层为观察，见 AC-A03 |
| AC-011 | 每波最多 2 个 child，第三个被拒绝 | **RETIRED** — 咨询层为观察，见 AC-A12 |
| AC-012 | 最多 2 波；第二波无第一波新证据时被拒绝 | **RETIRED** — 咨询层为观察，见 AC-A12 |
| AC-013 | 子任务包不包含完整父上下文或完整实现要求 | **RETIRED** — 咨询层为建议，见 AC-A07/AC-C03 |
| AC-014 | child 不能设置父任务 completed | **RETIRED** — 子不声明父完成为建议 |
| AC-015 | generation/phase/model 改变后的 child 结果为 stale | 保留（tombstone） |
| AC-016 | effort 只允许 medium→high→xhigh | 保留为父 effort |
| AC-017 | medium→xhigh、high→max、xhigh→max 全部拒绝 | 保留为父 effort |
| AC-018 | 提升后未完成新验证尝试，下一次提升被拒绝 | 保留为父 effort |
| AC-019 | preflight resolved effort 为 Max 时 Provider 调用次数为 0；只有 post-call actual 的宿主保持 BLOCKED | **RETIRED** — 咨询层为标注，见 AC-A11 |
| AC-020 | unknown effort 产生 SOURCE GAP，不宣称安全 route | 保留 |
| AC-021 | role 缺失不回退到 default/task/任意模型 | 保留 |
| AC-022 | requested 与 resolved 字段严格分离 | 保留（扩展为五类分离） |
| AC-023 | 价格缺失不改变 routing result，单列 SOURCE GAP | 保留 |
| AC-024 | 相同 evidence 集合不能重复同一增量动作 | 保留为 `weconverge_decide` |
| AC-025 | 外部手动 model/effort 变更导致 ownership 放弃 | 保留 |
| AC-026 | off/reset/end/switch 只恢复 Extension 拥有的 effort | 保留 |
| AC-027 | 恢复失败保留 actual 并显示 degraded，不改持久配置 | 保留 |
| AC-028 | status 为只读，未知字段明确显示 unknown/SOURCE GAP | 保留（增加 advisoryNote） |
| AC-029 | 非法命令参数零状态变化 | 保留 |
| AC-030 | audit 不包含隐藏推理、凭据或完整父上下文 | 保留（增加分层/截断） |
| AC-031 | audit 写入失败不会阻断普通 OMP，但显示 degraded | 保留 |
| AC-032 | 路由、任务、SOURCE GAP、BLOCKED、restore、health 可独立组合 | 保留 |
| AC-033 | 所有错误路径无无限重试、无限派发或仍受 Extension 自动控制的后台循环；detached child 保持可见但不参与路由 | 保留 |
| AC-034 | continue_current 与其他动作一样必须有障碍、evidence、新信息和成功判据 | 保留为 `weconverge_decide` |
| AC-035 | 有 confirmed anchor、具体能力缺口、新信息和 falsifier 的证据可通过；纯模型自述被拒绝 | 保留为 `raise_effort` |
| AC-036 | 专业角色与下一档 effort 均合法时选择能补齐能力且相对成本更低者；缺成本时 SOURCE GAP | **RETIRED** — 咨询层为 `inferred` 比较，不强制选择 |
| AC-037 | session resume 仅从审计重放并与 actual 对账；损坏/冲突时不新增自动资源 | 保留 |
| AC-038 | off 将 WEConverge running child 标记 detached，不终止用户 child，迟到结果只审计 | 保留（有界 tombstone） |
| AC-039 | model switch 清空旧 evidence、方向、波次、decision、grant 和 routing ownership | 保留 |
| AC-040 | 人工探索 grant 绑定 generation、限额与 task_end，过期/跨模型不可用且不解除 Max 禁令 | **RETIRED** — 咨询层无强制 grant 派发权 |
| AC-041 | 策略注入失败时普通 OMP 任务继续，WEConverge 不再产生副作用 | 保留 |
| AC-042 | 相同 decisionId 重试不重复派发/提升；不同 payload 复用 ID 被拒绝 | 保留 |
| AC-043 | report_blocked 无 confirmed evidence、无安全替代理由或仍有合法替代时被拒绝 | 保留 |
| AC-044 | report_source_gap 缺 missingFact、requiredSource 或 impact 时被拒绝且不改变 phase | 保留 |

> **机械验收现行集**：以上保留项 + §13.7 CAP-A08 机械层 + §13 咨询层 AC-A / AC-C。

## 19. CAP-014 真实 OMP 验收（历史）

真实 smoke 必须使用安装后的 OMP Extension 和真实会话事件。执行前必须记录 CP-001..010；任一场景依赖的 probe 未通过时，该场景为 BLOCKED，不能通过修改用户 Agent/模型配置、读取内部文件或弱化断言继续。若现场自动 child 角色解析为 Max，则 child/exploration/specialist smoke 按 Max 护栏保持 BLOCKED；不依赖 child 的 Medium baseline smoke 不能代替它们。

| AC | 场景与通过条件 | 咨询层处置 |
|---|---|---|
| AC-101 | 安装与加载：source inventory 证明唯一可编辑源码；安装路径为指向它的 Junction；OMP 正式加载成功且无 Extension load error | 保留 |
| AC-102 | 关闭对照：普通任务 actual model/effort 不变，无 WEConverge child | 保留 |
| AC-103 | 简单任务：当前主模型、Medium、单 Agent，零分类调用 | 保留 |
| AC-104 | 内部搜索：有选中/备用标识，无额外 Provider 请求 | 保留 |
| AC-105 | 外部探索：两个真实 child 有真实 parent link、不同方向/confirmed route；各自 terminal evidence 回答对应 falsifier，结果可区分且来自 OMP 事件 | **RETIRED** — 咨询层以观察 evidence 替代派发成功证据 |
| AC-106 | 深度提升：Medium 两个本质不同失败后只到 High；新验证后才可 XHigh | 保留为 `raise_effort` 观察 |
| AC-107 | 专业角色：capability→OMP role→actual 专业模型链可读回 | **RETIRED** — 同 AC-105 |
| AC-108 | Max 护栏：preflight resolved Max 时无 Provider 调用并明确冲突；若只能事后得知 actual Max，本项 BLOCKED 而非 PASS | **RETIRED** — 咨询层为 `observedIsMax` 标注 |
| AC-109 | SOURCE GAP：移除必要输入后不增加 Agent/effort | 保留为 `report_source_gap` |
| AC-110 | 模型切换：旧 baseline 恢复，旧 evidence/方向/波次/grant 清空，新 generation 建立，迟到 child stale | 保留（有界 tombstone） |
| AC-111 | off 恢复：High/XHigh session 恢复接管前 baseline，running WEConverge child detached，用户 child 未被终止，持久配置 hash 不变 | 保留（detached 为 tombstone） |
| AC-112 | 失败路径：创建失败、超时、读回失败均无 Extension 自动控制的遗留循环；detached child 有明确状态 | 保留 |
| AC-113 | 禁区：OMP 核心、WeOMP、Provider/Agent/global effort 配置无本项目 diff | 保留 |
| AC-114 | 自然 task terminal：无需 off 即恢复接管前 baseline，并有 OMP actual effort 读回 | 保留 |
| AC-115 | 会话重启恢复：审计重放得到同一 generation/state，并与 OMP actual 状态对账 | 保留（`--no-session` 为 degraded） |

### 19.1 真实证据包

每个 smoke 必须保存：

- 基线时间和任务/session ID；
- OMP 正式事件摘录；
- parent/child ID；
- requested role 与 actual resolved agent/model/effort；
- Provider 调用计数或能证明未调用的正式事件；
- decision/audit event；
- terminal result；
- baseline 恢复读回；
- SOURCE GAP 列表；
- 禁区前后 hash/status。
- 权威源码 inventory、junction target 与 OMP Extension load success/error 读回。

缺少 parent link、actual effort 或 Provider 调用前 Max 护栏证据时，对应 AC 不通过；不能用机械测试替代。

---

## 13. 咨询层分层验收（v1.1-advisory — 现行）

### 13.1 机械验收（Mechanical — deterministic, fake ExtensionAPI）

| AC | 验收 | 证据层 |
|---|---|---|
| AC-A01 | `before_agent_start` 返回 `systemPrompt: string[]` 满足：English、咨询性、≤60 tokens / parent Provider request、含 `task(context, tasks:[≤2])` 字面量；generation-scoped 注入事件（`session_start`/`session_switch`/`off→on` 各一次）；可被忽略无强制后效；计费语义 `≤60×T` 正确，陈述实际缓存为 SOURCE GAP | 机械：token 计数、generation 注入去重 |
| AC-A02 | Extension 未注册 `task` wrapper、未调用 `ctx.invokeTool("task")`、未在 `tool_call` 返回 `{block:true}`、未变异 `input`、未取消、不自动派发、不要求 `weconverge_decide` 前置 | 机械：extension 导出/注册断言 |
| AC-A03 | `tool_call` 观察：任意原生 `task` 的 `requested` 参数被记录为 `requested` 事实，不作 `observed` 提升 | 机械：`tool_call` handler |
| AC-A04 | `tool_result` / `task:subagent:lifecycle\|progress\|event` 观察：可得字段记为 `observed`，不可得记 `source_gap`，`progress.resolvedModel` 仅为 `observedModel` | 机械 |
| AC-A05 | 观察者 fail-open：handler 抛错/超时仅记 `health: degraded` + `sourceGaps`，OMP `task` 继续完成 | 机械：抛错 fixture |
| AC-A06 | `weconverge_decide` 窄门：`version==1` 校验；`decisionId` 幂等（同 id 同 payload 返首次，同 id 异 payload 拒绝）；`obstacle/evidenceRefs/expectedNewInformation/successCriterion` 齐全；`report_blocked`/`report_source_gap` 字段门 | 机械 |
| AC-A07 | `relativeCostTier` 永不冒充 `resolvedEffort`；`expected` 不作 `observed`；`requested` 不作 `observed` | 机械：taxonomy fixture |
| AC-A08 | `raise_effort` 合法转换仅 `medium→high→xhigh`，`max` 非目标 | 机械 |
| AC-A09 | `raise_effort` 前置：`reasoning_depth_insufficient` + confirmed evidence + 方向有效 + `effort∈{medium,high}` + 新验证尝试 + session-local 可写可读回 | 机械 |
| AC-A10 | 所有权与恢复：外部变更放弃所有权并 `degraded`；`off/reset/switch/end` 仅恢复 owned effort 并读回，失败记 `failed|degraded` | 机械 |
| AC-A11 | 模型感知 Max：`cost_tiers` 为 `inferred`；原生 `task` 的 Max 仅记 `observedIsMax:true` 咨询标注，不阻断 | 机械 |
| AC-A12 | 咨询限制：`tasks.length>2` / 第三波 / 去重 / `falsifier` 空等仅记 `observed` + advisory note，不拒绝 | 机械 |
| AC-A13 | 运行时：单活 full runtime；`session_switch` 销毁旧 runtime；tombstone 有界（每 generation ≤2，最老丢弃，最小记录） | 机械 |
| AC-A14 | 事实分类永不混淆：任一提升（`requested→observed` / `expected→observed` / `inferred→observed` / `requested→expected`）均失败 | 机械 |
| AC-A15 | 审计：分层 `requested/expected/observed/inferred/source_gap`、脱敏、自由文本 ≤200 chars、凭据/隐藏推理/完整父上下文不记录；写入失败仅 `degraded` | 机械 |
| AC-A16 | 命令：`on/off/status/reset` 参数精确校验；`status` 只读且含 `advisoryNote: pure advisory — no enforcement` 与 `priceTelemetry: SOURCE GAP`；`off` 不取消远端子、`reset` 不改 `enabled` 不删审计 | 机械 |
| AC-A17 | 配置：`modelRoles`/`task.agentModelOverrides` 只读；`enabled` 双轨持久化；`--no-session` 记 `degraded` 而非伪造 | 机械 |

### 13.2 真实 OMP 观察验收（Live — observed, not enforced）

| AC | 场景与通过条件 | 证据层 |
|---|---|---|
| AC-L01 | 安装与加载：source inventory 唯一源码；junction 指向它；OMP 正式加载成功且无 load error | 真实：inventory + junction + load |
| AC-L02 | 策略注入：启用后首个新 generation 的 `before_agent_start` 观测到 `systemPrompt` 含策略文本（≤60 tokens） | 真实：generation 始端事件 |
| AC-L03 | 观察通道：父模型发射原生 `task` 时，`tool_call` observed `requested`、`tool_result` observed `SingleResult[]`、`task:subagent:*` 在有发射时可观测；`resolvedModel` 在有 progress 时可观测，否则记 `source_gap` | 真实：`tool_call`/`tool_result`/`task:subagent:*` |
| AC-L04 | `off` 语义：`off` 后新 `task` 观测记为 `detached`，远端子任务由 OMP 继续执行不被取消；`status` 显示 `phase: disabled` | 真实 |
| AC-L05 | 恢复与切换：`session_switch` 销毁旧 full runtime；`off/reset/end/switch` 的 owned effort 恢复有读回；public session-delete 无事件为 SOURCE GAP | 真实 |

> 注：旧 `AC-105` (两真实 child + parent link + falsifier 区分) / `AC-107` (专业链) / `AC-108` (pre-provider Max 拒绝) 为 **RETIRED**；咨询层不以 Extension 派发成功为通过条件。

### 13.3 成本验收（Cost — token economics, observed）

| AC | 验收 | 证据层 |
|---|---|---|
| AC-C01 | Generation-scoped 策略 token：注入事件每 generation 一次；每 parent Provider request 复用该 policy，最坏 `≤60×T` / T requests，无 prompt-cache 折扣假设；实际计费/缓存为 SOURCE GAP，陈述中不宣称已贴现 | 成本：turn 转录 + policy 长度度量 |
| AC-C02 | 单批原生任务：父模型直接批处理 `task(context, tasks:[≤2])`，Batch 组装成本为父 reasoning+output 一次计费；OMP 负责并发与结果装配；无轮询、无额外 Extension 侧 Provider 调用 | 成本：`tool_call` batch 观测 |
| AC-C03 | 子输出不保证：policy 可建议输出上限，实际长度由 OMP/子模型决定；audit 仅对其副本截断 ≤200 chars，不宣称强制紧凑 | 成本：子输出长度观测 |

### 13.4 Honest audit gates（咨询层）

- `expected` 作 `observed` 失败；
- `relativeCostTier` 作 `resolvedEffort` 失败；
- 观察器抛错 fixture 必须显示 `health: degraded` 且 OMP task 仍完成（fail-open）。

## 20. REQ→AC 完整映射

### 20.1 历史映射（v1.0.0 保留追溯 — 与 §18/§19 一致）

| REQ | AC |
|---|---|
| REQ-001 | AC-101、AC-113 |
| REQ-002 | AC-022、AC-105、AC-107 |
| REQ-003 | AC-030、AC-113 |
| REQ-004 | AC-105、AC-113 |
| REQ-005 | AC-004、AC-103、AC-104 |
| REQ-006 | AC-101 |
| REQ-010 | AC-001、AC-002、AC-102 |
| REQ-011 | AC-003、AC-110 |
| REQ-012 | AC-002、AC-026、AC-027、AC-110、AC-111、AC-114 |
| REQ-013 | AC-025、AC-026、AC-038、AC-110 |
| REQ-020 | AC-004、AC-103 |
| REQ-021 | AC-005、AC-104 |
| REQ-022 | AC-007、AC-010、AC-105 |
| REQ-023 | AC-011、AC-013、AC-014、AC-105 |
| REQ-024 | AC-009、AC-034、AC-036 |
| REQ-025 | AC-006、AC-034、AC-042 |
| REQ-026 | AC-010、AC-024、AC-036 |
| REQ-027 | AC-013、AC-105 |
| REQ-030 | AC-016、AC-106 |
| REQ-031 | AC-018、AC-106 |
| REQ-032 | AC-017、AC-019、AC-108 |
| REQ-033 | AC-026、AC-027、AC-111、AC-113 |
| REQ-040 | AC-021、AC-107 |
| REQ-041 | AC-020、AC-022、AC-105、AC-107 |
| REQ-042 | AC-019、AC-108 |
| REQ-043 | AC-023、AC-036 |
| REQ-044 | AC-011、AC-012、AC-040、AC-105 |
| REQ-045 | AC-004、AC-006、AC-103、AC-104 |
| REQ-050 | AC-007、AC-010、AC-035、AC-106 |
| REQ-051 | AC-023、AC-032、AC-043、AC-044、AC-109 |
| REQ-052 | AC-008、AC-044、AC-109 |
| REQ-053 | AC-015、AC-038、AC-039、AC-110 |
| REQ-060 | AC-002、AC-028、AC-029、AC-111 |
| REQ-061 | AC-028 |
| REQ-062 | AC-022、AC-030、AC-105、AC-107 |
| REQ-063 | AC-030 |
| REQ-064 | AC-020、AC-022、AC-023 |
| REQ-070 | AC-027、AC-031、AC-033、AC-037、AC-041、AC-112、AC-115 |
| REQ-071 | AC-021、AC-112 |
| REQ-080 | AC-001..044 |
| REQ-081 | AC-101..115 |
| REQ-082 | AC-022、AC-101..115 |
| REQ-083 | AC-101、AC-113 |

### 20.2 现行映射（v1.1-advisory — 实施依据）

| 咨询 REQ | CAP-A | 现行 AC |
|---|---|---|
| REQ-100 | CAP-A01, CAP-A08 | AC-A01, AC-C01 |
| REQ-101 | CAP-A02, CAP-A08 | AC-A02 |
| REQ-102 | CAP-A02, CAP-A08 | AC-A03, AC-A04, AC-L03 |
| REQ-103 | CAP-A02, CAP-A08 | AC-A05 |
| REQ-104 | CAP-A05 | AC-A08, AC-A09, AC-L05 |
| REQ-105 | CAP-A04, CAP-A05 | AC-A06, AC-A07, AC-A08..A10 |
| REQ-106 | CAP-A06, CAP-A03 | AC-A11, AC-A07, AC-A15 |
| REQ-107 | CAP-A06, CAP-A03 | AC-A11, AC-A07 |
| REQ-108 | CAP-A06 | AC-A12 |
| REQ-109 | CAP-A07 | AC-A13, AC-L05 |
| REQ-110 | CAP-A03, CAP-A10 | AC-A14, AC-A15 |
| REQ-111 | CAP-A10, CAP-A03 | AC-A15, AC-A14 |
| REQ-112 | CAP-A09 | AC-A16 |
| REQ-113 | CAP-A11 | AC-A17 |
| REQ-114 | CAP-A04, CAP-A05 | AC-A06, AC-A08, AC-A09 |
| REQ-115 | CAP-A01, CAP-A02, CAP-A08 | AC-C01, AC-C02, AC-C03 |

> 每个咨询 REQ 至少映射一个可证伪 `AC-A/L/C`；无映射即为退化。

## 21. 批准设计防退化矩阵

| 设计硬约束 | SPEC 锁定点（v1.0.0） | 咨询层锁定点（v1.1-advisory） |
|---|---|---|
| 独立 OMP Extension，不改核心 | CAP-001、AC-101、AC-113 | CAP-A02, AC-A02, AC-L01 |
| 默认关闭，启用后持续 | CAP-002、AC-001..003 | CAP-A01, CAP-A09, AC-A16 |
| 当前主模型、Medium、单 Agent | CAP-003、AC-004、AC-103 | CAP-A01, AC-A01 |
| 无前置分类调用 | CAP-003/CAP-008、AC-004、AC-103..104 | CAP-A01/A02, AC-A01/A02, AC-C02 |
| 内部多方案，只执行一个 | CAP-003、AC-005、AC-104 | CAP-A01, AC-A01 |
| 不收敛后外部独立探路 | CAP-004/005、AC-010..015、AC-105 | CAP-A02 (观察), AC-A03/A04/L03, 原强制门 RETIRED |
| 困难类型决定动作 | CAP-004、AC-009 | CAP-A04, AC-A06 |
| AI 不分配 token/model ID | §4.3、AC-006 | §4.3 (窄门), AC-A06 |
| Medium→High→XHigh | CAP-006、AC-016..018、AC-106 | CAP-A05, AC-A08..A09 (仅父) |
| 永不自动 Max | CAP-006/008、AC-017/019、AC-108 | CAP-A06 (模型感知), AC-A11 (咨询标注) |
| 每波≤2、最多2波 | CAP-005/008、AC-011..012 | CAP-A06 (咨询值), AC-A12 |
| 复用 OMP 角色 | CAP-007、AC-105/107 | CAP-A06, AC-A11 (expected) |
| actual route 独立读回 | §4.4、CAP-007、AC-022、AC-105/107 | §4.4-A, CAP-A03, AC-A07/A14 |
| SOURCE GAP/BLOCKED 分离 | CAP-009、AC-008/023/032/109 | CAP-A03/A10, AC-A14/A15 |
| session/model 切换恢复 | CAP-002/006/012、AC-025..027、AC-037..039、AC-110..115 | CAP-A07/A05, AC-A10/A13/L05 |
| 迟到结果 stale | CAP-005/012、AC-015/110 | CAP-A07, AC-A13 |
| 命令/status | CAP-010、AC-028..029 | CAP-A09, AC-A16 |
| 调度审计与脱敏 | CAP-011、AC-030..031 | CAP-A10, AC-A15 |
| 无无限后台探索 | CAP-012、AC-033/112 | CAP-A02/A07, AC-A02/A13 |
| 真实 OMP smoke | CAP-014、AC-101..115 | CAP-A08, AC-L01..L05 |
| 价格/额度缺失保留 SOURCE GAP | CAP-008/009、AC-023 | CAP-A03/A06, AC-A07/A15, AC-L03 |

矩阵任一行在后续技术设计、计划、任务或实现中缺失，均视为退化并阻断交付。

## 22. 完成判定

### 22.1 历史完成判定（v1.0.0 保留追溯）

WEConverge v1 只有在以下全部成立时完成：

1. 所有 REQ 有 CAP 与 AC；
2. AC-001..044 全部通过；
3. AC-101..115 全部通过；
4. 关键 OMP API 能力无未解决 BLOCKED；
5. 自动实际 route 中没有 Max；
6. 没有 Extension 所有的未恢复 effort 或仍参与自动路由的后台 child；detached child 必须可见且结果不再触发决策；
7. 请求 route 与 actual route 分离且可读回；
8. SOURCE GAP 没有被误报为失败、BLOCKED 或 PASS；
9. 禁区无 diff；
10. Owner 完成最终验收。

部分机械测试、命令成功、Extension 加载成功或模型自述均不构成完成。

### 22.2 咨询层完成判定（v1.1-advisory — 现行）

WEConverge v1.1-advisory 只有在以下全部成立时完成：

1. §20.2 现行 `REQ-100..115 → CAP-A → AC-A/L/C` 全部有映射且无占位；
2. 机械层 `AC-A01..A17` 与成本层 `AC-C01..C03` 全部通过（确定性）；
3. 真实观察层 `AC-L01..L05` 对咨询合同有观测证据，且无退役 AC 被标记 PASS（见 §0.3）；
4. `requested/expected/observed/inferred/source_gap` 永不混淆；
5. `priceTelemetry: SOURCE GAP` 与 `resolvedEffort: source_gap` 诚实呈现；
6. 运行时为单活 full runtime + 有界 tombstones，无第二调度器/无轮询/无额外 LLM 调用，public session-delete 为 SOURCE GAP；
7. 无 `task` 强制（block/mutation/cancel/auto-dispatch）；
8. 禁区无 diff；
9. Owner 完成最终验收。
