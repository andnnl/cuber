# 公式计时 TPS 与出题前 y 实现计划

> **面向 AI 代理的工作者：** 在当前工作区内联执行；测试先行，保留既有未提交更改，不自动提交。

**目标：** 记录公式训练 TPS，并在 z2 旁新增持久化的出题前 y 下拉框。

**架构：** 计时器只统计接受的实体步数；记录计算和统计通过纯函数完成；题面生成器在原有打乱前叠加选中的 y；界面仅绑定设置和结果格式化。

**技术栈：** TypeScript 4.3、Vue 2、Node assert 脚本、webpack。

---

### 任务 1：计步与存储

**文件：** `src/ble/formula-timer.ts`、`src/ble/formula-timer-store.ts`、`scripts/test-formula-timer.cjs`、`scripts/test-formula-timer-store.cjs`

- [x] 测试：有效实时步+重复/恢复步，成功记录 `moveCount`；新题归零，旧记录可读取，无效步数被拒绝。
- [x] 运行 `npm run test:formula-timer`，确认因新断言失败。
- [x] 仅在 `move()` 返回真前增加一次步数并写入记录，兼容旧存储字段。
- [x] 重跑相同命令，确认通过。

### 任务 2：TPS 与统计视图

**文件：** `src/ble/formula-timer-stats.ts`、`src/vue/FormulaTimer/index.ts`、`src/vue/FormulaTimer/index.html`、`scripts/test-formula-timer-stats.cjs`、`scripts/test-formula-timer-stats-view.cjs`

- [x] 测试：成功有时长才算逐条 TPS，零时长、失败、旧数据不纳入；界面有反馈、历史及统计 TPS。
- [x] 跑 `npm run test:formula-timer` 确认失败。
- [x] 添加纯函数格式化及聚合，绑定反馈、列表与统计展示。
- [x] 重跑测试并确认通过。

### 任务 3：出题前 y

**文件：** `src/ble/formula-timer-formula.ts`、`src/ble/formula-timer-store.ts`、`src/vue/FormulaTimer/index.ts`、`src/vue/FormulaTimer/index.html`、`scripts/test-formula-timer-formulas.cjs`、`scripts/test-formula-timer-store.cjs`

- [x] 测试：四种选择及 z2 组合后的打乱串/题面一致，旧配置默认无，设置记忆；检查界面选项及调用。
- [x] 跑 `npm run test:formula-timer` 确认失败。
- [x] 生成器将 y 放在公式逆操作前，视图选择立即保存并换题。
- [x] 跑 `npm run test:formula-timer`、`npm run build -- --output-path <临时目录>`、`git diff --check` 验证。
