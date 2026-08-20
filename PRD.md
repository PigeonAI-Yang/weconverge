# WEConverge PRD

- 状态：Advisory contract v1.1.0-advisory — Owner-approved pure advisory (2026-08-20) + D-08 correction (2026-08-20, Owner-directed)
- 历史基线：v1.0.0 (2026-08-19) 原文保留于本文第 1–12 章作为历史记录（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写），仅通过本文第 0 章与第 13 章以后的咨询层显式覆盖
- 咨询权威：`docs/spark/2026-08-20-weconverge-pure-advisory-design.md` (Owner-approved 2026-08-20) + D-08 `before_agent_start` 官方 hook 握手为权威交接（Provider payload 内省非职责）
- 历史基线：`docs/spark/2026-08-19-weconverge-design.md` (Owner-approved 2026-08-19)
- 产品：WEConverge (OMP 用户级 Extension, 权威目录 `J:\PigeonYang\tools\weconverge`)
- 权威顺序：Owner 显式决定 (2026-08-20 D-01..D-08) > 本文咨询层 (§0, §13+) > 历史基线设计 (2026-08-19) > 本文历史层 (§1–12, v1.0.0 原文) > SPEC / TECHNICAL_DESIGN 咨询层
> **实施授权**：本文咨询层已获 Owner 授权作为实现合同；历史层不单独作为实施依据，冲突处以咨询层为准（见 §0.2）。

---

## 0. 咨询层修订记录（Contract Migration — 显式覆盖声明）

### 0.1 权威与保留规则

1. 本文第 1–12 章为 **v1.0.0 历史原文保留（除以 `> **咨询层…**` 显式标注的视觉化补充外无删除/重写）**，不做静默弱化；其中与咨询层冲突的条款按 §0.2 显式退役为咨询观察，不再作为强制门。
2. 任何历史 `REQ` 退役必须在 §0.2 逐条列出旧条款、退役形态与证据层替代；未列入 §0.2 的历史条款继续有效。
3. 咨询层新增需求编号为 `REQ-100` 起（`REQ-100..119`），避免与历史 `REQ-001..083` 碰撞；两者通过 §0.2 映射关联。D-08 新增 **AC-A18** 为确定性官方-hook 握手验收，其映射见 §14 与 SPEC §13.1/§20.2。
4. 历史 `REQ-001..083 → CAP → AC` 映射保留为历史追溯；咨询层 `REQ-100..119 → CAP-A → AC-A` 为现行可证伪验收依据。旧强制 `AC-001..044` / `AC-101..115` / **`AC-L02`** 中因强制执行或自相矛盾（Provider payload 回读）而不再适用的项按 §0.3 显式列为 `RETIRED (advisory)`，永不按 PASS 呈现。**AC-L02 的最终 Provider payload 回读要求按 D-08 永久 RETIRED，其缺失不记为产品 SOURCE GAP；替代为 AC-A18。**

### 0.2 D-01..D-08 显式覆盖（旧条款 → 咨询层）

| 决定 | 历史基线条款 | 咨询层处置 | 现行需求 | 证据层替代 |
|---|---|---|---|---|
| D-01 | PRD §7 J-004/J-005/REQ-022/023/027 + SPEC §6-10/CAP-005/TECHNICAL_DESIGN §3：`weconverge_decide` 为唯一逻辑门并自动派发 `explore_in_parallel` | **退役强制派发；保留为观察**。`weconverge_decide` 仅用于父 effort 变更与正式缺口/阻塞/手动授权；常规外部探索由父模型直接发射原生 `task`，Extension 仅观察 | REQ-105 (parent-effort-only decide), REQ-101 (pure advisory — no dispatch) | 机械：decide 窄门校验；Live：`tool_call` observed `task` 出现即 phase 进入 `external_exploration`（观察，不阻断） |
| D-02 | SPEC §5.2/TECHNICAL_DESIGN §6：自动成本强制 — 全局 Max 禁令、每波 ≤2、每任务 ≤2 波、去重、falsifier、紧凑输出强制 | **退役为咨询观察**；限制值在 `status` 展示、audit 记为 observed + advisory note，不做 block/mutation/cancel | REQ-108 (advisory limits), REQ-106 (model-aware Max, no global ban) | 机械：超限 batch 仍 `observed` 且不拒绝；Live：`status` 显示配置上限与实测 `tasks.length`/`explorationWave` |
| D-03 | SPEC §11/§4.2/CAP-006：effort 阶梯 `medium→high→xhigh` 伴自动 Max 在 `tool_call` 边界拒绝 | **仅父 effort 阶梯保留强制**；面向原生 `task` 的自动 Max 阻断退役 | REQ-104 (parent-effort ladder only), REQ-106 | 机械：`raise_effort` 前置校验；Live：原生 `task` 含 Max 时记 `observedIsMax:true` 仅为咨询标注 |
| D-04 | SPEC §4.4/§13：`ResolvedRouteV1.resolvedEffort: "xhigh"` 可证明 | **修订为 SOURCE GAP**；公开面无稳定 effort 字段 | REQ-107 (resolvedEffort is source_gap) | 机械：`observed.resolvedEffort == source_gap || unknown` 断言；Live：`progress.resolvedModel` 后缀仅为推断 |
| D-05 | SPEC §6.1 CP-001 / CAP-001：Extension 可派发外部探索 | **退役为仅父可派发**；Extension 观察 | REQ-101, REQ-102 | 机械：无 `emitChild` 路径；Live：`tool_result` / `task:subagent:*` 观察 |
| D-06 | Runtime："每父会话一个 Extension 运行时 + parent-child 链追踪" | **修订为：** 单活 full runtime + 有界 detached tombstones；switch 销毁旧 full runtime；不假设 public session-delete | REQ-109 (runtime/tombstone lifecycle) | 机械：generation 作用域 + tombstone bounded ≤2；Live：switch 后旧 runtime 句柄不再收事件 |
| D-07 | SPEC §22 / ACCEPTANCE AC-105/107/108 阶梯完整性 PASS 门 | **退役为 RETIRED**；以 §13 机械/真实/成本三层分立验收替代 | REQ-115..117 (acceptance separation) | 机械/真实/成本分层证据（SPEC §13 咨询层） |
| D-08 | SPEC §13.2 / TECHNICAL_DESIGN §12 / 纯咨询设计 §12 的 AC-L02 最终 Provider payload 回读要求：启用后首个 generation 的 `before_agent_start` systemPrompt 必须在最终 Provider payload 中可回读验证 | **RETIRED (never PASS)**。Provider-wire payload 内省不是 Extension 职责；下游 OMP 组装为 OMP 官方 `before_agent_start.systemPrompt` hook 合同，超出 WEConverge 责任边界。替代为 AC-A18 确定性官方 hook 握手（见下）；AC-L02 永不按 PASS 呈现，其缺失不记为产品 SOURCE GAP | REQ-100 (compact policy injection), CAP-A01 | 确定性：注册的公共 `before_agent_start` handler 在 enabled 时确定性返回精确有界 WEConverge policy 块；同 generation 复用相同 content/fingerprint；disabled 返回无 policy；token ≤60；无需 Provider 调用/回读。Live 观测层不再以 Provider payload 回读为门 |

历史条款凡被 §0.2 列为退役，其对应强制语义（block/mutation/cancel/auto-dispatch/pre-provider Max proof/强制并发·波次·去重·紧凑输出）不再作为实施门；历史文本仍保留供追溯，但验收以咨询层为准。
### 0.3 旧强制 AC 退役映射（RETIRED — 咨询下不按 PASS 呈现）

| 旧 AC | 历史门 | 咨询层处置 | 现行替代 AC |
|---|---|---|---|
| AC-006 (拒绝 token/model ID) | 强制拒绝 | 保留：`weconverge_decide` 仍拒绝 token/model ID；原生 `task` 不经此门 | AC-A06 |
| AC-010 (外部探索需 confirmed evidence) | 强制拒绝 | 退役为观察：原生 `task` 不设证据门，audit 记 requested/observed 分离 | AC-A03 |
| AC-011 (每波 ≤2) / AC-012 (≤2 波) | 强制拒绝第三个/第三波 | 退役为咨询：超限仅记录，不拒绝 | AC-A12 |
| AC-013 (子包不含完整父上下文) | 强制校验 | 退役为咨询建议：policy 建议最小上下文，不强制截断 | AC-C03 / AC-A07 |
| AC-016..018 (effort 阶梯) | 自动阶梯强制 | 保留为父 effort 窄门 (AC-A08..A10)；子/自动 task 阶梯不适用 | AC-A08..A10 |
| AC-019/AC-108 (pre-provider Max 拒绝) | 调度前证明非 Max | 退役为观察标注：仅 `raise_effort` 保留前置校验 | AC-A11 |
| AC-105/AC-107/AC-108 (外部探索/专业角色/Max 护栏 live) | 真实派发与 Max 护栏 PASS | 退役为 RETIRED；以 live 观察证据替代强制派发证据 | AC-L03 (保留观察)；AC-105/107 对应强制派发部分 RETIRED |
| AC-L02 (策略注入最终 Provider payload 回读) | 启用后首个 generation 的 `before_agent_start` systemPrompt 必须在最终 Provider payload 中可回读（≤60 tokens） | **RETIRED (never PASS) per D-08**：Provider-wire payload 内省非 Extension 职责；下游 OMP 组装为 OMP 官方 hook 合同，超出 WEConverge 责任边界；其缺失不记为产品 SOURCE GAP | **AC-A18** (确定性官方 hook 握手 — 见 §13.1) |
| 其余 AC-001..044 / AC-101..115 | 机械/真实 PASS | 历史保留；咨询层以 AC-A / AC-L / AC-C 重述可证伪门 | 见 SPEC §13 咨询层映射 |

> 原则：**Retired, not faked.** 任何退役 AC 不得在咨询验收中标记 PASS；伪造即为合同违背。

---

## 1. 文档权威链

本项目合同按以下顺序解释：

1. 用户明确核准或后续明确变更；
2. `docs/spark/2026-08-19-weconverge-design.md`：已批准产品设计与边界；
3. `PRD.md`：产品意图、范围、需求和成功定义；
4. `SPEC.md`：规范行为、状态、接口、错误语义和可证伪验收；
5. 后续 `TECHNICAL_DESIGN.md`：实现架构，不得改写上游行为合同；
6. 后续 `PLAN.md`：依赖顺序，不得删减需求；
7. 后续任务台账：唯一实施进度事实源，不得反向修改产品合同。

发生冲突时，上游优先。实现困难、OMP API 缺口或成本压力只能形成阻塞、SOURCE GAP 或显式变更提案，不能静默降低本 PRD 或 SPEC。

> **咨询层补充（2026-08-20, Owner-approved）：** 本文档 §0 与 §13+ 为 Owner 于 2026-08-20 批准的纯咨询覆盖层（含 D-08 Provider payload 回读退役与 AC-A18 官方 hook 握手）；与历史层冲突时以咨询层为准。`docs/spark/2026-08-20-weconverge-pure-advisory-design.md` 为咨询层设计权威。公共 OMP API 保持权威，D-08 不涉及 OMP core/WeOMP/用户配置/凭据变更。

## 2. Owner 核准事实

用户于 2026-08-19 核准 WEConverge 设计，并授权编写随附 PRD 与 SPEC：

> 我同意 核准了.现在我请你将此方案随附的PRD/SPEC都写好,尤其是SPEC,一定不能有退化

本次授权仅覆盖产品合同文档，不授权实现、安装、修改 OMP/WeOMP 或改变用户现有模型与 Agent 配置。

> **2026-08-20 补充核准**：Owner 批准纯咨询缩减设计（pure-advisory reduction）并授权将 D-01..D-07 落为可实施咨询合同；实现现已获明确授权（见本文 §0）。**2026-08-20 D-08 补充**：Owner 指示移除自相矛盾的 Extension Provider payload 终局回读要求，AC-L02 永久 RETIRED，替换为 AC-A18 确定性官方 hook 握手；公共 OMP API 权威不变，不涉及 OMP core/WeOMP/用户配置/凭据变更。

## 3. 产品命题

WEConverge 是 OMP 原生 Agent、模型角色和 Task 派遣机制之上的 AI-native 调度策略层。

OMP 已解决“有哪些 Agent、如何派发、如何并发和回传”。WEConverge 解决“什么时候值得继续、换方案、增加搜索宽度、提高推理深度、调用专业能力，或者因缺少事实而停止烧额度”。

产品原则：

> AI 决定当前缺少什么能力；WEConverge 以成本递增的方式提供能力，并记录真实动作与结果。

> **咨询层命题补充（v1.1-advisory）：** WEConverge 纯咨询层是位于 OMP 原生 `Agent / modelRoles / Task` 之上的**成本敏感咨询层**：通过 `before_agent_start` 注入紧凑策略（≤60 tokens / parent Provider request，generation-scoped），由昂贵父模型自主决定是否以原生 `task(tasks:[≤2])` 开展有界探索；Extension 仅观察 `tool_call / tool_result / task:subagent:*` 并记录 `requested / expected / observed / inferred / source_gap`，不强制、不派发、不阻断。

## 4. 用户与核心工作

### 4.1 主要用户

主要用户是使用 WeOMP Desktop/OMP 完成长任务、同时拥有多个模型与 Agent 路由的个人 Owner。

### 4.2 用户要完成的工作

1. 无需在任务开始前判断该用 Medium、High 还是 XHigh；
2. 让主力 AI 先用默认低成本路径尝试解决；
3. 当任务真正不收敛时，自动选择能带来新信息的增量资源；
4. 针对前端、研究、机械工作等困难类型调用已配置的适合角色；
5. 避免廉价 Agent 重复完整实现，也避免高价主模型处理机械工作；
6. 看清每次调度为何发生、实际用了什么模型/effort、是否恢复；
7. 在缺权限、资料、价格或额度遥测时得到诚实的 SOURCE GAP，而不是错误的失败或成功。

## 5. 产品目标

### G-001 先收敛，再增加资源

新任务的自动路径保持当前主模型、Medium、单 Agent，不增加前置分类调用或周期性反思。

### G-002 用证据换取额外成本

只有真实执行证据显示当前路径不收敛，且新动作能够获得新的可验证信息时，才能增加 Agent、专业模型或 effort。

### G-003 匹配困难类型

方向不明增加搜索宽度；方向明确但深度不足提高 effort；领域不匹配调用专业角色；机械工作委派便宜 Agent；缺事实报告 SOURCE GAP。

### G-004 保持 OMP 独立与可更新

WEConverge 只通过 OMP 公开 Extension 能力工作，不修改核心、不复制 Agent 基础设施、不读取未文档化内部文件。

### G-005 让调度可核验

请求路由与实际 resolved route 分开记录；任务结果、路由结果、SOURCE GAP、BLOCKED 和恢复健康分别呈现。

> **咨询层目标补充**：G-005 在咨询层体现为五类事实分离（requested/expected/observed/inferred/source_gap，见 REQ-110），且父模型 token/turn 成本为主成本目标（REQ-115）。

## 6. 非目标

首版明确不做：

- 跨 Codex、Cursor、Claude Code 等宿主的通用控制平面；
- OMP fork、核心补丁或第二套 Agent 生命周期；
- 常驻总控 LLM、事件级分类 LLM 或关键词分类器；
- 默认五方案、五 Agent 或多 Agent 重复完整实现；
- token 数字预算分配；
- 自动使用 Max effort；
- 猜测价格、余额、套餐额度或未提供的 resolved route；
- 修改 Provider 凭据、模型注册、全局 effort 或现有 Agent 配置；
- WeOMP Beta 设置页实现；
- 公开发布、云服务、遥测或多用户权限系统。

> **咨询层非目标（显式，v1.1-advisory）：** 覆盖/包裹/阻断/变异/取消原生 `task`；在 `weconverge_decide` 或任意 Extension 路径内自动派发子任务；要求 `weconverge_decide` 前置于 `task`；在工具边界强制 Max 禁令/并发/波次/去重/截断；强制紧凑子输出；创建第二调度器/第二子总线/第二并发·取消·结果层或跨会话持久子追踪；打补丁 OMP 核心、改 `config.yml`/模型注册、存 Provider key、假设 Provider 价格/计费遥测存在；轮询结果（见 REQ-101）。

## 7. 首版用户旅程

### J-001 默认关闭

Extension 安装后不改变任何任务。Owner 执行 `/weconverge on` 后，启用状态对后续新任务持续生效。

### J-002 简单任务保持便宜

Owner 提交封闭、路径明确、可一次验证的任务。主力 AI 直接执行，保持单 Agent、当前主模型与 Medium，不产生额外分类调用。

### J-003 非平凡任务先内部比较

主力 AI 在当前一次推理内比较至少两个本质不同方向，只执行一个最优方向，并保留简短备用方向标识。完整隐藏推理不写入审计。

### J-004 方向不明时外部探路

已有证据表明当前路径不收敛，且障碍是方向不明。主力 AI 提出独立探路任务，WEConverge 调用便宜 OMP Agent 做最小可证伪实验，主力 AI 综合证据。

> **咨询层语义（v1.1-advisory）：** 主力 AI 自主发射原生 `task(context, tasks:[≤2])`；Extension 观察并记录，不派发。

### J-005 推理深度不足时逐级提升

方向明确且 Medium 尝试被证据证明无法闭合。WEConverge 只提升一级至 High；完成新的可验证尝试后，仍不收敛才允许 XHigh；永不自动进入 Max。

> **咨询层语义（v1.1-advisory）：** 阶梯仅适用于 `weconverge_decide raise_effort`（父 effort）；原生 `task` 的 Max 不被 Extension 阻断（模型感知按能力路由，见 REQ-106）。

### J-006 调用专业能力

障碍来自领域能力不匹配。AI 请求一种能力，WEConverge 通过用户配置解析到 OMP 已有专业角色，例如把前端能力映射到 `designer`。产品不硬编码 Kimi K3，也不改 OMP 配置。

### J-007 缺事实时停止烧额度

缺少权限、文件、日志、外部服务状态、价格或额度遥测时，WEConverge 报告具体 SOURCE GAP，不增加 effort 或并发。

### J-008 关闭与恢复

Owner 执行 `/weconverge off`，Extension 停止新动作并恢复自己拥有的 session-local effort 变更，不覆盖用户手动变更，不修改持久 OMP 配置。用户创建的 Agent 不被终止；WEConverge 已派发且仍运行的 child 标记 detached，其迟到结果只进入审计，不再参与路由。

> **咨询层语义（v1.1-advisory）：** `off` 后 observer 对新 `task` 观察记为 advisory-detached；运行中子任务由 OMP 继续执行，Extension 将其标记 detached，不尝试取消（REQ-109, REQ-112）。

## 8. 需求索引

| ID | 领域 | 需求 |
|---|---|---|
| REQ-001 | Constitution | 独立用户级 Extension，不修改 OMP/WeOMP |
| REQ-002 | Constitution | OMP 是 Agent、路由和运行事实源 |
| REQ-003 | Constitution | 不读取未文档化内部文件，不保存凭据 |
| REQ-004 | Constitution | 不重建 Agent/Task/并发/回传基础设施 |
| REQ-005 | Constitution | 无额外分类 LLM、无关键词路由器 |
| REQ-006 | Install | 单一权威源码与 junction 安装 |
| REQ-010 | Activation | 默认关闭，显式启用后跨新任务持续 |
| REQ-011 | Activation | 每个任务隔离 session-local 调度状态 |
| REQ-012 | Activation | 关闭、重置、模型切换和结束时安全恢复 |
| REQ-013 | Activation | 外部手动变更优先，Extension 不夺回所有权 |
| REQ-020 | Policy | 简单任务维持当前主模型、Medium、单 Agent |
| REQ-021 | Policy | 非平凡任务执行内部多方案比较 |
| REQ-022 | Policy | 只有不收敛证据才能启动外部搜索 |
| REQ-023 | Policy | 外部探索必须独立、最小、可证伪 |
| REQ-024 | Policy | 困难类型决定语义动作，不使用固定流水线 |
| REQ-025 | Policy | AI 只请求语义能力，不分配 token/model ID |
| REQ-026 | Policy | 每次增量资源必须预期带来新信息 |
| REQ-027 | Policy | 子 Agent 不复制完整父上下文或完整实现 |
| REQ-030 | Effort | 自动状态机仅 Medium→High→XHigh |
| REQ-031 | Effort | 每次只升一级且先完成新验证尝试 |
| REQ-032 | Effort | 自动路径永不使用 Max |
| REQ-033 | Effort | 不修改 OMP 持久全局 effort |
| REQ-040 | Roles | 能力映射到已有 OMP Agent/模型角色 |
| REQ-041 | Roles | 派发前后验证实际 resolved model/effort |
| REQ-042 | Roles | resolved Max 自动拒绝，手动调用不受影响 |
| REQ-043 | Cost | 相对成本层级可配置，不冒充真实价格 |
| REQ-044 | Cost | 默认每波并发≤2、每任务自动探索≤2 波 |
| REQ-045 | Cost | 无硬 token 预算，无周期性反思 |
| REQ-050 | Evidence | 明确定义不收敛证据与无效触发信号 |
| REQ-051 | Integrity | SOURCE GAP、BLOCKED、路由失败、任务失败分离 |
| REQ-052 | Integrity | 缺事实不通过增加算力补偿 |
| REQ-053 | Integrity | 迟到结果不污染新阶段或新模型 |
| REQ-060 | Commands | 提供 on/off/status/reset 命令合同 |
| REQ-061 | Status | 状态展示实际 route、阶段、波次、恢复和缺口 |
| REQ-062 | Audit | 调度事件记录请求、实际路由、证据、结果与恢复 |
| REQ-063 | Audit | 不记录完整隐藏推理、凭据或完整父上下文 |
| REQ-064 | Audit | 无法读回的事实为空并附 SOURCE GAP |
| REQ-070 | Failure | Extension 失败降级为普通 OMP，不遗留后台循环 |
| REQ-071 | Failure | 不对未知角色或能力静默回退到任意模型 |
| REQ-080 | Verification | 机械测试覆盖状态机、护栏、恢复和完整性 |
| REQ-081 | Verification | 真实 OMP smoke 验证实际父子链与 resolved route |
| REQ-082 | Verification | 命令成功或模型叙述不能代替真实验收 |
| REQ-083 | Delivery | 不触碰 OMP 核心、WeOMP、凭据与现有 Agent 配置 |

> **咨询层需求索引（v1.1-advisory, 现行验收依据）：**

| ID | 领域 | 咨询层需求 | 取代/关联历史 REQ |
|---|---|---|---|
| REQ-100 | Policy | 紧凑 `before_agent_start` 策略注入：每 parent Provider request ≤60 tokens、English、咨询性、generation-scoped 注入事件 | REQ-020..021, REQ-045 的咨询化 |
| REQ-101 | Constitution | 纯咨询：不覆盖/包裹/阻断/变异/取消原生 `task`，不在 Extension 内自动派发，不要求 `weconverge_decide` 前置 | REQ-001/002/004, D-01/D-02/D-05 |
| REQ-102 | Observation | 仅观察：订阅 `tool_call`/`tool_result`/`task:subagent:*` 公开通道，同步观察、永不阻断 | REQ-002, REQ-062 |
| REQ-103 | Observation | 观察者 fail-open：任意观察 handler 抛错或超时仅记 `health: degraded`，不阻断 OMP 执行 | REQ-070 |
| REQ-104 | Effort | 父 effort 阶梯仅适用于 `weconverge_decide raise_effort`：`medium→high→xhigh`，每次一级、需新验证尝试 | REQ-030/031 |
| REQ-105 | Decision | `weconverge_decide` 窄化：仅 `raise_effort`（证据锚定）、`report_source_gap`/`report_blocked`、显式手动授权；常规探索不经此门 | REQ-024..026, REQ-050 |
| REQ-106 | Roles/Cost | 模型感知 Max：按用户配置的能力路由允许 Max，不设全局 Max 禁令；`cost_tiers` 为相对成本，不冒充 wire effort | REQ-032/042/043 |
| REQ-107 | Integrity | `resolvedEffort` 为 SOURCE GAP：无公开 effort 字段时记 `unknown/source_gap`，不以 `relativeCostTier` 冒充 | REQ-041/064 |
| REQ-108 | Cost | 咨询限制：`tasks.length ≤2` / `≤2 波` 等为咨询值，在 `status`/audit 中展示与记录，不在工具边界强制 | REQ-044 |
| REQ-109 | Lifecycle | 单活 full runtime + 有界 detached tombstones（每 generation ≤2，最老丢弃）；`session_switch` 销毁旧 full runtime；public session-delete 为 SOURCE GAP | REQ-011..013, REQ-053 |
| REQ-110 | Integrity | 五类事实永不混淆：`requested / expected / observed / inferred / source_gap` | REQ-051/064 |
| REQ-111 | Audit | 审计记录请求/期望/观察/推断/缺口分层、脱敏、截断（自由文本 ≤200 chars） | REQ-062/063 |
| REQ-112 | Commands | 命令咨询化：`on/off/status/reset` 仅为本地咨询状态，不取消远端子任务，不删会话 | REQ-060/061 |
| REQ-113 | Config | `modelRoles`/`task.agentModelOverrides` 为权威路由表，用户配置 `capabilities/cost_tiers` 仅为咨询期望 | REQ-040/043 |
| REQ-114 | Evidence | `raise_effort` 需 `reasoning_depth_insufficient` + 已确认证据 + baseline 校验 + 变更后读回 | REQ-050/030 |
| REQ-115 | Cost | 成本主目标：父模型 input+output+reasoning 为主；`weconverge_decide` 仅在窄路径产生额外 Provider 调用，不轮询 | REQ-045 |

历史 `REQ-001..083` 仍保留追溯价值；现行实现以 `REQ-100..115` 为准，冲突处以咨询层为准（§0.2）。

## 9. 规范需求

### 9.1 Constitution 与安装

#### REQ-001 独立用户级 Extension

WEConverge 必须独立维护在 `J:\PigeonYang\tools\weconverge`，不得进入 OMP 核心或 WeOMP 产品代码。

#### REQ-002 OMP 是运行事实源

Agent 定义、模型和 effort 解析、父子关系、生命周期与结果以 OMP 正式事件和读回为准。WEConverge 的意图或审计不能覆盖 OMP 事实。

#### REQ-003 正式接口与敏感数据边界

只能使用公开、受支持的 Extension API；不得读取 OMP 未文档化内部文件，不得保存 Provider 密钥或认证材料。

#### REQ-004 不重建 OMP

必须复用 OMP 的 Agent、Task、并发、取消和结果回传，不能建立第二套执行总线。

#### REQ-005 无分类 LLM

默认路径不得新增任何前置、事件级或周期性 LLM 分类调用，也不得用关键词表假装语义判断。

#### REQ-006 单一安装源

OMP 用户 Extension 目录必须是指向权威源码的 junction；不得维护第二份可编辑源码。

### 9.2 启用、任务隔离与恢复

#### REQ-010 默认关闭和持久启用

安装后默认关闭。只有 Owner 显式 `on` 才持久启用，且只对之后的新任务自动生效；当前没有执行中任务时可立即建立新的 session baseline，执行中的任务不得被中途接管。

#### REQ-011 任务状态隔离

每个任务拥有独立状态；不得继承上个任务的失败、候选方案、effort、波次或子 Agent 结论。恢复同一任务时只能从 Extension 审计事件重建并与 OMP actual 状态对账，不能信任模型叙述。

#### REQ-012 状态恢复

任务结束、关闭、reset、卸载或模型切换时，必须恢复 Extension 自己改变的 session-local effort，并明确读回恢复结果。关闭不得终止用户 Agent；WEConverge running child 必须 detached，迟到结果不再触发决策。

#### REQ-013 外部所有权优先

检测到用户或其他组件手动改变 model/effort 后，WEConverge 必须停止覆盖并重新建立 baseline；恢复失败或所有权冲突显示 degraded。

### 9.3 AI-native 策略

#### REQ-020 默认低成本路径

新任务默认当前主模型、Medium、单 Agent。若实际 baseline 不是 Medium，只报告配置偏差，不修改持久配置。

#### REQ-021 内部方案搜索

非平凡任务在当前一次推理内考虑至少两个本质不同方案，只执行一个最优方案，并保留备用方向的简短标识。简单任务可直接执行。

#### REQ-022 外部搜索门槛

只有存在结构化不收敛证据，且下一动作会获得新的可验证信息时，才能启动外部探索。

> **咨询层（v1.1-advisory）：** 该门槛不再作为 Extension 强制门；由父模型自主判断，Extension 仅以 `requested` 观察记录，不拒绝。

#### REQ-023 外部探索形态

每个探索 Agent 只承担一个独立方向的最小调查或可证伪实验，并返回证据、失败和 SOURCE GAP，不宣布父任务完成。

> **咨询层（v1.1-advisory）：** 形态为 policy 建议（`tasks:[≤2]`、`falsifier`），不强制；超规仅记录 `observed`。

#### REQ-024 困难类型路由

方向不明、深度不足、领域不匹配、机械工作、缺事实和确证阻塞必须映射到不同动作；不得强制“先委派再升级”的固定流水线。

#### REQ-025 语义请求

AI 只能选择批准的语义动作，提供障碍、证据、新信息预期和成功判据；不得填写 token 预算或直接指定 Provider/model ID。

> **咨询层（v1.1-advisory）：** 该语义合同在 `weconverge_decide` 窄路径保留；在原生 `task` 路径，父模型直接以 `task` 参数表达意图，Extension 以四类事实分离记录。

#### REQ-026 新信息原则

不能说明将新增什么可验证信息的资源请求必须被拒绝或留在当前路径。

> **咨询层（v1.1-advisory）：** 拒绝仅适用于 `weconverge_decide` 路径；原生 `task` 路径不拒绝，仅记录。

#### REQ-027 最小子任务包

子 Agent 只获得完成独立探针所需的上下文和验收，不得默认复制完整父上下文或派发重复完整实现。

> **咨询层（v1.1-advisory）：** 为咨询建议，不强制截断；audit 仅记录观测长度。

### 9.4 Effort、角色与成本

#### REQ-030 Effort 状态机

自动 effort 只允许 `Medium → High → XHigh`。

> **咨询层（v1.1-advisory）：** 仅适用于父 effort `raise_effort`（REQ-104）；原生 `task` 不受此机约束。

#### REQ-031 单级提升

每次只能提升一级；提升后必须先完成一个新的可验证尝试，才能判断下一次提升。

> **咨询层（v1.1-advisory）：** 同 REQ-030。

#### REQ-032 Max 禁令

任何 WEConverge 自动动作均不得请求或实际使用 Max。XHigh 不收敛后只能换策略、SOURCE GAP、BLOCKED 或请求用户明确授权；明确授权属于手动路径，不改写自动禁令。

> **咨询层（v1.1-advisory）：** 全局自动 Max 禁令退役；仅 `raise_effort` 目标集不含 `max`。原生 `task` 允许 Max，按 REQ-106 模型感知处理。

#### REQ-033 不改持久 effort

WEConverge 不得修改 OMP 持久全局 effort 配置。

### 9.5 证据与完整性

#### REQ-050 不收敛证据

有效证据至少包括：改变实现后同一失败再次出现、两个本质不同 Medium 尝试未通过同一验收、关键假设被真实实验否定、子 Agent 证据冲突，或基于已有可观察证据明确指出当前缺少的具体能力及下一动作将新增的可验证信息。最后一类必须引用已有事实并给出 falsifier；纯模型自述、单次命令错误、主观复杂感、上下文较大或缺外部事实不能单独触发升级。

> **咨询层（v1.1-advisory）：** 该证据门仅约束 `raise_effort`（REQ-114）；原生 `task` 探索不设此门。

#### REQ-051 结果类型分离

路由结果、任务结果、SOURCE GAP、BLOCKED、partial、stale 和 degraded 必须分别建模和展示。

#### REQ-052 缺事实不加算力

缺权限、输入、日志、外部服务状态或必要遥测时，不得自动提高 effort 或增加 Agent。

> **咨询层（v1.1-advisory）：** 阻止对象仅为 Extension 自动动作；父模型自主的原生 `task` 不被 Extension 阻断，Extension 记 `source_gap`。

#### REQ-053 迟到结果隔离

父任务阶段、模型或 generation 已变化时，迟到的子 Agent 结果必须标记 stale，只保留审计，不能自动触发新动作。

> **咨询层（v1.1-advisory）：** stale 通过有界 tombstone 记录（REQ-109）实现。

### 9.6 命令、状态与审计

#### REQ-060 命令合同

必须提供 `/weconverge on|off|status|reset`，非法参数只显示用法且不改变状态。

#### REQ-061 状态真实性

状态至少显示启用、phase、baseline、actual model/effort、探索波次、活动子 Agent、最后决策、恢复健康和 SOURCE GAP。

#### REQ-062 审计字段

每个动作必须记录时间、会话、父 Agent、动作、困难类型、证据摘要、新信息预期、成功判据、请求角色、actual route、相对成本、结果、缺口和恢复结果。

#### REQ-063 审计最小化

审计不得记录完整隐藏推理、Provider 凭据或完整父上下文。

#### REQ-064 不可确认即缺口

无法从 OMP 正式接口确认的 actual route、父子链、价格或额度字段必须为空，并附具体 SOURCE GAP。

### 9.7 失败与验收

#### REQ-070 安全降级

Extension 自身失败不得阻断普通 OMP 任务；必须停止新增自动动作、报告 degraded，并确保没有无限后台探索或未恢复的 Extension 所有状态。

#### REQ-071 禁止任意回退

角色不存在、能力不可用或正式 API 缺失时，不得静默选择任意模型；必须报告 SOURCE GAP 或实现阻塞。

#### REQ-080 机械验证

所有状态转换、成本护栏、所有权、恢复、stale、SOURCE GAP 和 Max 禁令必须有确定性测试。

#### REQ-081 真实 OMP smoke

真实 smoke 必须覆盖关闭对照、简单任务、内部搜索、外部探索、深度提升、专业角色、Max 拒绝、SOURCE GAP、模型切换与关闭恢复。

> **咨询层（v1.1-advisory）：** 外部探索、专业角色、深度提升的验证以**观察**为证据（`tool_call`/`tool_result`/`task:subagent:*` 实测），不以 Extension 派发成功为证据。

#### REQ-082 证据标准

命令退出码、模型叙述、请求的角色或单元测试不能代替 OMP 实际事件、真实父子链、resolved route 和恢复读回。

#### REQ-083 交付边界

验收必须证明未修改 OMP 核心、WeOMP 产品代码、Provider 凭据、全局 effort 和现有 Agent 配置。

## 10. 产品成功指标

首版不以“调用次数越少”作为唯一成功指标，而以最低预期总成本获得可验收结果为目标。

### 10.1 必过指标

1. 关闭状态与简单任务产生零个 WEConverge 子 Agent、零次分类 LLM；
2. 自动调度记录中 Max 使用次数为零；
   > **咨询层（v1.1-advisory）：** 该指标仅适用于 `raise_effort` 目标集；原生 `task` 的 Max 以 `observedIsMax` 观察标注，不计为 Extension 违规。
3. 每个增量资源动作都存在证据引用、新信息预期和成功判据；
   > **咨询层（v1.1-advisory）：** 适用于 `weconverge_decide` 路径；原生 `task` 路径以 `requested` 观察为准。
4. 每个实际派发都有 OMP resolved route 读回，或明确 SOURCE GAP；
5. 所有任务结束、关闭和模型切换 smoke 均无 Extension 所有的未恢复 effort；
6. 缺外部事实的 smoke 不产生 effort 提升或新增 Agent；
   > **咨询层（v1.1-advisory）：** 指 `raise_effort` 不因缺事实而触发；原生 `task` 不被强制阻止。
7. 外部探索不超过配置上限，且每个 Agent 的方向和验收互不重复；
   > **咨询层（v1.1-advisory）：** 上限为咨询值，以观测记录为准，不强制拒绝。
8. 真实 smoke 的父子链、模型、effort 和结果来自 OMP 事件，不来自模型自述。

### 10.2 观察指标

以下指标用于后续校准，不作为首版虚假承诺：

- 增量资源动作后首次获得新有效证据的比例；
- 相同失败签名的无效重复次数；
- 简单任务被误升级的比例；
- SOURCE GAP 被错误升级的比例；
- 专业角色相对通用角色的验收通过率；
- 可获得真实价格遥测时的货币成本变化。

价格或额度遥测不可用时，货币成本指标保持 SOURCE GAP。

## 11. 首版发布门

只有以下条件同时成立，首版才可宣布功能完成：

1. PRD、SPEC 与批准设计全量可追溯，无缺失或反向弱化；
2. 所需 OMP Extension 正式 API 已验证；缺失关键 API 时保持 BLOCKED，不使用内部文件绕过；
3. 机械测试全部通过；
4. 真实 OMP smoke 全部通过；
5. 安装是 junction，权威源码唯一；
6. 自动路径未出现 Max；
   > **咨询层（v1.1-advisory）：** 同 10.1 备注，仅考核 `raise_effort` 路径。
7. 所有恢复和所有权测试通过；
8. SOURCE GAP 没有被误报成路由失败或任务失败；
9. 未修改明确禁区；
10. Owner 完成最终产品验收。

> **咨询层发布门补充（v1.1-advisory, 替代历史 SPEC §22 强制 ladder 门）：** 除上述门外，咨询层以 SPEC §13 的机械/真实/成本三层分立验收为准；历史 AC-105/107/108 的强制派发门及 **AC-L02 Provider payload 回读门（D-08 RETIRED）** 已退役，以观察/确定性握手证据替代。T14 修订版 live 门计入 AC-A18、排除 AC-L02。

## 12. 设计覆盖表

| 批准设计章节 | PRD 覆盖 |
|---|---|
| 1 产品定义、2 问题、3 目标 | §§3-5，G-001..005 |
| 4 非目标 | §6 |
| 5 OMP 边界、6 独立维护 | REQ-001..006 |
| 7 启用语义 | REQ-010..013 |
| 8 AI-native 接口 | REQ-024..026 |
| 9 两阶段搜索、10 收敛 | REQ-020..023、REQ-050 |
| 11 困难映射 | REQ-024、REQ-052 |
| 12 模型角色 | REQ-040..043 |
| 13 effort 状态机 | REQ-030..033 |
| 14 成本保护 | REQ-026、REQ-043..045 |
| 15 SOURCE GAP/BLOCKED | REQ-051..052、REQ-064、REQ-071 |
| 16 Session/切换/恢复 | REQ-011..013、REQ-053 |
| 17 命令/status | REQ-060..061 |
| 18 审计 | REQ-062..064 |
| 19 失败处理 | REQ-070..071 |
| 20 测试、21 完成条件 | REQ-080..083、§§10-11 |
| 22 产品边界结论 | G-001..005、§11 |

设计中的每一项硬约束都必须在 `SPEC.md` 映射到规范能力和验收项。没有映射的需求视为 SPEC 退化，禁止进入实施。

---

## 13. 咨询层需求（v1.1-advisory — 现行实施依据）

### 13.1 宪章与观察

#### REQ-100 紧凑策略注入（Compact policy injection）

启用任务的策略块必须通过 `before_agent_start` 以 `BeforeAgentStartEventResult.systemPrompt: string[]` 返回满足：
1. 内容为 English、咨询性、≤60 tokens / parent Provider request；
2. 含一条 directive + 两条 bullet + 字面量 `task(context, tasks:[≤2])` 引用；
3. generation-scoped 注入事件（`session_start`/`session_switch` 与 `off→on` 时各一次），但计费按每 parent Provider request 含该 policy 计（最坏 `≤60×T` tokens / T requests，无 prompt-cache 折扣假设；实际计费/缓存为 SOURCE GAP）；
4. 不产生额外 Provider 调用；模型可忽略该策略，无强制后效；
5. **D-08 官方 hook 握手**：注册的公共 `before_agent_start` handler 在 enabled 时确定性返回精确有界 WEConverge policy 块；同 generation 复用相同 content/fingerprint；disabled 返回无 policy；token ≤60；无需 Provider 调用/回读（AC-A18）。
> **D-08  advisory**：`before_agent_start.systemPrompt` 的下游 OMP 组装与最终 Provider payload 呈现为 OMP 官方 hook 合同，超出 WEConverge 责任边界；Extension 不检验最终 Provider payload，其缺失不记为产品 SOURCE GAP（AC-L02 已 RETIRED）。

#### REQ-101 纯咨询（Pure advisory — no enforcement）

Extension 必须**不**覆盖/包裹/阻断/变异/取消原生 `task`，不调用 `ctx.invokeTool("task")`，不设工具边界并发/波次/debounce 强制，不要求 `weconverge_decide` 前置。`OMP native Task` 为唯一执行器与结果装配者。

#### REQ-102 仅观察

Extension 必须通过公开 `pi.on("tool_call")` / `pi.on("tool_result")` / `pi.events.on("task:subagent:*")` 订阅观察：
- `tool_call` 记 `requested`（模型实际发射的 `task` 参数）；
- `tool_result` 记 `details: SingleResult[]`（OMP 装配结果）；
- `task:subagent:lifecycle|progress|event` 记 `observed`（`childId/agent/parentToolCallId/sessionFile/status/resolvedModel` 等，能取到才记）；
- 所有 handler 同步、不阻塞、不改 `input`、不取消、不变异。

#### REQ-103 观察者 fail-open

任意观察 handler 抛错或超出同步预算（≤5 ms、无 `await`/IO/网络）时，必须捕获、记 `health: degraded` + `sourceGaps += ["observer:<reason>"]`，并让 OMP 原生执行继续。不产生 block、revision、retry、或对模型的重写提示。

### 13.2 Effort 与决策

#### REQ-104 父 effort 阶梯（Parent-effort only ladder）

自动 effort 阶梯 `medium → high → xhigh` 仅适用于 `weconverge_decide raise_effort`，且必须满足：`difficultyType == reasoning_depth_insufficient`、存在已确认证据、当前方向仍有效、当前 effort ∈ {medium,high}、上次提升后已完成新验证尝试、OMP 正式 API 能 session-local 变更并读回。任一不满足即拒绝；`max` 永不作为自动目标。

#### REQ-105 窄化决策门（Parent-effort-only decide）

`weconverge_decide` 仅保留三类用途：
1. `raise_effort`（满足 REQ-104）；
2. 正式 `report_source_gap` / `report_blocked`（分别满足 SPEC 咨询层对应字段门）；
3. 显式手动授权/手动探索许可。
常规探索（external_exploration）不经此门，由父模型直接发射原生 `task`，以 `tool_call` 观察为准。`weconverge_decide` 在 narrow 路径外返回 `rejected` 且零副作用。

### 13.3 角色、成本与事实

#### REQ-106 模型感知 Max（Model-aware Max policy）

`cost_tiers` / `capabilities` 为用户配置的相对成本与能力→角色期望映射，不证明 wire effort。全局自动 Max 禁令退役；能力路由按 `modelRoles` / `task.agentModelOverrides` 解析到的实际 resolved model 是否具备 Max 能力来做**咨询标注**（`expectedMaxCapable: inferred`, `observedIsMax: true/false`），不做工具边界阻断。`relativeCostTier` 永不冒充 `resolvedEffort`。

#### REQ-107 已解析 effort 为 SOURCE GAP

在公开 Extension 面未暴露稳定 `resolvedEffort` 前，任何 `observed.resolvedEffort` 必须为 `unknown` 或 `source_gap`；不得以 `relativeCostTier` 或 `resolvedModel` 后缀推断为已证明的 effort。`observed.resolvedModel` 后缀仅为咨询佐证（`inferred`），不作为已证明 effort。

#### REQ-108 咨询限制（Advisory limits — not enforced）

`maxParallelExplorers ≤2` / `maxExplorationWaves ≤2` / `tasks.length ≤2` / `falsifier` / 去重 等为**咨询值**，在 `status` 展示、在 audit 中以 `observed` 记录，不在工具边界阻断。模型发射 `tasks.length >2` 或第三波时，Extension 记录观测值并附 `advisoryNote`，不拒绝。

### 13.4 运行时与缺口

#### REQ-109 运行时与墓碑生命周期

任意时刻恰好一个 active full runtime（当前 `sessionId#generation`），含 policy injector / observer / state keeper / command handlers；迟到子任务以**有界 minimal detached tombstone** 记录（`childId/parentToolCallId/sessionFile/status/resolvedModel?` + 截断输出预览 ≤200 chars），不含 handler、不占事件总线。成功 `session_switch` 销毁旧 full runtime。Public session-delete 事件为 SOURCE GAP，tombstone 以每 generation 最多 2 个、超限丢弃最老的方式回收。

#### REQ-110 事实分类（Fact taxonomy — never conflated）

任何路由/成本陈述必须标注且永不混淆：
- `requested`（`tool_call` 实发参数）、`expected`（配置期望）、`observed`（公开事件/结果字段回读）、`inferred`（基于 `cost_tiers`/命名启发式，显式标注）、`source_gap`（公开 API 不可得）。`requested→observed` / `expected→resolved` 等提升禁止。

#### REQ-111 审计分层与卫生

每条 audit 必须分层记录 `requested / expected / observed / inferred / source_gaps`，对凭据/隐藏推理/完整父上下文脱敏，自由文本在审计边界截断 ≤200 chars。写入失败仅记 `health: degraded`，不阻断普通 OMP。

### 13.5 命令与状态

#### REQ-112 命令咨询化

`weconverge on|off|status|reset` 通过 `registerCommand` 注册，仅为本地咨询状态转换：`off` 不取消远端子任务（标记 detached）、`reset` 清空当前 generation 咨询状态但保留 audit、`status` 只读且含 `advisoryNote: pure advisory — no enforcement`。非法参数返回 usage 且零状态变化。

### 13.6 配置与证据

#### REQ-113 配置权威

`modelRoles` / `task.agentModelOverrides` 为 OMP 权威；WEConverge 只读不写。`enabled` 持久化经 `appendEntry` + 版本化自有文件双轨（`--no-session` 下记 `health: degraded` 而非伪造持久化）。

#### REQ-114 提升证据

`raise_effort` 除 REQ-104 前置外，还必须满足 SPEC 咨询层 §4.2 的 evidence 门（至少一个 confirmed evidence + `expectedNewInformation` + `successCriterion` + `obstacle`）。

### 13.7 成本

#### REQ-115 成本主目标

父模型 input+output+reasoning 为主成本；子成本次之。常规探索零 Extension 诱发 Provider 调用（父直接批处理原生 `task`）；无轮询；策略文本有界（REQ-100）；子输出紧凑性不作保证，audit 仅对其副本截断。

## 14. 咨询层追溯（REQ → 现行 AC 概览）

| 咨询 REQ | 现行 AC (SPEC §13) |
|---|---|
| REQ-100 | AC-A01 (policy bounded ≤60 tokens, generation-scoped) + **AC-A18 (deterministic official-hook handoff — D-08)** |
| REQ-101 | AC-A02 (no wrapper/block/mutation/cancel/auto-dispatch) |
| REQ-102 | AC-A03..A04 (observation channels) |
| REQ-103 | AC-A05 (fail-open) |
| REQ-104 | AC-A08..A10 (parent-effort ladder) |
| REQ-105 | AC-A06..A07 (decide narrow gate) |
| REQ-106 | AC-A11 (model-aware Max advisory) |
| REQ-107 | AC-A07, AC-A11 (resolvedEffort source_gap) |
| REQ-108 | AC-A12 (advisory limits observed) |
| REQ-109 | AC-A13 (runtime + tombstones) |
| REQ-110 | AC-A14 (taxonomy never conflated) |
| REQ-111 | AC-A04, AC-A15 (audit) |
| REQ-112 | AC-A16 (commands) |
| REQ-113 | AC-A17 (config authority) |
| REQ-114 | AC-A06, AC-A08 (effort evidence) |
| REQ-115 | AC-C01..C03 (cost) |

> **D-08 映射**：AC-A18 映射至 REQ-100 / CAP-A01，确定性证据为 handler 返回值与 fingerprint 复用；live 门 `AC-L02` 已 RETIRED，不再计入 T14 live 必过门。行为 canary（模型是否实际遵从 policy 探索）不作为验收证据，因模型遵从非确定性。

历史 `REQ-001..083` 的完整机械/真实映射保留于 SPEC §12 咨询层历史表；现行映射以本表与 SPEC §13 为准。
