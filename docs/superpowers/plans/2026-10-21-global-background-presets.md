# 全局背景十色预设实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目按 AGENTS.md 内联执行，不新建 worktree。

**目标：** 全局背景色设置复用 BLE Cross 原有十色预设。

**架构：** 预设名和色值放在 `src/vue/background-presets.ts`，设置页和 BLE Cross 共用。全局预设调用既有 `BackgroundStore.setGlobal`；页面自定义覆盖逻辑不变。

**技术栈：** TypeScript、Vue 2 模板、Playwright CLI、webpack 5。

---

## 文件职责

- 创建 `src/vue/background-presets.ts`：十个背景预设的单一来源。
- 修改 `src/vue/BleCrossTrainer/index.ts`：删除局部重复数组并引入共享常量。
- 修改 `src/vue/Setting/index.ts` 和 `index.html`：全局预设的数据绑定、点击及选中视觉状态。
- 修改 `scripts/verify-background-ui.js`：浏览器端验证十色、点击、恢复默认和界面隔离。

### 任务 1：测试全局十色交互

- [x] 在 `scripts/verify-background-ui.js` 已打开设置页后，检查 `[data-global-bg-preset]` 恰好十个且顺序与 BLE 色表相同；点击 `#48515E` 后检查全局调色器和背景色，切换页面覆盖仍不改变；恢复默认后不再选中。新增断言例子：

```js
const presets = page.locator('[data-global-bg-preset]');
const actual = await presets.evaluateAll(els => els.map(el => [el.title, el.getAttribute('data-color')]));
if (actual.length !== 10 || actual[6][1] !== '#48515E') throw Error('全局背景预设缺失');
await presets.nth(6).click();
if (await page.locator('[data-global-bg]').inputValue() !== '#48515e') throw Error('全局预设未同步');
```

- [x] 运行现有背景浏览器验证入口，确认新增断言首先因找不到预设而失败。

### 任务 2：共享数据与全局入口

- [x] 创建 `src/vue/background-presets.ts`，导出以下数据结构与完整原有色表：

```ts
export type BackgroundPreset = { name: string; value: string };
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "白色", value: "#FFFFFF" }, { name: "浅灰", value: "#F3F4F6" },
  { name: "米白", value: "#FFF8E7" }, { name: "淡黄", value: "#FFFDE7" },
  { name: "淡绿", value: "#E8F5E9" }, { name: "淡青", value: "#465255" },
  { name: "淡蓝", value: "#48515E" }, { name: "淡紫", value: "#514B5B" },
  { name: "淡粉", value: "#5D4C53" }, { name: "暗黑", value: "#121212" },
];
```

- [x] BLE Cross 改为 `import { BACKGROUND_PRESETS } from "../background-presets"` 并设 `readonly backgroundPresets = BACKGROUND_PRESETS`，删除局部类型和数组。
- [x] Setting 同样引入 `BACKGROUND_PRESETS`，添加 `readonly backgroundPresets = BACKGROUND_PRESETS`；模板在全局调色器后插入可换行网格，按钮使用 `v-for="item in backgroundPresets"`、`data-global-bg-preset`、`:data-color="item.value"`、`:title="item.name + ' ' + item.value"`、`@click="setGlobalBackground(item.value)"` 和 `:class="{selected: globalColor === item.value}"`。白色边框和选中轮廓均清楚可见；每个按钮设 `:aria-label="item.name + '背景 ' + item.value"`。
- [x] 运行背景 UI 验证及 `npm run build`，确认均通过。

### 任务 3：回归与交付

- [x] 在浏览器检查设置页窄屏十色布局及 BLE Cross 原有十色入口；执行 `scripts/verify-background-ble.js` 的已有背景同步验证。
- [x] 检查 `git diff --check` 和仅本次相关 diff，说明验证结果；由于实现涉及用户原有未提交改动，未经单独要求不把混合改动整文件提交。
