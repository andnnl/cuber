# 公式计时屏幕完成判定实现计划

> **面向 AI 代理的工作者：** 内联执行，不使用 worktree；按测试先行逐步实现。

**目标：** 屏幕题面完成立即结算，并在下一题前丢弃残留动画。

**架构：** `FormulaTimer` 仅管理时间、序号与结果，`FormulaTimerView` 管理逐步的无动画逻辑魔方与可见动画。`Twister` 提供丢弃待播动作的入口。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert 测试。

---

### 任务 1：屏幕完成作为唯一成功来源

**文件：** `src/ble/formula-timer.ts`；`scripts/test-formula-timer.cjs`

- [x] 测试：实体仍未还原，`completeDisplayed(at)` 立即成功；在未起表时不可结算。
- [x] 运行 `npm run test:formula-timer` 确认失败原因是缺少屏幕完成接口。
- [x] 实现 `completeDisplayed(at)` 调用 `finish('success', at)`，视图不再用实体状态帧触发成功。
- [x] 运行测试确认通过。

### 任务 2：动画积压时同步逻辑题面

**文件：** `src/vue/FormulaTimer/index.ts`；`src/ble/formula-timer-follow.ts`；`scripts/test-formula-timer.cjs`

- [x] 测试：白底题面映射后的逻辑终态还原；完成时间取最后一个转动事件。
- [x] 运行 `npm run test:formula-timer` 确认失败。
- [x] 每题初始化无动画逻辑魔方；每笔有效 BLE 转动先按逻辑中心映射，再同步写入逻辑题面和可见动画，目标达成后调用 `completeDisplayed(at)`。
- [x] 运行测试确认通过。

### 任务 3：下一题丢弃旧动画

**文件：** `src/cuber/twister.ts`；`src/vue/FormulaTimer/index.ts`；`scripts/test-formula-timer.cjs`

- [x] 测试：动作积压时切题不将排队动作应用到新题，且保留新题的打乱状态。
- [x] 运行 `npm run test:formula-timer` 确认失败。
- [x] 在 `Twister` 添加丢弃待播动作并释放在途锁的方法；切题先调用它再 `setup` 新打乱。
- [x] 运行 `npm run test:formula-timer`、`npm run test:ble`、`tsc --noEmit --skipLibCheck` 与 `git diff --check`。
