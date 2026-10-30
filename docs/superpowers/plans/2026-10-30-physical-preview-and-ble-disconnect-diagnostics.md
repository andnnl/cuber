# 实体转动预览与断连来源诊断实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 在当前工作区内联执行；不得创建 worktree。每步使用复选框跟踪。

**目标：** 六格观察法和无缝 OP 的 3D 魔方跟随实时蓝牙转动，同时不改训练判断；为十字界面偶发断连提供可辨认来源的日志。

**架构：** 全局 AppShell 分发 MOVE，经现有 FollowGate 独立控制画面；六格训练的计时和还原判定不受画面跟随开关影响。断连仅诊断：区分主动断开和传输层断开，不打印设备地址/协议帧。

**技术栈：** TypeScript、Vue 2、Playwright CLI（现有 `scripts/verify-global-ble.js`）、Node 与 mock 蓝牙传输。

**文件职责：** `src/vue/AppShell/index.ts` 只路由实体事件；`src/vue/SeamlessOp/index.ts` 与 `src/vue/PllObservation/index.ts` 各负责播放/复盘场景保护；`src/vue/AppShell/index.html` 和两页面文案解释预览；`src/ble/cube-link.ts` 与 `src/ble/cube-session.ts` 记录断线来源；`scripts/verify-training-follow.js` 和 `scripts/test-ble.js` 提供回归测试。

---

### 任务 1：当前页视觉跟随与独立训练

- [ ] 新建 `scripts/verify-training-follow.js`，使用项目已有 Playwright CLI `async page => { ... }` 约定：进入 `seamlessop`/`pll6`，记录 `cube.serialize()`；`mockApplyFormula('R')` 后等动画结束应改变画面，但题目/判断保持不变；关闭跟随时画面不变，六格的计时/还原仍收到事件；播放、复盘、跨页、下一题不补播旧转动。
- [ ] 在启动的本地服务器上执行 `playwright-cli run-code --filename scripts/verify-training-follow.js`，确认新测试针对“不跟随”失败。
- [ ] 修改 AppShell：`isCubeView` 包含 `seamlessop`；`seamlessop` MOVE 通过 `gate.accept` 后送到视图；`pll6` 的 MOVE 不论画面开关都送训练函数，另将 `gate.accept` 结果用于画面；FACELETS 原样送六格判定。复用 `twister.push(event.move)`，不做绝对 facelets 同步。
- [ ] 页面保护：无缝 OP 在 `playing` 或 `step !== 0` 时不混入实体动画；六格在 `replayRecord` 时不混入实体动画。六格 `refreshActualFeature` 应从 `loadCase`/复盘保存的案例起始贴纸计算，实体预览期间禁用与已转动画面不一致的 3D 线索覆盖层；`loadCase`/`retry` 恢复画面和覆盖层。
- [ ] 更新页面可见说明：预览是从屏幕题面叠加实时实体动作，不等同实体绝对状态；无缝 OP 不以实体动作判 PLL。
- [ ] 重跑 `playwright-cli run-code --filename scripts/verify-training-follow.js`，随后 `npm run test:ble`、`npm run test:pll`、`npm run test:op` 和 `npm run build`；只在所有相关验证通过后提交任务 1 的明确文件。

### 任务 2：断连诊断（不猜测修复）

- [ ] 先在 `scripts/test-ble.js` 增加 mock 测试，区分 `CubeSession.disconnect()` 主动断开和模拟传输层 `onDisconnect` 意外断开所留下的诊断来源；不要断言 MAC 或原始帧。
- [ ] 执行 `npm run test:ble`，确认新诊断测试因缺少来源信息失败。
- [ ] 在 `CubeLink`、`CubeSession` 的状态边界记录主动/传输层来源及连接代际；Web GATT 回调显示 `gatt.connected`，Native 回调注明原生事件；AppShell 销毁路径单独标记。不打印 MAC、广播内容、贴纸或密钥。
- [ ] 重跑 `npm run test:ble` 和 `npm run build`，使用模拟链路验证异常断开有来源、主动断开不误报异常；只在验证通过后提交任务 2。

### 最终检查

- [ ] 检查 `git diff --check`、限定本轮提交文件和用户现有未跟踪文件；报告真机断连仍需要用户提供平台与断开前后的日志才可判断物理链路根因。
