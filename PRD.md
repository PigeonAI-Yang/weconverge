# WEConverge PRD

- 状态：Proposed requirement baseline — pending Owner review
- 版本：1.0.0
- 日期：2026-08-19
- 产品：WEConverge
- 形态：Oh My Pi 用户级 Extension
- 权威项目：`J:\PigeonYang\tools\weconverge`
- 上游批准设计：`docs/spark/2026-08-19-weconverge-design.md`

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

## 2. Owner 核准事实

用户于 2026-08-19 核准 WEConverge 设计，并授权编写随附 PRD 与 SPEC：

> 我同意 核准了.现在我请你将此方案随附的PRD/SPEC都写好,尤其是SPEC,一定不能有退化

本次授权仅覆盖产品合同文档，不授权实现、安装、修改 OMP/WeOMP 或改变用户现有模型与 Agent 配置。

## 3. 产品命题

WEConverge 是 OMP 原生 Agent、模型角色和 Task 派遣机制之上的 AI-native 调度策略层。

OMP 已解决“有哪些 Agent、如何派发、如何并发和回传”。WEConverge 解决“什么时候值得继续、换方案、增加搜索宽度、提高推理深度、调用专业能力，或者因缺少事实而停止烧额度”。

产品原则：

> AI 决定当前缺少什么能力；WEConverge 以成本递增的方式提供能力，并记录真实动作与结果。

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

## 7. 首版用户旅程

### J-001 默认关闭

Extension 安装后不改变任何任务。Owner 执行 `/weconverge on` 后，启用状态对后续新任务持续生效。

### J-002 简单任务保持便宜

Owner 提交封闭、路径明确、可一次验证的任务。主力 AI 直接执行，保持单 Agent、当前主模型与 Medium，不产生额外分类调用。

### J-003 非平凡任务先内部比较

主力 AI 在当前一次推理内比较至少两个本质不同方向，只执行一个最优方向，并保留简短备用方向标识。完整隐藏推理不写入审计。

### J-004 方向不明时外部探路

已有证据表明当前路径不收敛，且障碍是方向不明。主力 AI 提出独立探路任务，WEConverge 调用便宜 OMP Agent 做最小可证伪实验，主力 AI 综合证据。

### J-005 推理深度不足时逐级提升

方向明确且 Medium 尝试被证据证明无法闭合。WEConverge 只提升一级至 High；完成新的可验证尝试后，仍不收敛才允许 XHigh；永不自动进入 Max。

### J-006 调用专业能力

障碍来自领域能力不匹配。AI 请求一种能力，WEConverge 通过用户配置解析到 OMP 已有专业角色，例如把前端能力映射到 `designer`。产品不硬编码 Kimi K3，也不改 OMP 配置。

### J-007 缺事实时停止烧额度

缺少权限、文件、日志、外部服务状态、价格或额度遥测时，WEConverge 报告具体 SOURCE GAP，不增加 effort 或并发。

### J-008 关闭与恢复

Owner 执行 `/weconverge off`，Extension 停止新动作并恢复自己拥有的 session-local effort 变更，不覆盖用户手动变更，不修改持久 OMP 配置。用户创建的 Agent 不被终止；WEConverge 已派发且仍运行的 child 标记 detached，其迟到结果只进入审计，不再参与路由。

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

#### REQ-023 外部探索形态

每个探索 Agent 只承担一个独立方向的最小调查或可证伪实验，并返回证据、失败和 SOURCE GAP，不宣布父任务完成。

#### REQ-024 困难类型路由

方向不明、深度不足、领域不匹配、机械工作、缺事实和确证阻塞必须映射到不同动作；不得强制“先委派再升级”的固定流水线。

#### REQ-025 语义请求

AI 只能选择批准的语义动作，提供障碍、证据、新信息预期和成功判据；不得填写 token 预算或直接指定 Provider/model ID。

#### REQ-026 新信息原则

不能说明将新增什么可验证信息的资源请求必须被拒绝或留在当前路径。

#### REQ-027 最小子任务包

子 Agent 只获得完成独立探针所需的上下文和验收，不得默认复制完整父上下文或派发重复完整实现。

### 9.4 Effort、角色与成本

#### REQ-030 Effort 状态机

自动 effort 只允许 `Medium → High → XHigh`。

#### REQ-031 单级提升

每次只能提升一级；提升后必须先完成一个新的可验证尝试，才能判断下一次提升。

#### REQ-032 Max 禁令

任何 WEConverge 自动动作均不得请求或实际使用 Max。XHigh 不收敛后只能换策略、SOURCE GAP、BLOCKED 或请求用户明确授权；明确授权属于手动路径，不改写自动禁令。

#### REQ-033 不改持久 effort

WEConverge 不得修改 OMP 持久全局 effort 配置。

#### REQ-040 复用角色

能力名称通过 WEConverge 配置映射到 OMP 现有 Agent/模型角色；专业模型由用户在 OMP 中配置。

#### REQ-041 实际路由读回

请求角色与 actual resolved agent/model/effort 必须分别记录。无法读回时不得宣称路由通过。

#### REQ-042 Max 路由拒绝

自动派发必须能在 Provider 调用前解析并确认目标 effort。preflight 结果为 Max 时必须拒绝，并报告成本护栏冲突；若 OMP 正式 API 只能在调用后提供 actual effort，则自动派发能力保持 BLOCKED，不能先调用再把事后发现 Max 算作护栏通过。用户手动调用不受 Extension 拦截。

#### REQ-043 相对成本配置

首版使用用户配置的相对成本层级做选择；当专业角色和更高 effort 都能补齐同一能力时，必须选择预计成本更低的合法候选并记录比较。价格、余额、额度遥测缺失时显示 SOURCE GAP，不估算货币成本。

#### REQ-044 探索上限

默认每波最多两个探索 Agent，每任务最多两波自动探索。用户可降低上限；扩大上限需要当前任务内的明确人工授权。

#### REQ-045 禁止伪预算

不得用主力 AI 主观生成的 token 数字作为预算，也不得增加周期性反思调用。

### 9.5 证据与完整性

#### REQ-050 不收敛证据

有效证据至少包括：改变实现后同一失败再次出现、两个本质不同 Medium 尝试未通过同一验收、关键假设被真实实验否定、子 Agent 证据冲突，或基于已有可观察证据明确指出当前缺少的具体能力及下一动作将新增的可验证信息。最后一类必须引用已有事实并给出 falsifier；纯模型自述、单次命令错误、主观复杂感、上下文较大或缺外部事实不能单独触发升级。

#### REQ-051 结果类型分离

路由结果、任务结果、SOURCE GAP、BLOCKED、partial、stale 和 degraded 必须分别建模和展示。

#### REQ-052 缺事实不加算力

缺权限、输入、日志、外部服务状态或必要遥测时，不得自动提高 effort 或增加 Agent。

#### REQ-053 迟到结果隔离

父任务阶段、模型或 generation 已变化时，迟到的子 Agent 结果必须标记 stale，只保留审计，不能自动触发新动作。

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

#### REQ-082 证据标准

命令退出码、模型叙述、请求的角色或单元测试不能代替 OMP 实际事件、真实父子链、resolved route 和恢复读回。

#### REQ-083 交付边界

验收必须证明未修改 OMP 核心、WeOMP 产品代码、Provider 凭据、全局 effort 和现有 Agent 配置。

## 10. 产品成功指标

首版不以“调用次数越少”作为唯一成功指标，而以最低预期总成本获得可验收结果为目标。

### 10.1 必过指标

1. 关闭状态与简单任务产生零个 WEConverge 子 Agent、零次分类 LLM；
2. 自动调度记录中 Max 使用次数为零；
3. 每个增量资源动作都存在证据引用、新信息预期和成功判据；
4. 每个实际派发都有 OMP resolved route 读回，或明确 SOURCE GAP；
5. 所有任务结束、关闭和模型切换 smoke 均无 Extension 所有的未恢复 effort；
6. 缺外部事实的 smoke 不产生 effort 提升或新增 Agent；
7. 外部探索不超过配置上限，且每个 Agent 的方向和验收互不重复；
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
7. 所有恢复和所有权测试通过；
8. SOURCE GAP 没有被误报成路由失败或任务失败；
9. 未修改明确禁区；
10. Owner 完成最终产品验收。

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
