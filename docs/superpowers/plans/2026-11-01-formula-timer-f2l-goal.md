# 公式计时 F2L 目标判定实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 内联执行本计划；用户指定本项目不使用 worktree。

**目标：** F2L 在十字和前两层完成时立即结算，不等待六面还原。

**架构：** `isFormulaGoal` 的 F2L 分支只比较 D 面和四个侧面下两排与当前中心色；保留 OLL/PLL 分支及页面原有的逐步判定调用。

**技术栈：** TypeScript、现有 Node 断言脚本、webpack。

---

### 任务 1：判定与回归

**文件：**
- 修改：`scripts/test-formula-timer.cjs`，覆盖合法的 U 顶层扰动、未完成槽位/十字、z2 朝向、非法面及 OLL/PLL 原规则。
- 修改：`src/ble/formula-timer.ts`，实现中心色相对的 F2L 完成判定。
- 修改：`src/vue/FormulaTimer/index.html`，同步更新训练界面的判定说明。

- [x] **步骤 1：添加失败测试。** 以 `Cube(3)` 构造 `U`、`R U R'`、`F`、`z2 U`，断言前者与后者 F2L 完成、中间两种未完成；顶层 U 转动不能让 PLL 完成。添加界面文案断言。
- [x] **步骤 2：运行红灯。** `./node_modules/.bin/tsc -p tsconfig.ble.json && node scripts/test-formula-timer.cjs`；确认原有 `U` 的 F2L 判定仍为 false，旧说明与新规则不符。
- [x] **步骤 3：最小实现。** 对 F2L，校验 `/^[URFDLB]{54}$/` 与六中心色互异；比较 `facelets.slice(27, 36)` 与 D 中心九次、四侧面 `slice(base+3, base+9)` 与其中心六次；OLL/PLL 不动。更新页面说明。
- [x] **步骤 4：运行绿灯和回归。** `npm run test:formula-timer && npm run test:ble && npm run build`；三项均退出 0。
- [x] **步骤 5：检查变更。** `git diff --check -- src/ble/formula-timer.ts src/vue/FormulaTimer/index.html scripts/test-formula-timer.cjs`；原有未提交改动保留，不混合提交。
