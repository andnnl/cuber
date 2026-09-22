# BLE Cross 蓝牙首步竞态修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 保留 GAN 动作的实时/历史来源信息，让轮次同步窗口接受真实首步、拒绝历史补发，并在权威基线发现状态断档时对齐 3D。

**架构：** GAN 协议适配层把 `localTimestamp === null` 转为统一 MOVE 事件的 `recovered` 标记。BLE Cross 的轮次屏障只丢弃 `recovered` 动作，实时动作继续走既有 `onMoveEvent → mirrorPush → onManualTwist` 路径；基线返回时根据返回前的 `predicted` 是否与权威状态一致决定是否重绘，并按完整视图链恢复画面姿态。

**技术栈：** TypeScript 4.3、Vue 2 类组件、Three.js、GAN BLE 协议、Node `assert`、Playwright CLI

---

## 文件结构

- 修改 `src/ble/types.ts`：为统一 MOVE 事件定义 `recovered` 来源标记。
- 修改 `src/ble/protocols/gan.ts`：把 GAN `localTimestamp` 映射成 `recovered`。
- 修改 `src/vue/BleCrossTrainer/index.ts`：按来源处理同步窗口 MOVE，并在基线漂移时恢复权威画面及完整视图姿态。
- 修改 `scripts/test-ble.js`：验证协议适配层保留实时动作标记。
- 修改 `scripts/verify-blecross-recompute.js`：覆盖真实首步先到、历史补发丢弃、基线漂移收敛和后续动作一致性。

### 任务 1：协议动作来源元数据

**文件：**
- 修改：`scripts/test-ble.js:246-265`
- 修改：`src/ble/types.ts:5-10`
- 修改：`src/ble/protocols/gan.ts:198-205`

- [ ] **步骤 1：编写失败的协议测试**

在现有“转动事件流”用例中增加断言：

```js
assert.strictEqual(moveEvents[0].recovered, false, "实时 MOVE 应保留非恢复来源标记");
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:ble`

预期：FAIL，提示实时 MOVE 的 `recovered` 实际为 `undefined`。

- [ ] **步骤 3：扩展统一事件类型并映射 GAN 元数据**

将 MOVE 类型改为：

```ts
| { type: "move"; move: string; serial?: number; recovered?: boolean }
```

GAN 转换保留来源：

```ts
case "MOVE":
  return {
    type: "move",
    move: e.move,
    serial: e.serial,
    recovered: e.localTimestamp === null,
  };
```

- [ ] **步骤 4：运行协议测试验证通过**

运行：`npm run test:ble`

预期：全部 BLE 测试通过，新增断言为 PASS。

- [ ] **步骤 5：提交协议元数据变更**

```bash
git add src/ble/types.ts src/ble/protocols/gan.ts scripts/test-ble.js
git commit -m "fix(蓝牙协议): 保留动作历史恢复标记"
```

### 任务 2：轮次同步窗口首步竞态

**文件：**
- 修改：`scripts/verify-blecross-recompute.js:770-850`
- 修改：`src/vue/BleCrossTrainer/index.ts:320-335,1080-1205,1247-1331`

- [ ] **步骤 1：编写失败的浏览器回归测试**

在轮次边界用例中明确构造以下顺序，并断言统一账本：

```js
vm.bleRoundSyncPending = true;
vm.handleEvent({ type: "move", move: "R", serial: 121, recovered: false });
vm.world.cube.twister.finish();
const beforeBaseline = {
  scene: vm.mapStateForJudge(vm.world.cube.serialize()),
  predicted: vm.predicted,
  moves: vm.moveCount,
  phase: vm.phase,
};
vm.handleEvent({ type: "facelets", facelets: afterR, serial: 121 });
```

期望 `beforeBaseline.scene === afterR`、`predicted === afterR`、`moves === 1`、`phase === "solving"`。另建独立场景注入：

```js
vm.bleRoundSyncPending = true;
vm.handleEvent({ type: "move", move: "U", serial: 130, recovered: true });
```

期望历史动作不改变画面、计步和阶段；随后权威 FACELETS 与旧画面不同时，基线处理将画面对齐权威状态但仍不计步。

再覆盖相反顺序：先发送 serial=140 的 FACELETS，再发送同 serial、`recovered=false` 的 MOVE；期望该 MOVE 通过 `coveredByAuthoritative` 只镜像和计数一次，而不是被基线误标为已消费。

- [ ] **步骤 2：运行浏览器测试验证正确失败**

运行：`npm run verify:blecross`

预期：FAIL，错误指出同步窗口内真实首步未显示/未计数，或基线后 `scene !== predicted`。

- [ ] **步骤 3：实现同步窗口来源判断**

在 `handleEvent` 的 MOVE 分支改为：

```ts
if (this.bleRoundSyncPending && e.recovered) {
  console.log(`[BT] MOVE ${e.move} s=${e.serial} → roundSync 历史恢复丢弃`);
  return;
}
if (this.bleRoundSyncPending) {
  console.log(`[BT] MOVE ${e.move} s=${e.serial} → roundSync 实时首步接受`);
}
this.onMoveEvent(e.move, e.serial);
```

缺少 `recovered` 时按实时动作处理，保持其他协议兼容。

基线设置序号时不得无条件把 `bleMoveSerial` 写成 baseline。保存基线到达前的 MOVE 序号：若它已经等于 baseline，说明实时 MOVE 先到，保留为已消费；否则清为 `null`，允许稍后到达的同序号实时 MOVE 进入 `coveredByAuthoritative`，再由该分支写入已消费序号。历史恢复 MOVE 仍由 `recovered` 标记拒绝。

- [ ] **步骤 4：实现基线漂移对齐与视图恢复**

处理 FACELETS 前记录：

```ts
const baselineDrift = roundBaseline && valid !== this.predicted;
```

增加只用于权威重绘的辅助方法，保存完整视图链、重绘物理状态，再用快速整体转恢复画面姿态，不向 history 重复记账：

```ts
private syncPhysicalScene(raw: string, tag: string): void {
  const viewOps = this.effectiveViewOps().map((op) => ({ ...op }));
  this.rebasing = true;
  this.world.cube.twister.finish();
  this.syncScene(raw, tag);
  for (const op of viewOps) {
    for (const group of this.world.cube.table.groups[op.axis]) {
      group.twist(op.times * (Math.PI / 2), true);
    }
  }
  this.rebasing = false;
  this.world.dirty = true;
}
```

`onAuthoritative` 完成实体跟踪校正后，仅当 `baselineDrift` 为真时调用该辅助方法。正常真实首步已经通过动画落定，不触发整幅重绘。

- [ ] **步骤 5：运行浏览器回归验证通过**

运行：`npm run verify:blecross`

预期：PASS；真实首步只计一次，历史补发不计步，基线漂移后画面与实体一致。

- [ ] **步骤 6：提交训练页竞态修复**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "fix(蓝牙训练): 修复轮次同步吞首步竞态"
```

### 任务 3：完整验证与构建产物

**文件：**
- 可能修改：`dist/index.html`
- 可能创建：`dist/index.<hash>.js`
- 恢复：`dist/cube_cross_table.bin`

- [ ] **步骤 1：运行 BLE 单元测试**

运行：`npm run test:ble`

预期：全部通过，0 失败。

- [ ] **步骤 2：运行 BLE Cross 浏览器回归**

运行：`npm run verify:blecross`

预期：PASS，无首步竞态或既有功能回归。

- [ ] **步骤 3：运行生产构建**

运行：`npm run build`

预期：webpack `compiled successfully`。

- [ ] **步骤 4：恢复构建清理掉的查表文件**

运行：`node scripts/gen-table.mjs`

预期：`dist/cube_cross_table.bin` 为 2661132 字节。

- [ ] **步骤 5：检查并提交构建产物**

运行：

```bash
git status -sb
git diff --check
git diff --stat
```

确认 `README.md` 与 `.trae/` 未进入暂存区后，仅添加本次构建产物：

```bash
git add dist/index.html dist/index.*.js
git commit -m "build(蓝牙训练): 更新首步竞态修复产物"
```

- [ ] **步骤 6：最终一致性检查**

运行：

```bash
git status -sb
git log -4 --oneline
```

预期：只剩用户原有 `README.md` 修改和未跟踪 `.trae/`；本轮规格、计划、协议、训练页和构建产物提交均存在。
