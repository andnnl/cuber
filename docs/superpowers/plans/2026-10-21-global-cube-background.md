# 全局 3D 背景色与界面覆盖实现计划

> **面向 AI 代理的工作者：** 按用户偏好在当前工作区内联执行，不创建 worktree，不使用子代理。使用 executing-plans 分批执行以下复选框任务；每批后验证并报告。

**目标：** 全局背景色可供各 3D 页面跟随，各页面可独立覆盖；固定公式与 BLE Cross 共用设置。

**架构：** 独立的 `BackgroundStore` 管理持久化、迁移、校验与订阅；AppShell 根据当前路由生成 CSS 变量，共享 Viewport 的透明画布容器使用变量。BLE Cross 自有画布背景和固定公式 prop 都读取同一作用域。全局菜单展示全局色与当前界面覆盖。

**技术栈：** TypeScript、Vue 2、Vuetify、Three.js、Node assert、现有浏览器验证脚本。

**设计规格：** `docs/superpowers/specs/2026-10-21-global-cube-background-design.md`。

---

## 文件结构

- 创建 `src/vue/background-store.ts`：唯一颜色模型，提供 `globalColor`、`mode`、`customColor`、`effective`、写入、订阅与旧值迁移；不触碰魔方数据。
- 创建 `scripts/test-background-store.js`：不启动浏览器的边界、迁移、持久化与事件测试。
- 修改 `src/vue/AppShell/index.ts`、`index.html`：创建 store，向设置菜单／BLE Cross 注入，并在当前路由上声明有效颜色 CSS 变量；切页刷新变量。
- 修改 `src/vue/Viewport/index.html`：将变量用到画布容器；不修改 WebGL renderer。
- 修改 `src/vue/Setting/index.ts`、`index.html`：全局选择器、恢复默认、当前页面跟随／自定义及颜色选择器。
- 修改 `src/vue/BleCrossTrainer/index.ts`、`index.html` 和 `FixedCases/index.html`：原有入口显示／更新 BLE Cross 同一作用域，固定案例从现有 prop 取有效色。
- 修改 `src/vue/CfopLearning/theme.ts`：CFOP 画布区域使用变量，操作面板和其余浅灰背景不变。
- 创建 `scripts/verify-background-ui.js`：浏览器端验证切页、BLE 固定案例、刷新、GIF 背景与隔离。

**现有改动提醒：** 上述 AppShell、BLE Cross、CFOP 文件当前有其他未提交改动。先检查目标段落；只改背景相关行，不覆盖、不暂存其他变更。首次提交前先用 `git diff --cached` 精确检查暂存内容；若无法分离，暂停提交并说明。

### 任务 1：颜色模型与旧设置迁移

**文件：** 创建 `src/vue/background-store.ts`、`scripts/test-background-store.js`。

- [ ] **步骤 1：先写失败测试。** 使用可注入的 `Storage` 兼容内存桩，断言 `normalize('#abcdef') === '#ABCDEF'`、非法值为 `null`；没有设置时 `effective('blecross', '#FFFFFF') === '#FFFFFF'`，CFOP 默认 `#EEF1F7`；全局色影响跟随页面；BLE 覆盖不影响 CFOP；固定公式经 `blecross` 作用域取得同色；旧 `bleBackgroundColor` 有效时迁入自定义，切回跟随并重建 store 后不会被旧键再次覆盖；`setItem` 抛错时当前会话仍更新。

```js
const assert = require('assert');
const { BackgroundStore, normalize } = require('../.tmp/background/background-store.js');
const values = new Map([['bleBackgroundColor', '#aabbcc']]);
const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
const bg = new BackgroundStore(storage);
assert.strictEqual(normalize('#abcdef'), '#ABCDEF');
assert.strictEqual(normalize('red'), null);
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#AABBCC');
bg.setMode('blecross', 'global');
assert.strictEqual(new BackgroundStore(storage).effective('blecross', '#FFFFFF'), '#FFFFFF');
bg.setGlobal('#123456');
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#123456');
bg.setCustom('blecross', '#665544');
assert.strictEqual(bg.effective('blecross', '#FFFFFF'), '#665544');
assert.strictEqual(bg.effective('cfop', '#EEF1F7'), '#123456');
```

- [ ] **步骤 2：运行测试确认失败。** `node scripts/test-background-store.js`；预期因未编译或缺少模块失败。
- [ ] **步骤 3：实现纯存储模块。** 采用每个实例内的内存状态镜像；只有 `getItem`、`setItem`、`removeItem` 是可失败的边界，使用 `try/catch`，不能让异常阻断显示；`setGlobal(null)` 删除全局键；只有新模式键缺失时迁移旧 BLE 键，写入新模式与颜色。`subscribe` 返回取消函数；在浏览器由 AppShell 注册 `storage` 监听并调用 store 的 `reload()`，写入后主动通知当前标签页。作用域只允许已经定义的 3D 路由名，固定案例映射到 `blecross`。具体公开签名：

```ts
export type BackgroundMode = 'global' | 'custom';
export function normalize(value: string | null): string | null;
export class BackgroundStore {
  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>);
  get globalColor(): string | null;
  mode(scope: string): BackgroundMode;
  customColor(scope: string): string | null;
  effective(scope: string, fallback: string): string;
  setGlobal(color: string | null): void;
  setMode(scope: string, mode: BackgroundMode): void;
  setCustom(scope: string, color: string): void;
  reload(): void;
  subscribe(listener: () => void): () => void;
}
```

- [ ] **步骤 4：编译并验证模型。** 运行 `./node_modules/.bin/tsc src/vue/background-store.ts --target es2019 --module commonjs --skipLibCheck --types webpack-env --outDir .tmp/background`，然后 `node scripts/test-background-store.js`；预期全部断言通过。`--types webpack-env` 避免当前 TypeScript 4.3 解析仓库里较新的 Node 声明失败。补充订阅／取消、无效存储值、抛错桩与重新加载断言。
- [ ] **步骤 5：提交该独立新增模块和测试。** 只暂存这两个文件，检查暂存差异后 `git commit -m 'feat(背景色): 添加全局与界面隔离的设置模型'`。

### 任务 2：AppShell、透明画布与全局入口

**文件：** 修改 `src/vue/AppShell/index.ts`、`index.html`、`src/vue/Viewport/index.html`、`src/vue/CfopLearning/theme.ts`、`src/vue/Setting/index.ts`、`index.html`；创建 `scripts/verify-background-ui.js`。

- [ ] **步骤 1：先编写页面失败验证。** 在已有 `scripts/verify-global-ble.js` 的浏览器驱动方式上，打开 playground 和 `?mode=cfop`；先记录实际画布父容器的 `getComputedStyle(...).backgroundColor`，再在设置菜单选全局色 `#123456`，预期两个画布都变色而 `.cfop-panel` 保持原色；当前页选择自定义 `#654321`，切到另一页仍是全局色，回来仍是覆盖色。

```js
const color = async page => page.locator('[data-cube-background]').evaluate(el => getComputedStyle(el).backgroundColor);
// 设置全局色后：assert.strictEqual(await color(page), 'rgb(18, 52, 86)');
// 当前页自定义后：assert.strictEqual(await color(page), 'rgb(101, 67, 33)');
```

- [ ] **步骤 2：运行页面验证确认失败。** 启动本地 webpack 服务（使用 `NODE_OPTIONS=--openssl-legacy-provider ./node_modules/.bin/webpack server --mode=development --host=127.0.0.1 --port=18082`），另一个终端运行 `playwright-cli run-code --filename scripts/verify-background-ui.js`；预期找不到新控件或 `data-cube-background`。
- [ ] **步骤 3：AppShell 接入 store。** `readonly background = new BackgroundStore(window.localStorage)`；`provide` 增加 `cubeBackground: this.background`；用响应式 `backgroundVersion` 与订阅回调更新 `effectiveBackground`。路由优先采用 `activeMode`；CFOP fallback `#EEF1F7`，BLE Cross `#FFFFFF`，其他路由使用不改变旧观感的白色；`beforeDestroy` 取消订阅和 `storage` 监听。模板根容器绑定 `:style="{'--cube-background': effectiveBackground}"`。不要使用 `body` 或 `.v-application` 选择器。

```ts
get effectiveBackground(): string {
  void this.backgroundVersion;
  const fallback = this.activeMode === 'cfop' ? '#EEF1F7' : '#FFFFFF';
  return this.background.effective(this.activeMode, fallback);
}
```

- [ ] **步骤 4：画布与设置菜单接入。** `Viewport` 根元素加 `data-cube-background` 与 `background-color: var(--cube-background, transparent)`；CFOP `.cfop-cube` 也使用相同变量以填满画布区，不改 `.cfop-panel`。Setting 注入 `cubeBackground`，从 `getActiveMode()` 取得作用域，读取有效值时用响应式版本或订阅刷新；设置菜单控件分别调用 `setGlobal`、`setMode`、`setCustom`，全局「恢复默认」调用 `setGlobal(null)`。模式为跟随时当前页面颜色入口禁用并显示有效色值；改到自定义时以当前有效色作初始覆盖，防止跳成旧色。菜单对 `bleconnect` 隐藏当前页面选项。

```html
<div ref="canvas" data-cube-background style="background-color: var(--cube-background, transparent)"></div>
<input data-global-bg type="color" :value="globalColor || '#FFFFFF'" @input="setGlobalBackground($event.target.value)">
<button data-global-bg-reset @click="resetGlobalBackground">恢复默认</button>
<select data-page-bg-mode :value="pageBackgroundMode" @change="setPageBackgroundMode($event.target.value)">
  <option value="global">跟随全局</option><option value="custom">本界面自定义</option>
</select>
<input data-page-bg type="color" :disabled="pageBackgroundMode !== 'custom'" :value="pageBackgroundColor" @input="setPageBackground($event.target.value)">
```

- [ ] **步骤 5：运行局部验证。** `npm run build`、`playwright-cli run-code --filename scripts/verify-background-ui.js`；预期跨页、刷新和 CFOP 面板不变。测试同标签切页与另一标签的 `storage` 事件，确认缓存中的组件返回时仍重新呈现当前作用域。
- [ ] **步骤 6：精确检查并提交。** 对已有未提交文件使用按块暂存，确认 `git diff --cached` 只含本任务背景改动，再提交 `feat(背景色): 增加全局画布背景及当前界面设置`；若无法隔离混合块，不提交并告知用户，不丢弃已有工作。

### 任务 3：BLE Cross 与固定公式共用覆盖色

**文件：** 修改 `src/vue/BleCrossTrainer/index.ts`、`index.html`、`src/vue/BleCrossTrainer/FixedCases/index.html`、`scripts/verify-background-ui.js`、`scripts/verify-blecross-fixed-visual-options.js`。

- [ ] **步骤 1：先扩充失败测试。** 以旧 `bleBackgroundColor='#112233'` 打开 BLE Cross，期待画布及固定公式均显示 `rgb(17, 34, 51)`；在固定公式中选择 `#445566` 后关闭弹层，主画布同步；切回跟随全局再刷新，仍不恢复旧 `#112233`；设置全局色只影响跟随页面。选择色后 3D 序列化状态不变。
- [ ] **步骤 2：运行确认失败。** `playwright-cli run-code --filename scripts/verify-background-ui.js`；预期模式控件或固定公式同步断言失败。
- [ ] **步骤 3：BLE 页面注入同一 store，替代直接读写旧键。** `backgroundColor` 始终代表 `store.effective('blecross', '#FFFFFF')`；菜单及 BLE 控件变更时通过 store 订阅同步值，离开或销毁时取消订阅；`setBackgroundColor` 只修改 BLE Cross 的自定义色（若还处于跟随则先切到自定义）。BLE 控件增加「跟随全局／自定义」，从跟随切自定义时先复制当前有效色。固定公式继续用 `:background="backgroundColor"`、`@set-background="setBackgroundColor"`，不要再创建独立存储键。删掉 `mounted` 中主动把默认值写入旧键的逻辑。

```ts
setBackgroundColor(value: string): void {
  this.background.setCustom('blecross', value);
  this.backgroundColor = this.background.effective('blecross', '#FFFFFF');
  this.world.dirty = true;
}
```

- [ ] **步骤 4：测试 GIF 使用实际有效色。** 保留现有 `gifBackColor()` 从画布区域读取背景的路径；验证跟随全局与自定义两种颜色录入时的 `setClearColor` 参数一致。固定案例独立 canvas 的背景 prop 始终使用同一有效色。调整现有 `verify-blecross-fixed-visual-options.js`：将对旧 `bleBackgroundColor` 持续写入的断言改为新 `cubeBackground.blecross.color` 与 mode 断言，同时仍检查旧键迁移。
- [ ] **步骤 5：回归并提交。** `npm run build`、`playwright-cli run-code --filename scripts/verify-background-ui.js`、`playwright-cli run-code --filename scripts/verify-blecross-fixed-visual-options.js`。只暂存本任务背景相关行；若与现有未提交功能混合不可拆分，不强行提交。

### 任务 4：总验收与文档

**文件：** 修改 `README.md` 中设置说明；检查 `scripts/verify-background-ui.js` 和现有回归脚本。

- [ ] **步骤 1：增加用户说明。** 写清「全局默认／当前界面自定义」优先级、固定公式与 BLE Cross 共用、旧颜色自动保留、恢复默认不删除界面覆盖。只改背景相关段落。
- [ ] **步骤 2：验证。** `npm run build`；运行新增背景验证，以及 `playwright-cli run-code --filename scripts/verify-global-ble.js`、`playwright-cli run-code --filename scripts/verify-cfop.js`（CFOP 脚本写死端口 18084，需先在该端口启动同一版本服务）。用手机视口复查画布底色与面板可读性、色块菜单可点击、页面切换不闪前一页颜色；记录实际运行命令和结果，未能运行的测试单独说明。
- [ ] **步骤 3：仅提交可准确隔离的 README 与测试改动。** 检查 `git diff --cached --check` 与暂存文件清单；不推送、不打包 APK，除非用户另行要求。

## 自检对应关系

规格中的全局默认及界面覆盖对应任务 1–2；固定案例共享与旧值迁移对应任务 1、3；切页、跨标签、存储异常对应任务 1–2；画布与面板分离、GIF、暗黑不变对应任务 2–4。实施中维持 WebGL 透明，不对 `body` 或全局主题写色。
