# BLE Cross 非最优自动重试实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在开启自动下轮和非最优重试时，让正确但步数不等于可用最优解的 Cross/XCross 训练在 2.5 秒后重置同一局，达到最优后正常进入下一局。

**架构：** 新增一个无副作用的判定模块，统一计算 Cross 与 XCross 是否需要重试；组件在成功结算后保存判定快照，并让现有单一定时器根据快照执行 `resetRound()` 或 `nextRoundDirect()`。界面只增加一个持久化复选框和动态倒计时文案，不建立第二套定时器。

**技术栈：** TypeScript、Vue 2、Vuetify、Node assert、Playwright CLI、浏览器 `localStorage` 与定时器

---

## 文件结构

- 创建 `src/ble/non-optimal-retry.ts`：以纯函数封装 Cross/XCross 最优步数选择和重试判断。
- 修改 `scripts/test-ble.js`：为纯判定模块增加 Cross、XCross 和无有效解单元测试。
- 修改 `scripts/verify-blecross-recompute.js`：验证偏好恢复、控件渲染、动态倒计时和两种到期动作。
- 修改 `src/vue/BleCrossTrainer/index.ts`：维护偏好和成功快照，统一安排“自动下轮/重试本局”。
- 修改 `src/vue/BleCrossTrainer/index.html`：增加「非最优重试」复选框并补充使用说明。

### 任务 1：用纯函数锁定最优步数比较规则

**文件：**
- 创建：`src/ble/non-optimal-retry.ts`
- 测试：`scripts/test-ble.js`

- [ ] **步骤 1：编写失败的单元测试**

在 `scripts/test-ble.js` 引入尚不存在的模块并覆盖明确行为：

```js
const nonOptimalRetry = req("non-optimal-retry.js");

await test("Cross 仅在有效最优解与实际步数不同时重试", () => {
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal({
    trainMode: "cross", actualSteps: 6,
    crossReady: true, crossBestSteps: 5, crossBestValid: true,
    xcrossReady: false, completedSlots: [], bestX: [],
  }), true);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal({
    trainMode: "cross", actualSteps: 5,
    crossReady: true, crossBestSteps: 5, crossBestValid: true,
    xcrossReady: false, completedSlots: [], bestX: [],
  }), false);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal({
    trainMode: "cross", actualSteps: 6,
    crossReady: false, crossBestSteps: 5, crossBestValid: false,
    xcrossReady: false, completedSlots: [], bestX: [],
  }), false);
});

await test("XCross 只取已完成槽位中的最少有效最优步数", () => {
  const base = {
    trainMode: "xcross", actualSteps: 7,
    crossReady: false, crossBestSteps: 0, crossBestValid: false,
    xcrossReady: true,
    completedSlots: ["FL", "BR"],
    bestX: [
      { slot: "FL", steps: 7, available: true },
      { slot: "FR", steps: 4, available: true },
      { slot: "BR", steps: 6, available: true },
    ],
  };
  assert.strictEqual(nonOptimalRetry.bestComparableSteps(base), 6);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal(base), true);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal({ ...base, actualSteps: 6 }), false);
});

await test("XCross 未就绪或已完成槽位没有有效解时不重试", () => {
  const input = {
    trainMode: "xcross", actualSteps: 8,
    crossReady: false, crossBestSteps: 0, crossBestValid: false,
    xcrossReady: true, completedSlots: ["FL"],
    bestX: [{ slot: "FL", steps: 0, available: false }],
  };
  assert.strictEqual(nonOptimalRetry.bestComparableSteps(input), null);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal(input), false);
  assert.strictEqual(nonOptimalRetry.shouldRetryNonOptimal({ ...input, xcrossReady: false }), false);
});
```

- [ ] **步骤 2：运行单元测试并确认正确失败**

运行：

```bash
npm run test:ble
```

预期：FAIL，报错无法加载 `non-optimal-retry.js`。

- [ ] **步骤 3：实现最少纯函数**

在 `src/ble/non-optimal-retry.ts` 定义输入类型并实现：

```ts
export type RetryTrainMode = "cross" | "xcross";

export interface RetryBestSlot {
  slot: string;
  steps: number;
  available: boolean;
}

export interface NonOptimalRetryInput {
  trainMode: RetryTrainMode;
  actualSteps: number;
  crossReady: boolean;
  crossBestSteps: number;
  crossBestValid: boolean;
  xcrossReady: boolean;
  completedSlots: string[];
  bestX: RetryBestSlot[];
}

export function bestComparableSteps(input: NonOptimalRetryInput): number | null {
  if (input.trainMode === "cross") {
    return input.crossReady && input.crossBestValid ? input.crossBestSteps : null;
  }
  if (!input.xcrossReady) return null;
  const completed = new Set(input.completedSlots);
  const steps = input.bestX
    .filter(item => completed.has(item.slot) && item.available)
    .map(item => item.steps);
  return steps.length ? Math.min(...steps) : null;
}

export function shouldRetryNonOptimal(input: NonOptimalRetryInput): boolean {
  const best = bestComparableSteps(input);
  return best !== null && input.actualSteps !== best;
}
```

- [ ] **步骤 4：运行单元测试并确认通过**

运行：`npm run test:ble`

预期：全部 BLE 单元测试通过。

- [ ] **步骤 5：提交纯函数与测试**

```bash
git add src/ble/non-optimal-retry.ts scripts/test-ble.js
git commit -m "test(蓝牙训练): 锁定非最优重试判定规则"
```

### 任务 2：集成持久化设置和成功后动作调度

**文件：**
- 修改：`scripts/verify-blecross-recompute.js`
- 修改：`src/vue/BleCrossTrainer/index.ts`

- [ ] **步骤 1：扩展页面回归测试并确认失败**

在设置恢复用例中写入 `bleRetryNonOptimal=1`，刷新后断言：

```js
retryNonOptimal: vm.retryNonOptimal,
retrySaved: localStorage.getItem("bleRetryNonOptimal"),
```

在倒计时用例中分别构造成功快照：

```js
vm.autoNext = true;
vm.retryNonOptimal = true;
vm.retryCurrentRound = true;
vm.scheduleAutoNext();
const retryText = vm.autoNextCountdownText;
timeoutCallback();

vm.phase = "success";
vm.retryCurrentRound = false;
vm.scheduleAutoNext();
const nextText = vm.autoNextCountdownText;
timeoutCallback();
```

替换 `resetRound` 与 `nextRoundDirect` 为计数函数，断言：

```js
retryText === "2.5 秒后重试本局"
nextText === "2.5 秒后自动下轮"
resetCalls === 1
nextCalls === 1
```

另断言 `saveRetryNonOptimal()` 在成功状态会取消旧任务并按新设置重新调度。

运行：`npm run verify:blecross`

预期：FAIL，原因是设置、保存方法或重试调度尚不存在。

- [ ] **步骤 2：添加组件状态和偏好恢复**

在 `BleCrossTrainer` 增加：

```ts
retryNonOptimal = false;
private retryCurrentRound = false;
private bestSolutionAvailable = false;
```

在 `mounted()` 恢复：

```ts
this.retryNonOptimal = window.localStorage.getItem("bleRetryNonOptimal") === "1";
```

增加保存并重新调度方法：

```ts
saveRetryNonOptimal(): void {
  window.localStorage.setItem("bleRetryNonOptimal", this.retryNonOptimal ? "1" : "0");
  if (this.phase === "success" && this.autoNext) this.scheduleAutoNext();
}
```

- [ ] **步骤 3：成功时生成不可变的重试判定快照**

在 `requestBest()` 开始时把 `bestSolutionAvailable` 清为 `false`；Cross 求解得到包含空串在内的合法结果时置为 `true`。XCross 的每项结果增加 `available` 字段，以区分合法 0 步解与求解失败。导入 `shouldRetryNonOptimal`，在 `finishSuccess()` 完成 `completedSlots` 与 `moveCount` 计算后赋值：

```ts
this.retryCurrentRound = this.retryNonOptimal && shouldRetryNonOptimal({
  trainMode: this.trainMode,
  actualSteps: this.moveCount,
  crossReady: this.bestReady,
  crossBestSteps: this.bestSteps,
  crossBestValid: this.bestSolutionAvailable,
  xcrossReady: this.bestXReady,
  completedSlots: this.completedSlots,
  bestX: this.bestXDisplay.map(item => ({
    slot: item.slot,
    steps: item.steps,
    available: item.available,
  })),
});
```

在新打乱和重置完成后将快照清回 `false`，避免跨轮残留。

- [ ] **步骤 4：泛化现有单一定时器**

倒计时后缀根据快照生成：

```ts
const actionText = this.retryNonOptimal && this.retryCurrentRound
  ? "重试本局"
  : "自动下轮";
this.autoNextCountdownText = `${(remaining / 1000).toFixed(1)} 秒后${actionText}`;
```

到期时先保存动作、清理定时器，再执行：

```ts
const retry = this.retryNonOptimal && this.retryCurrentRound;
this.clearAutoNextSchedule();
const action = retry ? () => this.resetRound() : () => this.nextRoundDirect();
void Promise.resolve(action()).catch(onError);
```

错误提示根据动作显示“重试本局执行异常”或“自动下轮执行异常”。

- [ ] **步骤 5：运行页面回归并确认通过**

运行：`npm run verify:blecross`

预期：设置恢复、两种倒计时、重试和下一轮动作全部通过。

- [ ] **步骤 6：提交调度集成**

```bash
git add src/vue/BleCrossTrainer/index.ts scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 非最优时自动重试当前局"
```

### 任务 3：增加界面开关和使用说明

**文件：**
- 修改：`scripts/verify-blecross-recompute.js`
- 修改：`src/vue/BleCrossTrainer/index.html`

- [ ] **步骤 1：先添加移动端界面失败断言**

在 360px 视口读取 `[data-ble-retry-non-optimal]`，断言控件存在、文案为“非最优重试”、复选框与模型同步，并且控制行未产生横向溢出。再读取使用说明文本，断言包含“非最优重试”和“同一局”。

运行：`npm run verify:blecross`

预期：FAIL，原因是新控件和说明尚未渲染。

- [ ] **步骤 2：添加复选框**

在「自动下轮」旁加入：

```html
<label data-ble-retry-non-optimal ... title="正确但未达到最优步数时，倒计时后重置同一局继续练习">
  <input type="checkbox" v-model="retryNonOptimal" @change="saveRetryNonOptimal" ... />非最优重试
</label>
```

控制行允许在窄屏换行，状态文字保留 `min-width: 0`，避免移动端横向溢出。

- [ ] **步骤 3：补充使用说明**

在自动下轮说明后增加：

```html
<div>· 勾选「非最优重试」后，正确但步数不是最优时会倒计时重置同一局；达到最优后才自动进入下一局</div>
```

- [ ] **步骤 4：运行页面回归并确认通过**

运行：`npm run verify:blecross`

预期：桌面与 360px 移动端控件、说明和倒计时全部通过。

- [ ] **步骤 5：提交界面变更**

```bash
git add src/vue/BleCrossTrainer/index.html scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 添加非最优重试开关说明"
```

### 任务 4：完整验证、构建和发布

**文件：**
- 构建产物：`dist/`

- [ ] **步骤 1：运行完整自动化验证**

```bash
npm run test:ble
npm run verify:blecross
```

预期：BLE 单元测试全部通过，页面验证退出码为 0。

- [ ] **步骤 2：通过视觉伴侣检查界面**

在桌面与 360px 手机宽度确认「自动下轮」「非最优重试」「最优解」控件可读，成功状态分别显示“秒后重试本局”和“秒后自动下轮”，且同局重试不改变打乱公式。

- [ ] **步骤 3：保护二进制表并执行生产构建**

构建前备份未跟踪的 `dist/cube_cross_table.bin`，运行：

```bash
npm run build
```

构建后恢复该文件，并验证 SHA-256 仍为：

```text
93455c0e1994692f153c7631bef9a9dc1f68b648a8fe5a378eafd7a9e180f7c5
```

- [ ] **步骤 4：检查工作区和变更范围**

```bash
git diff --check
git status --short
git log -6 --oneline
```

确认不提交用户已有的 `README.md`、`.superpowers/`、`.trae/` 与 `dist/cube_cross_table.bin`。

- [ ] **步骤 5：提交构建产物**

```bash
git add dist
git commit -m "build(蓝牙训练): 更新非最优重试产物"
```

- [ ] **步骤 6：推送两个远端**

```bash
git push origin master
git -c http.proxy=http://127.0.0.1:7890 push github master
```

预期：Gitee 与 GitHub 的 `master` 都更新到相同最终提交。
