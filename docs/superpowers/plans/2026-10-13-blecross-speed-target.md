# BLE Cross 还原速度目标实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 内联执行。步骤使用复选框跟踪进度。

**目标：** 正确还原但超过所选秒数时自动重练同一局，直到达标。

**架构：** 独立纯函数负责目标解析与毫秒级比较；BLE Cross 训练器在成功时保存本次耗时，自动下轮调度合并步数与速度条件。模板展示紧凑下拉框，持久化设置。

**技术栈：** TypeScript、Vue 2、Playwright 回归、Node 单测。

---

### 任务 1：纯函数与边界测试

**文件：** `src/ble/solve-time-target.ts`、`scripts/test-ble.js`

- [x] 在 `scripts/test-ble.js` 新增解析测试：null/非法→0，`"3"`→3；比较测试：3001ms 超过 3 秒，3000ms 不超过，缺少起点不重试。
- [x] 执行 `npm run test:ble`，确认新增测试因缺少模块失败。
- [x] 实现 `parseSolveTimeTarget(value): number` 与 `isSolveTimeOverTarget(durationMs, targetSeconds): boolean`，合法选项仅 0/1/2/3/5/8/10。
- [x] 重新执行 `npm run test:ble`，确认通过。

### 任务 2：训练器与 UI 回归

**文件：** `src/vue/BleCrossTrainer/index.ts`、`src/vue/BleCrossTrainer/index.html`、`src/vue/BleCrossTrainer/theme.ts`、`scripts/verify-blecross-recompute.js`

- [x] 在浏览器回归中断言下拉选项、保存恢复、成功超时提示、达标/超时倒计时动作、与非最优条件取或、关闭自动下轮不跳转、训练记录正确。
- [x] 执行 `npm run verify:blecross`，确认新断言失败。
- [x] 增加 `solveTimeTarget` 持久化、成功时毫秒耗时快照与超时状态；倒计时和跳转共同使用 `shouldRetryCurrentRound()`。
- [x] 展开设置中放置“速度目标”下拉框；窄屏换行，收纳模式隐藏设置，结果仍可见；帮助文案补充规则。
- [x] 执行 `npm run verify:blecross`，确认回归通过。

### 任务 3：最终验证

- [x] 执行 `npm run test:ble`、`npm run test:android`、`npm run build`、`npm run verify:blecross`。
- [x] 执行限定本任务文件的 `git diff --check` 和 `git status --short`，保护原有未提交改动。
