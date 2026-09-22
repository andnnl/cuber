# BLE Cross 观察用时记录实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让手动和蓝牙训练在实际经历观察阶段时，都把观察用时保存到训练记录并在现有列表中显示。

**架构：** 保留现有 `TrainRecord.obs: number | null` 和训练记录弹窗，只调整结算数据来源。`recordTrain` 统一根据有效的 `observeStart` 与 `solveStart` 计算观察秒数；现有格式化和平均值逻辑继续兼容旧记录及无观察时间记录。

**技术栈：** TypeScript、Vue 2、Vuetify、Playwright CLI、localStorage

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加训练记录观察时间的页面回归场景。
- 修改 `src/vue/BleCrossTrainer/index.ts`：统一计算并保存手动、蓝牙训练的观察用时。

### 任务 1：锁定观察用时持久化行为

**文件：**
- 测试：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：编写失败的页面回归测试**

在页面实例上清空记录并固定时间戳，分别调用蓝牙记录、有观察阶段的手动记录和无观察阶段记录：

```js
const observationRecords = await page.evaluate(() => {
  const vm = window.__bleCross;
  const realNow = Date.now;
  vm.records = [];
  vm.saveRecords = () => {};

  Date.now = () => 15000;
  vm.isManual = false;
  vm.observeStart = 10000;
  vm.solveStart = 12500;
  vm.recordTrain(true);

  Date.now = () => 25000;
  vm.isManual = true;
  vm.observeStart = 20000;
  vm.solveStart = 22000;
  vm.recordTrain(true);

  Date.now = () => 30000;
  vm.observeStart = 0;
  vm.solveStart = 0;
  vm.recordTrain(false);
  Date.now = realNow;

  return {
    bluetoothObs: vm.records[2].obs,
    manualObs: vm.records[1].obs,
    missingObs: vm.records[0].obs,
    formattedBluetooth: vm.fmtRecSec(vm.records[2].obs),
    formattedMissing: vm.fmtRecSec(vm.records[0].obs),
    avgObs: vm.recStats.avgObs,
  };
});
```

断言结果：

```js
if (
  observationRecords.bluetoothObs !== 2.5 ||
  observationRecords.manualObs !== 2 ||
  observationRecords.missingObs !== null ||
  observationRecords.formattedBluetooth !== "2.5s" ||
  observationRecords.formattedMissing !== "-" ||
  observationRecords.avgObs !== "2.3s"
) {
  throw new Error(`训练记录观察用时异常: ${JSON.stringify(observationRecords)}`);
}
```

- [ ] **步骤 2：运行测试并确认正确失败**

运行：

```bash
npm run verify:blecross
```

预期：命令失败，`bluetoothObs` 为 `null`，证明现有的 `isManual` 限制会丢失蓝牙观察时间。

### 任务 2：统一保存有效观察时间

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:46-48`
- 修改：`src/vue/BleCrossTrainer/index.ts:312-316`
- 修改：`src/vue/BleCrossTrainer/index.ts:2511-2522`

- [ ] **步骤 1：更新字段注释**

将 `obs` 和计时字段说明改为模式无关：

```ts
/** 一轮训练记录：obs=观察用时秒（无观察阶段为 null）。 */
```

- [ ] **步骤 2：实现最小有效性判断**

在 `recordTrain` 中移除 `isManual` 限制，并防止无效或倒序时间戳产生负数：

```ts
const observed = this.observeStart > 0 && this.solveStart >= this.observeStart;
const rec: TrainRecord = {
  // 其他字段保持原样
  obs: observed ? (this.solveStart - this.observeStart) / 1000 : null,
};
```

- [ ] **步骤 3：运行页面回归测试确认通过**

运行：

```bash
npm run verify:blecross
```

预期：退出码为 `0`，蓝牙和手动观察时间均保存，无观察阶段继续为 `null`。

- [ ] **步骤 4：运行 BLE 协议回归**

运行：

```bash
npm run test:ble
```

预期：`27 通过, 0 失败`。

- [ ] **步骤 5：提交功能与测试**

```bash
git add -- \
  src/vue/BleCrossTrainer/index.ts \
  scripts/verify-blecross-recompute.js
git commit -m "fix(训练记录): 保存蓝牙观察用时"
```

### 任务 3：完成前验证

**文件：**
- 验证：`src/vue/BleCrossTrainer/index.ts`
- 验证：`scripts/verify-blecross-recompute.js`

- [ ] **步骤 1：运行生产构建**

运行：

```bash
npm run build
```

预期：Webpack 输出 `compiled successfully`。

- [ ] **步骤 2：检查补丁格式和工作区范围**

运行：

```bash
git diff --check -- \
  src/vue/BleCrossTrainer/index.ts \
  scripts/verify-blecross-recompute.js
git status --short
```

预期：`git diff --check` 无输出；`README.md`、`.trae/` 和 `dist/cube_cross_table.bin` 仍保持用户原有状态，不进入功能变更。
