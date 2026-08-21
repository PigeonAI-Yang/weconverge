# WEConverge

> **别让 AI 一上来就无脑烧满算力：WEConverge，让长任务真正稳步收敛。**

WEConverge 是运行在 [Oh My Pi (OMP)](https://github.com/canis-aur/oh-my-pi) 之上的 **AI 原生调度策略插件（Extension）**。

它不重新造一套 Agent 框架，也不增加昂贵的前置分类模型，而是直接向主力 AI 提供一套**成本递增的能力工具箱**与**收敛纪律**——让 AI 根据实际执行证据决定何时继续、何时换思路、何时派发子任务，并在关键节点严格控制算力消耗与止损。

---

## 解决什么痛点？

日常让 AI 处理长链路编码或 Debug 时，经常遇到以下问题：

* **杀鸡用牛刀**：几行代码的小改动，AI 默认拉满 Thinking Max 硬憋数分钟，浪费额度与时间。
* **卡住就鬼打墙**：一旦思路不对，AI 在同一种错误方案里反复微调、原地打转，不断生成无效代码。
* **盲目开分身**：动辄并发派发 4~5 个子 Agent，互相抄答案或重复读取全仓库，算力开销成倍放大。
* **事后才发现失控**：缺乏客观的执行与路由审计，额度烧完了才发现底层模型并未按预期生效。

---

## 核心设计原则

### 1. 默认克制：绝不在开始前瞎猜难度
* **低成本起步**：默认使用当前配置的主力模型、**Medium** 思考强度、单 Agent 执行。
* **按需升级**：不做前置分类调用；只有在目标代码验证失败、产生真实反例证据后，才允许向更高梯队申请资源。

### 2. 证据驱动：卡住换方向，拒绝无效死磕
* **方案多维分叉**：面对复杂任务，AI 必须先在内部对比多个**本质不同**的假设与路径，而非同一方案换个写法。
* **显式收敛动作**：遇到阻碍时，必须提交明确的调度决策（如切换备选方案、派发轻量探路 Agent、引入专业审核角色或报告 SOURCE GAP）。每一次算力提升都必须说明“预期获得什么新信息”。

### 3. 按模型和角色判断成本，不把 Max 一刀切
* **父会话可配置阶梯**：`weconverge_decide` 的 `raise_effort` 按 `settings.json` 中 `effortPolicies` 的按模型阶梯逐级提升（键精确为 `effortPolicies.rules[].match` / `rules[].automaticEfforts` / `default.automaticEfforts`，有序首匹配、大小写敏感全量 glob 仅 `*`/`?`、effort 后缀剥离；未配置时走内置兼容 `Medium → High → XHigh`；已配置且显式包含 `max` 时可自动升至 `max`，否则不自动至 `max`）。每次仅升至已配置的下一阶，且执行后立即读回实际 effort；不存在 blanket Max 禁令，也不设需要用户按次审批的流程。
* **子任务仅观察不阻断**：父模型通过原生 OMP `task` 派发的子代理/子任务（无论路由到何种 effort，含 `Max` 的日常档位）属于按模型和角色区分的正常选项，WEConverge 仅记录为 `observedIsMax` 等咨询标注，不在执行前拒绝、不改写、不取消；该类原生 `task` 不经父会话 `raise_effort` 的阶梯门控。
* **模型感知、无全局禁令**：成本判断以 `modelRoles` / `task.agentModelOverrides` 等实际路由与 `effortPolicies` 匹配到的阶梯为准，不把标签为 `Max` 的路由一刀切；无前置 token/额度消耗预估，无全局 Max 禁令，用户通过 OMP 自行选择的模型/思考强度不受此梯阶限制。配置示例均用中性虚构 ID（如 `acme/*`、`other/bar`），不使用真实模型名。
### 4. 无缝复用 OMP：即插即用，零系统侵入
* 完全复用 OMP 原生的 Agent 角色、模型路由、Task 派遣、工具链路与生命周期。
* 作为用户级 Extension 独立安装与升级，不侵入 OMP 核心，不强制绑定私有运行时。

### 5. 真实审计：请求与实跑分离
* 分开记录“请求的模型/角色”与“实际 resolved 的 model / effort”。
* 每次决策形成完整的 `decision_received → validated → action_started → terminal` 事件链，支持断点恢复与全链路追溯。

---

## 实测基准（5 组严格配对对照）

在相同任务、相同 commit、相同 prompt、相同主模型与 effort 的严格控制变量实验中（涵盖 pytest、Matplotlib、Django、Seaborn、Astropy 等实际代码任务）：

| 指标 | WEConverge ON | WEConverge OFF | 对比结果 |
|---|---|---|---|
| **配对胜负** | **3 胜** | 1 胜 | 1 平局 |
| **平均耗时** | **9.81 分钟** | 11.23 分钟 | **提速 ~12.6%** |
| **Seaborn 任务** | **8.19 分钟** | 14.35 分钟 | **提速 ~43%** |
| **Matplotlib 任务** | **8.43 分钟** | 11.43 分钟 | **提速 ~26%** |
| **交付成功率** | **5/5 (100%)** | 5/5 (100%) | 提速不以牺牲质量为代价 |

> *注：数据来源于已固化的 5 组端到端代码修复实验。WEConverge 的核心价值在于帮助模型在遇到分支阻碍时更快收敛到正确根因，避免无效消耗。*

---

## 快速上手

### 安装
确保本插件目录位于 OMP 的 extensions 路径下（或通过软链接/junction 接入）：
```powershell
# 例如接入到 OMP 用户插件目录
J:\OhMyPi\data\.omp\agent\extensions\weconverge -> J:\PigeonYang\tools\weconverge
```

### 控制命令

在 OMP 会话中直接输入以下斜杠命令即可完成控制：

```text
/weconverge on       # 开启智能调度策略（持久生效于后续新任务）
/weconverge off      # 关闭智能调度策略
/weconverge status   # 查看当前运行状态、baseline 与配置
/weconverge reset    # 重置当前任务状态与 baseline，保留启用状态
```

---

## 可配置按模型自动 effort 阶梯

在 `settings.json` 顶层可选添加 `effortPolicies`（键名大小写精确），按模型声明自动升档阶梯。未配置时行为与历史一致（内置 `medium→high→xhigh`）；配置存在但校验失败时 `raise_effort` 自动升档被禁用并在 `status` 报告 `CONFIG ERROR`。

```json
{
  "effortPolicies": {
    "rules": [
      { "match": "acme/*", "automaticEfforts": ["medium", "high", "xhigh"] },
      { "match": "other/*", "automaticEfforts": ["high", "xhigh", "max"] }
    ],
    "default": { "automaticEfforts": ["medium", "high", "xhigh"] }
  }
}
```

- **键精确**：仅 `effortPolicies.rules[].match` / `rules[].automaticEfforts` / `default.automaticEfforts`。
- **有序首匹配**：按 `rules` 声明顺序首条命中即止，未命中回退 `default`；大小写敏感，全量匹配，仅 `*`/`?` 为通配，`provider/model:effort` 中 `:effort` 后缀不参与匹配。
- **仅下一阶**：每次 `raise_effort` 仅升至匹配到阶梯的下一阶，可非连续（如 `medium→xhigh`），已含 `max` 时可自动至 `max`；否则不自动至 `max`。每次执行后立即读回实际 effort。
- **原生 `task` 不受阶梯门控**：父模型直接发射的 `task(tasks:[...])` 保持咨询观察、不阻断、不改写，仅作 `observed` 记录。
- **示例 ID 均为虚构**（如 `acme/*`），不使用真实模型名；不引入按次用户授权流程。

---

## 适用场景

* **重度依赖 AI 处理长链路任务**：如多文件重构、开源 Issue 修复、跨模块联调。
* **配置了多模型与多 Agent 角色**：希望按需分工而不是一刀切调用高价模型。
* **注重算力投入产出比**：拒绝无意义的算力堆叠与失控并发。

---

## 理念

> **让 AI 决定当前缺少什么能力；让插件保障每一次调用都有证据、有边界、可收敛。**
