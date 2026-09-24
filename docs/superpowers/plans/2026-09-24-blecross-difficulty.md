# BLE Cross 难度选择与设置记忆实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 BLE Cross 增加随机及 2～7 步精确十字难度，记住卡片设置与 z2 姿态，同时交付精简最优解标签和完整使用说明。

**架构：** 在 `src/ble` 新增无 UI 依赖的难度生成模块，通过注入随机打乱器和十字求解器完成“随机基准、十字复原、精确扰动、再次校验”。Vue 组件负责持久化、异步请求编号、状态提示和最终调用 `startScramble`，模板与主题只负责紧凑布局和帮助文字。

**技术栈：** TypeScript、Vue 2、Vuetify、Three.js、WASM 十字求解器、Node `assert`、Playwright CLI、webpack 5

---

## 文件结构

- 创建：`src/ble/cross-difficulty.ts`——难度类型、存储值解析、随机扰动和精确难度公式生成。
- 修改：`scripts/test-ble.js`——纯生成模块的确定性单元测试。
- 修改：`src/vue/BleCrossTrainer/index.ts`——难度状态、异步生成、请求失效、设置恢复和 z2 持久化。
- 修改：`src/vue/BleCrossTrainer/index.html`——难度下拉框、精简最优解标签和使用说明。
- 修改：`src/vue/BleCrossTrainer/theme.ts`——手机端设置行与难度下拉框尺寸。
- 修改：`scripts/verify-blecross-recompute.js`——真实求解器、持久化、帮助文字和 360 px 布局回归。
- 修改：`dist/index.html`、`dist/index.<hash>.js`——生产构建产物。
- 修改：`docs/superpowers/plans/2026-09-24-blecross-difficulty.md`——逐任务记录命令、结果和提交哈希。

### 任务 1：实现可单测的精确难度生成器

**文件：**

- 创建：`src/ble/cross-difficulty.ts`
- 修改：`scripts/test-ble.js`
- 测试：`scripts/test-ble.js`

- [ ] **步骤 1：先添加难度解析和生成器失败测试**

在 `scripts/test-ble.js` 的模块加载区加入：

```javascript
const crossDifficulty = req("cross-difficulty.js");
```

在 `main()` 的 move-diff 测试后加入：

```javascript
console.log("== cross-difficulty ==");

await test("难度存储值仅接受 random 与 2～7", () => {
  assert.strictEqual(crossDifficulty.parseCrossDifficulty(null), "random");
  assert.strictEqual(crossDifficulty.parseCrossDifficulty("random"), "random");
  for (let n = 2; n <= 7; n++) {
    assert.strictEqual(crossDifficulty.parseCrossDifficulty(String(n)), n);
  }
  for (const bad of ["", "1", "8", "5.0", "abc"]) {
    assert.strictEqual(crossDifficulty.parseCrossDifficulty(bad), "random");
  }
});

await test("随机扰动严格生成指定 HTM 步数且不连续同轴", () => {
  const values = [0.01, 0.02, 0.45, 0.80, 0.91, 0.20, 0.55, 0.34, 0.73, 0.67];
  let i = 0;
  const moves = crossDifficulty.randomCrossPerturbation(7, () => values[i++ % values.length]);
  assert.strictEqual(moves.length, 7);
  const axis = face => ({ U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 })[face[0]];
  for (let j = 1; j < moves.length; j++) {
    assert.notStrictEqual(axis(moves[j - 1]), axis(moves[j]));
  }
});

await test("精确难度生成会建立已解十字基准并只接受匹配步数", async () => {
  const solved = facelets.SOLVED_FACELETS;
  const seed = "R";
  const suffix = ["F", "R"];
  const seedState = moveDiff.applyFormulaFrom(solved, seed);
  const finalState = moveDiff.applyFormulaFrom(solved, `${seed} R' ${suffix.join(" ")}`);
  const seen = [];
  const formula = await crossDifficulty.generateExactCrossScramble({
    baseState: solved,
    difficulty: 2,
    z2On: false,
    randomScramble: () => seed,
    perturbation: () => suffix,
    solveCross: async state => {
      seen.push(state);
      if (state === seedState) return ["R'"];
      if (state === finalState) return ["R' F'"];
      return ["error: unexpected state"];
    },
  });
  assert.strictEqual(formula, "R R' F R");
  assert.deepStrictEqual(seen, [seedState, finalState]);
});

await test("白底精确难度在训练帧求解并换回物理公式", async () => {
  const solved = facelets.SOLVED_FACELETS;
  const seed = "L";
  const suffix = ["F", "L"];
  const seedPhysical = moveDiff.applyFormulaFrom(solved, seed);
  const finalPhysical = moveDiff.applyFormulaFrom(solved, "L L' F L");
  const formula = await crossDifficulty.generateExactCrossScramble({
    baseState: solved,
    difficulty: 2,
    z2On: true,
    randomScramble: () => seed,
    perturbation: () => suffix,
    solveCross: async state => {
      if (state === moveDiff.toTrainFrame(seedPhysical)) return ["R'"];
      if (state === moveDiff.toTrainFrame(finalPhysical)) return ["R' F'"];
      return ["error: unexpected state"];
    },
  });
  assert.strictEqual(formula, "L L' F L");
});

await test("精确难度生成支持取消且不会返回过期公式", async () => {
  let current = true;
  const formula = await crossDifficulty.generateExactCrossScramble({
    baseState: facelets.SOLVED_FACELETS,
    difficulty: 2,
    z2On: false,
    randomScramble: () => "R",
    perturbation: () => ["F", "R"],
    solveCross: async () => {
      current = false;
      return ["R'"];
    },
    isCurrent: () => current,
  });
  assert.strictEqual(formula, null);
});

await test("求解器错误立即终止且不会返回公式", async () => {
  await assert.rejects(
    crossDifficulty.generateExactCrossScramble({
      baseState: facelets.SOLVED_FACELETS,
      difficulty: 5,
      z2On: false,
      randomScramble: () => "R U F",
      solveCross: async () => ["error: solver unavailable"],
    }),
    /solver unavailable/
  );
});

await test("重试耗尽后返回明确的难度生成错误", async () => {
  await assert.rejects(
    crossDifficulty.generateExactCrossScramble({
      baseState: facelets.SOLVED_FACELETS,
      difficulty: 7,
      z2On: false,
      randomScramble: () => "R",
      perturbation: () => ["F", "R", "U", "L", "B", "D", "F"],
      solveCross: async state => state === moveDiff.applyFormula("R") ? ["R'"] : ["R U"],
    }),
    /无法生成 7 步难度/
  );
});
```

- [ ] **步骤 2：运行单测并确认红灯**

运行：

```bash
npm run test:ble
```

预期：TypeScript 编译或 Node 加载失败，明确指出 `cross-difficulty` 模块不存在；不是现有 BLE 测试失败。

- [ ] **步骤 3：实现最少的纯生成模块**

创建 `src/ble/cross-difficulty.ts`：

```typescript
import { isCrossDone } from "./facelets";
import { applyFormulaFrom, toTrainFrame, z2Move } from "./move-diff";

export type CrossDifficulty = "random" | 2 | 3 | 4 | 5 | 6 | 7;

export const CROSS_DIFFICULTIES: CrossDifficulty[] = ["random", 2, 3, 4, 5, 6, 7];

export function parseCrossDifficulty(value: string | null): CrossDifficulty {
  if (value === "random") return "random";
  return value && /^[2-7]$/.test(value) ? (Number(value) as CrossDifficulty) : "random";
}

export function countFormulaMoves(formula: string): number {
  const value = formula.trim();
  return value ? value.split(/\s+/).length : 0;
}

const AXIS_FACES = [["U", "D"], ["R", "L"], ["F", "B"]];
const SUFFIXES = ["", "'", "2"];

export function randomCrossPerturbation(steps: number, random: () => number = Math.random): string[] {
  const result: string[] = [];
  let lastAxis = -1;
  while (result.length < steps) {
    const rawAxis = Math.floor(random() * AXIS_FACES.length);
    const axis = rawAxis === lastAxis ? (rawAxis + 1) % AXIS_FACES.length : rawAxis;
    const faces = AXIS_FACES[axis];
    const face = faces[Math.floor(random() * faces.length) % faces.length];
    const suffix = SUFFIXES[Math.floor(random() * SUFFIXES.length) % SUFFIXES.length];
    result.push(face + suffix);
    lastAxis = axis;
  }
  return result;
}

type GenerateOptions = {
  baseState: string;
  difficulty: Exclude<CrossDifficulty, "random">;
  z2On: boolean;
  randomScramble: () => string;
  solveCross: (state: string) => Promise<string[]>;
  perturbation?: (steps: number) => string[];
  isCurrent?: () => boolean;
};

function joinFormula(...parts: string[]): string {
  return parts.map(x => x.trim()).filter(Boolean).join(" ");
}

function checkedSolution(solutions: string[]): string {
  if (!solutions || solutions.length === 0) throw new Error("十字求解器没有返回解法");
  const solution = ((solutions && solutions[0]) || "").trim();
  if (solution.indexOf("error") === 0) throw new Error(solution);
  return solution;
}

export async function generateExactCrossScramble(options: GenerateOptions): Promise<string | null> {
  const current = options.isCurrent || (() => true);
  const makePerturbation = options.perturbation || randomCrossPerturbation;
  const targetFrame = (state: string) => (options.z2On ? toTrainFrame(state) : state);
  const physicalFormula = (formula: string) =>
    options.z2On && formula
      ? formula.split(/\s+/).map(z2Move).join(" ")
      : formula;

  for (let baseTry = 0; baseTry < 3; baseTry++) {
    if (!current()) return null;
    const seed = options.randomScramble();
    const seedState = applyFormulaFrom(options.baseState, seed);
    const anchorSolution = checkedSolution(await options.solveCross(targetFrame(seedState)));
    if (!current()) return null;
    const anchor = joinFormula(seed, physicalFormula(anchorSolution));
    const anchorState = applyFormulaFrom(options.baseState, anchor);
    if (!isCrossDone(targetFrame(anchorState))) throw new Error("十字基准校验失败");

    for (let suffixTry = 0; suffixTry < 100; suffixTry++) {
      if (!current()) return null;
      const suffix = makePerturbation(options.difficulty).join(" ");
      const formula = joinFormula(anchor, suffix);
      const state = applyFormulaFrom(options.baseState, formula);
      const solution = checkedSolution(await options.solveCross(targetFrame(state)));
      if (!current()) return null;
      if (countFormulaMoves(solution) === options.difficulty) return formula;
    }
  }
  throw new Error(`无法生成 ${options.difficulty} 步难度，请重试`);
}
```

- [ ] **步骤 4：运行单测确认绿灯**

运行：

```bash
npm run test:ble
```

预期：原有 27 项加新增 7 项全部通过，退出码为 0。

- [ ] **步骤 5：提交任务 1**

```bash
git add src/ble/cross-difficulty.ts scripts/test-ble.js
git commit -m "feat(蓝牙训练): 添加精确十字难度生成器（任务 1/5）"
```

### 任务 2：补齐设置记忆并精简最优解标签

**文件：**

- 修改：`scripts/verify-blecross-recompute.js`
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 修改：`src/vue/BleCrossTrainer/index.html`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：先添加标签和持久化失败测试**

在 Playwright 脚本开头背景测试之后增加一次设置写入、刷新与读取，断言：

```javascript
const restoredSettings = await page.evaluate(async () => {
  const vm = window.__bleCross;
  vm.trainMode = "xcross"; vm.saveTrainMode();
  vm.difficulty = 5; vm.saveDifficulty();
  vm.visGhost = true; vm.saveVisGhost();
  vm.visHide = true; vm.saveVisHide();
  vm.visSlot = "BR"; vm.saveVisSlot();
  vm.autoNext = false; vm.saveAutoNext();
  vm.showBest = false; vm.saveShowBest();
  vm.recLimit = 50; vm.saveRecLimit();
  if (!vm.z2On) vm.toggleZ2();
  vm.world.cube.twister.finish();
  return true;
});
await page.reload();
await page.waitForFunction(() => window.__bleCross && window.__bleCross.world);
const settings = await page.evaluate(() => {
  const vm = window.__bleCross;
  return {
    trainMode: vm.trainMode, difficulty: vm.difficulty,
    visGhost: vm.visGhost, visHide: vm.visHide, visSlot: vm.visSlot,
    autoNext: vm.autoNext, showBest: vm.showBest, recLimit: vm.recLimit,
    z2On: vm.z2On, z2Marks: vm.z2Marks.slice(),
    target: vm.crossTargetText(), mappedU: vm.displayMove("U"),
    difficultySaved: localStorage.getItem("bleDifficulty"),
    z2Saved: localStorage.getItem("bleZ2On"),
  };
});
if (JSON.stringify(settings) !== JSON.stringify({
  trainMode: "xcross", difficulty: 5,
  visGhost: true, visHide: true, visSlot: "BR",
  autoNext: false, showBest: false, recLimit: 50,
  z2On: true, z2Marks: [0],
  target: "白色十字 (4 条白棱围住白色中心)", mappedU: "D",
  difficultySaved: "5", z2Saved: "1",
})) throw new Error(`设置恢复异常: ${JSON.stringify(settings)}`);
```

再读取模板文字并断言不存在 `最优解(`，同时存在表达式：

```javascript
const bestLabel = await page.evaluate(() => {
  const vm = window.__bleCross;
  vm.trainMode = "cross";
  vm.bestReady = true;
  vm.bestSolution = "R U F L D";
  return document.querySelector("[data-ble-best-label]").textContent.trim();
});
if (bestLabel !== "白5步") throw new Error(`最优解标签未精简: ${bestLabel}`);
```

- [ ] **步骤 2：运行页面验证确认红灯**

先确保开发服务器运行，再执行：

```bash
npm run verify:blecross
```

预期：FAIL，提示 `saveDifficulty` 或难度字段不存在；生产代码尚未修改。

- [ ] **步骤 3：实现难度与 z2 存储恢复**

在 `index.ts` 导入：

```typescript
import {
  CrossDifficulty,
  parseCrossDifficulty,
} from "../../ble/cross-difficulty";
```

新增状态和保存方法：

```typescript
difficulty: CrossDifficulty = "random";
private scrambleGenerationId = 0;
generatingDifficulty = false;

private cancelDifficultyGeneration(): void {
  this.scrambleGenerationId++;
  this.generatingDifficulty = false;
}

saveDifficulty(): void {
  window.localStorage.setItem("bleDifficulty", String(this.difficulty));
  this.cancelDifficultyGeneration();
}
```

在 `mounted()` 中恢复：

```typescript
this.difficulty = parseCrossDifficulty(window.localStorage.getItem("bleDifficulty"));
this.z2On = window.localStorage.getItem("bleZ2On") === "1";
this.z2Marks = this.z2On ? [0] : [];
```

在已有 `$nextTick` 初始化块的末尾，若 `z2On` 为真则调用 `applyZ2Flip(true)`，使 3D 姿态与状态一致。`toggleZ2()` 切换后写入：

```typescript
window.localStorage.setItem("bleZ2On", this.z2On ? "1" : "0");
this.cancelDifficultyGeneration();
```

修改 `startManual()`，删除强制 `z2On = false` 和切回白顶的分支，只重建：

```typescript
this.baseOps = [];
this.z2Marks = this.z2On ? [0] : [];
```

- [ ] **步骤 4：精简模板标签**

把 Cross 最优解标签替换为：

```html
<span
  data-ble-best-label
  style="color: #1565c0; white-space: nowrap; font-weight: bold;"
>{{ z2On ? '白' : '黄' }}{{ bestReady ? bestSteps + '步' : '' }}</span>
```

- [ ] **步骤 5：运行页面验证确认绿灯**

运行：

```bash
npm run verify:blecross
```

预期：新增设置恢复与 `白5步` 标签断言通过；脚本退出码为 0。测试结束前把设置恢复为测试脚本原先依赖的默认值，避免污染后续用例。

- [ ] **步骤 6：提交任务 2**

```bash
git add src/vue/BleCrossTrainer/index.ts src/vue/BleCrossTrainer/index.html scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 记忆难度与姿态设置（任务 2/5）"
```

### 任务 3：接入固定难度异步开轮

**文件：**

- 修改：`scripts/verify-blecross-recompute.js`
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：先添加真实求解器固定难度失败测试**

在 Playwright 脚本中进入手动模式，打开最优解，并对黄底与白底分别循环 2～7：

```javascript
const difficultyResults = await page.evaluate(async () => {
  const vm = window.__bleCross;
  vm.autoNext = false;
  vm.showBest = true;
  vm.trainMode = "cross";
  vm.enterManual();
  const rows = [];
  for (const z2On of [false, true]) {
    if (vm.z2On !== z2On) {
      vm.toggleZ2();
      vm.world.cube.twister.finish();
    }
    for (let difficulty = 2; difficulty <= 7; difficulty++) {
      vm.difficulty = difficulty;
      await vm.newScramble();
      vm.world.cube.twister.finish();
      const deadline = Date.now() + 10000;
      while (!vm.bestReady && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      rows.push({ z2On, difficulty, best: vm.bestSteps, phase: vm.phase });
    }
  }
  return rows;
});
if (difficultyResults.some(row => row.best !== row.difficulty || row.phase !== "observing")) {
  throw new Error(`固定难度不精确: ${JSON.stringify(difficultyResults)}`);
}
```

增加三项独立断言：

1. `difficulty = "random"` 时只调用一次现有 `twister.scrambler()`，不调用难度生成器。
2. 在 XCross 模式生成 5 步题目后切回 Cross 重求，`bestSteps === 5`。
3. 生成过程中改变请求编号后，旧 Promise 返回不得调用 `startScramble`。

再扩展现有自定义打乱测试：先设置 `difficulty = 5`，输入 `R U2 F'` 后仍断言 `scramble === "R U2 F'"`。模拟求解器错误和重试耗尽，断言打乱公式、场景与阶段保持原值，状态文字包含 `难度生成失败`。

- [ ] **步骤 2：运行页面验证确认红灯**

运行：

```bash
npm run verify:blecross
```

预期：FAIL，固定难度仍走普通随机打乱，至少一个 `best !== difficulty`。

- [ ] **步骤 3：实现异步生成与请求失效**

在 `index.ts` 扩展导入：

```typescript
import {
  CrossDifficulty,
  generateExactCrossScramble,
  parseCrossDifficulty,
} from "../../ble/cross-difficulty";
```

复用任务 2 已添加的 `scrambleGenerationId`、`generatingDifficulty` 和 `cancelDifficultyGeneration()`，把 `newScramble()` 改为返回 Promise，并保持随机路径不额外求解：

```typescript
async newScramble(): Promise<void> {
  const requestId = ++this.scrambleGenerationId;
  if (this.difficulty === "random") {
    this.startScramble(this.world.cube.twister.scrambler());
    return;
  }
  if (!this.isManual && this.status !== "connected") this.enterManual();
  if (!this.isManual && this.status !== "connected") return;

  const difficulty = this.difficulty;
  const z2On = this.z2On;
  const baseState = this.isManual ? SOLVED_FACELETS : this.predicted || SOLVED_FACELETS;
  const stillCurrent = () =>
    requestId === this.scrambleGenerationId &&
    this.difficulty === difficulty &&
    this.z2On === z2On &&
    (this.isManual || this.predicted === baseState);
  this.generatingDifficulty = true;
  this.statusText = `正在生成 ${difficulty} 步难度…`;
  try {
    const formula = await generateExactCrossScramble({
      baseState,
      difficulty,
      z2On,
      randomScramble: () => this.world.cube.twister.scrambler(),
      solveCross: state => this.solver.solveCross(state, 1, 8),
      isCurrent: stillCurrent,
    });
    if (formula && stillCurrent()) this.startScramble(formula);
  } catch (error) {
    if (stillCurrent()) {
      this.statusText = "难度生成失败: " + (error instanceof Error ? error.message : String(error));
    }
  } finally {
    if (requestId === this.scrambleGenerationId) this.generatingDifficulty = false;
  }
}
```

对调用点作如下调整：

- `applyCustomScramble()` 开头调用 `cancelDifficultyGeneration()`，再直接 `startScramble(formula)`。
- `nextRoundDirect()` 返回 `Promise<void>` 并 `await this.newScramble()`。
- 自动下轮定时器使用 `void this.nextRoundDirect().catch(...)`，异步错误仍清理倒计时并显示。
- `mockDemo()` 使用 `await this.newScramble()` 后再读取 `scrambleTarget`。
- `toggleZ2()`、`saveDifficulty()`、断开或销毁路径调用 `cancelDifficultyGeneration()`，使旧结果失效并立即清除生成中状态。

- [ ] **步骤 4：运行页面验证确认绿灯**

运行：

```bash
npm run verify:blecross
```

预期：黄底和白底的 2～7 步共 12 个样本全部精确；随机、XCross、取消和错误路径断言通过。

- [ ] **步骤 5：提交任务 3**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 接入固定步数打乱（任务 3/5）"
```

### 任务 4：完成难度控件、手机布局和使用说明

**文件：**

- 修改：`scripts/verify-blecross-recompute.js`
- 修改：`src/vue/BleCrossTrainer/index.html`
- 修改：`src/vue/BleCrossTrainer/theme.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：先添加 DOM、帮助文字和手机布局失败测试**

在页面验证脚本中断言：

```javascript
const difficultyUi = await page.evaluate(() => {
  const select = document.querySelector("[data-ble-difficulty]");
  const bg = document.querySelector(".ble-bg-trigger").getBoundingClientRect();
  const rect = select.getBoundingClientRect();
  const options = [...select.options].map(option => ({ value: option.value, text: option.textContent.trim() }));
  const help = document.querySelector(".help-body").textContent;
  return { options, afterBackground: rect.left >= bg.right, help };
});
if (
  JSON.stringify(difficultyUi.options) !== JSON.stringify([
    { value: "random", text: "随机" },
    ...[2, 3, 4, 5, 6, 7].map(n => ({ value: String(n), text: `${n}步` })),
  ]) ||
  !difficultyUi.afterBackground ||
  !difficultyUi.help.includes("XCross 只按十字部分计算难度") ||
  !difficultyUi.help.includes("自定义打乱公式不受难度选择限制") ||
  !difficultyUi.help.includes("自动记住")
) throw new Error(`难度控件或说明异常: ${JSON.stringify(difficultyUi)}`);
```

在 360 × 740 视口下断言设置行、背景按钮、难度下拉框和可见的 XCross 槽位选择都落在卡片范围内，控件高度至少 22 px，不出现逐字竖排。

- [ ] **步骤 2：运行页面验证确认红灯**

运行：

```bash
npm run verify:blecross
```

预期：FAIL，找不到 `[data-ble-difficulty]`。

- [ ] **步骤 3：添加紧凑难度下拉框**

在背景选择菜单闭合标签之后、现有 `flex: 1` 空白元素之前加入：

```html
<select
  data-ble-difficulty
  class="ble-difficulty-select"
  v-model="difficulty"
  @change="saveDifficulty"
  title="按当前底色十字的精确最优步数生成打乱；XCross 不计 F2L 部分"
>
  <option value="random">随机</option>
  <option v-for="n in [2, 3, 4, 5, 6, 7]" :key="n" :value="n">{{ n }}步</option>
</select>
```

同时给现有「新打乱」按钮增加 `:disabled="generatingDifficulty"`，防止生成期间重复点击；自定义公式入口保持可用，用于主动取消固定难度生成并立即执行输入公式。

给设置行添加 `ble-visual-options` 类。在 `theme.ts` 中增加：

```css
.ble-visual-options { min-width: 0; flex-wrap: nowrap; }
.ble-difficulty-select {
  flex: none;
  height: 22px;
  min-width: 48px;
  border: 1px solid #e3e8f0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  padding: 0 2px;
  font-size: 12px;
  white-space: nowrap;
}
@media (max-width: 420px) {
  .ble-visual-options { gap: 5px !important; }
  .ble-difficulty-select { min-width: 44px; max-width: 54px; }
}
```

- [ ] **步骤 4：补充使用说明**

在「练习模式」之后增加：

```html
<div style="margin-top: 8px;"><b>难度与设置记忆</b></div>
<div>· 「随机」使用普通完整打乱；2步～7步表示当前底色十字的精确最优步数</div>
<div>· XCross 只按十字部分计算难度，F2L 部分不计入</div>
<div>· 自定义打乱公式不受难度选择限制，始终按输入公式执行</div>
<div>· 复选框、下拉框、背景颜色和 z2 姿态会自动记住</div>
```

- [ ] **步骤 5：运行页面验证和手机截图验收**

运行：

```bash
npm run verify:blecross
```

预期：脚本退出码为 0。随后在 360 × 740 视口打开 `?mode=blecross`，确认难度下拉位于背景按钮右侧，设置行无竖排和遮挡，并保存截图证据到 `.superpowers/`（不提交）。

- [ ] **步骤 6：提交任务 4**

```bash
git add src/vue/BleCrossTrainer/index.html src/vue/BleCrossTrainer/theme.ts scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 添加难度控件与使用说明（任务 4/5）"
```

### 任务 5：全量验证、构建与记录

**文件：**

- 修改：`dist/index.html`
- 创建：`dist/index.<新哈希>.js`
- 删除：`dist/index.<旧哈希>.js`
- 修改：`docs/superpowers/plans/2026-09-24-blecross-difficulty.md`

- [ ] **步骤 1：运行 BLE 单元测试**

运行：

```bash
npm run test:ble
```

预期：全部测试通过，失败数为 0。

- [ ] **步骤 2：运行 BLE Cross 页面回归**

运行：

```bash
npm run verify:blecross
```

预期：退出码为 0，覆盖难度精确性、设置恢复、标签、帮助文字和手机布局。

- [ ] **步骤 3：运行生产构建**

运行：

```bash
npm run build
```

预期：webpack 生产构建成功，`dist/index.html` 引用新的哈希 JS。构建后确认 `dist/cube_cross_table.bin` 仍存在但保持未跟踪，不加入提交。

- [ ] **步骤 4：检查最终差异和用户文件**

运行：

```bash
git diff --check
git status --short
git diff --stat
test -f dist/cube_cross_table.bin && wc -c dist/cube_cross_table.bin
```

预期：无空白错误；`README.md`、`.superpowers/`、`.trae/` 和 `dist/cube_cross_table.bin` 保持用户原有未提交状态。

- [ ] **步骤 5：记录验证证据并提交构建产物**

把实际命令、退出码、测试数量、截图路径和提交哈希填写到本计划对应任务下，然后执行：

```bash
git add -u dist
git add dist/index.html dist/index.*.js docs/superpowers/plans/2026-09-24-blecross-difficulty.md
git commit -m "build(蓝牙训练): 更新难度选择功能产物（任务 5/5）"
```

提交前使用 `git diff --cached --name-only`，确认未包含 `README.md`、`.superpowers/`、`.trae/` 或 `dist/cube_cross_table.bin`。

- [ ] **步骤 6：最终核对提交链**

运行：

```bash
git log --oneline -9
git status --short --branch
```

预期：计划、规格及 5 个实现任务提交都位于当前 `master`；工作区只剩明确保留的用户文件。
