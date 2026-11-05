# 三界面出题前 AUF 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联逐任务实现此计划。

**目标：** 三界面随机前置步骤使用无／U／U'／U2，不再用整体 y。

**架构：** 修改独立出题器 `op-case`、`formula-timer-formula`、`pll-training`，保持 UI 与蓝牙状态机接口。无缝 OP “无 PLL”验证接受只差 AUF 的状态；原有后置 AUF 和 z2 不变。

**技术栈：** TypeScript、Vue 2、Node assert 回归脚本。

---

### 任务 1：无缝 OP

**文件：** `src/ble/op-case.ts`、`scripts/test-op-case.cjs`

- [x] 修改测试中的前置四值为 `['', 'U', "U'", 'U2']`，并要求无 PLL 的非空前置案例通过、结果可由至多三次 U 复原；运行 `npm run test:op` 确认失败。
- [x] 将 `ROTATIONS` 替换为前置 AUF 选项；验证无 PLL 时的 `afterFacelets` 可经 U 转动复原；换 PLL 保持该取值。
- [x] 运行 `npm run test:op`，确认 21×57×4 与 z2 组合测试通过。

### 任务 2：公式计时

**文件：** `src/ble/formula-timer-formula.ts`、`scripts/test-formula-timer-formulas.cjs`

- [x] 将 OLL／PLL 的前置四值测试改为 `['', 'U', "U'", 'U2']`，确认 F2L 未增加前置 U；运行 `npm run test:formula-timer` 确认失败。
- [x] 修改 `ROTATIONS`；保持 OLL 调用 `validateOpCase` 和出题前 z2 顺序。
- [x] 运行 `npm run test:formula-timer` 确认通过。

### 任务 3：六格观察法

**文件：** `src/ble/pll-training.ts`、`scripts/test-pll-training.cjs`

- [x] 将前置四值测试改为 `['', 'U', "U'", 'U2']`，保持后置 AUF 断言；运行 `npm run test:pll` 确认失败。
- [x] 修改前置候选列表，不改变 `postAuf`、题面顺序或成绩存储。
- [x] 运行 `npm run test:pll` 确认通过。

### 任务 4：交付验证

- [x] 运行 `npm run test:ble`、`npm run test:op`、`npm run test:pll`、`npm run test:formula-timer` 和 `npm run build`。
- [x] 运行 `git diff --check`；确认先前的蓝牙改动与本次更改均保留。此次不打包、提交或发布。
