# WEConverge — OMP AI-native 调度策略层设计

- 日期：2026-08-19
- 状态：已获用户批准，待书面复核
- 产品：WEConverge（WE 表示“我们”）
- 形态：Oh My Pi 用户级 Extension
- 权威源码目录：`J:\PigeonYang\tools\weconverge`
- 未来安装目录：OMP 用户 Extension 目录中的 junction

## 1. 产品定义

WEConverge 是 OMP 原生 Agent、模型角色和 Task 派遣机制之上的 AI-native 调度策略层。

它不重新实现 Lead、Task、Scout、Designer、Reviewer 等 Agent，也不成为一个独立的总控 LLM。它向正在执行任务的主力 AI 提供一套成本递增的能力工具箱，使 AI 能在证据表明当前路径不收敛时选择更合适的动作，并由 Extension 约束成本、执行动作、记录决策和恢复运行状态。

核心原则是：

> AI 决定当前缺少什么能力；WEConverge 以成本递增的方式提供能力，并记录真实动作与结果。

## 2. 问题

OMP 已经能把不同 Agent 绑定到不同模型，也能创建父子 Agent、并发执行任务和回传结果，但它主要回答“有哪些执行角色、怎样派发”。它没有完整回答：

1. 主力 AI 什么时候应该继续当前方向，什么时候应该换方向；
2. 困难来自搜索宽度、推理深度、领域不匹配，还是缺少外部证据；
3. 什么时候值得花费额外模型额度；
4. 如何避免主力模型在任务开始时过早提高推理强度或盲目并发；
5. 如何在多轮失败后扩大搜索，而不是继续消耗在同一条路径上；
6. 如何保留可审计的调度事实，而不是依赖模型事后叙述。

现有“任务一开始先分类 effort”方案分类过早。用户通常无法预判任务难度，小分类模型也无法在没有执行证据时可靠判断任务最终需要 Medium、High 还是 XHigh。让主力模型主观填写具体 token 预算同样不可靠，尤其会伤害探索性任务。

## 3. 目标

首版必须做到：

1. 不修改 OMP 核心，以用户级 Extension 独立维护和安装；
2. 默认关闭，用户主动启用后对后续任务持续生效；
3. 默认路径保持单 Agent、当前主模型和 Medium，不增加前置分类模型调用；
4. 对非平凡任务注入“先在内部比较多个本质不同方案，再执行一个最优方案”的策略；
5. 在实际执行不收敛后，允许主力 AI 调用便宜 Agent 做最小、可证伪的并行探路；
6. 根据困难类型选择继续、换方案、委派、调用专业角色、并行探索或提高 effort；
7. effort 只允许自动按 `Medium → High → XHigh` 递增，永不自动选择 Max；
8. 不让 AI 分配具体 token 数字，用语义动作和可配置成本护栏控制资源；
9. 区分失败、BLOCKED 与 SOURCE GAP，缺证据时不靠增加算力冒充解决；
10. 记录每次调度的触发证据、选择、实际路由、结果和恢复状态。

## 4. 非目标

首版不做：

- 修改、复制或 fork OMP 核心；
- 建设适配 Codex、Cursor、Claude Code 等宿主的通用控制平面；
- 重建 OMP 的 Agent 生命周期、消息总线、并发和结果回传；
- 新增常驻总控模型或每事件调用一次分类模型；
- 默认生成五个方案、启动五个 Agent，或让多个 Agent 完整重复实现；
- 根据关键词做脆弱的任务分类器；
- 用刚性 token 数字作为任务预算；
- 自动使用 Max effort；
- 假设 OMP 一定提供实时价格、套餐余额或剩余额度遥测；
- 修改 Provider 密钥、模型注册或用户现有 Agent 配置；
- 在首版实现 WeOMP Settings 的 Beta 页面；该 UI 由 WeOMP 后续单独接入。

## 5. 与 OMP 的边界

OMP 是执行事实源，WEConverge 只消费公开、受支持的 Extension 能力。

OMP 继续负责：

- Agent 定义和角色名称；
- 模型与 effort 的最终解析；
- 父子 Agent 创建、并发、取消和结果回传；
- Tool、会话、Provider 与认证；
- 用户配置中的 `modelRoles` 和 `task.agentModelOverrides`。

WEConverge 负责：

- 向主力 AI 注入简短的调度策略；
- 保存当前任务的收敛状态和调度证据；
- 接收 AI 发出的语义调度动作；
- 将动作解析为现有 OMP Agent/模型角色调用；
- 在调用前检查成本护栏和有效路由；
- 记录 OMP 实际解析出的 Agent、模型和 effort；
- 在结束、关闭或切换时恢复 Extension 自己改变的 session-local 状态。

WEConverge 不读取 OMP 未文档化的内部状态文件，不保存 Provider 密钥，不把自身记录当作 OMP 运行事实。若公开 Extension API 无法读回实际 resolved route，该字段必须报告 SOURCE GAP。

## 6. 独立维护与安装

唯一维护源为：

```text
J:\PigeonYang\tools\weconverge
```

未来通过 junction 安装到 OMP 用户 Extension 目录。安装位置只作为入口，不维护第二份源码。WEConverge 不进入 `J:\PigeonYang\harness\WeOMP`；WeOMP Beta 设置页未来只调用公开控制接口并展示状态。

首版建议结构为：

```text
weconverge/
├── docs/spark/
├── src/
│   ├── extension.ts
│   ├── policy.ts
│   ├── session-state.ts
│   ├── route-resolver.ts
│   └── audit.ts
├── test/
└── package.json
```

这是职责边界，不是本设计阶段的代码脚手架。实现时只有在独立测试或文件尺寸确实需要时才继续拆分。

## 7. 启用语义

WEConverge 安装后默认关闭。用户通过 OMP 命令或未来 WeOMP Beta 开关主动启用一次后，启用状态持久保存，并作用于之后新建的任务。

每个任务仍创建独立的 session-local 调度状态，不继承上一个任务的失败计数、候选方案、当前 effort 或子 Agent 结果。

关闭时：

1. 不再注入策略或接受新的自动调度动作；
2. 恢复由 WEConverge 改变的 session-local effort；
3. 不强行终止用户自己创建的 Agent；
4. 对 Extension 已经派发且仍运行的 Agent，停止将其结果用于新的路由决策，并在状态中标记为 detached；
5. 保留已完成的审计事件。

## 8. AI-native 调度接口

WEConverge 不让 AI填写“算力申请表”，只提供以下语义动作：

```text
continue_current
activate_alternative
delegate_bounded_work
invoke_specialist
explore_in_parallel
raise_effort
report_source_gap
report_blocked
```

主力 AI 选择动作时必须附带：当前障碍、已有可观察证据、预期获得的新信息以及成功判据。它不填写 token 数量，也不直接写 Provider/model ID。

Extension 根据用户配置把语义动作解析到已有 OMP Agent 或模型角色，并在执行后读回实际 route。AI 负责判断；Extension 负责能力提供、约束、执行和审计。Extension 不对每个事件再调用一个 LLM 做审批。

## 9. 两阶段方案搜索

### 9.1 阶段一：内部搜索宽度

对非平凡任务，主力 AI 在一次正常推理中：

1. 考虑至少两个本质不同的方向；
2. 比较成功概率、相对成本、可逆性和可验证性；
3. 只执行一个最优方向；
4. 保留未选方向的简短标识，作为失败后的备用方向。

“本质不同”指关键假设、数据来源或验证方式不同，不是同一路径的措辞变体。简单、封闭、可一次验证的任务不强制执行多方案比较。

内部比较复用主力 AI 当前这一次推理，不产生额外模型调用，也不要求把完整隐藏推理写入日志。审计只保存选中方向、备用方向标识和可验证理由。

### 9.2 阶段二：外部搜索宽度

只有已有执行证据显示当前任务不收敛时，主力 AI 才能启动外部探索：

1. 提出相互独立的探索方向；
2. 将每个方向交给便宜的 OMP Agent；
3. 每个 Agent 只执行最小调查或可证伪实验；
4. 子 Agent 返回证据、失败和 SOURCE GAP，不宣布整个任务完成；
5. 主力 AI 比较结果，选择一个突破方向继续整合。

默认每一波最多并行两个探索 Agent。第二波必须提供第一波未收敛的新证据；每个任务自动探索最多两波。达到上限后，AI只能提高 effort、调用专业角色、报告 SOURCE GAP/BLOCKED，或请求用户明确授权扩大成本。

## 10. 收敛判断

WEConverge 不把“工作时间长”“工具调用多”或“出现一次错误”直接视为不收敛。以下事件可作为证据：

- 同一可归一化失败在改变实现后再次出现；
- 两个本质不同的 Medium 尝试都未通过同一项验收；
- 关键假设被真实读回或最小实验证伪；
- 主力 AI 能指出缺少的具体能力以及下一动作将新增的可验证信息；
- 子 Agent 返回互相冲突的证据，需要更深推理整合。

以下情况不能单独触发加算力：

- 一次命令失败；
- 仅仅感觉任务复杂；
- 上下文或 token 消耗较大；
- 没有真实读回的模型自述；
- 缺少权限、输入、日志或外部服务状态。

## 11. 困难类型与动作映射

| 困难类型 | 首选动作 | 不应做的事 |
|---|---|---|
| 方向不明、多个假设待证伪 | `explore_in_parallel`，使用便宜 Scout/Task 类 Agent | 直接提高主模型 effort |
| 方向明确，但当前推理无法闭合 | `raise_effort` | 派多个 Agent 重复同一实现 |
| 领域能力不匹配 | `invoke_specialist` | 让通用 Agent 靠更多 token 硬做 |
| 机械、封闭、可客观验收 | `delegate_bounded_work`，使用便宜 Task/Sonic 类 Agent | 占用高价主模型执行全过程 |
| 当前方案已被证伪，备用方向可测 | `activate_alternative` | 在原方向继续小修小补 |
| 缺权限、资料、日志或外部状态 | `report_source_gap` | 增加并发或 effort |
| 必要路径已验证不可行且无安全替代 | `report_blocked` | 把未完成包装成成功 |

这不是固定的“先委派、再升级”流水线。主力 AI 根据困难类型选择最便宜、最可能带来新信息的动作。

## 12. 模型角色配置

WEConverge 配置引用 OMP 已有 Agent 或模型角色，不重复保存模型凭据。配置表达能力与相对成本，例如：

```yaml
roles:
  integrator: current
  cheap_worker: task
  mechanical_worker: sonic
  researcher: scout
  reviewer: reviewer
  frontend_specialist: designer

cost_tiers:
  current: 2
  task: 1
  sonic: 1
  scout: 1
  reviewer: 1
  designer: 2
```

角色名称只是对 OMP 现有配置的引用。用户可以把 `designer` 映射到 Kimi K3 或其他适合前端的模型，WEConverge 不硬编码 Kimi，也不改写 OMP 配置。

派发前必须检查目标角色的实际 resolved model 和 effort。自动路径若解析为 Max，则拒绝派发并报告配置不满足“永不自动使用 Max”的成本护栏；用户手动调用该 Agent 不受 WEConverge 限制。

若实时价格和套餐额度不可读取，WEConverge 使用用户配置的相对成本层级，并在状态中明确显示 `price telemetry: SOURCE GAP`。相对成本不冒充实际货币花费。

## 13. Effort 状态机

每个任务的自动 effort 状态为：

```text
Medium -> High -> XHigh
```

规则：

1. 新任务从 OMP 实际解析出的 baseline 开始；自动调度的目标 baseline 是 Medium；
2. baseline 不是 Medium 时不静默改写全局配置，状态报告当前值和配置偏差；
3. 只有“方向明确但推理深度不足”且存在不收敛证据时才提升一级；
4. 每次提升后必须先进行一次新的、可验证的尝试，不能连续跳级；
5. XHigh 失败后不得自动进入 Max；
6. 换方案、外部探索或专业角色更可能带来新信息时，优先使用对应动作，而不是提高 effort；
7. 任务完成、关闭 Extension 或切换模型后，恢复 Extension 接管前的 session-local effort；
8. WEConverge 永不修改 OMP 的持久全局 effort 配置。

## 14. 成本保护

首版使用动作护栏，不使用刚性 token 预算：

- 默认零个子 Agent、零次额外分类调用；
- 内部方案比较合并在主力 AI 的正常推理内；
- 只有能说明将获得什么新信息时才允许增加资源；
- 外部探索默认并发上限为 2，自动探索上限为 2 波；
- 每个子 Agent 接收最小任务包，不复制完整父上下文；
- 子 Agent 做调查或实验，不并行复制完整实现；
- 同一失败证据不能重复申请同一种升级；
- 专业角色与更高 effort 比较时，选择预计更便宜且能补齐缺失能力的一项；
- API 价格、余额和套餐额度缺失只形成 SOURCE GAP，不误判为路由失败；
- 用户可通过配置降低并发和波次数，但自动路径不能突破硬上限或启用 Max。

成本优化的目标不是“最少调用”，而是“用最低的预期总成本获得可验收结果”。廉价但不产生新信息的重复调用同样属于浪费。

## 15. SOURCE GAP 与 BLOCKED

`SOURCE GAP` 表示缺少做出结论所需的外部事实，例如：

- 无法读取实际 resolved model/effort；
- 无实时价格、余额或套餐额度遥测；
- 缺少文件、日志、权限、用户输入或外部服务状态；
- OMP 公开 Extension API 不暴露所需运行事实。

`BLOCKED` 表示完成任务所必需的路径已通过证据证明不可执行，且允许范围内没有安全替代方案。

两者都不是路由失败的同义词。路由可以成功而价格遥测仍为 SOURCE GAP；某个探索 Agent 失败也不代表整体 BLOCKED。

## 16. Session、模型切换与恢复

每个任务保存以下 session-local 状态：

```text
enabledAtStart
phase
baselineModel
baselineEffort
currentModel
currentEffort
selectedDirection
alternativeDirectionIds
failureEvidence
explorationWave
ownedChildRuns
lastDecision
restoreState
```

恢复规则：

- 新任务：清空上个任务的方案、失败和 Agent 结果；读取新的实际 baseline；
- 会话恢复：从 Extension 自己写入的审计事件重建状态，不根据模型叙述猜测；
- 模型切换：结束当前 effort 接管，恢复旧模型 baseline，清空该模型的失败计数，并为新模型建立新 baseline；
- Extension 关闭或卸载：恢复自己拥有的 session-local effort 变更；
- 用户手动改变模型或 effort：视为外部所有权变更，WEConverge 不覆盖，状态转为 degraded 并重新建立 baseline；
- 子 Agent 迟到结果：保留审计，但若父任务阶段或模型已变化，则标记 stale，不自动触发新动作；
- 恢复失败：报告 degraded 和具体原因，不修改 OMP 持久配置做补偿。

## 17. 命令与状态

首版注册：

```text
/weconverge on
/weconverge off
/weconverge status
/weconverge reset
```

- `on`：持久启用，对之后的新任务生效；当前空闲任务可建立新的 session-local baseline。
- `off`：持久关闭，停止自动动作并恢复 Extension 拥有的临时 effort 变更。
- `status`：只读显示启用状态、当前阶段、baseline、当前 model/effort、探索波次、活动子 Agent、最后决策、恢复健康和 SOURCE GAP。
- `reset`：仅清空当前任务的 WEConverge 调度状态并恢复 baseline，不清除历史审计，不修改 OMP 配置。

示例：

```text
WEConverge
enabled: yes
phase: external_exploration
route: cockpit-gpt/gpt-5.6-sol / medium
baseline: cockpit-gpt/gpt-5.6-sol / medium
exploration: wave 1, 2 active
last decision: direction unclear -> parallel scout probes
automatic max: prohibited
restore health: ok
price telemetry: SOURCE GAP
```

## 18. 审计记录

每个调度事件记录：

```text
timestamp
sessionId
parentAgentId
action
difficultyType
evidenceSummary
expectedNewInformation
successCriterion
requestedRole
resolvedAgent
resolvedModel
resolvedEffort
relativeCostTier
result
sourceGaps
restoreResult
```

审计记录不保存完整隐藏推理、Provider 密钥或完整父上下文。`requestedRole` 与 `resolvedModel/resolvedEffort` 分开记录，防止把期望路由误当成实际路由。无法读回的实际字段必须为空并附 SOURCE GAP。

## 19. 失败处理

| 失败 | 行为 |
|---|---|
| 策略注入失败 | 记录 degraded，继续普通 OMP 任务 |
| 目标角色不存在 | 不回退到任意模型；报告 SOURCE GAP |
| resolved route 是 Max | 拒绝自动派发，报告成本护栏冲突 |
| 子 Agent 创建失败 | 记录失败，由主力 AI选择其他语义动作 |
| 子 Agent 超时 | 保留已有证据并标记 partial，不无限等待 |
| effort 切换失败 | 保持当前 effort，记录实际状态 |
| 价格/额度不可读 | 路由照常按相对成本执行，遥测为 SOURCE GAP |
| 恢复 baseline 失败 | 标记 degraded，明确当前实际状态，不改持久配置 |
| 用户手动改变运行状态 | 放弃 Extension 所有权，重新读取 baseline |

任何失败都不得遗留后台无限探索，也不得把“命令成功”当作任务验收成功。

## 20. 测试设计

### 20.1 机械测试

至少覆盖：

1. 默认关闭，`on/off` 持久语义正确；
2. 新任务从干净 session-local 状态开始；
3. 简单任务不强制多方案和子 Agent；
4. 非平凡任务保存一个选中方向和至少一个备用方向标识；
5. 单次工具错误不触发 effort 提升；
6. 缺权限或证据只产生 SOURCE GAP；
7. 方向不明选择外部探索，方向明确且深度不足才提升 effort；
8. Medium 只能升到 High，High 只能升到 XHigh；
9. 自动路径永不产生 Max；
10. resolved 为 Max 的角色被成本护栏拒绝；
11. 每波最多两个探索 Agent，每任务最多两波；
12. 不同探索方向不会收到完整父上下文或重复完整实现任务；
13. requested role 与实际 resolved route 分开记录；
14. 模型切换、关闭、重置和任务结束恢复 baseline；
15. 外部手动变更不会被 Extension 覆盖；
16. 迟到的子 Agent 结果被标记 stale；
17. 价格遥测 SOURCE GAP 不会被报告为路由失败或 BLOCKED。

### 20.2 真实 OMP smoke

真实验收必须在安装 junction 后执行：

1. **关闭对照**：Extension 已安装但关闭；普通任务无策略注入、无额外 Agent、model/effort 不变。
2. **简单任务**：启用后完成一个封闭任务；保持当前主模型、Medium 和单 Agent。
3. **内部搜索**：提交一个非平凡但可在单次推理内完成的任务；审计存在选中方向和备用方向标识，无额外模型调用。
4. **方向不明**：构造两个独立假设；实际创建两个便宜探索 Agent，读回 parent-child 关系、resolved model/effort 和不同实验结果。
5. **深度不足**：构造方向明确且 Medium 两次可证伪失败的任务；只升到 High，并在新尝试后才允许 XHigh。
6. **专业角色**：将 OMP 的 `designer` 角色配置为一个前端专业模型；触发领域不匹配后读回实际 resolved route。WEConverge 本身不改配置。
7. **Max 护栏**：目标角色实际解析为 Max；自动派发被拒绝，状态显示配置冲突。
8. **SOURCE GAP**：移除一项必要输入；不增加 effort 或 Agent，结果明确为 SOURCE GAP。
9. **模型切换**：任务中切换模型；旧 baseline 被恢复，新模型建立独立状态，旧子 Agent 迟到结果不影响新路由。
10. **关闭恢复**：在 High 状态执行 `off`；读回当前 session 已恢复接管前 baseline，持久 OMP 配置未变化。

Smoke 证据必须来自 OMP 实际事件和 resolved route 读回，不能只引用主力 AI 的文字说明。

## 21. 完成条件

首版只有同时满足以下条件才算完成：

1. 权威源码只存在于 `J:\PigeonYang\tools\weconverge`；
2. OMP 用户 Extension 安装目录是指向权威源码的 junction；
3. OMP 能加载 Extension，无加载错误；
4. 默认关闭，启用和关闭能跨新任务保持；
5. 简单任务保持单 Agent、当前主模型和 Medium；
6. 内部方案比较不产生额外分类调用；
7. 外部探索只在有不收敛证据时发生，并遵守并发和波次上限；
8. 实际 resolved route 被记录，期望路由不能代替实际路由；
9. effort 自动路径只出现 Medium、High、XHigh，从不出现 Max；
10. 领域不匹配能调用用户配置的 OMP 专业角色；
11. SOURCE GAP、BLOCKED、路由失败和任务失败可被分别观察；
12. 任务结束、模型切换、关闭和外部所有权变更不会留下 WEConverge 拥有的临时状态；
13. 全部机械测试通过；
14. 全部真实 OMP smoke 有事件、父子链、resolved route 和恢复读回证据；
15. 未修改 OMP 核心、WeOMP 产品代码、Provider 密钥或用户 Agent 配置；
16. 对缺失的价格、余额、额度或 Extension API 遥测诚实保留 SOURCE GAP。

## 22. 首版产品边界结论

WEConverge 的价值不在于比 OMP 多几个 Agent 名字，而在于为已有能力增加“何时扩大搜索、何时提高深度、何时换专业能力、何时停止烧额度”的可执行策略。

首版坚持三条边界：

1. 先用当前主模型、Medium、单 Agent 尝试收敛；
2. 只有真实失败证据才能换取额外资源；
3. 资源增加必须带来新的可验证信息，缺少外部事实时直接报告 SOURCE GAP。

这使 WEConverge 成为 WeOMP Desktop 可体现差异化的 AI 调度能力，同时仍保持 OMP 可更新、可替换和独立维护。
