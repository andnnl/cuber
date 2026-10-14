# 全局蓝牙会话与界面跟随实现计划

> **面向 AI 代理的工作者：** 按项目偏好使用内联执行，以 superpowers:executing-plans 逐任务实现。步骤用复选框跟踪进度；不创建 worktree。

**目标：** 一次蓝牙连接跨菜单保持，当前 3D 界面默认跟随实体新转动，允许逐界面关闭，BLECross 离开后暂停训练。

**架构：** 根组件拥有唯一 `CubeSession`，向活动界面提供只读状态和可取消的 MOVE 订阅。路由在同一文档中切换并缓存界面实例；界面适配层控制 MOVE 到自身 `World` 的映射。BLECross 保留训练账本，但设备连接、扫描和重连上移到会话服务。

**技术栈：** TypeScript 4.3、Vue 2 类组件、Vuetify、Three.js、现有 `CubeLink`、Node 断言测试、Playwright CLI。

**设计依据：** `docs/superpowers/specs/2026-10-14-global-ble-session-design.md`。

---

## 文件职责

- `src/ble/cube-link.ts`：为状态／设备事件提供可取消订阅，保留现有代际守卫。
- `src/ble/cube-session.ts`：唯一连接的状态、扫描协调、记忆设备和自动重连；设备事件按当前连接代际分发。
- `src/ble/follow-gate.ts`：纯逻辑门控：活动模式、逐模式开关、会话代际、历史恢复事件；每次激活只接收之后的新 MOVE。
- `src/vue/AppShell/index.ts`、`index.html`：根层导航、缓存组件、连接入口和跟随／重置按钮；非 3D 页面不显示后两项。
- `src/index.ts`、`src/vue/Setting/index.ts`：入口解析与菜单内导航，保留 `player?data=...` 直达和前进／后退。
- `src/vue/BleCrossTrainer/index.ts`、`index.html`：注入共享会话，处理激活、暂停、恢复与现有训练逻辑。
- `src/vue/{Playground,Director,Player,Helper,F2LTrainer,CrossF2LTrainer,Algs}/index.ts`：活动状态、MOVE 适配、仅当前界面渲染、还原按钮；非交互 3D 界面仅处理生命周期。
- `src/vue/Viewport/index.ts`：释放 WebGL／事件监听，避免缓存切换导致资源累积。
- `scripts/test-ble.js`、`scripts/verify-global-ble.js`、`package.json`：纯逻辑测试与真实浏览器的菜单／画面回归。

## 任务 1：建立可取消订阅及门控纯逻辑

- [x] 在 `scripts/test-ble.js` 加失败测试：`CubeLink.onEvent/onStatus` 返回的清理函数调用后不再通知；同一回调不会重复积累。再测跟随默认开启、按模式关闭、退出／再入不回放、`recovered` MOVE 丢弃、连接代际变更重置起点。
- [x] 运行 `npm run test:ble`，确认新增断言先失败。
- [x] 修改 `src/ble/cube-link.ts`：`onEvent(cb): () => void` 与 `onStatus(cb): () => void` 在注册后返回取消函数；遍历快照 `for (const cb of [...this.eventCbs])`，保证回调中取消安全。已有忽略返回值的调用保持兼容。
- [x] 新建 `src/ble/follow-gate.ts`：`FollowGate` 以 `activeMode`、`enabledByMode`（默认 true）和会话代际决定 `accept(mode, event)`；仅活动、启用、非 recovered 的实时 MOVE 为 true。`activate(mode)` 不重放队列；`setEnabled(mode, enabled)` 写 `bleFollow:<mode>`，存储读取异常时按默认开启。门控不持有 `World`。
- [x] `npm run test:ble` 应全绿。将测试和实现一起提交为 `feat(蓝牙连接): 增加可取消订阅与跟随门控`，不要单独提交失败测试。

关键测试示例（扩展已有 `test` 辅助函数）：

```js
await test("跟随只接收当前界面的新实时动作", () => {
  const { FollowGate } = req("follow-gate.js");
  const gate = new FollowGate({ getItem: () => null, setItem: () => {} });
  gate.activate("playground");
  assert.strictEqual(gate.accept("playground", { type: "move", move: "R" }), true);
  gate.activate("director");
  assert.strictEqual(gate.accept("playground", { type: "move", move: "U" }), false);
  gate.setEnabled("director", false);
  assert.strictEqual(gate.accept("director", { type: "move", move: "F" }), false);
  gate.setEnabled("director", true);
  assert.strictEqual(gate.accept("director", { type: "move", move: "B", recovered: true }), false);
});
```

`CubeLink` 取消订阅的最小形式：

```ts
onEvent(cb: (event: LinkEvent) => void): () => void {
  this.eventCbs.push(cb);
  return () => {
    const index = this.eventCbs.indexOf(cb);
    if (index >= 0) this.eventCbs.splice(index, 1);
  };
}
```

## 任务 2：抽取唯一连接会话

- [x] 在 `scripts/test-ble.js` 增加失败测试：跨两次 `activate` 只创建一次 `CubeLink`；连接、状态、电量、facelets 和最近 MOVE 序号持续更新；取消订阅与断连后无旧回调。使用现有 `MockGanCubeTransport` 和注入式 link factory，不依赖浏览器全局。
- [x] 运行 `npm run test:ble` 观察红灯。
- [x] 实现 `CubeSession`：持有一个 `CubeLink`，提供 `connect(kind, opts)`、`disconnect()`、`requestFacelets()`、`requestBattery()`、`mockApplyFormula()`、`subscribe(onSnapshot, onEvent)` 及 `dispose()`；事件回调接收完整 `LinkEvent`，仅 UI 门控决定是否驱动画面。保存现有 `bleLastKind/bleLastMac/bleLastName/bleManualMac` 键。将 BLECross 中 `tryAutoReconnect` 的设备级流程移入会话；只调用一次，连接失败保留错误供用户重试。扫描仍复用 `getNativeTransport()`，关闭对话框停止扫描但不影响连接。
- [x] `npm run test:ble` 全绿。提交 `feat(蓝牙连接): 将设备生命周期提升为共享会话`。

接口约定：

```ts
type SessionSnapshot = {
  status: CubeLinkStatus;
  deviceName: string;
  battery: number | null;
  facelets: string | null;
  lastMoveSerial: number | null;
  generation: number;
  error: string;
};
type EventCallback = (event: LinkEvent) => void;
// subscribe(onSnapshot, onEvent) 返回取消函数；新订阅者先收到 snapshot，不补发 MOVE。
```

会话构造时只订阅底层一次；界面切换只变更上层订阅：

```ts
class CubeSession {
  constructor(private readonly link: CubeLink = new CubeLink()) {
    this.link.onEvent(event => this.publish(event));
    this.link.onStatus(() => this.publishSnapshot());
  }
  // publish 更新电量／facelets／最近序号，再通知当前订阅者。
  // dispose 取消底层订阅并断开；切换菜单不调用 dispose。
}
```

## 任务 3：应用内导航与常驻连接入口

- [x] 新建 `scripts/verify-global-ble.js` 的浏览器检查：Mock 连接后菜单切换不产生文档导航；会话和画面实例不变；URL、后退／前进及播放器深链正确。
- [x] 创建 `AppShell`：根层唯一会话、跟随门控、缓存界面与 History API 导航；刷新时按 URL 重建。
- [x] 改入口、菜单及站内链接为应用内导航；全局连接面板协调扫描／连接／断开，不建立第二份 link。
- [x] 浏览器回归与生产构建通过，完成提交。

导航约定：

```ts
type AppRoute = { mode: string; data?: string };
// navigate(route) 对菜单采用 pushState，再改变 activeMode；popstate 只读取 URL。
// keep-alive 缓存每种 mode 的组件实例；player 含 data 时以 mode + data 为键。
```

菜单不直接操作浏览器 location，改为注入导航函数：

```ts
@Inject("navigate") navigate: (route: AppRoute) => void;
// Setting.tap 中原 window.location.replace(link) 替换为：
this.navigate({ mode: key as string });
```

## 任务 4：逐界面转动、资源与还原状态

- [x] 浏览器覆盖跟随开关、逐界面偏好、画面保留／还原以及播放期间忽略 MOVE。
- [x] 外壳门控向当前普通 3D `World` 追加实时动作，播放时忽略；BLECross 继续走其专用实体事件处理。还原仅作用当前画面。
- [x] 隐藏页停止 rAF 与键盘操作，CrossF2L 计时暂停；Viewport 销毁时释放监听与 renderer。
- [x] 蓝牙单测、浏览器回归和生产构建通过。

外壳收到事件时，先判活动模式再调用当前页面的适配器；状态帧绝不走画面适配器：

```ts
if (event.type === "move" && gate.accept(activeMode, event)) {
  activeCubeView?.applyPhysicalMove(event.move, event.serial);
}
// 顶栏按钮调用 activeCubeView?.resetVisualCube()，不调用 session.disconnect()。
```

## 任务 5：BLECross 暂停、恢复和实体账本

- [x] 浏览器覆盖观察期、还原期、success 自动下轮等待期、后台转动和断线／重连；预览及基线自愈切页后取消。
- [x] BLECross 使用共享会话，重入按最新状态／代际重建实体账本，不用权威帧覆盖保留的画面。
- [x] 暂停时间账本顺延观察／还原计时并恢复自动下轮剩余时间；最优解异步回调用请求 ID 防止后台写回。
- [x] 旧版 BLECross 回归、全局浏览器回归和蓝牙单测通过。

暂停时间账本使用活动时间，避免 `Date.now()` 跨菜单继续累计：

```ts
onAppDeactivate(): void {
  this.pausedAt = Date.now();
  this.autoNextRemaining = this.resultTimer === null
    ? null : Math.max(0, this.autoNextDeadline - this.pausedAt);
  this.clearAutoNextSchedule();
}
onAppActivate(): void {
  if (this.pausedAt === null) return;
  const pausedMs = Date.now() - this.pausedAt;
  if (this.observeStart) this.observeStart += pausedMs;
  if (this.solveStart) this.solveStart += pausedMs;
  if (this.timerStart) this.timerStart += pausedMs;
  this.pausedAt = null;
  if (this.autoNextRemaining !== null) this.resumeAutoNext(this.autoNextRemaining);
  this.autoNextRemaining = null;
}
```

`resumeAutoNext(remainingMs)` 必须使用与现有自动下轮相同的行为分支，仅改变延时；后台异步完成回调检查活动状态，避免跳过暂停。

## 任务 6：完整验证与交付

- [x] 蓝牙／Android 单测、生产构建、BLECross／连接教程／全局浏览器回归通过。
- [x] 构建 Debug／Release APK；无真机环境，真机连接与切页仍待用户验证。
- [x] 检查差异与受跟踪产物，同步 `dist/` 和 Android assets；用户无关文件不纳入提交。
- [ ] 向用户交付摘要、验证结果和真机风险；不推送或发布 APK。
