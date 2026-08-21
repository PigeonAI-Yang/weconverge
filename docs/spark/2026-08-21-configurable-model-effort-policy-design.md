# 可配置按模型自动 effort 阶梯设计（Owner-approved）

- 日期：2026-08-21
- 状态：Owner-approved design-only — 仅作设计记录，不授权实现
- 权威目录：`J:/PigeonYang/tools/weconverge`
- 上游基线：`docs/spark/2026-08-20-weconverge-pure-advisory-design.md`（pure advisory，Owner-approved）、`docs/spark/2026-08-19-weconverge-design.md`、`PRD.md v1.1.0-advisory`、`SPEC.md v1.1.0-advisory`、`TECHNICAL_DESIGN.md v1.1.0-advisory`
- 范围：Documentation only。本文仅冻结可配置按模型自动 effort 阶梯的产品契约与验收门槛，不修改任何实现、PRD/SPEC/TECHNICAL_DESIGN/README、配置、测试或其它文件；不含实现计划。
- 约束：实现阶段源码中不得出现任何硬编码模型名（包括 Sol/K3/Kimi 等）；不得引入按次用户授权工作流；native `task` 保持咨询观察、不阻断。

> **实施授权边界**：本文是设计记录，不授权 PRD、SPEC、技术设计、源码、测试、ledger 或 OMP core 的任何修改。实现需另行授权，并按本文第 11 节契约文件清单更新。

---

## 1. 背景与问题

### 1.1 背景
WEConverge 现行纯咨询层（2026-08-20）已将 `weconverge_decide: raise_effort` 收敛为仅作用于父会话的 `medium→high→xhigh` 固定阶梯，`max` 非自动目标；原生 `task` 的 Max 仅作 `observedIsMax` 咨询标注、不阻断；`resolvedEffort` 为 `source_gap`。该固定阶梯不区分模型能力差异：同一阶梯同时约束所有 provider/model，而实际路由中不同模型的可用档位、兼容档位与成本差异显著。

### 1.2 问题
1. 无法为不同模型声明不同的自动升级路径（例如某模型仅支持 `high→xhigh`，某模型可自动 `xhigh→max`）。
2. 固定阶梯将 `max` 一律排除在自动路径之外，无法在用户显式配置的情况下允许特定模型自动升至 `max`。
3. 缺少用户可审计、可配置的“模型→阶梯”绑定：无法以 `settings.json` 声明式表达并在 `status`/audit 中可读回验证。
4. 未定义“可用但未配置/未命中/不可读”的回退与错误语义：缺省行为、配置错误时的熔断、非连续阶梯、当前档位不在阶梯内等情况无契约。

---

## 2. 目标与非目标

### 2.1 目标
- 在既有 `settings.json` 内新增可配置的按模型自动 effort 阶梯，以有序首匹配 glob 规则将 canonical model ID 映射到其专属自动升档阶梯。
- 保留与纯咨询层一致的 advisory 语义：阶梯仅作用于 `weconverge_decide: raise_effort` 的父会话自动升档，不影响原生 `task` 的派发与执行。
- 明确缺省、回退、不可读、冲突与校验语义，使校验失败可被 `status`/health 明确报告且自动升档被禁用。
- 使 `status`、audit、decision 结果与原因码完全可审计、可复现、无占位符。

### 2.2 非目标
- 不新增执行期按次用户授权工作流：自动升档是否发生由规则与前置条件决定，不弹出或等待用户确认。
- 不引入硬编码模型名：实现源码中不得出现任何具体 provider/model 字面量（含 Sol/K3/Kimi 等）；所有模型绑定均来自配置。
- 不改变原生 `task` 的派发、阻断或取消语义：`task` 保持 advisory 观察、不阻断。
- 不改变现有 `modelRoles` / `task.agentModelOverrides` 的权威路由表职责；阶梯仅决定“从当前 effort 下一步升到哪一档”。
- 不引入新的持久化文件或独立配置通道：复用既有 `settings.json`。

---

## 3. Owner 已核准决定

1. **可配置按模型阶梯（D-09）**：Owner 核准以有序首匹配 glob 规则在 `settings.json` 内配置按模型自动 effort 阶梯。
2. **配置位置（D-10）**：阶梯配置置于既有 `settings.json` 顶层新增 `effortPolicies` 块内，不新增配置通道；缺省块缺席时采用通用兼容缺省阶梯。
3. **匹配语义（D-11）**：规则按配置顺序首匹配；glob 仅含 `*` 与 `?`、大小写敏感、匹配完整 canonical `provider/model` ID；effort 后缀不参与 glob 匹配，另行以阶梯声明。
4. **必选 default（D-12）**：`effortPolicies` 若存在则必须包含 `default` 阶梯；其作为已知但未命中模型的回退。
5. **源码零模型名（D-13）**：实现源码不得硬编码任何模型名（含 Sol/K3/Kimi 等）；全部模型字面量仅出现在用户配置与测试/验收虚构样例中。
6. **失效即禁用（D-14）**：`effortPolicies` 存在但校验失败时，`raise_effort` 自动升档被禁用，`health`/`status` 报告 `CONFIG ERROR`。
7. **非连续阶梯允许（D-15）**：阶梯可非连续（例如 `medium→xhigh` 跳过 `high`），每次仅升至已配置的下一阶，不补中阶。
8. **Max 可自动（D-16）**：当某条阶梯显式包含 `max` 时，`max` 可成为该模型的自动升档目标；未包含 `max` 的阶梯仍保持 `max` 非自动。
9. **按次解析（D-17）**：每次 `raise_effort` 均按当时 `actualModel` 与 `actualEffort` 解析适用的阶梯与下一阶。
10. **切换重匹配（D-18）**：模型切换后下一次 `raise_effort` 按新模型的匹配规则重匹配阶梯。
11. **无按次授权（D-19）**：不引入按次用户授权工作流；自动升档由规则与既有 `raise_effort` 前置条件（`reasoning_depth_insufficient`、已确认证据、新验证、session-local 可写可读回等）共同决定。
12. **可审计性（D-20）**：`status`/audit 必须暴露所用规则、阶梯与原因码；无效配置与 policy conflict 必须以确切原因码呈现。

---

## 4. 配置契约：`settings.json` 内的 JSON Schema

### 4.1 位置与兼容
- 位置：既有 `settings.json` 顶层新增可选对象 `effortPolicies`。既有字段（`schemaVersion`、`enabled`、`maxParallelExplorers`、`maxExplorationWaves`、`capabilities`、`relativeCostTiers`、`effortCostTiers` 等）保持不变。
- 兼容：`effortPolicies` 缺席视为未配置，采用第 5 节通用兼容缺省阶梯，不视为配置错误。

### 4.2 Schema（TypeScript 形式，规范性）

```ts
type EffortLevel = "medium" | "high" | "xhigh" | "max";

interface EffortPoliciesBlock {
  // 有序首匹配规则；按数组顺序评估，首条匹配即止。
  rules: Array<{
    // 匹配模式（glob），大小写敏感，匹配完整 canonical provider/model ID。
    // 仅允许字符：可见字符 + 通配符 * 与 ?；不支持 **、字符类、转义序列、正则。
    // effort 后缀不参与匹配（见 4.4）。
    match: string;
    // 该匹配模型的自动升档阶梯：有序、去重、升序、子集于 EffortLevel。
    automaticEfforts: EffortLevel[];
  }>;
  // 未命中回退：当 actualModel 已知但未被任何 rule 命中时使用。
  // 必选当 effortPolicies 存在时；缺省块缺席而 effortPolicies 缺席则由 5 节兼容缺省兜底。
  default: {
    automaticEfforts: EffortLevel[];
  };
}
```

```ts
// settings.json 顶层增量（其余字段不变）
interface SettingsJsonV1WithEffortPolicies extends SettingsJsonV1 {
  effortPolicies?: EffortPoliciesBlock;
}
```

### 4.3 约束形式化
- `automaticEfforts` 必须非空（`length >= 1`），元素唯一且按 `medium < high < xhigh < max` 严格升序。
- `match` 必须非空字符串且为合法 glob（见 4.4）；空串或仅空白视为非法。
- `rules` 可为空数组（此时所有已知模型均走 `default`），但若 `effortPolicies` 存在则 `default.automaticEfforts` 必须满足上述阶梯约束且为必选。
- 规则去重与遮蔽：`match` 精确重复视为重复错误；被前序规则完全遮蔽（shadowing）的后序规则视为校验错误。

### 4.4 glob 语义（规范性）
- 运算符：`*` 匹配零或多个任意字符（不含路径分隔语义，视为普通字符集上的通配）；`?` 匹配恰好一个任意字符。
- 不支持：`**`、`[class]`、`{a,b}`、`\` 转义、正则。出现即视为非法 glob。
- 大小写敏感：`OpenAI/GPT-4` 与 `openai/gpt-4` 不等价。
- 匹配对象：完整 canonical `provider/model` ID 字符串全量匹配（等价于 `^glob$`），非子串匹配。
- effort 后缀分离：canonical ID 不含 effort 后缀；`provider/model:effort` 形式中的 `:effort` 部分不参与 glob 匹配，匹配前必须剥离后缀。

---

## 5. 缺省与错误语义

### 5.1 缺席块的通用兼容缺省
当 `settings.json` 中 `effortPolicies` 完全缺席时，系统采用通用兼容缺省阶梯：`medium→high→xhigh`。该缺省阶梯适用于所有模型，等价于纯咨询层固定阶梯，且永不自动升至 `max`。此分支不产生 `CONFIG ERROR`，`status` 中以来源 `default:builtin-compat` 呈现。

### 5.2 存在块但无效：禁用与报告
当 `effortPolicies` 存在但校验失败（任一 6 节规则不满足）时：
- `weconverge_decide: raise_effort` 的自动升档被禁用（fail-closed 仅此窄门；不影响 `report_source_gap`/`report_blocked` 等非升档路径）。
- `health` 置为 `degraded`，`status.healthDetail` 与 `status.effortPolicyStatus` 报告 `CONFIG ERROR`，并附首个错误码与可读说明。
- `status` 仍可读，但 `effortPolicies.effective` 置为 `null`，`nextEffort` 为 `null`。
---

## 6. 校验规则（存在块时强制）
按出现顺序校验，任一失败即整体 `effortPolicies` 无效（5.2）：

1. **非空**：每条 `rule.automaticEfforts` 与 `default.automaticEfforts` 均 `length >= 1`。
2. **官方 efforts**：`automaticEfforts` 元素仅允许 `medium|high|xhigh|max`。
3. **唯一**：`automaticEfforts` 内无重复值。
4. **升序**：`automaticEfforts` 按 `medium < high < xhigh < max` 严格升序；乱序或降序非法。
5. **合法 glob**：`match` 非空、非空白、仅含 `*`/`?` 为通配符；含 `**`、`[`、`]`、`{`、`}`、`\` 等非法形态即非法。
6. **重复与遮蔽**：`match` 精确重复；或某条后序规则的匹配集被前序规则完全包含（shadowing）—— 判定为校验错误。实现以规范性示例为准：若前序为 `acme/*`，后序 `acme/foo` 为被遮蔽。

## 7. 非连续阶梯

阶梯可非连续。例：`["medium","xhigh"]` 合法且表示 `medium→xhigh` 跳过 `high`。每次 `raise_effort` 仅升至该阶梯中的下一阶，不插入未配置的中阶；若当前档位已为阶梯末位则无下一阶。

---

## 8. 运行时解析

### 8.1 按次解析 actualModel 与 actualEffort
每次 `raise_effort` 决策时，系统按当时可读回的 `actualModel`（`ctx.models.current()`）与 `actualEffort`（`ctx.getThinkingLevel()` 映射）解析：
- 以 `actualModel` 的 canonical ID 剥离 effort 后缀后，按 `rules` 顺序首匹配 `match` 得到 `matchedRule`；未命中则取 `default`。
- 以 `actualEffort` 在所选 `automaticEfforts` 中定位当前位置，下一阶为 `automaticEfforts[index+1]`。

### 8.2 未命中已知模型的回退
当 `actualModel` 可读但未被任何 `match` 命中时，使用 `default.automaticEfforts`。此分支为正常回退，不产生错误；`status` 记录 `matchedRule: "default"`。

### 8.3 不可读模型的 SOURCE GAP
当 `actualModel` 不可读（`ctx.models.current()` 返回 `null/undefined`）时，`raise_effort` 不得解析阶梯，记为 `source_gap`，原因码 `SOURCE_GAP_ACTUAL_MODEL_UNREADABLE`，不产生 effort 变更。

### 8.4 当前档位不在阶梯内：policy conflict
当 `actualEffort` 可读但不存在于所选 `automaticEfforts` 中（例如 `actualEffort=high` 而 `automaticEfforts=["medium","xhigh"]`），视为 policy conflict：
- `raise_effort` 被拒绝，原因码 `POLICY_CONFLICT_CURRENT_NOT_IN_LADDER`。
- `status` 置 `effortPolicyStatus: "policy_conflict"`，`health: degraded`，audit 记录 `policyConflict` 详情。

### 8.5 仅下一阶
`raise_effort` 每次仅允许升至已配置的下一阶（`automaticEfforts[index+1]`）。跨阶跳升不被允许；若已处末位则 `NO_NEXT_RUNG`。

### 8.6 已配置的 Max 可自动
当所选 `automaticEfforts` 显式包含 `max` 且 `actualEffort` 的下一阶为 `max` 时，`max` 可成为自动升档目标。此为 D-09/D-16 的显式例外：仅当配置包含 `max` 时自动 `→max` 合法；否则 `max` 仍非自动目标。

### 8.7 模型切换重匹配
模型切换（`session_before_switch` / `before_agent_start` / `modelSwitch` 边界）后，下一次 `raise_effort` 按新 `actualModel` 重新首匹配规则并重算下一阶；不沿用旧模型的匹配结果。

### 8.8 native task 保持咨询观察
原生 `task`（父模型直接发射的 `task(tasks:[...])`）不经 effort 阶梯门控：不阻断、不改写、不取消。阶梯仅作用于 `weconverge_decide: raise_effort` 的父会话 effort 变更。原生 `task` 的路由与 effort 仅作 `observed` 记录，必要时附加 `observedIsMax` 咨询标注。

---

## 9. 可观测性：status 与 audit

### 9.1 `status` 新增字段（只读）

```ts
interface StatusEffortPolicyView {
  // 整体状态
  effortPolicyStatus: "ok" | "builtin-compat" | "config_error" | "policy_conflict" | "source_gap";
  // 校验与健康
  healthDetail: string | null; // CONFIG ERROR 首错说明或 null
  // 有效配置回显
  effective: {
    matchedRule: string | null; // 命中的 match 或 "default" 或 "builtin-compat" 或 null（错误/不可读时）
    automaticEfforts: EffortLevel[] | null;
    nextEffort: EffortLevel | null;
    source: "rule" | "default" | "builtin-compat" | null;
  } | null;
  // 校验错误明细（仅 config_error 时非空）
  validationErrors: Array<{ code: string; message: string }>;
}
```

`status` 顶层同时保留既有 `actualModel/actualEffort/effortOwner/health/sourceGaps/priceTelemetry` 等字段，不删除或重命名。

### 9.2 audit 事件增量
每条 `weconverge_audit` 事件在 `raise_effort` 路径新增：

```ts
interface AuditEffortPolicyFields {
  requestedEffort: EffortLevel | null;
  actualModel: string | null;
  actualEffort: EffortLevel | "unknown" | null;
  matchedRule: string | null; // match 或 "default" 或 null
  automaticEfforts: EffortLevel[] | null;
  nextEffort: EffortLevel | null;
  reasonCode: string | null; // 见 9.3
  policySource: "rule" | "default" | "builtin-compat" | null;
}
```

### 9.3 原因码（精确、穷尽）

| 场景 | `reasonCode` | `effortPolicyStatus` | 行为 |
|---|---|---|---|
| 命中规则并成功升档 | `ACCEPTED_NEXT_RUNG` | `ok` | 执行 `setThinkingLevel(next)` 并读回 |
| 默认回退成功升档 | `ACCEPTED_DEFAULT_NEXT_RUNG` | `ok` | 同上，`matchedRule="default"` |
| 已处阶梯末位无下一阶 | `REJECTED_NO_NEXT_RUNG` | `ok` | 拒绝升档 |
| 当前档位不在阶梯内 | `POLICY_CONFLICT_CURRENT_NOT_IN_LADDER` | `policy_conflict` | 拒绝升档，`health: degraded` |
| `actualModel` 不可读 | `SOURCE_GAP_ACTUAL_MODEL_UNREADABLE` | `source_gap` | 拒绝升档 |
| `actualEffort` 不可读 | `SOURCE_GAP_ACTUAL_EFFORT_UNREADABLE` | `source_gap` | 拒绝升档 |
| 配置校验失败 | `BLOCKED_CONFIG_ERROR` | `config_error` | 禁用自动升档，`health: degraded` |
| 被重复/遮蔽规则命中（校验期） | `BLOCKED_DUPLICATE_OR_SHADOWED_RULE` | `config_error` | 同上 |
| 非法 glob | `BLOCKED_INVALID_GLOB` | `config_error` | 同上 |
| 非法 automaticEfforts（空/重复/乱序/非法值） | `BLOCKED_INVALID_LADDER` | `config_error` | 同上 |
| 缺少必选 default | `BLOCKED_MISSING_DEFAULT` | `config_error` | 同上 |

`accepted`/`rejected`/`blocked`/`source_gap` 四类原因码永不混淆；`accepted` 仅在实际执行 `setThinkingLevel` 前置校验全部通过且读回成功时产生。

---

## 10. 设置后读回（post-set readback）

`raise_effort` 执行 `setThinkingLevel(nextEffort)` 后必须立即读回 `actualEffort`（`ctx.getThinkingLevel()`）与 `actualModel`：
- 读回一致：audit 记 `ACCEPTED_*`，`status` 更新 `currentEffort`。
- 读回不一致或不可读：记 `failed`/`degraded`，`restoreState` 按既有恢复契约处理，不二次重试；错误不被吞没。

---

## 11. 实现契约：后续实现必须更新的文件

后续实现授权后，至少需更新以下文件以兑现本设计（仅列契约，不含实现计划）：

- `src/core/config.ts` — 新增 `effortPolicies` 校验（第 6 节）与 `CONFIG ERROR` 熔断语义。
- `src/core/types.ts` — 新增 `EffortPoliciesBlock`、`StatusEffortPolicyView`、`AuditEffortPolicyFields` 及 `EffortLevel` 复用。
- `src/core/decision.ts` — `raise_effort` 按次解析 actualModel/actualEffort、首匹配、非连续下一阶、Max 可自动、policy conflict 与原因码。
- `src/core/state.ts` — `modelSwitch` 后重匹配语义与状态视图。
- `src/core/audit.ts` — audit 增量字段与脱敏/截断规则延续。
- `src/extension.ts` — wiring：`settings.json` 读取、校验失败时禁用 `raise_effort`、health/status 熔断、`before_agent_start` 不变。
- `src/core/status.ts`（或等价状态渲染）— `status` 新增视图与错误呈现。
- `PRD.md` — 增补按模型阶梯需求与验收入口。
- `SPEC.md` / `TECHNICAL_DESIGN.md` — 将本设计提升为规范性条款（实现阶段另行提案，不在本文修改）。
- `README.md` / `README.txt` — 更新面向用户的可配置阶梯说明与示例（不含硬编码模型名）。
- `test/mechanical.test.ts` 与 `test/extension.integration.test.ts`（或新增专用测试）— 覆盖 13 项验收场景；源码测试中使用的模型 ID 必须为虚构 ID，不得使用真实产品模型名。
---

## 12. 方案比较与选型理由

### 12.1 已考虑方案
1. **有序首匹配 glob（本文选型）**：规则按声明顺序首匹配；`*`/`?`、大小写敏感、全量匹配、effort 后缀分离。
2. **最长前缀/最具体匹配**：按匹配长度或特异度排序，自动选择“最具体”规则。
3. **正则表达式表**：每条规则为完整正则，支持字符类与分组。
4. **精确映射表**：仅允许 `provider/model` 精确键，无通配。

### 12.2 为何选择有序首匹配
- **可预测性与可审计性**：声明顺序即优先级，无需推断“最具体”度量；`status` 可直接报告 `matchedRule` 为命中项。
- **用户可控遮蔽**：用户可将高优先级例外置顶（如 `acme/critical-*`），通用兜底置底（如 `*/*`），实现意图即所得。
- **最小惊讶**：`most-specific` 的特异度算法在 `*`/`?` 并存时易产生歧义与实现分歧；有序首匹配无歧义且易于形式化验证与测试。
- **兼容既有心智**：OMP 侧 `modelRoles` 与常见 glob 工具链均以有序评估为直觉模型；学习成本最低。
- **无正则风险**：正则带来复杂度、回溯与校验负担，且与“仅 `*`/`?`”的最小能力集不匹配；精确表则无法表达批量模型族。

---

## 13. 验收场景（13 项，使用虚构模型 ID）

> 约定：以下模型 ID 均为虚构，仅用于验收；实现源码不得出现这些字面量以外的硬编码模型名。`actualModel` 为 canonical `provider/model`，`actualEffort` 为当前 effort，`automaticEfforts` 为匹配到的阶梯（JSON 键为 `match`/`automaticEfforts`，语义为 glob/阶梯）。

### AC-01 有序首匹配命中首条
- 配置：`rules=[{match:"acme/f*", automaticEfforts:["medium","high"]},{match:"acme/*o", automaticEfforts:["high","xhigh"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 当时：`actualModel="acme/foo", actualEffort="medium"`
- 期望：`acme/foo` 同时匹配 `acme/f*` 与 `acme/*o`，但按首匹配命中 `acme/f*`（首条），`nextEffort="high"`，原因码 `ACCEPTED_NEXT_RUNG`，`matchedRule="acme/f*"`；两条规则互不完全遮蔽，校验通过。

### AC-02 未命中回退 default
- 配置：`rules=[{match:"acme/*", automaticEfforts:["medium","high"]}], default:{automaticEfforts:["high","xhigh"]}`
- 当时：`actualModel="other/bar", actualEffort="high"`
- 期望：未命中任何 rule，走 `default`，`nextEffort="xhigh"`，`ACCEPTED_DEFAULT_NEXT_RUNG`。

### AC-03 大小写敏感区分
- 配置：`rules=[{match:"Acme/Foo", automaticEfforts:["medium","high"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 当时：`actualModel="acme/foo", actualEffort="medium"`
- 期望：大小写敏感导致不命中 `Acme/Foo`，回退 `default`，`nextEffort="high"`。

### AC-04 effort 后缀分离
- 配置：`rules=[{match:"acme/foo", automaticEfforts:["medium","high","xhigh"]}], default:{automaticEfforts:["medium","high"]}`
- 当时：`actualModel="acme/foo"`（自 `acme/foo:xhigh` 剥离后缀后匹配），`actualEffort="high"`
- 期望：`acme/foo:xhigh` 仍命中 `acme/foo`，`nextEffort="xhigh"`。

### AC-05 缺席块走通用兼容缺省
- 配置：`effortPolicies` 缺席。
- 当时：`actualModel="any/model", actualEffort="medium"`
- 期望：采用内置兼容 `medium→high→xhigh`，`nextEffort="high"`，`status.effortPolicyStatus="builtin-compat"`，无 `CONFIG ERROR`。

### AC-06 存在块但非法：禁用与 CONFIG ERROR
- 配置：`rules=[{match:"", automaticEfforts:["medium","high"]}], default:{automaticEfforts:["medium","high"]}`（空 match 非法）
- 当时：任意 `raise_effort`
- 期望：`raise_effort` 被禁用，`BLOCKED_CONFIG_ERROR` / `BLOCKED_INVALID_GLOB`，`health: degraded`，`status` 报告 `CONFIG ERROR`，`effective=null`。

### AC-07 非连续阶梯跳升
- 配置：`rules=[{match:"acme/*", automaticEfforts:["medium","xhigh"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 当时：`actualModel="acme/bar", actualEffort="medium"`
- 期望：跳过 `high`，`nextEffort="xhigh"`，`ACCEPTED_NEXT_RUNG`。

### AC-08 已配置 Max 的自动升档
- 配置：`rules=[{match:"acme/*", automaticEfforts:["high","xhigh","max"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 当时：`actualModel="acme/bar", actualEffort="xhigh"`
- 期望：`nextEffort="max"`，`ACCEPTED_NEXT_RUNG`；若 `automaticEfforts` 未含 `max` 则 `REJECTED_NO_NEXT_RUNG`。

### AC-09 当前档位不在阶梯内：policy conflict
- 配置：`rules=[{match:"acme/*", automaticEfforts:["medium","xhigh"]}], default:{automaticEfforts:["medium","xhigh"]}`
- 当时：`actualModel="acme/bar", actualEffort="high"`
- 期望：拒绝升档，`POLICY_CONFLICT_CURRENT_NOT_IN_LADDER`，`effortPolicyStatus="policy_conflict"`，`health: degraded`。

### AC-10 actualModel 不可读：SOURCE GAP
- 配置：任意合法 `effortPolicies`。
- 当时：`ctx.models.current()` 返回 `null/undefined`，`actualEffort="medium"`
- 期望：`SOURCE_GAP_ACTUAL_MODEL_UNREADABLE`，不变更 effort。

### AC-11 模型切换重匹配
- 配置：`rules=[{match:"acme/*", automaticEfforts:["medium","high"]},{match:"other/*", automaticEfforts:["high","xhigh","max"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 步骤：`actualModel="acme/foo", actualEffort="medium" → next=high`；切换后 `actualModel="other/bar", actualEffort="high"`
- 期望：切换后重匹配 `other/*`，`nextEffort="xhigh"`（后续可至 `max`），`matchedRule="other/*"`。

### AC-12 `?` 单字符通配与 `*` 零字符
- 配置：`rules=[{match:"acme/fo?", automaticEfforts:["medium","high"]},{match:"acme/*", automaticEfforts:["high","xhigh"]}], default:{automaticEfforts:["medium","high","xhigh"]}`
- 当时：`actualModel="acme/foo", actualEffort="medium"` 命中 `acme/fo?`；`actualModel="acme/", actualEffort="high"` 命中 `acme/*` 的零字符分支
- 期望：前者 `next=high`，后者 `next=xhigh`，均 `ACCEPTED_NEXT_RUNG`。

### AC-13 重复/遮蔽校验
- 配置：`rules=[{match:"acme/*", automaticEfforts:["medium","high"]},{match:"acme/*", automaticEfforts:["high","xhigh"]}], default:{automaticEfforts:["medium","high"]}`（重复）
- 或 `rules=[{match:"acme/*", automaticEfforts:["medium","high"]},{match:"acme/foo", automaticEfforts:["high","xhigh"]}], default:{automaticEfforts:["medium","high"]}`（`acme/foo` 被 `acme/*` 完全遮蔽）
- 期望：校验失败，`BLOCKED_DUPLICATE_OR_SHADOWED_RULE`，`raise_effort` 禁用，`CONFIG ERROR`。
---

## 14. 显式非目标重申

- 本设计**不引入按次用户授权工作流**：自动升档不等待、不弹出、不阻塞于用户确认；是否升档由规则匹配、阶梯位置与既有 `raise_effort` 前置条件共同决定。
- 实现源码中**不得出现任何硬编码模型名**，包括但不限于 `Sol`、`K3`、`Kimi` 等字面量；所有模型绑定仅来自用户配置与验收虚构样例。

---

## 15. 自检记录

- 无 `TODO`/`TBD`/占位符：全文以确定性契约与穷尽原因码呈现，未留待定项。
- 无矛盾：缺席块采用内置兼容缺省（5.1），存在块无效则禁用（5.2，已移除按次手动授权表述）与跳升/Max 可自动（7/8.6）正交且不冲突；native `task` 不阻断（8.8）与 `raise_effort` 窄门一致。
- 无歧义：glob 运算符、大小写敏感、完整匹配、后缀分离、重复/遮蔽判定均形式化定义且配验收样例；AC-01 已修正为 `acme/f*`/`acme/*o` 互不完全遮蔽的首匹配用例。
- 键名一致性：全篇 JSON/schema/status/audit/配置与验收示例的键名已统一为 Owner 核准的 `match`/`automaticEfforts`，概念 prose 仍可用 glob/阶梯表述。
- 合约完整性：实现契约清单（第 11 节）已补齐 `PRD.md` 与 `README.md`/`README.txt`，与 `SPEC.md`/`TECHNICAL_DESIGN.md` 并列。
- 无实现范围外溢：本文仅为设计记录，未修改任何实现、PRD/SPEC、技术设计、README、配置、测试或其它文件；实现文件清单仅作契约声明（第 11 节）。
- 验收完整性：13 项场景覆盖首匹配、回退、大小写、后缀分离、缺省、非法禁用、非连续、Max 可自动、policy conflict、SOURCE GAP、切换重匹配、`?`/`*` 语义、重复/遮蔽；AC-01 首匹配已确保两条规则均命中但首条胜出且不触发遮蔽校验。
