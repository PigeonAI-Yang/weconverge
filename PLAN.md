# WEConverge — PLAN.md（依赖有序执行计划）

- 版本：1.0.0 / 2026-08-19
- 权威顺序：PRD §1。本计划不得删减需求、不得弱化验收。
- 唯一机器可校验台账：`ledger.json`（由 `scripts/check-ledger.mjs` 校验依赖与状态）。
- 规则：一次只推进一个依赖已满足的任务；状态 `in_progress` 前置依赖全 `done`；状态 `done` 前置 `in_progress` 且已验收；`blocked` 须附证据，不得伪装 `done`。

## 依赖顺序

```
T01 能力探针 CP-001..010        (无依赖)        → done   [CAPABILITY_PROBE.md]
T02 技术设计                    (T01)           → done   [TECHNICAL_DESIGN.md]
T03 计划 + 机器台账             (T02)           → done   [PLAN.md, ledger.json]
T04 实现纯核心引擎             (T03)           → in_progress [src/core/*]        AC-001..044(引擎)
T05 实现 OMP 接线              (T04)           → pending [src/extension.ts]  CAP-001/002/010/012/014
T06 运行机械验收 AC-001..044   (T04,T05)       → pending [test/mechanical.test.ts]  AC-001..044
T07 安装 junction + 真实OMP报告 (T06)          → blocked [extensions/weconverge -> repo; ACCEPTANCE.md] AC-101..115
T08 只读代码审查 + 修复        (T06)           → pending
T09 本地提交                    (T07,T08)       → pending
```

> 2026-08-20 状态纠偏（Owner 批准）：2026-08-19 验收 REJECTED。T07 在 AC-101..115
> 具备真实 OMP 证据前保持 blocked；T04/T05/T06/T08/T09 回到修复轨道。
> 一次只允许一个 in_progress。

## 每个任务的验收门槛

- **T04**：核心模块编译通过（`tsc --noEmit` 对 core）；不引入运行时 OMP 依赖。
- **T05**：`extension.ts` 类型契合公开 `ExtensionAPI`；仅 `import type` 引用 OMP 包；不修改禁区。
- **T06**：`test/mechanical.test.ts` 全绿（AC-001..044 每项至少 1 断言）。
- **T07**：junction 目标 = 仓库绝对路径且可读；AC-101 安装维达成；AC-102..115 环境 BLOCKED 的逐项证据写入 ACCEPTANCE.md，不伪造 PASS。
- **T08**：审查清单（禁区未改、无第二套调度、审计脱敏、幂等、恢复、Max 禁令）逐项核对；发现问题修复后重跑 T06。
- **T09**：仓库工作树干净（仅本项目），已本地 commit；无远端/push/发布。

## 阻塞与门

- CP-003/CP-004(child) 不可经公开 API 证明 → 自动 child 路由实现保持 BLOCKED 分支，不伪造（见 CAPABILITY_PROBE.md）。
- 2026-08-20 更正：本机存在可驱动 OMP 运行时（`J:\OhMyPi\bin\omp.exe` v17.3.7，PTY 下 TUI 正常加载 extension）。此前"本沙箱无可驱动 OMP 运行时"的定性作废。AC-101..115 必须在隔离 profile、非 Max route 下用真实 OMP 逐项取证；无法安全执行的场景保持 BLOCKED 并写明缺哪个正式 API。
- 任何 `blocked` 必须引用证据（探针/源码/配置），禁止"未调查"当 PASS。
