# BLE Cross 偶发卡顿修复设计

## 目标

降低 Android App 长时间训练、固定难度出题和 XCross 最优解刷新时的主线程阻塞，同时保持现有判定、配色、视角和蓝牙同步语义不变。

## 已确认原因

- WASM 胶水函数是同步调用；TypeScript 的 `async/await` 不会把计算移出 WebView UI 线程。
- 固定难度最多尝试 3×100 个候选，每个候选都会求一次 Cross。
- XCross 一次刷新依次执行 FL/FR/BL/BR 四次同步搜索。
- Android 将所有网页 `console` 消息转发到 Logcat，高频 BLE 与求解日志产生额外 I/O。
- 动画循环每帧创建新的绑定函数，组件销毁时没有取消 rAF。

## 设计

### 1. Worker 优先的 WASM 求解

新增模块 Worker。Worker 自己加载 `cube_cross_solve.js` 和 WASM，接收初始化、加载/生成搜索表、Cross 求解、XCross 求解和读取统计请求。主线程以请求 ID 匹配 Promise 响应。

`WasmSolver` 优先使用 Worker；Worker 创建或初始化失败时回退到原有主线程模块，保证不支持模块 Worker 的浏览器仍能使用。`isWasmLoaded()` 与 `isTableLoaded()` 继续提供同步状态查询，调用方接口不变。

### 2. 固定难度生成可取消并让出 UI

生成器保留现有最多 3×100 次的正确性边界，但每若干次候选后通过可注入的 `yieldControl()` 主动让出宏任务，使渲染、触摸和取消事件能够被处理。每次让出前后都检查 `isCurrent()`，过期轮次立即返回 `null`。

### 3. 最优解请求去重

对相同模式、状态、z2 和视角建立请求键。相同在途请求不重复发起；最近完成结果使用小容量缓存复用。新基准仍通过请求 ID 阻止旧结果写回。

### 4. 发布日志降噪

BLE 高频 MOVE/FACELETS/MIRROR 和普通求解过程日志统一走调试日志函数；生产构建不输出，开发构建保留。错误和警告始终保留。

Android `WebChromeClient` 仅在 Debug 包转发普通日志；Release 包只转发 warning/error，避免 Java/Logcat I/O 放大。

### 5. 动画循环生命周期

缓存绑定后的 rAF 回调，保存 request ID；组件销毁时取消。计时文本只在显示值变化时写入 Vue 状态，避免无效响应式赋值。

## 验证

- 单元测试覆盖难度生成让出、取消和原有精确步数行为。
- 静态 Android 测试覆盖 Release 日志过滤。
- 浏览器验证覆盖相同最优解请求不重复、视角按钮仍重算、拖动仍不重算。
- 完整执行 `npm run test:ble`、`npm run test:android`、`npm run build`。

## 非目标

- 不改变 Cross/XCross 搜索算法。
- 不改变训练记录结构和成功判定。
- 不改变 BLE 协议或设备去重规则。
