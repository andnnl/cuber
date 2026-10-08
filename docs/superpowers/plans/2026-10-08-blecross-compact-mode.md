# BLE Cross 手机收纳模式实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 BLE Cross 增加可持久化的紧凑底部面板，仅保留新打乱、重置、z2、y、y'、最优解和动态结果。

**架构：** 在 `BleCrossTrainer` 中增加独立的 `compactMode` 展示状态，模板继续复用现有按钮、解法和结果组件，只对完整设置及预览控件增加条件显示。CSS 在紧凑状态下把 5 个核心按钮固定为单行网格，不修改训练、蓝牙、求解或 3D 手势逻辑。

**技术栈：** TypeScript、Vue 2、Vuetify、CSS、Playwright CLI、webpack 5

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：增加收纳模式默认值、持久化、显示范围、状态不变和手机宽度回归。
- 修改 `src/vue/BleCrossTrainer/index.ts`：增加 `compactMode` 状态、挂载恢复和切换保存方法。
- 修改 `src/vue/BleCrossTrainer/index.html`：增加收纳入口，对完整内容与预览按钮增加条件显示。
- 修改 `src/vue/BleCrossTrainer/theme.ts`：增加紧凑面板、核心按钮网格和手机窄屏样式。
- 修改 `docs/superpowers/plans/2026-10-08-blecross-compact-mode.md`：记录执行进度。
- 更新 `dist/index.html` 和带哈希的 `dist/index.*.js`：保存生产构建产物。

### 任务 1：锁定收纳模式行为

**文件：**
- 修改：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：编写失败的浏览器回归测试**

在页面测试前清除 `bleCompactMode` 并刷新，断言默认完整模式。记录魔方状态和训练状态后点击收纳按钮：

```javascript
localStorage.removeItem("bleCompactMode");
await page.reload();

const before = await page.evaluate(() => {
  const vm = window.__bleCross;
  return {
    cube: vm.world.cube.serialize(),
    phase: vm.phase,
    moveCount: vm.moveCount,
    solution: vm.userSolution,
  };
});

await page.locator("[data-ble-compact-toggle]").click();
```

断言：

- `compactMode === true`；
- `localStorage.bleCompactMode === "1"`；
- `[data-ble-core-actions]` 中只有 5 个可见按钮；
- `[data-ble-full-only]` 全部隐藏；
- `[data-ble-preview-controls]` 隐藏；
- 最优解和动态结果容器仍存在；
- 魔方状态、阶段、步数和已拧公式不变。

- [x] **步骤 2：覆盖刷新恢复与手机布局**

在收纳状态刷新页面后断言仍为收纳模式；把视口设置为 `390 × 844`，检查核心按钮容器：

```javascript
const mobileLayout = await page.locator("[data-ble-core-actions]").evaluate(el => ({
  display: getComputedStyle(el).display,
  columns: getComputedStyle(el).gridTemplateColumns,
  overflow: el.scrollWidth > el.clientWidth,
}));
```

预期 `display === "grid"`、网格为 5 列且 `overflow === false`。点击「展开」后完整内容恢复，并保存 `"0"`。

- [x] **步骤 3：运行测试验证红灯**

运行：`npm run verify:blecross`

预期：FAIL，页面没有 `compactMode`、收纳按钮或对应 DOM 标记。

### 任务 2：实现状态与持久化

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：增加收纳状态**

在界面设置字段附近增加：

```typescript
compactMode = false;
```

- [x] **步骤 2：挂载时恢复选择**

在 `mounted()` 读取其他 BLE Cross 设置的位置增加：

```typescript
this.compactMode = window.localStorage.getItem("bleCompactMode") === "1";
```

没有保存值或保存为 `"0"` 时保持完整模式。

- [x] **步骤 3：增加切换方法**

```typescript
toggleCompactMode(): void {
  this.compactMode = !this.compactMode;
  window.localStorage.setItem("bleCompactMode", this.compactMode ? "1" : "0");
}
```

该方法只修改展示状态，不调用求解、重绘、重置或蓝牙方法。

- [x] **步骤 4：运行浏览器回归确认状态部分转绿**

运行：`npm run verify:blecross`

预期：状态与持久化断言通过，模板显示范围和手机布局断言仍失败。

### 任务 3：实现紧凑模板与手机样式

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.html`
- 修改：`src/vue/BleCrossTrainer/theme.ts`
- 测试：`scripts/verify-blecross-recompute.js`

- [x] **步骤 1：增加通用收纳入口**

在卡片内容顶部增加紧凑标题行：

```html
<div class="ble-compact-header">
  <div style="flex: 1;"></div>
  <v-btn data-ble-compact-toggle x-small @click="toggleCompactMode">
    {{ compactMode ? '展开' : '收纳' }}
  </v-btn>
</div>
```

为 `v-card` 增加 `:class="{'ble-card-compact': compactMode}"`。

- [x] **步骤 2：区分核心操作和完整内容**

- 核心按钮行增加 `data-ble-core-actions` 和 `:class="{'ble-compact-actions': compactMode}"`。
- Cross/XCross 选择与校准按钮增加 `v-if="!compactMode"`。
- 连接行、MAC 行、自定义打乱行和可视化选项行增加 `v-show="!compactMode" data-ble-full-only`。
- 流程行继续显示状态、计时和步数；其中 3 个设置复选框包入 `v-show="!compactMode" data-ble-full-only`。

- [x] **步骤 3：保留解法文字并隐藏预览控件**

- 最优解容器增加 `data-ble-solution-panel`。
- Cross 的 `⏮ / ⏭ / ▶ / GIF` 与 XCross 每行预览按钮、GIF 行统一包入 `v-if="!compactMode" data-ble-preview-controls`。
- 实时步骤容器和完成结果容器分别增加 `data-ble-live-result`、`data-ble-success-result`，保持原有状态条件。

- [x] **步骤 4：增加紧凑 CSS**

在 `theme.ts` 增加：

```css
.ble-card .ble-compact-header {
  display: flex;
  align-items: center;
  min-height: 20px;
}
.ble-card.ble-card-compact .ble-scramble-actions.ble-compact-actions {
  display: grid;
  grid-template-columns: minmax(72px, 1.45fr) minmax(58px, 1.1fr) repeat(3, minmax(34px, .7fr));
  gap: 4px;
}
.ble-card.ble-card-compact .ble-compact-actions .v-btn {
  min-width: 0 !important;
  width: 100%;
  padding: 0 4px !important;
}
```

在 `@media (max-width: 420px)` 中进一步压缩卡片内边距、按钮间距和解法区域间距，但不隐藏公式或结果。

- [x] **步骤 5：运行浏览器回归确认全部转绿**

运行：`npm run verify:blecross`

预期：默认、切换、持久化、显示范围、状态不变和手机 5 列布局全部通过。

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

预期：全部浏览器断言通过；若既有固定难度随机生成用例偶发失败，应单独重跑并记录，不得忽略新增收纳断言失败。

- [x] **步骤 3：运行生产构建并保护求解表**

备份未跟踪的 `dist/cube_cross_table.bin`，运行 `npm run build`，恢复文件并验证 SHA-256 保持为：

```text
93455c0e1994692f153c7631bef9a9dc1f68b648a8fe5a378eafd7a9e180f7c5
```

- [ ] **步骤 4：检查提交范围并提交**

只提交计划、测试、实现和构建产物；保留用户已有的 `README.md`、`.superpowers/`、`.trae/` 与 `dist/cube_cross_table.bin`。

建议提交信息：

```text
feat(蓝牙训练): 添加手机收纳模式
```

- [ ] **步骤 5：推送两个远端**

将 `master` 推送到 `origin`（Gitee）和 `github`，确认两个远端与本地 `HEAD` 一致。

## 自检

- 规格中的手动切换、默认完整、持久化、5 个按钮、解法文字、动态结果和隐藏范围均有对应任务。
- `compactMode`、`toggleCompactMode()`、`bleCompactMode` 和 DOM 标记在测试与实现步骤中命名一致。
- 收纳模式只控制模板和 CSS，没有把训练设置重置或复制到新的状态模型。
- 计划不修改底层 3D、蓝牙协议、求解器或训练记录结构。
