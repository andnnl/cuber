# BLE Cross 偶发卡顿修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 Cross/XCross WASM 搜索移出 UI 主线程，并降低固定难度、日志和动画循环造成的卡顿。

**架构：** 新增独立模块 Worker 承载 WASM 与搜索表，`WasmSolver` 作为带兼容回退的 RPC 客户端。难度生成器分片让出事件循环，训练器对最优解请求去重缓存，Android Release 限制控制台转发。

**技术栈：** TypeScript、Web Worker、WebAssembly、Vue 2、Android WebView、Node 回归脚本、webpack 5。

---

### 任务 1：固定难度生成让出与取消

**文件：**
- 修改：`src/ble/cross-difficulty.ts`
- 测试：`scripts/test-ble.js`

- [x] 编写失败测试：连续候选时按配置调用 `yieldControl`，并能在让出后由 `isCurrent` 取消。
- [x] 运行 `npm run test:ble`，确认新测试失败。
- [x] 为 `GenerateOptions` 增加 `yieldControl`/`yieldEvery`，在候选循环中按批次让出并二次检查取消。
- [x] 再运行 `npm run test:ble`，确认精确难度、错误、重试耗尽和新测试全部通过。

### 任务 2：WASM Worker RPC

**文件：**
- 创建：`public/cube_cross_worker.js`
- 创建：`src/wasm/SolverWorkerClient.ts`
- 修改：`src/wasm/WasmSolver.ts`
- 修改：`webpack.config.js`
- 测试：`scripts/test-android-app.js`

- [x] 编写失败测试：生产构建配置必须复制 Worker，Worker 必须支持 init/load/generate/solveMulti/solveXCross/stats 消息。
- [x] 运行 `npm run test:android`，确认测试失败。
- [x] 实现带请求 ID、超时、错误广播和 terminate 的 Worker 客户端。
- [x] 实现 Worker 内 WASM 初始化和表操作，二进制表使用 transferable 传递。
- [x] 改造 `WasmSolver`：Worker 优先；失败后初始化原主线程模块；保持现有导出签名和同步 ready 状态。
- [x] 运行 `npm run test:android` 与 TypeScript/webpack 构建检查。

### 任务 3：最优解请求去重与缓存

**文件：**
- 创建：`src/ble/solve-request-cache.ts`
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/test-ble.js`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] 编写失败测试：相同 key 的在途请求只执行一次；完成结果可复用；超过容量淘汰最旧项。
- [x] 运行 `npm run test:ble`，确认失败。
- [x] 实现小容量 Promise/结果缓存，并以模式、状态、z2、视角构造 key。
- [x] Cross 与四槽 XCross 通过缓存执行，保留 `bestReqId` 写回保护。
- [x] 运行 BLE 单元测试和浏览器重算验证。

### 任务 4：日志降噪

**文件：**
- 创建：`src/util/debug-log.ts`
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 修改：`src/solver/Solver.ts`
- 修改：`src/wasm/WasmSolver.ts`
- 修改：`android/app/src/main/java/com/cuber/trainer/MainActivity.java`
- 测试：`scripts/test-android-app.js`

- [x] 编写失败测试：Android 普通 console 日志仅 Debug 包转发，warning/error 始终转发。
- [x] 运行 `npm run test:android`，确认失败。
- [x] 将 BLE/WASM 高频普通日志改为仅开发环境输出的 `debugLog`。
- [x] 按 `ConsoleMessage.MessageLevel` 和 `BuildConfig.DEBUG` 过滤 Android 转发。
- [x] 运行 Android 配置测试。

### 任务 5：rAF 生命周期与无效更新

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] 增加浏览器验证：销毁时取消已登记 rAF；循环回调引用稳定。
- [x] 保存 `animationFrameId` 与稳定回调，在 `beforeDestroy` 取消。
- [x] 只有计时字符串变化时更新 `elapsedText`。
- [x] 运行浏览器验证。

### 任务 6：完整验证

**文件：**
- 修改：`docs/superpowers/plans/2026-10-13-blecross-performance.md`

- [x] 运行 `npm run test:ble`，预期全部通过。
- [x] 运行 `npm run test:android`，预期输出 `Android app configuration tests passed`。
- [x] 运行 `npm run build`，预期 webpack production 编译成功且产物包含 `cube_cross_worker.js`。
- [x] 启动本地页面，验证搜索表初始化、Cross、XCross、固定 7 步难度和拖动不重算。
- [x] 检查 `git diff --check` 与 `git status --short`，确保未覆盖用户既有改动。
