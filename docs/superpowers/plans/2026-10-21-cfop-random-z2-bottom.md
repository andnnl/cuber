# CFOP 27 步打乱后 z2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目按 AGENTS.md 内联执行、不使用 worktree。

**目标：** CFOP 页保留 27 步随机面转，记住“打乱后切换底色 z2”选择并让 3D、求解、播放共享起点。

**架构：** `CfopLearning` 保存独立布尔偏好；`newScramble` 在现有随机公式末尾按需追加一次 `z2`，并以完整公式同步输入框和 `twister.setup`。Worker 已接受末尾 `z2`，但返回观察坐标重标记的贴纸色，进入 3D 路线前需转回实体颜色。

**技术栈：** Vue 2、TypeScript、Three.js、Rust/WASM Worker、Playwright CLI、webpack 5。

---

## 文件职责

- `src/vue/CfopLearning/index.ts`：偏好读取/保存及随机打乱完整状态。
- `src/vue/CfopLearning/index.html`：复选框及 54 位状态说明。
- `src/vue/CfopLearning/frame-colors.ts`：Worker 观察色与 3D 实体贴纸色的 z2 转换。
- `scripts/verify-cfop-z2.js`：浏览器行为、存储、Worker 零帧回归。

### 任务 1：先使预期行为测试失败

**文件：** 创建 `scripts/verify-cfop-z2.js`

- [x] **步骤 1：测试打乱与偏好。** 打开 `?mode=cfop`，设置 `vm.autoCross = false`，点击复选框并点击“随机打乱”，断言公式的前 27 个 token 都是面转且末尾仅一个 `z2`、当前画面 `cube.serialize()` 与转换后的路线第零帧一致；切换复选框不修改当前输入及魔方状态，刷新后选择仍保留；取消勾选再次随机打乱时无 `z2`。断言例：

```js
const formula = await page.locator('.cfop-panel input[type=text]').inputValue();
const tokens = formula.split(/\s+/);
if (tokens.length !== 28 || tokens[27] !== 'z2' ||
    tokens.slice(0, 27).some(move => !/^[URFDLB](?:2|')?$/.test(move)))
  throw Error(`勾选后随机公式不是 27 步 + z2：${formula}`);
```

- [x] **步骤 2：验证红灯。** `playwright-cli open http://127.0.0.1:18084/?mode=cfop` 后运行 `playwright-cli run-code --filename=scripts/verify-cfop-z2.js`；预期失败于没有复选框。

### 任务 2：实现 27 步后 z2

**文件：** 修改 `src/vue/CfopLearning/index.ts`、`src/vue/CfopLearning/index.html`

- [x] **步骤 3：偏好与 UI。** `bottomColorZ2 = false`；`mounted()` 中用 `try { this.bottomColorZ2 = localStorage.getItem('cfopBottomColorZ2') === '1'; } catch { ... }` 读取；`saveBottomColorZ2()` 用 `try/catch` 保存 `'1'/'0'`；在“随机打乱”按钮旁加入 `v-model="bottomColorZ2" @change="saveBottomColorZ2"` 的复选框，文案与规格一致。54 位状态提示注明不自动追加。

- [x] **步骤 4：同步完整公式。** 保留 `this.world.cube.twister.scrambler()` 的 27 步，计算 `const input = this.bottomColorZ2 ? scramble + ' z2' : scramble;`，让 `this.input = input` 与 `twister.setup(input)` 使用同一个值；`invalidate()` 和自动十字流程顺序不变。`frame-colors.ts` 将 Worker 帧的 U/D、R/L 色标映射回实体颜色，3D 路线与追踪反向转换一致。

- [x] **步骤 5：构建再验绿灯。** `npm run build`；`playwright-cli run-code --filename=scripts/verify-cfop-z2.js`，预期返回 `z2:'ok'`。Worker 原帧与 3D 的色标差异经诊断并转换，未放宽播放帧断言。

### 任务 3：回归与交付

- [x] **步骤 6：现有回归。** 运行 `node scripts/test-cfop-ui.js`、`node scripts/test-cfop-contract.js`，以及 `playwright-cli run-code --filename=scripts/verify-cfop-auto.js`（脚本使用当前打开的构建地址）。
- [x] **步骤 7：检查范围。** `git diff --check` 与本次相关文件；保留已有未提交改动，不因本功能合并或推送。交付说明测试证据、当前分支和未提交状态。
