# WEConverge — PLAN.md（依赖有序执行计划）

- 版本：1.0.0 / 2026-08-20（纯咨询权威：docs/spark/2026-08-20-weconverge-pure-advisory-design.md）
- 权威顺序：PRD §1。本计划不得删减需求、不得弱化验收。
- 唯一机器可校验台账：`ledger.json`（由 `scripts/check-ledger.mjs` 校验依赖与状态）。
- 规则：一次只推进一个依赖已满足的任务；状态 `in_progress` 前置依赖全 `done`；状态 `done` 前置依赖全 `done` 且已验收；`blocked` 须附证据，不得伪装 `done`。
- 纯咨询态：历史 2026-08-19 基线与已完成/阻塞定性原样保留；新增 T10..T14 为 Owner 于 2026-08-20 批准的纯咨询实现链，未完成前保持 pending/blocked，不伪造完成。

## 依赖顺序

```
T01 能力探针 CP-001..010                     (无依赖)        → done   [CAPABILITY_PROBE.md]
T02 技术设计                                 (T01)           → done   [TECHNICAL_DESIGN.md]
T03 计划 + 机器台账                          (T02)           → done   [PLAN.md, ledger.json]
T04 实现纯核心引擎                          (T03)           → done   [src/core/*]        AC-001..044(引擎)
T05 实现 OMP 接线                           (T04)           → done   [src/extension.ts]  CAP-001/002/010/012/014
T06 运行机械验收 AC-001..044                (T04,T05)       → done   [test/mechanical.test.ts + extension.integration.test.ts]  AC-001..044
T07 安装 junction + 真实OMP报告              (T06)           → blocked [extensions/weconverge -> repo; ACCEPTANCE.md] AC-101..115
T08 只读代码审查 + 修复                     (T06)           → done    [REVIEW.md] deterministic PASS; mechanical 210/210, extension integration 95/95, core+extension typecheck exit 0
T09 本地提交                                 (T07,T08)       → pending
T10 纯咨询规划迁移(PLAN/ledger/checker)      (T08)           → done [PLAN.md, ledger.json, scripts/check-ledger.mjs] 纯咨询权威链与退役映射，已于 8ea7f34 完成
T11 实现纯咨询核心(策略注入/观察/audit)      (T10)           → done [src/core/*, src/extension.ts] 移除 task wrapper/block/mutation, commit 48621b9
T12 实现纯咨询 OMP 接线                      (T11)           → done [src/extension.ts, types/omp-extension-api.d.ts] before_agent_start 咨询注入 + 观察, 32 members verified
T13 纯咨询机械验收                           (T11,T12)       → done [test/extension.integration.test.ts] 110 passed 0 failed incl. AC-A18 official-hook handoff (POLICY 35 ≤60)
T14 修订版真实 OMP 咨询验收                  (T13)           → blocked [ACCEPTANCE_ADVISORY.md AC-L01/L03/L04/L05/C01/C02/C03 — AC-L02 RETIRED per D-08] 需真实 OMP 回读，剩余 3 门 SOURCE GAP/NOT OBSERVED 前保持 blocked
```

> 2026-08-20 状态纠偏（Owner 批准）：历史 2026-08-19 验收 REJECTED 已保留在
> ACCEPTANCE.md/ledger.json。当前 T04/T05/T06/T08 已按现有证据完成；T07 因
> AC-101..115 仍含 BLOCKED/SOURCE GAP 保持 blocked；T09 继续 pending。
> 2026-08-20 咨询实现收敛（Owner 批准，commit 48621b9）+ D-08 修正（AC-L02 RETIRED → AC-A18）：T10 规划迁移已于 8ea7f34 完成；T11/T12/T13 已于 commit 48621b9 实现并通过机械/类型校验（npm run typecheck:core exit 0, npm run check:types 32 members verified, `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → 110 passed 0 failed incl. AC-A18 deterministic official-hook handoff, POLICY 35 tokens ≤60），状态 done；T14 修订版真实 OMP 咨询验收因 ACCEPTANCE_ADVISORY.md 中 AC-L04 NOT OBSERVED (PARTIAL)、AC-L05 SOURCE GAP、AC-C03 NOT OBSERVED 保持 blocked（AC-L02 RETIRED per D-08, 已排除，不作为阻塞），未升格为 done；当前无 in_progress，满足至多一个进行中约束（仅 T14 blocked 剩余，零 in_progress 合法）。

## 每个任务的验收门槛

- **T04**：核心模块编译通过（`tsc --noEmit` 对 core）；不引入运行时 OMP 依赖。当前确定性证据为 mechanical 210/210 PASS、core typecheck exit 0。
- **T05**：`extension.ts` 类型契合公开 `ExtensionAPI`；仅 `import type` 引用 OMP 包；不修改禁区。当前 extension typecheck exit 0。
- **T06**：`test/mechanical.test.ts` 全绿（AC-001..044 每项至少 1 断言）；当前 mechanical 210/210 PASS、extension integration 95/95 PASS，core+extension typecheck 均 exit 0。
- **T07**：E-001/E-010 证明 junction、installed discovery 与 non-Max Medium command/simple-task smoke；AC-101..115 仍含 BLOCKED/SOURCE GAP，T07 保持 blocked，不把 E-010 升格为完整 real-OMP acceptance。
- **T08**：审查清单（禁区未改、无第二套调度、审计脱敏、幂等、恢复、Max 禁令）逐项核对；当前确定性源审查为 PASS，证据为 mechanical 210/210、extension integration 95/95、core+extension typecheck exit 0；real-OMP 限制仍归 T07。
- **T09**：仓库工作树干净（仅本项目），已本地 commit；无远端/push/发布。仅在 T07/T08 均 done 后执行；提交前不得声称工作树干净或当前 HEAD 已满足。
- **T10**：已完成（commit 8ea7f34）；本文件、ledger.json 与 checker 已按 `docs/spark/2026-08-20-weconverge-pure-advisory-design.md` §13 显式退役/保留映射校正；历史 T01..T09 定性原样保留；`node scripts/check-ledger.mjs` v4 exit 0 且仅三文件变更（PLAN.md, ledger.json, scripts/check-ledger.mjs）。
- **T11**：已完成（commit 48621b9）：移除 `task` wrapper/block/mutation/cancel/auto-dispatch/preflight gating，保留 `before_agent_start` ≤60 token 咨询注入与 observation-only 观察器（fail-open ≤5ms）；不新增第二套调度；`types/omp-extension-api.d.ts` 仅同步公开 API。证据：commit 48621b9af5c320a9ea842f2d328c33dc30edb96d, npm run typecheck:core → exit 0, npm run check:types → 32 members verified, src/core/policy.ts 33 tokens (mechanical 35 ≤60)。
- **T12**：已完成（commit 48621b9）：`src/extension.ts` 仅使用 `before_agent_start.systemPrompt`、`pi.on(tool_call/tool_result)`、`pi.events(task:subagent:*)`、`appendEntry` 观察路径；不调用 `ctx.invokeTool(task)`、不阻塞、不变异输入；命令 `on/off/status/reset` 仅为本地 advisory 状态。证据：commit 48621b9, typecheck:core exit 0, check:types 32 members verified, 无禁区改动。
- **T13**：已完成（commit 48621b9 + D-08 AC-A18）：咨询契约机械验收分层通过 — 策略注入有界性 (POLICY 35 ≤60)、AC-A18 确定性官方-hook 握手（enabled 确定性返回有界 POLICY_BLOCK、同 generation fingerprint 复用、disabled 无 policy、≤60 tokens、无 Provider 回读）、fact taxonomy 隔离、observer fail-open、audit 脱敏截断（≤200 chars）、单活运行时 + bounded tombstone 语义。证据：`node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → 110 passed 0 failed (incl. AC-A18 PASS) + `test/mechanical.test.ts` 65 passed anchor; npm run typecheck:core exit 0; node scripts/check-ledger.mjs v6 exit 0。
- **T14**：修订版真实 OMP 咨询验收保持 blocked，直至 ACCEPTANCE_ADVISORY.md 对 active 门 AC-L01/L03/L04/L05/C01/C02/C03 逐项具备真实 OMP PASS 证据（AC-L02 RETIRED per D-08, 排除）；当前 AC-L04 NOT OBSERVED (PARTIAL)、AC-L05 SOURCE GAP、AC-C03 NOT OBSERVED，故保持 blocked（AC-L01 PASS, AC-L03 PASS with subfield SOURCE GAP, AC-C01 PASS, AC-C02 PASS, AC-A18 PASS；SPEC §22.2 NOT COMPLETE）。不得将机械测试或 E-010 smoke 升格为 revised live done。

## 阻塞与门

- CP-003/CP-004(child) 不可经公开 API 证明 → 自动 child 路由实现保持 BLOCKED 分支，不伪造（见 CAPABILITY_PROBE.md）。
- 2026-08-20 更正：本机存在可驱动 OMP 运行时（`J:\OhMyPi\bin\omp.exe` v17.3.8，PTY 下 TUI 正常加载 extension）。此前"本沙箱无可驱动 OMP 运行时"的定性作废。AC-101..115 必须在隔离 profile、非 Max route 下用真实 OMP 逐项取证；无法安全执行的场景保持 BLOCKED 并写明缺哪个正式 API。
- 任何 `blocked` 必须引用证据（探针/源码/配置），禁止"未调查"当 PASS。
- 纯咨询退役项（§13 D-01..D-08）：enforcement（block/mutation/cancel/automatic dispatch/max preflight/wave/concurrency/duplicate/compact 输出强制）+ AC-L02 Provider payload 回读（D-08 RETIRED, never PASS）已显式退役为 advisory 观察/确定性握手，不在新链中作为完成门；旧 AC-101..115 的 NOT COMPLETE/REJECTED 保持历史真实，不重写为 PASS。AC-A18 为替代确定性门。
- 修订版门：active 门 AC-L01/L03/L04/L05/C01/C02/C03 由 ACCEPTANCE_ADVISORY.md 单独判定（AC-L02 RETIRED per D-08, 排除）；T14 的 blocked 以该文件 active 门为准，不复用 ACCEPTANCE.md 的 AC-101..115 判定；历史 T07 仍以 ACCEPTANCE.md 的 AC-101..115 为准。T13 的 done 以 AC-A18 PASS + 110/110 为门。
