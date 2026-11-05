# PLL 六格特征提示、成绩筛选与案例复盘实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 在用户指定的当前主工作区内联执行；不要创建 worktree，也不要混入既有未提交桌面蓝牙改动。逐步标记复选框。

**目标：** 显示本题候选特征，分别记录正确／错误判断和蓝牙还原的不同时间指标，筛选记录并复盘当时屏幕案例。

**架构：** `PllTraining` 管理一次案例的精确公式、累计计时与逐次结果，`PllObservation` 负责提示开关／持久化／两维筛选／只读复盘；原始九类资料仍从经核对的 Markdown 导入。

**技术栈：** TypeScript、Vue 2、Three.js、Node assert、Playwright CLI、webpack。

---

## 文件与职责

- `src/ble/pll-training.ts`：在结果中保留 `scramble`、`selectedName`、`ok`，错误点击单独记账；暴露重启当前案例计时的方法。
- `scripts/test-pll-training.cjs`：固定随机源验证错误／正确逐条记账、累计判断时间、蓝牙速度和案例公式。
- `src/vue/PllObservation/index.ts`：特征开关持久化、记录兼容加载、筛选、复盘与返回训练。
- `src/vue/PllObservation/index.html`：内联候选提示、两维筛选列表和复盘控制。
- `src/vue/PllObservation/index.css`：提示与记录区域移动端样式。
- `scripts/verify-pll6-record-replay.js`：浏览器验证开关、筛选、状态复盘、返回训练与画布渲染。

## 执行状态（2026-10-26）

任务 1～3 已内联实现并验证；浏览器检查覆盖错误／正确／蓝牙三类记录、旧记录兼容、双筛选、复盘期间忽略事件、返回训练及 360px 布局。追加会话内 200 条上限的失败测试并修复后，`npm run test:pll` 通过。任务 4 的 `npm run test:ble`（60 通过）、`npm run build` 和 `git diff --check` 通过。`npx tsc --noEmit` 仍被现有 `src/wasm/cube_cross_solve.d.ts:1` 的 TS2436 阻断。

### 任务 1：逐次记录与计时

- [ ] **先写失败测试：** 在 `scripts/test-pll-training.cjs` 中用 `new PllTraining(items, () => 0.1, () => 1000)` 依次执行 `answer('PLL-3',1500)`、`answer('PLL-2',1700)`，断言有两条记录，分别 `ok=false/true`，耗时 500/700 毫秒、所选名称和同一案例公式；蓝牙完成断言 `kind='bluetooth'` 且耗时 1100 毫秒。
- [ ] **验证红灯：** 执行 `npm run test:pll`，预期对错误点击的记录断言失败。
- [ ] **实现：** 在 `PllResult` 加可选 `selectedName`、`ok`、`scramble` 和 `version`；`PllTraining` 用 `preAuf + invert(origin) + postAuf` 保存案例公式，若公式展开不在 BLE 纯模块可用范围，则由构造函数传入 `invert(origin)` 回调，测试用简单的 `R U R'`；错误点击入账但不调用 `next()`；正确与蓝牙结果入账后切题。
- [ ] **验证绿灯：** `npm run test:pll` 应通过，原有旧帧、重试、AUF 用例仍通过。

### 任务 2：候选特征开关、筛选和兼容旧记录

- [ ] **先写失败浏览器检查：** 创建 `scripts/verify-pll6-record-replay.js`，打开 `?mode=pll6`，断言复选框默认关闭、勾选后出现“本题候选特征”、关闭消失；错误按钮产生记录，可分别按类型／PLL 筛选。
- [ ] **验证红灯：** `playwright-cli -s=pll6 run-code --filename scripts/verify-pll6-record-replay.js`，预期找不到复选框。
- [ ] **实现：** `showCurrentFeatures` 从 `localStorage.pll6ShowCurrentFeatures` 读写；复用 `caseStudyRows`，提示注明多个观察朝向；`recordTypeFilter`、`recordPllFilter` 计算 `filteredRecords`；旧记录缺少新字段时仍展示 `kind` 与原有耗时，`scramble` 缺失不启用复盘。
- [ ] **验证绿灯：** 浏览器脚本前半段通过，手机宽度无横向溢出。

### 任务 3：3D 案例复盘与返回

- [ ] **扩充失败浏览器检查：** 对某条新记录点“复盘”，断言 `world.cube.serialize()` 等于用 `twister.setup(record.scramble)` 得到的状态，期间模拟蓝牙事件和按钮点击不新增记录；“返回训练”恢复进入复盘前的 `training.current` 与原 3D 状态且重新计时。
- [ ] **验证红灯：** 脚本预期找不到“复盘”或“返回训练”按钮。
- [ ] **实现：** `replayRecord: PllResult | null` 控制只读展示；进入时 `training.retry()`、`twister.setup(record.scramble)`，退出时 `training.restartCaseClock(Date.now())`、`twister.setup(training.current.scramble)`；事件处理和判题在复盘时直接忽略，按钮与蓝牙记录都不变化。
- [ ] **验证绿灯：** 浏览器脚本完整通过，重新进入页面后可从本地存储复盘同一记录。

### 任务 4：回归与交付

- [ ] 执行 `npm run test:pll`、`npm run test:ble`、`npm run build`、`git diff --check`；记录独立 `tsc --noEmit` 是否仍被既有 WASM 声明阻断。
- [ ] 浏览器检查手机宽度显示候选特征时仍可见魔方，切换页面后渲染正常；向用户给出本地验证地址。用户未要求推送／发布，保留本地工作区结果。
