# BLE Cross 蓝牙实时步骤固定视角实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 蓝牙步骤在 MOVE 到达时固定屏幕记号，后续 z2、y、y′ 不改写历史，同时让步骤文字与 3D 镜像共用同一转换结果。

**架构：** 保留 `userMoves` 作为物理帧权威序列，新增带事件时显示记号和规范视角签名的 `DisplayMoveRecord` 序列。单步转换集中到 `displayMoveWithOps()`，公式转换逐项复用；蓝牙显示历史按连续同视角片段分别调用 `simplifyMoves()`，跨视角边界不合并。

**技术栈：** TypeScript、Vue 2 class component、Three.js 魔方引擎、Playwright CLI、webpack 5

---

## 文件结构

- 修改：`scripts/verify-blecross-recompute.js` — 增加蓝牙历史不随视角重写、分段化简和动画同源回归。
- 修改：`src/vue/BleCrossTrainer/index.ts` — 统一记号转换、记录事件时显示记号、分段化简并管理生命周期。
- 修改：`dist/index.html` — 更新生产入口哈希。
- 删除：`dist/index.2091c8fb8dbca6c12782.js` — 当前生产入口产物。
- 创建：webpack 构建日志列出的新 `dist/index.*.js` — 文件名由内容哈希产生。
- 更新：`/home/andnnl/.trae-cn/memory/projects/-dd-workspace-trae-cuber--p2-032890de98c0df235e2d/project_memory.md` — 记录固定视角语义和验证结果。

### 任务 1：用浏览器回归固定蓝牙步骤的事件时视角

**文件：**
- 修改：`scripts/verify-blecross-recompute.js:1-355`

- [ ] **步骤 1：加入标准视角到 z2 的历史稳定性测试**

在页面首次加载并取得 `vm` 后建立一个隔离的蓝牙 solving 场景，拦截镜像记号避免动画影响断言：

```js
  const liveFrame = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.isManual = false;
    vm.phase = "solving";
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.solveBaseState = "";
    vm.needBreak = true;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.__mirrored = [];
    vm.mirrorPush = move => vm.__mirrored.push(move);

    vm.onMoveEvent("D");
    const beforeZ2 = vm.liveStepsText;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    const afterZ2 = vm.liveStepsText;
    vm.onMoveEvent("D");
    return {
      beforeZ2,
      afterZ2,
      afterSecond: vm.liveStepsText,
      mirrored: vm.__mirrored.slice(),
    };
  });
  if (
    liveFrame.beforeZ2 !== "D" ||
    liveFrame.afterZ2 !== "D" ||
    liveFrame.afterSecond !== "D U" ||
    JSON.stringify(liveFrame.mirrored) !== JSON.stringify(["D", "U"])
  ) {
    throw new Error(`蓝牙步骤没有固定事件时视角: ${JSON.stringify(liveFrame)}`);
  }
```

- [ ] **步骤 2：加入同视角化简和跨视角不合并测试**

分别构造同视角 `D,D` 和跨 z2 的 `D,D`：

```js
  const segmented = await page.evaluate(() => {
    const vm = window.__bleCross;
    const reset = () => {
      vm.userMoves = [];
      vm.userDisplayMoves = [];
      vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
      vm.phase = "solving";
      vm.needBreak = true;
      vm.observedOps = [];
      vm.z2Marks = [];
      vm.z2On = false;
    };
    reset();
    vm.onMoveEvent("D");
    vm.onMoveEvent("D");
    const sameView = vm.liveStepsText;
    reset();
    vm.onMoveEvent("D");
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    vm.onMoveEvent("D");
    return { sameView, splitView: vm.liveStepsText };
  });
  if (segmented.sameView !== "D2" || segmented.splitView !== "D U") {
    throw new Error(`蓝牙显示步骤分段化简错误: ${JSON.stringify(segmented)}`);
  }
```

- [ ] **步骤 3：加入 y/y′ 后历史稳定及完成态稳定测试**

在标准视角记录 `R`，执行 y 后记录一个新 MOVE，并保存当时 `displayMove()` 期望；再执行 y′，断言旧文本不变。将 `userSolution` 设为物理化简串、phase 设为 success，断言 `userSolutionText` 等于最后一次实时文本；再次切 z2 后仍不变化：

```js
  const mixedView = await page.evaluate(() => {
    const vm = window.__bleCross;
    vm.userMoves = [];
    vm.userDisplayMoves = [];
    vm.predicted = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    vm.phase = "solving";
    vm.needBreak = true;
    vm.observedOps = [];
    vm.z2Marks = [];
    vm.z2On = false;
    vm.onMoveEvent("R");
    vm.rotateWholeY(1);
    vm.world.cube.twister.finish();
    const secondExpected = vm.displayMove("F");
    vm.onMoveEvent("F");
    const live = vm.liveStepsText;
    vm.rotateWholeY(-1);
    vm.world.cube.twister.finish();
    const afterYBack = vm.liveStepsText;
    vm.userSolution = vm.userMoves.join(" ");
    vm.phase = "success";
    const success = vm.userSolutionText;
    vm.toggleZ2();
    vm.world.cube.twister.finish();
    return {
      secondExpected,
      live,
      afterYBack,
      success,
      afterFinalZ2: vm.userSolutionText,
    };
  });
  const expectedMixed = `R ${mixedView.secondExpected}`;
  if (
    mixedView.live !== expectedMixed ||
    mixedView.afterYBack !== expectedMixed ||
    mixedView.success !== expectedMixed ||
    mixedView.afterFinalZ2 !== expectedMixed
  ) {
    throw new Error(`y/y′ 或完成态重写了蓝牙历史: ${JSON.stringify(mixedView)}`);
  }
```

- [ ] **步骤 4：运行测试确认红灯**

```bash
npm run verify:blecross
```

预期：FAIL，旧实现至少在“按 z2 后历史 D 被改写为 U”处失败；不能是页面加载、语法或测试夹具错误。

### 任务 2：统一转换并保存事件时显示记录

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:35-55`
- 修改：`src/vue/BleCrossTrainer/index.ts:220-235`
- 修改：`src/vue/BleCrossTrainer/index.ts:625-735`
- 修改：`src/vue/BleCrossTrainer/index.ts:1121-1175`
- 修改：`src/vue/BleCrossTrainer/index.ts:1408-1420`
- 修改：`src/vue/BleCrossTrainer/index.ts:1747-1880`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：定义显示记录并增加本轮字段**

```ts
type DisplayMoveRecord = {
  physical: string;
  display: string;
  viewSig: string;
};
```

在 `userMoves` 旁增加：

```ts
  /** 蓝牙步骤的事件时屏幕记号；视角切换后历史不得重解释。 */
  private userDisplayMoves: DisplayMoveRecord[] = [];
```

- [ ] **步骤 2：建立唯一的单步转换实现**

```ts
  private displayMoveWithOps(move: string, ops: BaseOp[]): string {
    const map = baseOpsFaceCharMap(ops);
    return (map[move.charAt(0)] || move.charAt(0)) + move.slice(1);
  }

  private displayMove(move: string): string {
    return this.displayMoveWithOps(move, this.effectiveViewOps());
  }
```

`displayFormulaWithOps()` 删除独立的 `map` 逻辑，改为：

```ts
  private displayFormulaWithOps(formula: string, ops: BaseOp[]): string {
    return formula
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((move) => this.displayMoveWithOps(move, ops))
      .join(" ");
  }
```

- [ ] **步骤 3：实现按视角片段化简的显示公式**

```ts
  private fixedUserDisplayFormula(): string {
    const result: string[] = [];
    let segment: string[] = [];
    let viewSig = "";
    const flush = () => {
      if (segment.length > 0) {
        result.push(...simplifyMoves(segment));
        segment = [];
      }
    };
    for (const record of this.userDisplayMoves) {
      if (segment.length > 0 && record.viewSig !== viewSig) {
        flush();
      }
      viewSig = record.viewSig;
      segment.push(record.display);
    }
    flush();
    return result.join(" ");
  }
```

蓝牙分支的 `liveStepsText` 和 `userSolutionText` 都返回该方法；手动分支保持原样。

- [ ] **步骤 4：让 MOVE 记录和 3D 镜像共用一次转换结果**

在校准分支之后、普通 MOVE 数据流之前捕获规范视角：

```ts
    const viewOps = this.effectiveViewOps().map((op) => ({ ...op }));
    const displayMove = this.displayMoveWithOps(move, viewOps);
    const viewSig = JSON.stringify(viewOps);
```

有效 MOVE 且 phase 为 solving 时：

```ts
        this.userMoves.push(move);
        this.userDisplayMoves.push({ physical: move, display: displayMove, viewSig });
```

两个普通镜像分支都由 `this.mirrorPush(this.displayMove(move))` 改为 `this.mirrorPush(displayMove)`，保证文字与动画同源。

- [ ] **步骤 5：同步清空显示记录**

在以下三个现有 `this.userMoves = []` 后都加入：

```ts
    this.userDisplayMoves = [];
```

位置分别是 `startSolving()`、`resetRound()` 和 `fallbackToTouch()`。它们覆盖新轮、重置和断连回落；新打乱进入求解时通过 `startSolving()` 清空。

- [ ] **步骤 6：运行浏览器回归确认绿灯**

```bash
npm run verify:blecross
```

预期：新增固定视角/分段化简/动画同源测试及既有所有场景通过。

- [ ] **步骤 7：运行 TypeScript 与协议测试**

```bash
npm run test:ble
```

预期：`结果: 21 通过, 0 失败`。

- [ ] **步骤 8：提交源码和测试**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "fix(蓝牙训练): 固定每步操作的事件时视角"
```

### 任务 3：生产构建与最终验证

**文件：**
- 修改：`dist/index.html`
- 删除：`dist/index.2091c8fb8dbca6c12782.js`
- 创建：webpack 构建日志列出的新 `dist/index.*.js`
- 恢复：`dist/cube_cross_table.bin`
- 更新：`/home/andnnl/.trae-cn/memory/projects/-dd-workspace-trae-cuber--p2-032890de98c0df235e2d/project_memory.md`

- [ ] **步骤 1：执行生产构建**

```bash
npm run build
```

预期：webpack 退出码 0，生成新内容哈希入口文件。

- [ ] **步骤 2：恢复搜索表并检查大小**

```bash
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：`dist/cube_cross_table.bin 2661132 bytes`。

- [ ] **步骤 3：提交生产产物**

只暂存 webpack 日志中出现的新旧入口和 `dist/index.html`，用 `git diff --cached --stat` 确认不包含 `.trae/`，然后提交：

```bash
git commit -m "build(前端): 更新蓝牙步骤显示产物"
```

- [ ] **步骤 4：在最终提交状态重新验证**

```bash
npm run test:ble
npm run verify:blecross
git diff --check
git status --short
```

预期：协议测试 21/21、浏览器回归退出码 0、工作区仅剩用户原有 `.trae/`。

- [ ] **步骤 5：更新项目记忆**

记录统一函数、事件时显示记录、分段化简规则、源码/构建提交号和最终验证结果。记忆文件位于仓库外，不加入 Git。
