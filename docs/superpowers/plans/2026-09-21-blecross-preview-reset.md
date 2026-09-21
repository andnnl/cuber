# BLE Cross 公式预览自动复位实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让每次公式完整播放和第一次向前单步都从该求解结果绑定的精确 3D 起点开始，避免残留预览状态导致显示错误。

**架构：** 在现有 `bestViewOps` 旁保存同一异步求解请求的核心状态 `bestBaseState`，两者组成不可混帧的预览快照。播放层新增一个纯视觉恢复方法，用核心状态重贴贴纸后即时重放视角链；`▶` 总是恢复并从头播放，`⏭` 仅在游标为 0 时恢复，`⏮` 保持逆向步进。

**技术栈：** TypeScript、Vue 2 class component、Three.js 魔方引擎、Playwright CLI 浏览器回归、webpack 5

---

## 文件结构

- 修改：`scripts/verify-blecross-recompute.js` — 增加完整播放、首步前进、回退和 XCross 槽位切换的行为回归。
- 修改：`src/vue/BleCrossTrainer/index.ts` — 保存求解核心状态快照，恢复公式起点，并调整播放/单步入口。
- 修改：`dist/index.html` — 生产构建更新入口引用。
- 删除：`dist/index.c35ddebf349369086c48.js` — 当前入口产物，由 webpack 在生成新内容哈希文件时清理。
- 创建：webpack 构建日志列出的新 `dist/index.*.js` — 文件名由源码内容哈希确定，构建前无法静态命名。
- 保持：`dist/cube_cross_table.bin` — webpack 构建后用既有脚本重新生成搜索表。
- 更新：`/home/andnnl/.trae-cn/memory/projects/-dd-workspace-trae-cuber--p2-032890de98c0df235e2d/project_memory.md` — 记录新的播放复位语义、测试和提交。

### 任务 1：用浏览器回归固定预览复位行为

**文件：**
- 修改：`scripts/verify-blecross-recompute.js:1-217`

- [ ] **步骤 1：在既有求解快照回归之后加入测试辅助函数**

在首次 `formulaFrame` 校验之后，先显式切回 Cross、基于当前核心状态发起一次 mock 求解并等待 `bestReady`，确保后续读取的 `bestSolution` 与快照属于 Cross：

```js
  await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.trainMode = "cross";
    vm.requestBest(vm.mapStateForJudge(vm.world.cube.serialize()), vm.effectiveViewOps());
  });
  await page.waitForFunction(() => window.__bleCross.bestReady && window.__bleCross.bestSolution);
```

然后加入浏览器侧状态计算和等待辅助。Cross 公式使用 mock 求解器返回的 `U R F D L B`，避免依赖真实 WASM 搜索：

```js
  const waitForPreviewEnd = () =>
    page.waitForFunction(() => !window.__bleCross.playingBest, null, { timeout: 10000 });

  const previewExpected = (formula, count) =>
    page.evaluate(({ formula, count }) => {
      const vm = window.__bleCross;
      const shown = vm.bestMovesOf(formula).slice(0, count).join(" ");
      vm.rebasing = true;
      vm.syncScene(vm.bestBaseState);
      for (const op of vm.bestViewOps) {
        for (const group of vm.world.cube.table.groups[op.axis]) {
          group.twist(op.times * (Math.PI / 2), true);
        }
      }
      if (shown) {
        vm.world.cube.twister.push(shown);
        vm.world.cube.twister.finish();
      }
      const state = vm.world.cube.serialize();
      vm.rebasing = false;
      return state;
    }, { formula, count });
```

- [ ] **步骤 2：加入 Cross 完整播放总是从快照开头开始的失败测试**

保存公式及期望终态和训练字段，主动用 `R2 F` 污染画面并伪造非零游标，再调用 `playBest`：

```js
  const crossFormula = await page.evaluate(() => window.__bleCross.bestSolution);
  const crossCount = await page.evaluate(f => window.__bleCross.bestMovesOf(f).length, crossFormula);
  const crossExpected = await previewExpected(crossFormula, crossCount);
  const trainingBefore = await page.evaluate(() => {
    const vm = window.__bleCross;
    return { moves: vm.moveCount, predicted: vm.predicted, phase: vm.phase };
  });
  await page.evaluate(formula => {
    const vm = window.__bleCross;
    vm.syncScene(vm.bestBaseState);
    vm.world.cube.twister.setup("R2 F");
    vm.bestStepPos = { [formula]: 2 };
    vm.playBest(formula);
  }, crossFormula);
  await waitForPreviewEnd();
  const crossReplay = await page.evaluate(formula => {
    const vm = window.__bleCross;
    return {
      state: vm.world.cube.serialize(),
      pos: vm.bestStepAt(formula),
      moves: vm.moveCount,
      predicted: vm.predicted,
      phase: vm.phase,
    };
  }, crossFormula);
  if (crossReplay.state !== crossExpected || crossReplay.pos !== crossCount) {
    throw new Error(`播放没有从求解快照第 1 步重播: ${JSON.stringify(crossReplay)}`);
  }
  if (
    crossReplay.moves !== trainingBefore.moves ||
    crossReplay.predicted !== trainingBefore.predicted ||
    crossReplay.phase !== trainingBefore.phase
  ) {
    throw new Error(`公式预览改动了训练状态: ${JSON.stringify({ trainingBefore, crossReplay })}`);
  }
```

- [ ] **步骤 3：加入第一个 `⏭` 先复位、`⏮` 回到快照的失败测试**

```js
  const firstExpected = await previewExpected(crossFormula, 1);
  const baseExpected = await previewExpected(crossFormula, 0);
  await page.evaluate(formula => {
    const vm = window.__bleCross;
    vm.syncScene(vm.bestBaseState);
    vm.world.cube.twister.setup("L2 B");
    vm.bestStepPos = {};
    vm.stepBest(formula, 1);
  }, crossFormula);
  await waitForPreviewEnd();
  const firstState = await page.evaluate(() => window.__bleCross.world.cube.serialize());
  if (firstState !== firstExpected) {
    throw new Error("首个向前单步没有先恢复求解快照");
  }
  await page.evaluate(formula => window.__bleCross.stepBest(formula, -1), crossFormula);
  await waitForPreviewEnd();
  const back = await page.evaluate(formula => ({
    state: window.__bleCross.world.cube.serialize(),
    pos: window.__bleCross.bestStepAt(formula),
  }), crossFormula);
  if (back.state !== baseExpected || back.pos !== 0) {
    throw new Error(`回退首步后没有回到求解快照: ${JSON.stringify(back)}`);
  }
```

- [ ] **步骤 4：加入 XCross 槽位切换时不叠加前一公式状态的失败测试**

把脚本开头的 mock `solveXCross` 改为按槽位返回不同合法公式：

```js
      solveXCross: async (state, slot) => {
        vm.__solveCalls.push({ mode: "xcross", state, slot });
        return [{ FL: "U R", FR: "F D", BL: "L B", BR: "U2 R2" }[slot]];
      },
```

进入 XCross 后完整播放 `bestX[0].formula`，再播放 `bestX[1].formula`。用 `previewExpected(second, bestMovesOf(second).length)` 计算第二公式的独立终态，断言第二次播放结束后的 `serialize()` 与之相等；如果实现仍续用第一公式的画面，该断言必须失败。

- [ ] **步骤 5：运行回归并确认按预期失败**

运行：

```bash
npm run verify:blecross
```

预期：FAIL。最早失败应明确显示 `bestBaseState` 尚不存在，或 `playBest` 从伪造游标/污染画面续播；不能是语法错误、页面加载错误或测试服务器不可用。

### 任务 2：保存求解快照并在播放入口恢复

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:230-255`
- 修改：`src/vue/BleCrossTrainer/index.ts:799-848`
- 修改：`src/vue/BleCrossTrainer/index.ts:1423-1517`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：在视角快照旁增加核心状态快照**

```ts
  // 当前最优解结果绑定的核心状态快照；必须与 bestViewOps 来自同一次异步请求。
  // 公式预览只使用这两个字段重建起点，不能读取随后变化的实时 3D/实体状态。
  private bestBaseState = "";
```

在 `requestBest` 清理旧结果时同步清空：

```ts
    this.bestViewOps = [];
    this.bestBaseState = "";
```

- [ ] **步骤 2：只在当前异步请求成功发布时绑定状态和视角**

将两个异步求解方法改为接收 `state` 与 `viewOps` 的请求快照。Cross 成功分支：

```ts
        this.bestBaseState = state;
        this.bestViewOps = viewOps.map((op) => ({ ...op }));
        this.bestSolution = best
          ? best.split(/\s+/).map((m) => (this.z2On ? z2Move(m) : m)).join(" ")
          : "";
```

XCross 在 `reqId !== this.bestReqId` 守卫之后、发布 `bestX` 前执行：

```ts
      this.bestBaseState = state;
      this.bestViewOps = viewOps.map((op) => ({ ...op }));
      this.bestX = results;
```

过期请求和异常分支不写入这两个字段。

- [ ] **步骤 3：实现纯视觉公式起点恢复方法**

在 `stepBest` 与 `startBestPreview` 之间加入：

```ts
  /** 恢复当前最优解绑定的 3D 起点，不改变训练阶段、计时、步数或蓝牙权威状态。 */
  private resetBestPreview(formula: string, clearAll: boolean): boolean {
    if (!formula || !formula.trim() || !/^[URFDLB]{54}$/.test(this.bestBaseState)) {
      return false;
    }
    this.rebasing = true;
    try {
      this.syncScene(this.bestBaseState);
      for (const op of this.bestViewOps) {
        for (const group of this.world.cube.table.groups[op.axis]) {
          group.twist(op.times * (Math.PI / 2), true);
        }
      }
      this.bestStepPos = clearAll ? {} : { ...this.bestStepPos, [formula]: 0 };
      return true;
    } finally {
      this.rebasing = false;
    }
  }
```

注意：调用时 `playingBest` 必须为 `false`，所以 `syncScene` 不会走中断播放分支。即时视角重放必须与已有公式帧回归中的 `group.twist(..., true)` 完全一致。

- [ ] **步骤 4：让 `▶` 每次从头恢复并播放完整公式**

替换续播逻辑：

```ts
  playBest(formula: string): void {
    if (this.playingBest || !formula || !formula.trim()) {
      return;
    }
    const moves = this.bestMovesOf(formula);
    if (moves.length === 0 || !this.resetBestPreview(formula, true)) {
      return;
    }
    this.startBestPreview(formula, moves, 1);
  }
```

同步更新注释：`▶` 不再从游标续播，而是每次从求解快照第 1 步播放。

- [ ] **步骤 5：让第一个向前单步先恢复快照**

在 `stepBest` 取到 `pos` 后、选择第一条 token 前加入：

```ts
    if (dir > 0 && pos === 0 && !this.resetBestPreview(formula, false)) {
      return;
    }
```

反向单步不调用恢复方法。更新注释，明确首个 `⏭` 的复位语义。

- [ ] **步骤 6：运行专项回归确认绿灯**

运行：

```bash
npm run verify:blecross
```

预期：PASS；新增四类场景和既有模式切换、y/y′/z2、公式同帧、多轮蓝牙重置全部通过。

- [ ] **步骤 7：运行 TypeScript/协议回归**

运行：

```bash
npm run test:ble
```

预期：`结果: 21 通过, 0 失败`。

- [ ] **步骤 8：提交源码与回归测试**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "fix(训练器): 播放公式前恢复求解快照"
```

### 任务 3：生产构建、资产恢复与最终验证

**文件：**
- 修改：`dist/index.html`
- 创建：webpack 构建日志列出的新 `dist/index.*.js`
- 删除：`dist/index.c35ddebf349369086c48.js`
- 恢复：`dist/cube_cross_table.bin`
- 更新：`/home/andnnl/.trae-cn/memory/projects/-dd-workspace-trae-cuber--p2-032890de98c0df235e2d/project_memory.md`

- [ ] **步骤 1：执行生产构建**

```bash
npm run build
```

预期：webpack 退出码 0，并生成新的内容哈希入口文件。构建会清理 `dist/cube_cross_table.bin`，下一步必须恢复。

- [ ] **步骤 2：重新生成 Cross 搜索表并检查大小**

```bash
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：文件存在，大小为 `2661132 bytes`。

- [ ] **步骤 3：重新执行完整专项验证**

```bash
npm run test:ble
npm run verify:blecross
```

预期：协议测试 21/21，浏览器回归退出码 0。

- [ ] **步骤 4：检查构建差异不包含意外文件**

```bash
git status --short
git diff --check
git diff --stat
```

预期：只有预期的 `dist/index.html`、入口哈希文件变更以及未跟踪的用户目录 `.trae/`；搜索表若字节未变则不应产生 diff。

- [ ] **步骤 5：提交生产构建产物**

```bash
git add dist/index.html dist/index.*.js dist/cube_cross_table.bin
git commit -m "build(前端): 更新公式预览复位产物"
```

提交前使用 `git diff --cached --stat` 确认没有加入 `.trae/`。

- [ ] **步骤 6：更新项目记忆文件**

在项目记忆文件的 BLE Cross 修复区补充：

```markdown
- 公式预览绑定 `bestBaseState + bestViewOps` 同请求快照。
- 每次 `▶` 先恢复快照并从第 1 步播放；游标为 0 的首个 `⏭` 也先恢复；`⏮` 保持逐步回退。
- 预览复位不调用 `resetRound()`，不改变训练计时、步数、阶段或蓝牙权威状态。
```

同时记录新的提交号和最终验证结果。该文件位于 Git 仓库外，不加入提交。

- [ ] **步骤 7：最终状态核对**

```bash
git status --short
git log -6 --oneline
```

预期：工作区仅剩用户原有未跟踪目录 `.trae/`，最新历史依次包含设计、计划、源码修复和构建产物提交。
