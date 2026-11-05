# 公式计时切层补步实现计划

> **面向 AI 代理的工作者：** 在现有工作区内联执行，不创建 worktree，不自动提交。

**目标：** M2/S2/E2 连转出现通知断档时优先补回历史，无法补回则防止漏动画、错误成功及失真 TPS。

**架构：** GAN 驱动保留 FIFO 并非阻塞请求历史；计时恢复账本核验实时/历史和完整状态；视图对未知事件只校正净状态，不作为带时间戳的逐步动画。

**技术栈：** TypeScript、GAN Gen3/Gen4、Node assert、webpack。

---

### 任务 1：协议历史补步

**文件：** `src/ble/protocols/vendor/gan-protocol-core.ts`、`scripts/test-ble.js`

- [x] 写断号后保留 FIFO、发正确历史命令、GATT 悬挂也不阻塞、历史到达后按序输出和重复去重的失败测试。
- [x] 运行 `npm run test:ble`，确认失败来自旧断号跳过行为。
- [x] 实现 Gen3/Gen4 非阻塞、有界请求；状态帧序号 0 不回退 MOVE 基线。
- [x] 重跑 `npm run test:ble`（83 通过）。

### 任务 2：不可核验时间与画面兜底

**文件：** `src/ble/formula-timer-recovery.ts`、`src/vue/FormulaTimer/index.ts`、`scripts/test-formula-timer-recovery.cjs`

- [x] 写断号补步和未知时间不计成功/TPS、无时间步直接校正画面的失败测试。
- [x] 运行 `npm run test:formula-timer` 确认失败。
- [x] 让当前轮次遇到未知补步中断计时并完成画面校正；历史迟到不可跨轮播放。
- [x] 重跑 `npm run test:formula-timer`，并在临时目录生产构建及 `git diff --check` 验证。

备注：无实体设备实测；设备不回历史且完整状态不足以唯一确定漏步时，中断成绩并提示重试，而非虚构动作。缓冲保留至状态兜底；状态请求一直不返回时仍需用户重连或重试。
