# 公式计时逐步完成判定实现计划

> **面向 AI 代理的工作者：** 内联执行，保留当前工作区及历史未提交修改；本轮不提交、不使用 worktree。

**目标：** 每步蓝牙转动检查实体状态；预测达到目标时定格最后一步的时间，等待状态帧核验；未完成题停转 2 秒判失败。

**架构：** 计时控制器保留实体贴纸账本，不从虚拟题面或动画推断实体状态。只在预测达到目标时请求完整状态，收到匹配的实体状态才保存成功；不同步则恢复计时并以实体状态重建账本。蓝牙状态帧去重必须保留本次转动对应的快照。

**技术栈：** TypeScript、Vue 2、现有 `applyFaceletMove`、Node 断言测试。

---

### 任务 1：控制器状态机与停转阈值

**文件：** `src/ble/formula-timer.ts`；`scripts/test-formula-timer.cjs`。

- [x] 在测试中先覆盖：实体初始未完成、最后一步预测达到目标、时间立即冻结，等待实体快照才保存；迟到/矛盾快照不成功；首张终态快照及不同序号；停转 1999ms 不失败、2000ms 后请求快照并留核验时间。
- [x] 运行 `npm run test:formula-timer`，确认新增断言针对缺失的行为失败。
- [x] 引入单步 `applyFaceletMove` 更新实体账本，候选完成只冻结显示时间，完整快照确认后用候选转动时间写记录；冲突取消冻结并同步实体账本；未完成定时器设为 2000ms。
- [x] 重跑 `npm run test:formula-timer`，确认通过。

### 任务 2：界面与设备快照

**文件：** `src/vue/FormulaTimer/index.ts`、`src/vue/FormulaTimer/index.html`；如设备去重阻止终态送达，修改 `src/ble/protocols/moyu32.ts`、`scripts/test-ble.js`。

- [x] 用失败测试证明 MoYu 最后一步序号相同的首次状态帧必须送达，同时仍拒绝真正旧帧和重复帧。
- [x] 最小修正该状态帧去重；运行 `npm run test:ble`。
- [x] 将实体 `MOVE` 记号送入计时控制器；新题请求实体基线快照；显示冻结时间，更新文案为“停转 2 秒”。
- [x] 运行 `npm run test:formula-timer`、`npm run test:ble`、`npm run build`、`git diff --check`。
