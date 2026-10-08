# BLE Cross 显式视角刷新实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 仅在点击 `z2`、`y`、`y'` 或修改显式训练设置时重算解法和相关块，3D 拖动不改变解法与相关实体块集合。

**架构：** 在 `BleCrossTrainer` 内增加一次性按钮旋转计数，供统一动画回调区分按钮与拖动来源；同时以颜色组合签名缓存相关块身份，使整体拖动和层转后仍追踪同一批实体块。保持底层 3D 控制器及其他页面不变。

**技术栈：** TypeScript、Vue 2、Three.js、Playwright CLI、webpack 5

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加按钮/拖动重算来源和相关块缓存行为的浏览器回归。
- 修改 `src/vue/BleCrossTrainer/index.ts`：实现按钮旋转计数、相关块签名缓存及明确的失效时机。
- 修改 `docs/superpowers/plans/2026-10-08-blecross-explicit-view-refresh.md`：执行过程中更新复选框。
- 更新 `dist/index.html` 和带哈希的 `dist/index.*.js`：保存生产构建产物。

### 任务 1：锁定按钮与拖动的行为差异

**文件：**
- 修改：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：编写失败的浏览器回归测试**

在隔离的手动训练状态中替换 `recomputeBestFromCurrent()` 和 `requestBest()` 为计数器，然后执行：

```javascript
vm.world.cube.twister.push("x y z");
vm.world.cube.twister.finish();
const dragRecomputes = recomputes;

vm.rotateWholeY(1);
vm.world.cube.twister.finish();
const buttonRecomputes = recomputes;

vm.toggleZ2();
const z2Requests = requests;
```

断言拖动重算次数为 `0`，`y` 按钮增加 `1` 次，`z2` 增加一次直接求解请求。

- [x] **步骤 2：锁定相关块身份稳定性**

开启 XCross 与半透明，建立 `FL` 相关块缓存并断言：

```javascript
const initialCache = vm.visibilityNeededSignatures;
// x/y/z 拖动与普通层转后仍复用同一个 Set
// y 按钮、z2、槽位变更后必须建立新的 Set
```

同时比较缓存中的颜色组合签名，确认拖动与层转前后一致。

- [x] **步骤 3：运行测试验证红灯**

运行：`npm run verify:blecross`

预期：FAIL，现有实现会在拖动时重算，并且不存在稳定的相关块签名缓存。

### 任务 2：实现显式视角重算标记

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：增加按钮旋转待处理计数**

增加字段：

```typescript
private pendingViewButtonRecomputes = 0;
```

`rotateWholeY()` 每次点击先递增计数，再启动 `y` 或 `y'` 动画。

- [x] **步骤 2：按来源处理整体转回调**

`onManualTwist()` 同步视角链后，仅在签名变化且计数大于 `0` 时消费一次计数并调用 `recomputeBestFromCurrent()`；拖动只更新 `bestRotationSig`。签名未变化时不消费计数，避免前序层转回调误吃按钮意图。

- [x] **步骤 3：运行回归确认解法行为转绿**

运行：`npm run verify:blecross`

预期：拖动不重算，`y` / `y'` 和 `z2` 仍重算。

### 任务 3：实现相关块颜色签名缓存

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：增加缓存与辅助方法**

增加：

```typescript
private visibilityNeededSignatures: Set<string> | null = null;

private pieceColorSignature(colors: string[]): string {
  return colors.filter(Boolean).slice().sort().join("");
}

private invalidateVisibilityTargets(): void {
  this.visibilityNeededSignatures = null;
}
```

- [x] **步骤 2：按颜色签名选择相关块**

`applyVisibility()` 仅在缓存为空时，根据目标底色、四条十字棱以及 XCross 当前槽位建立签名集合；之后每次材质刷新都通过当前块的颜色签名判断是否相关，不再按当前位置重新选择。

- [x] **步骤 3：配置显式失效点**

在 `toggleZ2()`、`rotateWholeY()`、`saveTrainMode()`、`saveVisGhost()`、`saveVisHide()` 和 `saveVisSlot()` 中使缓存失效。拖动回调和普通层转不失效。

- [x] **步骤 4：运行浏览器回归确认全部转绿**

运行：`npm run verify:blecross`

预期：拖动与层转保持同一缓存对象和签名集合；按钮与显式设置建立新缓存。

### 任务 4：完整验证与交付

**文件：**
- 更新：`dist/index.html`
- 删除：旧的 `dist/index.*.js`
- 创建：新的 `dist/index.*.js`

- [x] **步骤 1：运行 BLE 单元测试**

运行：`npm run test:ble`

预期：38 个测试全部通过。

- [x] **步骤 2：运行 BLE Cross 浏览器回归**

运行：`npm run verify:blecross`

预期：全部浏览器断言通过。

- [x] **步骤 3：运行生产构建并保护求解表**

备份未跟踪的 `dist/cube_cross_table.bin`，运行 `npm run build`，恢复文件并验证 SHA-256 保持为：

```text
93455c0e1994692f153c7631bef9a9dc1f68b648a8fe5a378eafd7a9e180f7c5
```

- [x] **步骤 4：检查提交范围并提交**

仅提交计划、测试、实现和构建产物；保留用户已有的 `README.md`、`.superpowers/`、`.trae/` 与 `dist/cube_cross_table.bin`。

- [x] **步骤 5：推送两个远端**

将 `master` 推送到 `origin`（Gitee）和 `github`，确认两个远端与本地 `HEAD` 一致。

## 自检

- 规格中的解法冻结、相关块冻结、按钮刷新、显式设置刷新、层转追踪均有对应实现与测试。
- 所有字段和方法名在任务之间一致。
- 没有跨页面修改底层 3D 控制器，范围保持在 BLE Cross。
