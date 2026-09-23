# BLE Cross 自动下轮倒计时实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在训练成功后的 2.5 秒自动下轮等待期内，将精确到 0.1 秒的剩余时间显示在成功状态文字中。

**架构：** 保留现有 `resultTimer` 作为跳转任务，新增截止时间、100 ms 刷新任务和响应式倒计时文字。统一的调度与清理方法由成功结算、复选框变更、提前跳转及组件销毁复用；剩余时间始终由截止时间计算，避免浏览器后台降频造成累计误差。

**技术栈：** TypeScript、Vue 2、Vuetify、Playwright CLI、浏览器定时器

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加自动下轮倒计时的调度、递减、取消、重启、到期和异常回归。
- 修改 `src/vue/BleCrossTrainer/index.ts`：维护倒计时状态，统一自动下轮调度与清理。
- 修改 `src/vue/BleCrossTrainer/index.html`：在现有成功状态文字后显示倒计时。

### 任务 1：锁定倒计时行为

**文件：**
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：编写失败的页面回归测试**

在页面实例上替换浏览器时间和定时器，捕获调度参数及回调：

```js
const autoNextCountdown = await page.evaluate(async () => {
  const vm = window.__bleCross;
  const realNow = Date.now;
  const realSetTimeout = window.setTimeout;
  const realClearTimeout = window.clearTimeout;
  const realSetInterval = window.setInterval;
  const realClearInterval = window.clearInterval;
  let now = 10000;
  let timeoutCallback = null;
  let intervalCallback = null;
  const cleared = [];
  let nextCalls = 0;
  const nextRoundDirect = vm.nextRoundDirect.bind(vm);

  Date.now = () => now;
  window.setTimeout = (callback, delay) => {
    timeoutCallback = callback;
    return 101;
  };
  window.setInterval = (callback, delay) => {
    intervalCallback = callback;
    return 202;
  };
  window.clearTimeout = id => cleared.push(["timeout", id]);
  window.clearInterval = id => cleared.push(["interval", id]);
  vm.nextRoundDirect = () => nextCalls++;

  try {
    vm.phase = "success";
    vm.statusText = "✅ 十字完成!";
    vm.autoNext = true;
    vm.scheduleAutoNext();
    const initial = vm.autoNextCountdownText;
    await vm.$nextTick();
    const initialDom = document.querySelector(".ok-text").textContent.trim();
    now = 10100;
    intervalCallback();
    const ticked = vm.autoNextCountdownText;

    vm.autoNext = false;
    vm.saveAutoNext();
    const cancelled = vm.autoNextCountdownText;

    vm.autoNext = true;
    vm.saveAutoNext();
    const restarted = vm.autoNextCountdownText;
    now = 12600;
    timeoutCallback();

    return { initial, initialDom, ticked, cancelled, restarted, nextCalls, cleared };
  } finally {
    vm.clearAutoNextSchedule();
    vm.nextRoundDirect = nextRoundDirect;
    Date.now = realNow;
    window.setTimeout = realSetTimeout;
    window.clearTimeout = realClearTimeout;
    window.setInterval = realSetInterval;
    window.clearInterval = realClearInterval;
  }
});
```

断言核心结果：

```js
if (
  autoNextCountdown.initial !== "2.5 秒后自动下轮" ||
  !autoNextCountdown.initialDom.includes("2.5 秒后自动下轮") ||
  autoNextCountdown.ticked !== "2.4 秒后自动下轮" ||
  autoNextCountdown.cancelled !== "" ||
  autoNextCountdown.restarted !== "2.5 秒后自动下轮" ||
  autoNextCountdown.nextCalls !== 1
) {
  throw new Error(`自动下轮倒计时异常: ${JSON.stringify(autoNextCountdown)}`);
}
```

另设一次 `nextRoundDirect` 抛错，执行到期回调后断言：

```js
vm.nextRoundDirect = () => {
  throw new Error("countdown-test");
};
timeoutCallback();
const failed = {
  countdown: vm.autoNextCountdownText,
  status: vm.statusText,
};
```

期望 `failed.countdown === ""`，且 `failed.status` 包含 `countdown-test`。

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
npm run verify:blecross
```

预期：命令失败，原因是 `scheduleAutoNext`、`clearAutoNextSchedule` 或 `autoNextCountdownText` 尚不存在。

### 任务 2：实现统一倒计时调度

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:306-313`
- 修改：`src/vue/BleCrossTrainer/index.ts:450-466`
- 修改：`src/vue/BleCrossTrainer/index.ts:1821-1872`
- 修改：`src/vue/BleCrossTrainer/index.ts:1888-1894`
- 修改：`src/vue/BleCrossTrainer/index.ts:1977-1984`
- 修改：`src/vue/BleCrossTrainer/index.ts:2114-2135`

- [ ] **步骤 1：添加倒计时状态**

```ts
private resultTimer: any = null;
private autoNextCountdownTimer: any = null;
private autoNextDeadline = 0;
autoNextCountdownText = "";
```

- [ ] **步骤 2：实现截止时间刷新、统一清理和统一调度**

```ts
private refreshAutoNextCountdown(): void {
  if (this.phase !== "success" || this.autoNextDeadline <= 0) {
    this.autoNextCountdownText = "";
    return;
  }
  const remaining = Math.max(0, this.autoNextDeadline - Date.now());
  this.autoNextCountdownText = (remaining / 1000).toFixed(1) + " 秒后自动下轮";
}

private clearAutoNextSchedule(): void {
  if (this.resultTimer !== null) {
    window.clearTimeout(this.resultTimer);
    this.resultTimer = null;
  }
  if (this.autoNextCountdownTimer !== null) {
    window.clearInterval(this.autoNextCountdownTimer);
    this.autoNextCountdownTimer = null;
  }
  this.autoNextDeadline = 0;
  this.autoNextCountdownText = "";
}

private scheduleAutoNext(): void {
  this.clearAutoNextSchedule();
  if (!this.autoNext || this.phase !== "success") {
    return;
  }
  this.autoNextDeadline = Date.now() + 2500;
  this.refreshAutoNextCountdown();
  this.autoNextCountdownTimer = window.setInterval(() => this.refreshAutoNextCountdown(), 100);
  this.resultTimer = window.setTimeout(() => {
    this.clearAutoNextSchedule();
    try {
      this.nextRoundDirect();
    } catch (e) {
      console.error("[BLECross] 自动下轮执行异常", e);
      this.statusText =
        "自动下轮执行异常: " +
        (e instanceof Error ? e.message : String(e)) +
        " (可点「新打乱」继续)";
    }
  }, 2500);
}
```

- [ ] **步骤 3：替换分散的定时器管理**

按以下规则修改调用点：

```ts
// beforeDestroy、新打乱取消旧等待
this.clearAutoNextSchedule();

// finishSuccess：先清理上一组任务；开启时再调度新任务
this.clearAutoNextSchedule();
if (this.autoNext) this.scheduleAutoNext();

// saveAutoNext
if (this.phase === "success") {
  this.autoNext ? this.scheduleAutoNext() : this.clearAutoNextSchedule();
}
```

`resetRound` 先保存 `const skipAutoWait = this.resultTimer !== null`，再调用 `clearAutoNextSchedule()`；若 `skipAutoWait` 为真，立即执行 `nextRoundDirect()`。蓝牙断开路径不调用清理方法，以保留原有跨断连自动下轮行为。

- [ ] **步骤 4：在状态文字后显示独立倒计时字段**

将 `src/vue/BleCrossTrainer/index.html` 的状态文本改为：

```html
{{ statusText }}{{ autoNextCountdownText ? ' ' + autoNextCountdownText : '' }}
```

- [ ] **步骤 5：运行页面回归测试确认通过**

运行：

```bash
npm run verify:blecross
```

预期：退出码为 `0`；初始、递减、取消、重启、到期和异常场景全部通过。

- [ ] **步骤 6：运行 BLE 协议回归**

运行：

```bash
npm run test:ble
```

预期：`27 通过, 0 失败`。

- [ ] **步骤 7：提交功能与测试**

```bash
git add -- \
  src/vue/BleCrossTrainer/index.ts \
  src/vue/BleCrossTrainer/index.html \
  scripts/verify-blecross-recompute.js
git commit -m "feat(蓝牙训练): 显示自动下轮倒计时"
```

### 任务 3：完成前验证

**文件：**
- 验证：`src/vue/BleCrossTrainer/index.ts`
- 验证：`src/vue/BleCrossTrainer/index.html`
- 验证：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：运行生产构建**

运行：

```bash
npm run build
```

预期：Webpack 输出 `compiled successfully`。

- [ ] **步骤 2：恢复并校验未跟踪搜索表**

生产构建会清理 `dist`，因此重新生成用户保留的搜索表：

```bash
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：`dist/cube_cross_table.bin 2661132 bytes`。

- [ ] **步骤 3：检查补丁格式和工作区范围**

运行：

```bash
git diff --check -- \
  src/vue/BleCrossTrainer/index.ts \
  src/vue/BleCrossTrainer/index.html \
  scripts/verify-blecross-recompute.js
git status --short
```

预期：`git diff --check` 无输出；`README.md`、`.trae/`、`.superpowers/` 和 `dist/cube_cross_table.bin` 保持未提交。
