# 公式计时 OLL／PLL 出题对齐实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 在本工作区内联执行，不使用 worktree 或子代理。按复选框追踪步骤。

**目标：** 让公式计时页的 OLL／PLL 出题与无缝 OP 的整体朝向和逆公式顺序一致。

**架构：** 纯逻辑生成层复用 `validateOpCase` 检验 OLL 组合，PLL 独立拼接整体朝向与逆公式；案例持有打乱串，页面按案例打乱串重建，存储兼容旧记录。

**技术栈：** TypeScript、Vue 2、Node assert、Playwright CLI。

## 文件职责

- `src/ble/formula-timer-formula.ts`：可控随机的 OLL／PLL 案例和实际打乱串。
- `src/ble/formula-timer.ts`、`src/ble/formula-timer-store.ts`：案例／记录字段与旧版兼容。
- `src/vue/FormulaTimer/index.ts`、`index.html`：使用案例打乱串显示与重建题面。
- `scripts/test-formula-timer-formulas.cjs`、`scripts/test-formula-timer-store.cjs`、`scripts/verify-formula-timer.js`：纯逻辑、持久化和浏览器回归。

## 执行

- [x] 先在纯逻辑测试添加固定随机源，检验 OLL `y PLL逆 OLL逆`、PLL `y PLL逆`、F2L 保持不变；存储测试断言旧记录兼容。运行 `npm run test:formula-timer`，确认预期失败。
- [x] 将 `scramble` 保存到案例中；生成层复用无缝 OP 的 `validateOpCase` 校验 OLL，并从内置 PLL 池挑选；PLL 加随机整体朝向。页面的 `showCase` 使用本轮 `scramble`，旧记录回退公式逆序；显示本轮实际打乱。运行纯逻辑测试确认通过。
- [x] 浏览器模拟新题、重试和复盘，验证 3D 题面等于记录的起始状态；运行 `npm run test:formula-timer && npm run test:ble && npm run test:op && npm run build` 与 `git diff --check`。
- [x] 仅提交本功能文件，不清理用户原有未跟踪文件。
