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

- [ ] 在 `scripts/test-ble.js` 加失败测试：`CubeLink.onEvent/onStatus` 返回的清理函数调用后不再通知；同一回调不会重复积累。再测跟随默认开启、按模式关闭、退出／再入不回放、`recovered` MOVE 丢弃、连接代际变更重置起点。
- [ ] 运行 `npm run test:ble`，确认新增断言先失败。
- [ ] 修改 `src/ble/cube-link.ts`：`onEvent(cb): () => void` 与 `onStatus(cb): () => void` 在注册后返回取消函数；遍历快照 `for (const cb of [...this.eventCbs])`，保证回调中取消安全。已有忽略返回值的调用保持兼容。
- [ ] 新建 `src/ble/follow-gate.ts`：`FollowGate` 以 `activeMode`、`enabledByMode`（默认 true）和会话代际决定 `accept(mode, event)`；仅活动、启用、非 recovered 的实时 MOVE 为 true。`activate(mode)` 不重放队列；`setEnabled(mode, enabled)` 写 `bleFollow:<mode>`，存储读取异常时按默认开启。门控不持有 `World`。
- [ ] `npm run test:ble` 应全绿。将测试和实现一起提交为 `feat(蓝牙连接): 增加可取消订阅与跟随门控`，不要单独提交失败测试。

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

- [ ] 在 `scripts/test-ble.js` 增加失败测试：跨两次 `activate` 只创建一次 `CubeLink`；连接、状态、电量、facelets 和最近 MOVE 序号持续更新；取消订阅与断连后无旧回调。使用现有 `MockGanCubeTransport` 和注入式 link factory，不依赖浏览器全局。
- [ ] 运行 `npm run test:ble` 观察红灯。
- [ ] 实现 `CubeSession`：持有一个 `CubeLink`，提供 `connect(kind, opts)`、`disconnect()`、`requestFacelets()`、`requestBattery()`、`mockApplyFormula()`、`subscribe(onSnapshot, onEvent)` 及 `dispose()`；事件回调接收完整 `LinkEvent`，仅 UI 门控决定是否驱动画面。保存现有 `bleLastKind/bleLastMac/bleLastName/bleManualMac` 键。将 BLECross 中 `tryAutoReconnect` 的设备级流程移入会话；只调用一次，连接失败保留错误供用户重试。扫描仍复用 `getNativeTransport()`，关闭对话框停止扫描但不影响连接。
- [ ] `npm run test:ble` 全绿。提交 `feat(蓝牙连接): 将设备生命周期提升为共享会话`。

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

- [ ] 新建 `scripts/verify-global-ble.js` 的浏览器红灯检查：Mock 连接后菜单切换 `blecross → playground → blecross` 不产生文档导航；会话实例身份不变，BLECross 的 `World` 实例身份不变；URL 与后退／前进对应界面。直达 `?mode=player&data=...` 正确载入内容。
- [ ] 创建 `src/vue/AppShell/index.ts` 和 `index.html`：根组件实例持有 `CubeSession`、`FollowGate`、活动模式，缓存已访问组件；向后代 provide 会话与活动状态。使用 History API 维护 URL，监听 `popstate`，只在模式变化时激活界面。浏览器完整刷新从 URL 重新建立根实例，不假称保持现有连接。
- [ ] 改 `src/index.ts` 渲染外壳，保留 `mode=reset` 逻辑；改 `Setting.tap` 为调用注入的导航函数，教程返回、播放器 home 和站内 `?mode=` 链接也改应用内导航；分享链接仍是标准 URL。根顶栏连接入口调用会话连接／扫描／断开与错误提示，不建立第二份 link。
- [ ] 运行浏览器回归和 `npm run build`，确认深链与前进／后退。提交 `feat(界面导航): 常驻蓝牙会话并切换缓存界面`。

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

- [ ] 浏览器测试先覆盖：跟随默认开；关闭 `playground` 后实体转动不变画面；重新开启不补动作；其他模式不继承关闭状态。切换回来保持原画面；重置只影响当前模式。播放期间忽略 MOVE 且不补放。
- [ ] 在外壳跟随控件调用门控，并为每个交互 3D 页面提供明确 `applyPhysicalMove(move, serial?)`、`resetVisualCube()`、`onAppActivate()`、`onAppDeactivate()` 方法。普通页面只用 `twister.push(move)` 追加实时动作，播放组件有动画时直接忽略；BLECross 仍调用自身 `handleEvent`／`onMoveEvent`，不绕开其串号、z2 和虚拟打乱规则。重置直接作用当前 `World.cube`，不调用 BLECross 的「重置本轮」代替还原态。
- [ ] 缓存界面停止隐藏页的 rAF、键盘监听和需要停顿的计时器，激活时 resize 并只恢复一次循环。`Viewport` 销毁时移除 wheel 监听并释放 renderer；无需销毁的缓存实例只暂停渲染。检验不会有后台重复键盘动作或重复帧循环。
- [ ] 运行 `npm run test:ble`、浏览器回归与 `npm run build`。提交 `feat(魔方界面): 支持逐界面跟随与独立还原`。

外壳收到事件时，先判活动模式再调用当前页面的适配器；状态帧绝不走画面适配器：

```ts
if (event.type === "move" && gate.accept(activeMode, event)) {
  activeCubeView?.applyPhysicalMove(event.move, event.serial);
}
// 顶栏按钮调用 activeCubeView?.resetVisualCube()，不调用 session.disconnect()。
```

## 任务 5：BLECross 暂停、恢复和实体账本

- [ ] 在 `scripts/verify-global-ble.js` 增加红灯：观察期、还原期、success 自动下轮等待期分别切走；虚拟时间流逝不计入耗时且不触发下轮；回来从剩余时间继续。期间 Mock MOVE 不计步，不改 3D；首步新 MOVE 只处理一次。连接变更／权威 facelets 不能仅因界面进入而覆盖原场景。
- [ ] BLECross 移除 `new CubeLink()` 和自身设备级重连；订阅共享会话，只在活动且跟随时把实时 MOVE 交给训练处理。后台实体 facelets 只更新会话账本；重入时以最新 serial 建立事件边界，保留虚拟训练画面和已累计状态。
- [ ] 增加暂停时间账本：退出时保存暂停起点和自动下轮剩余毫秒、清除定时器；重入时把 `observeStart/solveStart/timerStart` 顺延暂停时长并以剩余毫秒重建倒计时。正在求解的异步回调要检查活动代际，不能在后台写结果。离开期间发生实体 MOVE 时显示可能失同步提示。
- [ ] 跑 `npm run verify:blecross`、`npm run verify:global-ble` 和 `npm run test:ble`。提交 `feat(蓝牙训练): 切换菜单时暂停并恢复训练局`。

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

- [ ] `npm run test:ble`、`npm run test:android`、`npm run build`、`npm run verify:blecross`、`npm run verify:bleconnect`、`npm run verify:global-ble`，阅读完整退出码和失败数。
- [ ] 真机／Android APK 中验证连接、跨菜单、扫描、断开与重连；若无真机环境，明确报告未验证真机，不以 Mock 冒充。
- [ ] `git diff --check`，检查仅任务范围的变动。构建产物若按仓库惯例受版本控制，同步 `dist/` 与 Android assets。保留用户现有 README、`.trae/`、`.superpowers/` 改动，不混入提交。
- [ ] 给用户交付行为摘要、验证结果和剩余风险；只有用户另行要求时才推送或发布新 APK。
