# BLE Cross 训练记录难度字段实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在训练记录中保存每轮开始时锁定的难度，并在记录列表中显示“随机”“2步～7步”或旧记录占位符“—”。

**架构：** `BleCrossTrainer` 在真正进入新一轮时保存难度快照，`recordTrain` 只读取该快照，避免用户中途切换下拉框污染当前记录。记录类型保持字段可选，格式化方法集中处理新旧数据，模板只负责渲染短文本。

**技术栈：** TypeScript 4.3、Vue 2 类组件、Vuetify、Playwright CLI、webpack 5

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加难度快照、旧记录兼容和列表渲染的浏览器回归测试。
- 修改 `src/vue/BleCrossTrainer/index.ts`：扩展记录类型、维护本轮难度快照、格式化列表文本。
- 修改 `src/vue/BleCrossTrainer/index.html`：增加“难度”表头和数据单元格。
- 修改 `src/vue/BleCrossTrainer/theme.ts`：确保难度单元格在手机端不换行。
- 更新 `dist/` 中 webpack 构建产物：交付可直接部署的页面资源。

### 任务 1：测试并实现难度快照

**文件：**
- 测试：`scripts/verify-blecross-recompute.js:488-530`
- 修改：`src/vue/BleCrossTrainer/index.ts:49-57,259-263,1988-1999,2666-2682`

- [ ] **步骤 1：编写失败的浏览器测试**

在现有训练记录测试中先启动一轮固定难度，再切换下拉值后结算，并验证记录仍使用开轮值：

```js
vm.records = [];
vm.saveRecords = () => {};
vm.roundDifficulty = 5;
vm.difficulty = 2;
vm.recordTrain(true);
const lockedDifficulty = vm.records[0].difficulty;

if (lockedDifficulty !== 5) {
  throw new Error(`训练记录未锁定开轮难度: ${lockedDifficulty}`);
}
```

同时在已有 `newScramble()` 固定难度分支测试中断言 `vm.roundDifficulty === 5`，证明快照由正式开轮入口写入，而不是由测试手工制造。

- [ ] **步骤 2：运行测试并确认红灯**

运行：

```bash
npm run verify:blecross
```

预期：FAIL，提示本轮难度字段缺失或 `训练记录未锁定开轮难度`。

- [ ] **步骤 3：实现最小难度快照**

扩展记录结构并添加本轮字段：

```ts
type TrainRecord = {
  t: number;
  mode: "cross" | "xcross";
  difficulty?: CrossDifficulty;
  ok: boolean;
  obs: number | null;
  solve: number | null;
  best: number;
  steps: number;
};

private roundDifficulty: CrossDifficulty | null = null;
```

在 `startScramble()` 中先结算被放弃的旧轮，再锁定新轮设置：

```ts
if (this.phase === "solving") {
  this.failCount++;
  this.recordTrain(false);
  this.running = false;
}
this.roundDifficulty = this.difficulty;
```

写记录时只读取快照；没有快照的兼容路径不伪造值：

```ts
const rec: TrainRecord = {
  t: Date.now(),
  mode: this.trainMode,
  difficulty: this.roundDifficulty === null ? undefined : this.roundDifficulty,
  ok,
  obs: observed ? (this.solveStart - this.observeStart) / 1000 : null,
  solve: this.solveStart ? (Date.now() - this.solveStart) / 1000 : null,
  best: this.bestReady && this.bestSolution ? this.bestMovesOf(this.bestSolution).length : -1,
  steps: this.moveCount,
};
```

- [ ] **步骤 4：运行测试并确认绿灯**

运行：`npm run verify:blecross`

预期：PASS，固定难度开轮值与记录值均为 `5`。

- [ ] **步骤 5：提交难度快照**

```bash
git add scripts/verify-blecross-recompute.js src/vue/BleCrossTrainer/index.ts
git commit -m "feat(蓝牙训练): 记录每轮训练难度"
```

### 任务 2：测试并实现记录列表难度列

**文件：**
- 测试：`scripts/verify-blecross-recompute.js:488-540`
- 修改：`src/vue/BleCrossTrainer/index.ts:2708-2715`
- 修改：`src/vue/BleCrossTrainer/index.html:477-492`
- 修改：`src/vue/BleCrossTrainer/theme.ts:249-274`

- [ ] **步骤 1：编写失败的格式化与 DOM 测试**

加入格式化断言，并打开记录弹窗检查表头和三个单元格：

```js
const labels = [vm.fmtRecDifficulty("random"), vm.fmtRecDifficulty(5), vm.fmtRecDifficulty(undefined)];
vm.records = [
  { t: 3, mode: "cross", difficulty: "random", ok: true, obs: 1, solve: 2, best: 3, steps: 4 },
  { t: 2, mode: "cross", difficulty: 5, ok: true, obs: 1, solve: 2, best: 3, steps: 4 },
  { t: 1, mode: "cross", ok: true, obs: 1, solve: 2, best: 3, steps: 4 },
];
vm.recDialog = true;
await vm.$nextTick();
const header = Array.from(document.querySelectorAll(".rec-table th")).map(x => x.textContent.trim());
const cells = Array.from(document.querySelectorAll("[data-rec-difficulty]")).map(x => ({
  text: x.textContent.trim(),
  nowrap: getComputedStyle(x).whiteSpace,
}));
```

预期 `labels` 和单元格文本均为 `["随机", "5步", "—"]`，表头包含“难度”，每个单元格的 `whiteSpace` 为 `nowrap`。

- [ ] **步骤 2：运行测试并确认红灯**

运行：`npm run verify:blecross`

预期：FAIL，提示 `fmtRecDifficulty` 不存在或列表缺少难度列。

- [ ] **步骤 3：实现格式化方法与列表列**

新增严格格式化方法：

```ts
fmtRecDifficulty(value: unknown): string {
  if (value === "random") {
    return "随机";
  }
  return typeof value === "number" && value >= 2 && value <= 7 && Number.isInteger(value)
    ? value + "步"
    : "—";
}
```

在“模式”之后加入表头和单元格：

```html
<th>难度</th>
<td data-rec-difficulty class="rec-difficulty">{{ fmtRecDifficulty(r.difficulty) }}</td>
```

为新列增加不换行规则：

```css
.rec-dialog .rec-table .rec-difficulty {
  white-space: nowrap;
}
```

- [ ] **步骤 4：运行测试并确认绿灯**

运行：`npm run verify:blecross`

预期：PASS，三种难度显示和手机端不换行均通过。

- [ ] **步骤 5：提交列表展示**

```bash
git add scripts/verify-blecross-recompute.js src/vue/BleCrossTrainer/index.ts src/vue/BleCrossTrainer/index.html src/vue/BleCrossTrainer/theme.ts
git commit -m "feat(蓝牙训练): 在记录列表显示难度"
```

### 任务 3：完整验证、构建并推送

**文件：**
- 更新：`dist/`

- [ ] **步骤 1：运行 BLE 单元测试**

运行：`npm run test:ble`

预期：全部测试通过，无 TypeScript 编译错误。

- [ ] **步骤 2：运行浏览器综合验证**

运行：`npm run verify:blecross`

预期：PASS，包含难度快照、旧记录兼容和列表不换行验证。

- [ ] **步骤 3：生产构建**

运行：`npm run build`

预期：webpack 以退出码 `0` 完成，并更新受影响的 `dist` 构建文件。

- [ ] **步骤 4：提交构建产物**

仅暂存本次构建修改的已跟踪文件，不暂存用户已有的 `README.md`、`.superpowers/`、`.trae/` 和未跟踪的 `dist/cube_cross_table.bin`：

```bash
git add -u dist
git commit -m "build(蓝牙训练): 更新记录难度字段产物"
```

- [ ] **步骤 5：核对并推送两个远端**

```bash
git status --short --branch
git push origin master
git -c http.proxy=http://127.0.0.1:7890 push github master
git ls-remote origin refs/heads/master
git -c http.proxy=http://127.0.0.1:7890 ls-remote github refs/heads/master
```

预期：Gitee `origin/master`、GitHub `github/master` 和本地 `HEAD` 哈希一致；用户原有未提交文件保持不变。
