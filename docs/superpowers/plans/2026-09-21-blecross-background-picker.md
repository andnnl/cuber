# BLE Cross 3D 背景色选择实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在 BLE Cross「隐藏无关」右侧增加 10 色预设与自定义调色器，只修改该页面的 3D 背景并持久化。

**架构：** 保持共享 `Viewport` 的透明 WebGL 画布不变，在 BLE Cross 的 viewport 包装层绑定局部背景色。组件负责颜色校验、预设列表和 `localStorage` 持久化，模板用 Vuetify `v-menu` 展示直观色块，现有 `gifBackColor()` 沿 DOM 父级读取同一背景。

**技术栈：** TypeScript、Vue 2 class component、Vuetify、Three.js、Playwright CLI、webpack 5。

---

## 文件结构

- 修改 `scripts/verify-blecross-recompute.js`：新增背景预设、局部渲染、自定义颜色、持久化、GIF 取色和状态不变的浏览器回归。
- 修改 `src/vue/BleCrossTrainer/index.ts`：定义 10 个预设色，加载并校验持久化颜色，提供统一选择入口。
- 修改 `src/vue/BleCrossTrainer/index.html`：给 viewport 包装层绑定背景，在「隐藏无关」右侧增加颜色下拉框和原生调色器。
- 修改 `src/vue/BleCrossTrainer/theme.ts`：增加颜色按钮、预设网格和选中态样式。
- 更新 `dist/index.html` 与内容哈希入口：提交生产构建产物。

### 任务 1：用浏览器回归锁定背景选择行为

**文件：**
- 测试：`scripts/verify-blecross-recompute.js:1`

- [ ] **步骤 1：在首次页面加载后加入失败断言**

测试通过 DOM 和组件实例验证以下行为：

```js
const background = await page.evaluate(() => {
  const vm = window.__bleCross;
  const before = vm.world.cube.serialize();
  localStorage.removeItem("bleBackgroundColor");
  vm.backgroundColor = "#FFFFFF";
  vm.setBackgroundColor("#121212");
  const wrapper = document.querySelector("[data-ble-background]");
  return {
    presets: vm.backgroundPresets.map(x => x.value),
    domPresets: document.querySelectorAll("[data-ble-bg-preset]").length,
    style: getComputedStyle(wrapper).backgroundColor,
    saved: localStorage.getItem("bleBackgroundColor"),
    gif: vm.gifBackColor(),
    unchanged: before === vm.world.cube.serialize(),
  };
});
if (
  background.presets.length !== 10 ||
  background.domPresets !== 10 ||
  background.style !== "rgb(18, 18, 18)" ||
  background.saved !== "#121212" ||
  background.gif !== 0x121212 ||
  !background.unchanged
) {
  throw new Error(`BLE Cross 背景色选择异常: ${JSON.stringify(background)}`);
}
```

继续覆盖自定义色、刷新恢复和非法值回退：先调用 `setBackgroundColor("#A1B2C3")` 并刷新，断言组件值与包装层颜色恢复；再写入非法值并刷新，断言回退 `#FFFFFF`。测试结束恢复白色，避免污染后续章节。

- [ ] **步骤 2：运行回归并确认红灯**

运行：

```bash
npm run verify:blecross
```

预期：FAIL，错误指向 `backgroundPresets`、`setBackgroundColor` 或 `[data-ble-background]` 尚不存在。

### 任务 2：实现局部背景状态与颜色下拉框

**文件：**
- 修改：`src/vue/BleCrossTrainer/index.ts:180-420`
- 修改：`src/vue/BleCrossTrainer/index.html:1-155`
- 修改：`src/vue/BleCrossTrainer/theme.ts:1-90`

- [ ] **步骤 1：定义预设、默认值和颜色校验**

在组件模块中加入：

```ts
type BackgroundPreset = { name: string; value: string };

const BLE_BACKGROUND_DEFAULT = "#FFFFFF";
const BLE_BACKGROUND_PRESETS: BackgroundPreset[] = [
  { name: "白色", value: "#FFFFFF" },
  { name: "浅灰", value: "#F3F4F6" },
  { name: "米白", value: "#FFF8E7" },
  { name: "淡黄", value: "#FFFDE7" },
  { name: "淡绿", value: "#E8F5E9" },
  { name: "淡青", value: "#E0F7FA" },
  { name: "淡蓝", value: "#EAF2FF" },
  { name: "淡紫", value: "#F3E8FF" },
  { name: "淡粉", value: "#FCE7F3" },
  { name: "暗黑", value: "#121212" },
];

function normalizeBackgroundColor(value: string | null): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : BLE_BACKGROUND_DEFAULT;
}
```

组件字段和统一入口：

```ts
backgroundColor = BLE_BACKGROUND_DEFAULT;
readonly backgroundPresets = BLE_BACKGROUND_PRESETS;

setBackgroundColor(value: string): void {
  this.backgroundColor = normalizeBackgroundColor(value);
  window.localStorage.setItem("bleBackgroundColor", this.backgroundColor);
  this.world.dirty = true;
}
```

在 `mounted()` 中读取 `bleBackgroundColor`，通过 `normalizeBackgroundColor()` 初始化；非法值回退白色且不影响启动。

- [ ] **步骤 2：绑定 BLE Cross 专用背景层**

将 viewport 包装层改为：

```html
<div
  data-ble-background
  :style="{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: backgroundColor}"
>
  <viewport ref="viewport"></viewport>
</div>
```

共享 `Viewport`、全局 `preferance.dark` 和其他页面保持不变。

- [ ] **步骤 3：在「隐藏无关」右侧加入下拉色板**

使用 `v-menu` 和带实际背景色的按钮：

```html
<v-menu offset-y :close-on-content-click="false">
  <template v-slot:activator="{ on, attrs }">
    <button class="ble-bg-trigger" v-bind="attrs" v-on="on" title="选择 3D 背景色">
      <span class="ble-bg-current" :style="{backgroundColor: backgroundColor}"></span>
      <span>▾</span>
    </button>
  </template>
  <v-card class="ble-bg-menu">
    <div class="ble-bg-grid">
      <button
        v-for="item in backgroundPresets"
        :key="item.value"
        data-ble-bg-preset
        class="ble-bg-swatch"
        :class="{selected: backgroundColor === item.value}"
        :style="{backgroundColor: item.value}"
        :title="item.name + ' ' + item.value"
        @click="setBackgroundColor(item.value)"
      ></button>
    </div>
    <label class="ble-bg-custom">
      自定义
      <input data-ble-bg-custom type="color" :value="backgroundColor" @input="setBackgroundColor($event.target.value)" />
    </label>
  </v-card>
</v-menu>
```

样式保证白色色块有边框、暗色色块可辨认、选中态有双层描边，菜单宽度紧凑且不会挤压 XCross 槽位选择器。

- [ ] **步骤 4：运行绿灯与类型回归**

运行：

```bash
npm run verify:blecross
npm run test:ble
git diff --check
```

预期：Playwright 完整脚本退出码为 0，BLE 测试 21/21，diff 无空白错误。

- [ ] **步骤 5：提交源码与测试**

```bash
git add scripts/verify-blecross-recompute.js src/vue/BleCrossTrainer/index.ts src/vue/BleCrossTrainer/index.html src/vue/BleCrossTrainer/theme.ts
git diff --cached --check
git commit -m "feat(蓝牙训练): 添加3D背景色选择"
```

### 任务 3：生成生产产物并完成验证

**文件：**
- 修改：`dist/index.html`
- 替换：`dist/index.<hash>.js`

- [ ] **步骤 1：生成生产构建和搜索表**

```bash
npm run build
node scripts/gen-table.mjs
stat -c '%n %s bytes' dist/cube_cross_table.bin
```

预期：webpack 成功，搜索表为 `2661132 bytes`。

- [ ] **步骤 2：只提交实际替换的生产入口**

```bash
git add dist/index.html dist/index.*.js
git diff --cached --check
git commit -m "build(前端): 更新3D背景色选择产物"
```

提交前确认暂存区没有 `.trae/` 或未变化的 vendor/WASM/搜索表。

- [ ] **步骤 3：在最终提交状态重新验证**

```bash
npm run test:ble
npm run verify:blecross
git diff --check
git status --short
```

预期：BLE 21/21、浏览器完整回归退出码 0；工作区仅保留用户原有的 `?? .trae/`。

- [ ] **步骤 4：更新外部项目记忆**

更新 `/home/andnnl/.trae-cn/memory/projects/-dd-workspace-trae-cuber--p2-032890de98c0df235e2d/project_memory.md`，记录局部背景边界、预设颜色、持久化键、GIF 自动取色、提交号和验证结果；该文件不加入 Git。
