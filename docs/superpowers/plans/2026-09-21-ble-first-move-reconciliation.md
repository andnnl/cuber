# BLE 首次转动状态对账实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 BLE MOVE 与权威 FACELETS 在任意到达顺序下只消费一次物理转动，避免连接或重置后的第一下使 3D 魔方重复转动或被旧状态回拉。

**架构：** 协议层把 GAN 事件序号透传到 `LinkEvent` 并串行处理通知；BLE Cross 页用 8 位循环序号统一对账 FACELETS 与 MOVE。已经被同序号 FACELETS 覆盖的 MOVE 仍参与计时和步骤记录，但不再推演状态或播放动画。

**技术栈：** TypeScript 4.3、Vue 2 class component、GAN BLE 协议、Node assert、Playwright CLI

---

## 文件结构

- 修改 `src/ble/types.ts`：为 MOVE/FACELETS 事件增加可选序号。
- 修改 `src/ble/protocols/gan.ts`：透传序号并串行化通知解析。
- 修改 `src/vue/BleCrossTrainer/index.ts`：实现序号比较、连接生命周期清理及状态对账。
- 修改 `scripts/test-ble.js`：覆盖序号透传、串行派发和失败隔离。
- 修改 `scripts/verify-blecross-recompute.js`：覆盖乱序、迟到状态、序号回绕和重置首步。

### 任务 1：协议事件保留序号

**文件：**
- 修改：`scripts/test-ble.js`
- 修改：`src/ble/types.ts:6-10`
- 修改：`src/ble/protocols/gan.ts:167-201`

- [ ] **步骤 1：编写失败的序号透传测试**

在 Mock 全链路的 MOVE/FACELETS 测试中断言：

```js
const moveEvents = events.filter((e) => e.type === "move");
assert.strictEqual(moveEvents[0].serial, 1);
assert.strictEqual(lastFacelets.serial, 10);
```

- [ ] **步骤 2：运行测试验证红灯**

运行：`npm run test:ble`

预期：序号断言失败，实际值为 `undefined`。

- [ ] **步骤 3：最小实现序号透传**

把 `LinkEvent` 修改为：

```ts
export type LinkEvent =
  | { type: "facelets"; facelets: string; serial?: number }
  | { type: "move"; move: string; serial?: number }
  | { type: "battery"; level: number }
  | { type: "hardware"; name?: string; softwareVersion?: string };
```

`toLinkEvent` 中保留事件序号：

```ts
case "FACELETS":
  return { type: "facelets", facelets: e.facelets, serial: e.serial };
case "MOVE":
  return { type: "move", move: e.move, serial: e.serial };
```

- [ ] **步骤 4：运行测试验证绿灯**

运行：`npm run test:ble`

预期：全部 BLE 单元测试通过。

- [ ] **步骤 5：提交协议序号变更**

```bash
git add src/ble/types.ts src/ble/protocols/gan.ts scripts/test-ble.js
git commit -m "fix(蓝牙协议): 保留状态与转动事件序号"
```

### 任务 2：串行处理 GAN 通知

**文件：**
- 修改：`scripts/test-ble.js`
- 修改：`src/ble/protocols/gan.ts:47-184`

- [ ] **步骤 1：编写失败的通知顺序与失败隔离测试**

构造可控 transport，并在测试中替换 link 的驱动和解密器：第一帧解析等待 Promise，第二帧立即完成。连续触发两帧后断言在释放第一帧前没有第二帧事件，释放后顺序为 `[1, 2]`。再令一帧抛错，断言后一帧仍会派发。

```js
transport.emit(Uint8Array.of(1, ...new Array(15).fill(0)));
transport.emit(Uint8Array.of(2, ...new Array(15).fill(0)));
await flush();
assert.deepStrictEqual(seen, []);
releaseFirst();
await flush();
assert.deepStrictEqual(seen, [1, 2]);
```

- [ ] **步骤 2：运行测试验证红灯**

运行：`npm run test:ble`

预期：第二帧在第一帧之前派发，顺序断言失败。

- [ ] **步骤 3：最小实现通知队列**

在 `GanCubeLink` 增加：

```ts
private notificationQueue: Promise<void> = Promise.resolve();

private enqueueBytes(data: Uint8Array): void {
  const frame = data.slice();
  this.notificationQueue = this.notificationQueue
    .then(() => this.handleBytes(frame))
    .catch(() => undefined);
}
```

连接时改为：

```ts
this.transport.onBytes((data) => this.enqueueBytes(data));
```

- [ ] **步骤 4：运行测试验证绿灯**

运行：`npm run test:ble`

预期：通知顺序及失败隔离测试通过，其他协议测试保持通过。

- [ ] **步骤 5：提交通知队列变更**

```bash
git add src/ble/protocols/gan.ts scripts/test-ble.js
git commit -m "fix(蓝牙协议): 串行处理魔方通知帧"
```

### 任务 3：BLE Cross 按序号对账状态

**文件：**
- 修改：`scripts/verify-blecross-recompute.js:590-625`
- 修改：`src/vue/BleCrossTrainer/index.ts:283-345,617-655,1111-1249`

- [ ] **步骤 1：编写失败的浏览器回归测试**

在测试页构造一个基准态及其 `R` 后状态，直接向组件派发带序号事件，并断言：

```js
vm.handleEvent({ type: "facelets", facelets: afterR, serial: 41 });
vm.handleEvent({ type: "move", move: "R", serial: 41 });
vm.world.cube.twister.finish();
assertState = {
  predicted: vm.predicted,
  scene: vm.world.cube.serialize(),
  moves: vm.moveCount,
  displayMoves: vm.userDisplayMoves.length,
};
```

期望 `predicted === afterR`、`scene === afterR`、`moves === 1`、`displayMoves === 1`。随后派发旧序号 40 的旧 FACELETS，状态不得回拉；再覆盖 `255 → 0`。

- [ ] **步骤 2：运行测试验证红灯**

运行：`npm run verify:blecross`

预期：同序号 MOVE 被再次应用，`predicted`/`scene` 变成 `R2`，或旧 FACELETS 回拉状态。

- [ ] **步骤 3：实现循环序号比较和生命周期清理**

在组件增加：

```ts
private bleEventSerial: number | null = null;
private bleAuthoritativeSerial: number | null = null;

private resetBleReconciliation(): void {
  this.bleEventSerial = null;
  this.bleAuthoritativeSerial = null;
}

private serialRelation(serial: number, reference: number): -1 | 0 | 1 {
  const diff = ((serial & 0xff) - (reference & 0xff)) & 0xff;
  return diff === 0 ? 0 : diff < 0x80 ? 1 : -1;
}
```

在连接开始、断开和输入源切换时调用 `resetBleReconciliation()`。

- [ ] **步骤 4：实现 FACELETS/MOVE 对账**

`handleEvent` 把序号传入 `onAuthoritative`/`onMoveEvent`。FACELETS 比最近事件旧时直接忽略；更新或同序号时记录权威序号。

`onMoveEvent(move, serial)` 先完成观察→还原的阶段切换和显示记号计算。若该 MOVE 已被同序号权威状态覆盖：

```ts
const covered = serial !== undefined &&
  this.bleAuthoritativeSerial !== null &&
  this.serialRelation(serial, this.bleAuthoritativeSerial) === 0;

if (covered && this.predicted) {
  this.recordBleMove(move, displayMove, viewSig);
  this.previewPending = false;
  this.judge(this.predicted);
  return;
}
```

其中 `recordBleMove` 只在 `phase === "solving"` 时追加物理/显示步骤并更新 HTM 步数；普通 MOVE 也复用它。更旧 MOVE 直接丢弃，更新 MOVE 记录最新事件序号后沿用现有推演与动画。

- [ ] **步骤 5：运行浏览器回归验证绿灯**

运行：`npm run verify:blecross`

预期：标准顺序、乱序、旧状态、回绕以及五轮重置首转全部通过。

- [ ] **步骤 6：提交训练页对账变更**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "fix(蓝牙训练): 修复首步状态重复消费"
```

### 任务 4：完整验证与交付

**文件：**
- 验证：`src/ble/**`
- 验证：`src/vue/BleCrossTrainer/**`

- [ ] **步骤 1：运行 BLE 单元测试**

运行：`npm run test:ble`

预期：全部通过，0 个失败。

- [ ] **步骤 2：运行 BLE Cross 浏览器回归**

运行：`npm run verify:blecross`

预期：脚本退出码 0。

- [ ] **步骤 3：运行生产构建**

运行：`npm run build`

预期：webpack 编译成功。构建会清理 `dist/cube_cross_table.bin`，随后运行：

```bash
~/.nvm/versions/node/v22.22.0/bin/node scripts/gen-table.mjs
```

预期：重新生成 `dist/cube_cross_table.bin`，大小为 2661132 字节。

- [ ] **步骤 4：检查提交与工作区**

运行：

```bash
git status --short
git log --oneline -5
```

预期：仅保留用户原有未跟踪 `.trae/`；实现与测试均已提交，不推送远端。
