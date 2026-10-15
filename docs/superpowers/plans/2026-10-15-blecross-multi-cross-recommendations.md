# BLECross 多组训练与指法推荐实现计划

> **面向 AI 代理的工作者：** 内联执行，逐任务采用测试驱动和完成前验证；不创建 worktree。

**目标：** BLECross 支持 Cross／XCross／XXCross／XXXCross 的实体完成判定，以及按需计算的四朝向指法推荐。

**架构：** 纯目标判定模块负责任意／指定槽位及白底训练帧，BLECross 保持现有计时和蓝牙事件账本。推荐使用现有独立 Worker，从轮次起点快照搜索，选择结果只控制展示／预览，不修改最优步数。模式、槽位和轮次变化取消旧 Worker；普通实体转动不启动搜索。

**技术栈：** Vue 2、TypeScript、Three.js、Rust WASM Worker、Node 测试。

---

### 任务 1：目标判定与记录语义

**文件：** `src/ble/cross-training-target.ts`、`src/ble/non-optimal-retry.ts`、`scripts/test-ble.js`

- [ ] 先写测试：标准完成态的 0/1/2/3 组判定；指定槽位缺一组失败；白底使用 `toTrainFrame`；无最优解时不重试。
- [ ] 运行 `npm run test:ble` 确认红灯。
- [ ] 实现 `evaluateCrossTarget(state, mode, slotMode, slots)`，返回训练帧中完成槽位及达成标志；扩展重试比较输入以支持多槽位集合。
- [ ] 再运行测试确认绿灯。

### 任务 2：BLECross 求解与推荐生命周期

**文件：** `src/vue/BleCrossTrainer/index.ts`、`scripts/verify-blecross-analysis.js`

- [ ] 先写浏览器断言：新模式、固定槽位切换、结果判定、点击才请求推荐、换轮取消旧结果、实体转动不触发搜索。
- [ ] 运行浏览器回归确认红灯。
- [ ] 在 BLECross 以 `solveBaseState` 标准核心帧求解；白底用 `toTrainFrame` 并将记号映射回物理帧；XX/XXX 使用 Worker `solveMultiCross`，推荐 Cross 用 `recommendCross`，其他模式评分已有候选。
- [ ] 从起点应用物理公式验证目标，保留独立推荐选择状态与独立最优基准。成功判定保持原蓝牙转动／计时／记录流程；离开、新轮、模式、槽位、z2/y 按钮时取消过期请求。
- [ ] 浏览器回归转绿。

### 任务 3：结果区与收纳入口

**文件：** `src/vue/BleCrossTrainer/index.html`、`src/vue/BleCrossTrainer/theme.ts`

- [ ] 在原面板加入四种模式与任意／指定槽位；收纳态保留推荐入口。
- [ ] 添加不挡住 3D 的 42vh 底部结果区及全屏视图；默认四条、全部、正面／深度筛选、简单／完整指法。
- [ ] `npm run test:ble`、`node scripts/test-cross-analysis.js`、`npm run test:android`、`NODE_OPTIONS=--openssl-legacy-provider npx webpack --mode=production` 和浏览器回归。

**边界：** 不发布、不推送、不上传 APK；无法连接真机时报告硬件验证限制。
