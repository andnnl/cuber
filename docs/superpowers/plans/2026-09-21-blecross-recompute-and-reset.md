# BLE Cross 重算坐标与蓝牙重置修复实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 Cross/XCross、y、y′、z2 全部基于当前 3D 状态重算最优解，并阻止 GAN 丢包缓冲在重置后批量重放旧 MOVE。

**架构：** BLE Cross 组件新增统一的当前状态重算入口；每个异步求解结果绑定发起请求时的视图链快照，公式和 XCross 槽位使用同一快照投影到屏幕帧。GAN Gen3/Gen4 缓冲失去连续性时丢弃不可信积压并请求权威 facelets，不再把积压事件作为实时 MOVE 派发。

**技术栈：** TypeScript 4.3、Vue 2 class component、Three.js、GAN 协议驱动、Node.js `assert`、webpack 5、playwright-cli。

---

## 文件结构

- 修改 `src/vue/BleCrossTrainer/index.ts`：统一当前状态重算，保存求解视图快照，确保公式和槽位同帧展示。
- 修改 `src/ble/protocols/vendor/gan-protocol-core.ts`：Gen3/Gen4 缓冲溢出时丢弃旧 MOVE 并请求权威状态。
- 修改 `scripts/test-ble.js`：增加 GAN Gen3/Gen4 缓冲积压回归测试。
- 创建 `scripts/verify-blecross-recompute.js`：在开发页面内验证模式、y/y′、z2 重算及 XCross 槽位/公式一致性。
- 修改 `package.json`：增加可重复执行的 BLE Cross 浏览器回归命令。

### 任务 1：锁定 GAN 积压批量重放缺陷

**文件：**
- 修改：`scripts/test-ble.js`
- 测试：`scripts/test-ble.js`

- [ ] **步骤 1：为 Gen3/Gen4 编写失败测试**

在 `scripts/test-ble.js` 中导入 `GanGen3ProtocolDriver` 和 `GanGen4ProtocolDriver`，增加以下辅助函数和测试：

```javascript
const vendorCore = req("protocols/vendor/gan-protocol-core.js");

function bufferedMove(serial) {
  return {
    type: "MOVE",
    serial,
    timestamp: serial,
    localTimestamp: serial,
    cubeTimestamp: null,
    face: 1,
    direction: 0,
    move: "R",
  };
}

for (const [name, Driver] of [
  ["Gen3", vendorCore.GanGen3ProtocolDriver],
  ["Gen4", vendorCore.GanGen4ProtocolDriver],
]) {
  await test(`${name}: 断档积压不批量重放旧 MOVE，并请求权威 facelets`, async () => {
    const driver = new Driver();
    driver.lastSerial = 1;
    driver.moveBuffer = Array.from({ length: 17 }, (_, i) => bufferedMove(20 + i));
    const sent = [];
    let disconnected = false;
    const conn = {
      sendCommandMessage: async (msg) => sent.push(Array.from(msg)),
      disconnect: async () => { disconnected = true; },
    };

    const stale = await driver.evictMoveBuffer(conn);
    assert.deepStrictEqual(stale, []);
    assert.strictEqual(driver.moveBuffer.length, 0);
    assert.strictEqual(driver.lastSerial, 36);
    assert.strictEqual(disconnected, false);
    assert.strictEqual(sent.length, 1);

    driver.moveBuffer.push(bufferedMove(37));
    const fresh = await driver.evictMoveBuffer(conn);
    assert.deepStrictEqual(fresh.map((e) => e.serial), [37]);
  });
}
```

- [ ] **步骤 2：运行测试并确认按预期失败**

运行：

```bash
~/.nvm/versions/node/v22.22.0/bin/npx tsc -p tsconfig.ble.json
~/.nvm/versions/node/v22.22.0/bin/node scripts/test-ble.js
```

预期：两个新增测试失败；旧实现返回序号 20～36 的 17 个 MOVE，且没有发送 facelets 请求。

- [ ] **步骤 3：提交红灯测试**

```bash
git add scripts/test-ble.js
git commit -m "test(蓝牙): 覆盖 GAN 断档积压恢复"
```

### 任务 2：修复 GAN Gen3/Gen4 缓冲恢复

**文件：**
- 修改：`src/ble/protocols/vendor/gan-protocol-core.ts:385-425`
- 修改：`src/ble/protocols/vendor/gan-protocol-core.ts:691-731`
- 测试：`scripts/test-ble.js`

- [ ] **步骤 1：实现最小恢复逻辑**

把 Gen3 和 Gen4 的 `moveBuffer.length > 16` 分支替换为相同策略：

```typescript
if (conn && this.moveBuffer.length > 16) {
    // 序号断档长期无法补齐时，缓冲动作已不再具备实时动画语义。
    // 记录最新序号后丢弃积压，由权威 facelets 纠正最终状态。
    const tail = this.moveBuffer[this.moveBuffer.length - 1] as GanCubeMoveEvent;
    this.lastSerial = tail.serial;
    this.moveBuffer = [];
    const request = this.createCommandMessage({ type: "REQUEST_FACELETS" });
    if (request) {
        await conn.sendCommandMessage(request).catch(() => undefined);
    }
}
```

不要把缓冲事件加入 `evictedEvents`，也不要调用 `disconnect()`。

- [ ] **步骤 2：运行 BLE 单测确认转绿**

运行：

```bash
~/.nvm/versions/node/v22.22.0/bin/npx tsc -p tsconfig.ble.json
~/.nvm/versions/node/v22.22.0/bin/node scripts/test-ble.js
```

预期：新增 Gen3/Gen4 用例和全部存量 BLE 用例通过。

- [ ] **步骤 3：提交协议修复**

```bash
git add src/ble/protocols/vendor/gan-protocol-core.ts scripts/test-ble.js
git commit -m "fix(蓝牙): 丢弃断档积压并同步权威状态"
```

### 任务 3：建立 BLE Cross 浏览器红灯回归

**文件：**
- 创建：`scripts/verify-blecross-recompute.js`
- 修改：`package.json`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：创建浏览器回归脚本**

创建 `scripts/verify-blecross-recompute.js`，导出供 `playwright-cli run-code` 执行的异步函数。脚本打开 `?mode=blecross`，进入手动训练，等待 `window.__bleCross` 和求解器就绪，然后执行以下断言：

```javascript
async page => {
  const url = "http://127.0.0.1:8080/?mode=blecross";
  await page.goto(url);
  await page.waitForFunction(() => window.__bleCross && window.__bleCross.solver);
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.showBest = true;
    vm.enterManual();
    vm.newScramble();
  });
  await page.waitForFunction(() => window.__bleCross.bestReady || window.__bleCross.bestXReady);

  const requestId = async () => page.evaluate(() => window.__bleCross.bestReqId);
  const beforeMode = await requestId();
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = vm.trainMode === "cross" ? "xcross" : "cross";
    vm.saveTrainMode();
  });
  await page.waitForFunction(id => window.__bleCross.bestReqId > id, beforeMode);

  for (const turns of [1, -1]) {
    const before = await requestId();
    await page.evaluate(t => window.__bleCross.rotateWholeY(t), turns);
    await page.waitForFunction(id => window.__bleCross.bestReqId > id, before);
  }

  const beforeZ2 = await requestId();
  await page.evaluate(() => window.__bleCross.toggleZ2());
  await page.waitForFunction(id => window.__bleCross.bestReqId > id, beforeZ2);

  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "xcross";
    vm.saveTrainMode();
  });
  await page.waitForFunction(() => window.__bleCross.bestXReady);
  const result = await page.evaluate(() => {
    const vm = window.__bleCross;
    return {
      count: vm.bestXDisplay.length,
      labels: vm.bestXDisplay.map(x => x.slot),
      hasFormula: vm.bestXDisplay.every(x => typeof x.formula === "string"),
      requestView: JSON.stringify(vm.bestViewOps),
      currentView: JSON.stringify(vm.effectiveViewOps()),
    };
  });
  if (result.count !== 4 || new Set(result.labels).size !== 4 || !result.hasFormula) {
    throw new Error(`XCross 展示不完整: ${JSON.stringify(result)}`);
  }
  if (result.requestView !== result.currentView) {
    throw new Error(`求解结果视图与当前视图不一致: ${JSON.stringify(result)}`);
  }
}
```

在 `package.json` 增加：

```json
"verify:blecross": "playwright-cli run-code --filename=scripts/verify-blecross-recompute.js"
```

- [ ] **步骤 2：启动开发服务**

运行：

```bash
~/.nvm/versions/node/v22.22.0/bin/npx webpack serve --mode=development --host=127.0.0.1
```

预期：开发服务监听 `127.0.0.1:8080`。

- [ ] **步骤 3：运行脚本并确认按预期失败**

另开命令运行：

```bash
playwright-cli open http://127.0.0.1:8080/?mode=blecross
playwright-cli run-code --filename=scripts/verify-blecross-recompute.js
```

预期：蓝牙/统一入口尚未实现时，y/y′ 请求代际不增长，或 `bestViewOps` 尚不存在导致视图快照断言失败。

- [ ] **步骤 4：提交红灯测试**

```bash
git add scripts/verify-blecross-recompute.js package.json
git commit -m "test(训练器): 覆盖当前状态最优解重算"
```

### 任务 4：绑定求解结果与视图链快照

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:220-245`
- 修改：`src/vue/BleCrossTrainer/index.ts:624-710`
- 修改：`src/vue/BleCrossTrainer/index.ts:1420-1520`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：增加求解视图快照状态**

在最优解字段附近增加：

```typescript
private bestViewOps: BaseOp[] = [];
```

新增显式映射方法，并让原方法继续服务实时 MOVE：

```typescript
private displayFormulaWithOps(formula: string, ops: BaseOp[]): string {
  const map = baseOpsFaceCharMap(ops);
  return formula
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => (map[m.charAt(0)] || m.charAt(0)) + m.slice(1))
    .join(" ");
}

private slotDisplayNameWithOps(slot: string, ops: BaseOp[]): string {
  const map = baseOpsFaceCharMap(ops);
  const a = map[slot.charAt(0)] || slot.charAt(0);
  const b = map[slot.charAt(1)] || slot.charAt(1);
  const rank: { [c: string]: number } = { F: 0, B: 0, U: 1, D: 1, L: 2, R: 2 };
  return rank[a] <= rank[b] ? a + b : b + a;
}
```

`bestSolutionText` 和 `bestXDisplay` 必须使用 `bestViewOps`，不再读取可能已经变化的实时 `effectiveViewOps()`：

```typescript
get bestSolutionText(): string {
  return this.displayFormulaWithOps(this.bestSolution, this.bestViewOps);
}

get bestXDisplay(): { slot: string; formula: string; steps: number; raw: string }[] {
  return this.bestX.map((b) => ({
    slot: this.slotDisplayNameWithOps(b.slot, this.bestViewOps),
    steps: b.steps,
    formula: this.displayFormulaWithOps(b.formula, this.bestViewOps),
    raw: b.formula,
  }));
}
```

- [ ] **步骤 2：让每次求解捕获并提交同一快照**

把 `requestBest` 改为接收可选快照，并在请求开始时复制数组：

```typescript
private requestBest(state: string, viewOps: BaseOp[] = this.effectiveViewOps()): void {
  const requestViewOps = viewOps.map((op) => ({ ...op }));
  // 保留现有清理、校验和模式分派逻辑
  if (this.trainMode === "xcross") {
    this.requestBestXCross(state, requestViewOps);
  } else {
    this.requestBestSolution(state, requestViewOps);
  }
}
```

把两个异步方法签名改为：

```typescript
private async requestBestSolution(state: string, viewOps: BaseOp[]): Promise<void>
private async requestBestXCross(state: string, viewOps: BaseOp[]): Promise<void>
```

在 `reqId === this.bestReqId` 的结果提交分支中先执行：

```typescript
this.bestViewOps = viewOps.map((op) => ({ ...op }));
```

请求清理时同时执行 `this.bestViewOps = []`，确保等待新结果期间不展示旧视图公式。

- [ ] **步骤 3：运行浏览器回归，确认视图快照断言通过但 y/y′ 触发仍失败**

运行：

```bash
playwright-cli run-code --filename=scripts/verify-blecross-recompute.js
```

预期：`bestViewOps` 与结果绑定的断言通过；尚未统一触发的 y/y′ 断言仍失败。

- [ ] **步骤 4：提交视图快照修复**

```bash
git add src/vue/BleCrossTrainer/index.ts
git commit -m "fix(训练器): 绑定最优解与视图坐标快照"
```

### 任务 5：统一 Cross/XCross、y/y′、z2 当前状态重算

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:760-840`
- 修改：`src/vue/BleCrossTrainer/index.ts:1250-1320`
- 修改：`src/vue/BleCrossTrainer/index.ts:2010-2045`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：新增统一重算方法**

在 `currentBestBase()` 附近增加：

```typescript
private recomputeBestFromCurrent(): void {
  if (
    this.phase !== "scrambling" &&
    this.phase !== "observing" &&
    this.phase !== "solving" &&
    this.phase !== "success"
  ) {
    return;
  }
  this.world.cube.twister.finish();
  this.syncObservedOps();
  const viewOps = this.effectiveViewOps();
  const screen = this.world.cube.serialize();
  const core = this.mapStateForJudge(screen);
  if (core) {
    this.bestRotationSig = JSON.stringify(this.observedOps);
    this.requestBest(core, viewOps);
  }
}
```

- [ ] **步骤 2：模式切换改用统一入口**

保留 `saveTrainMode()` 的持久化和 `applyVisibility()`，把其中按阶段选择 `scrambleTarget`/`solveBaseState` 的分支替换为：

```typescript
this.recomputeBestFromCurrent();
```

不要重复手工清空结果；`requestBest()` 已统一处理代际和旧结果清理。

- [ ] **步骤 3：y/y′ 落定后统一重算**

调整 `onManualTwist()`：先处理 `rebasing`，再同步 `observedOps` 和视图签名。只要签名变化且当前有训练轮，就调用 `recomputeBestFromCurrent()`；完成后蓝牙模式直接返回，手动模式继续原有计步和判定：

```typescript
private onManualTwist(): void {
  if (this.rebasing) {
    return;
  }
  this.syncObservedOps();
  const sig = JSON.stringify(this.observedOps);
  if (sig !== this.bestRotationSig && this.currentBestBase()) {
    this.recomputeBestFromCurrent();
  }
  if (!this.isManual) {
    return;
  }
  // 保留原有 observing/solving 逻辑
}
```

`rotateWholeY()` 仍只负责发起整体旋转。重算由动画落定后的 world callback 触发，避免在 `serialize()` 尚未提交新姿态时提前求解。

- [ ] **步骤 4：z2 使用同一快照重算**

`toggleZ2()` 在更新 `z2On`、`z2Marks` 后，以翻转前捕获的核心帧和更新后的 `effectiveViewOps()` 调用：

```typescript
if (physical) {
  this.requestBest(physical, this.effectiveViewOps());
} else {
  this.recomputeBestFromCurrent();
}
```

蓝牙分支不再使用冻结的 `currentBestBase()`；应读取当前 3D/当前 `predicted` 对应状态。若翻转动画尚未落定，优先使用翻转前已经捕获的核心帧。

- [ ] **步骤 5：运行浏览器回归确认全绿**

运行：

```bash
playwright-cli run-code --filename=scripts/verify-blecross-recompute.js
```

预期：模式、y、y′、z2 均使请求代际增长；XCross 返回 4 个互不重复的当前屏幕槽位，结果视图等于当前视图。

- [ ] **步骤 6：提交统一重算修复**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js package.json
git commit -m "fix(训练器): 统一按当前状态重算最优解"
```

### 任务 6：验证蓝牙重置首转与整体回归

**文件：**
- 验证：`src/vue/BleCrossTrainer/index.ts`
- 验证：`src/ble/protocols/vendor/gan-protocol-core.ts`
- 验证：`scripts/test-ble.js`
- 验证：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：运行 BLE 单测**

```bash
~/.nvm/versions/node/v22.22.0/bin/npx tsc -p tsconfig.ble.json
~/.nvm/versions/node/v22.22.0/bin/node scripts/test-ble.js
```

预期：全部通过，失败数为 0。

- [ ] **步骤 2：运行浏览器回归并检查控制台**

```bash
playwright-cli run-code --filename=scripts/verify-blecross-recompute.js
playwright-cli console warning
```

预期：脚本通过；没有未处理异常、非法状态串或批量旧 MOVE 警告。

- [ ] **步骤 3：运行 TypeScript/webpack 生产构建**

```bash
~/.nvm/versions/node/v22.22.0/bin/npm run build
```

预期：webpack 退出码为 0。构建会清理 `dist`，随后恢复内置十字搜索表：

```bash
~/.nvm/versions/node/v22.22.0/bin/node scripts/gen-table.mjs
test -s dist/cube_cross_table.bin
```

预期：`dist/cube_cross_table.bin` 存在且非空。

- [ ] **步骤 4：检查变更范围和用户已有改动**

```bash
git status --short
git diff --check
git diff -- src/vue/BleCrossTrainer/index.ts src/ble/protocols/vendor/gan-protocol-core.ts scripts/test-ble.js package.json
```

预期：无空白错误；`src/vue/BleCrossTrainer/index.ts` 中任务开始前已有的模式切换改动已被有意识地合并到统一入口，没有被静默覆盖；`.trae/` 保持未跟踪且不提交。

- [ ] **步骤 5：提交最终验证所需的小修正（仅在有变更时）**

```bash
git add src/vue/BleCrossTrainer/index.ts src/ble/protocols/vendor/gan-protocol-core.ts scripts/test-ble.js scripts/verify-blecross-recompute.js package.json dist
git commit -m "test(训练器): 完善重算与蓝牙重置回归"
```

若验证未产生新修改，则跳过本步骤，不创建空提交。
