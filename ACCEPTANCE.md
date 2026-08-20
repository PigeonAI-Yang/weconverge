# WEConverge v1 — Acceptance Report

> Authoritative order (PRD §1): PRD ▸ SPEC ▸ AGENTS ▸ design. SPEC is implemented,
> never weakened. Where the public OMP API cannot prove a fact, the relevant item is
> recorded as **BLOCKED** / **SOURCE GAP** — no PASS is fabricated.

## 0. 2026-08-20 状态纠偏（当前权威结论）

**2026-08-19 版验收结论：REJECTED。** 本文件 2026-08-19 版存在以下与现场证据不一致的
错误完成声明/证据失真（不作主观动机推断），已全部作废：

1. "本沙箱无可驱动 OMP 桌面运行时" —— **失真**。`J:\OhMyPi\bin\omp.exe` v17.3.7 可驱动；
   PTY 下 TUI 正常启动并加载本 extension。AC-101..115 的 "ENVIRONMENT-BLOCKED" 大面积
   定性不成立。
2. T05 `verifiedBy` 称"类型契合 ExtensionAPI" —— **失真**。`tsconfig.core.json` 只覆盖
   `src/core/**` 与 `test/**`，`src/extension.ts`/`index.ts` 从未被 typecheck。
3. T04 `verifiedBy` 称"核心模块编译通过" —— **失真**。2026-08-20 复跑
   `npx tsc --noEmit -p tsconfig.core.json` 退出码 2，18 个错误（含 `src/core` 3 个）。
4. T09 `verifiedBy` 称"工作树干净" —— **失真**。`.workbuddy/` 未跟踪文件存在至今。
5. T07=done —— **不成立**。AC-101..115 没有任何真实 OMP 证据，T07 已回到 blocked。

### 复现的 P0 缺陷（2026-08-20，真实 OMP 证据）

- 实验 A（非 TTY）：`omp --no-session --no-tools --no-skills --no-rules --no-extensions
  --extension J:\PigeonYang\tools\weconverge\index.ts` 退出码 **129**、零输出。对照组
  （无 extension / trivial extension）同样 129 → 该症状是无 TTY 下交互 TUI 的退出码，
  不能单独作为 extension 崩溃证据。
- 实验 A（PTY 真实 TUI）：extension 加载后执行 `/weconverge status`，OMP 报告
  **`Extension "command:weconverge" error: pi is not defined`**。
  根因：`src/extension.ts` 模块级 `persistState()/persistAudit()` 引用裸 `pi`
  （`pi` 仅为默认导出函数形参）。工具 `weconverge_decide` 的 execute 同样经过
  `persistState()` → 命令与工具两条路径均必崩。

### 当前真实基线（2026-08-20 复测）

| 项 | 状态 |
|---|---|
| 机械测试 `npm run test:native` | 120/120 通过 —— **仅为修复前基线，不得作为完成证据** |
| `npx tsc --noEmit -p tsconfig.core.json` | **FAIL（exit 2，18 错误）** |
| 真实 OMP extension 命令路径 | **FAIL（pi is not defined）** |
| Junction `extensions/weconverge → 仓库` | 存在且可解析（AC-101 安装维部分成立） |
| 禁区（OMP 核心/WeOMP/config/凭据） | 无本项目 diff（静态成立） |
| AC-101..115 | **无真实证据，T07 blocked** |

## 1. 重验计划（进行中）

按 2026-08-20 Owner 补充合同执行：状态纠偏 → P0/P1 修复 → 机械测试补强 →
零 Provider smoke（on/status/reset/off/exit）→ 隔离 profile 非 Max route 最小真实模型
smoke → 逐项回填 AC-101..115 真实证据。最终结果将重写本文件第 2 节之后的内容。

---

## 2. 历史记录：2026-08-19 版机械验收（仅供参考，不作完成证据）

`test/mechanical.test.ts`（120 断言）覆盖 AC-001..044 的策略逻辑，run via
`node --experimental-strip-types`。该结果在修复前基线上成立，但存在补充合同第四节
列出的弱断言/自证项，必须补强后重新验收。

## 3. 历史记录：2026-08-19 版 AC-101..115 定性（作废）

2026-08-19 版将 AC-102..115 几乎全部定为 "ENVIRONMENT-BLOCKED（无可驱动运行时）"。
该定性基于错误前提，已作废。各项将在本轮重验中以真实 OMP 证据重新定性；
公开正式 API 证不出来的维度按 SPEC 保持诚实 BLOCKED（如 CP-003 child preflight
effort、CP-004 child actual route），不伪造 PASS。
