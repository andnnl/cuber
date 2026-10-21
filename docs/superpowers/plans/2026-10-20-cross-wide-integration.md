# Cross 宽转候选双界面接入实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 在当前工作区内联逐任务实现本计划。步骤使用复选框（`- [ ]`）语法跟踪进度。本项目用户明确要求不使用 worktree。

**目标：** 在 `crossf2l`、`blecross` 两处原指法推荐下方增加可取消的 `u/u'` 少 B 候选，支持正确坐标映射和播放。

**架构：** 独立 `WideCrossClient` 驱动独立 Worker，按需加载 Rust WASM 和版本化 BIN，不占用原 `CrossAnalysisClient`。共享格式校验及映射模块连接 Rust 四朝向结果与两个不同的界面预览状态；两处各自管理折叠和取消周期。

**技术栈：** TypeScript、Vue 2、webpack 5、Rust 预构建 wasm-bindgen、Node 回归测试、浏览器自动化。

---

## 文件职责

- `public/cube_cross_solve.js`、`public/cube_cross_solve_bg.wasm`：从 Rust `master` 构建产物同步，胶水与 WASM 必须同版本。
- `public/cross_wide_table.bin`：Rust 已生成的表；`public/cube_cross_wide_worker.js`：独立加载、校验和回退；`webpack.config.js`：分发静态资源。
- `src/wasm/WideCrossClient.ts`：请求 ID、超时、终止与错误传播；`src/vue/CrossF2LTrainer/wide-recommendations.ts`：结果边界、朝向及 `u/u'` 映射。
- `src/vue/CrossF2LTrainer/index.ts`、`index.html`、`theme.ts`：CrossF2L 的展开、独立列表、取消与播放。
- `src/vue/BleCrossTrainer/index.ts`、`index.html`、`theme.ts`：BLE 的展开、白底／视角变换、独立列表及原预览控件。
- `scripts/test-wide-cross.js`、`scripts/test-ble.js`、浏览器回归脚本：输入输出、共轭、生命周期、两界面与资源测试。

### 任务 1：资源和可取消的独立 Worker

- [ ] **步骤 1：写失败的资源和客户端测试。** 在 `scripts/test-wide-cross.js` 用 `fs.existsSync` 检查 `public/cross_wide_table.bin`、`public/cube_cross_wide_worker.js`，用 `assert.match` 检查胶水中的 `recommend_wide_cross_cached_js` 导出，并以 Worker 模拟断言 `cancel()` 使旧请求拒绝、`request()` 的新 ID 不接受旧帧。
- [ ] **步骤 2：运行红灯。** `node scripts/test-wide-cross.js`；预期缺宽转文件或客户端导致失败。
- [ ] **步骤 3：同步 Rust `/dd/workspace_rust/cube_cross_solve` 的 `pkg/cube_cross_solve.js`、`pkg/cube_cross_solve_bg.wasm`、`cross_wide_table.bin` 到上述 `public` 文件。** Worker 代码调用：

```js
import init, * as wasm from './cube_cross_solve.js';
// await init(new URL('./cube_cross_solve_bg.wasm', import.meta.url));
// const response = await fetch(new URL('./cross_wide_table.bin', import.meta.url));
// result = wasm.recommend_wide_cross_cached_js(facelets, new Uint8Array(await response.arrayBuffer()));
// 仅 BIN 缺失／损坏时：wasm.recommend_wide_cross_js(facelets)。
```

  实际 Worker 内必须在回退时发送阶段状态、最终返回 `id`、`ok` 和 `result`；独立客户端与已有 `CrossAnalysisClient` 一样按 ID 匹配，取消时终止 Worker，180 秒超时终止，不在主线程求解。`webpack.config.js` 的 `CopyWebpackPlugin.patterns` 追加 Worker 与 BIN。
- [ ] **步骤 4：绿灯与构建。** `node scripts/test-wide-cross.js && npm run build`；检查 `dist` 中 JS、WASM、BIN 的 SHA-256 与源文件一致。
- [ ] **步骤 5：检查新增文件范围。** `git status --short`，只添加本任务文件；不纳入既有 `README.md`、固定公式和旧构建产物的用户改动。

### 任务 2：宽转候选结构与坐标验证

- [ ] **步骤 1：先写 `scripts/test-wide-cross.js` 的边界断言。** 将 Rust 的 `F/L/B/R` bucket、`moves: ['u', "u'", 'R']`、`back_turns`、`route` 交给导出的 `parseWideRecommendations`；断言 54 字符输入、四朝向、1～8 步、至少一个 `u/u'`、仅六面转及 `u/u'`，非法输入一律拒绝而不静默删步。`relativeMove('u', 'L') === 'u'`，白底 `wideToPhysicalMove('u', true) === 'd'`，黄底不变。
- [ ] **步骤 2：红灯。** `node scripts/test-wide-cross.js`；预期函数不存在。
- [ ] **步骤 3：实现 `src/vue/CrossF2LTrainer/wide-recommendations.ts`。** 每个候选保留 `id/front/displayMoves/physicalMoves/route/depth/backTurns`；对宽转做独立白名单和 `z2` 映射；原 `Recommendation` 与 `applyFormulaFrom` 不改。测试中以 3D `twister.setup('u')` 和 `toTrainFrame` 前后状态对照验证白底共轭方向，包括 `u'`，不只检查文本替换。
- [ ] **步骤 4：绿灯。** `node scripts/test-wide-cross.js && npm run test:ble`，预期新增断言通过且原 BLE 回归不退化。

### 任务 3：CrossF2L 折叠区和播放

- [ ] **步骤 1：增加浏览器回归（先失败）。** 打开 `?mode=crossf2l`，普通推荐后断言宽转区存在、默认折叠、不请求 BIN；展开后看到四朝向或明确空态；在已返回含 `u/u'` 的候选上选中／播放，并断言主训练最优解未被重写。
- [ ] **步骤 2：运行红灯。** 用 `playwright-cli run-code --filename scripts/verify-wide-cross.js`，预期找不到折叠区。
- [ ] **步骤 3：修改 `src/vue/CrossF2LTrainer/index.ts`、`index.html`、`theme.ts`。** 独立 `wideOpen/wideBusy/wideError/wideLimited/wideRecommendations` 和 `WideCrossClient`；`toggleWide()` 只在 `solveMode === 'cross'` 调 `request(solveFacelets)`，折叠／关闭／`invalidateAnalysis()`／`beforeDestroy()` 取消；用现有 `selectSolution` 和 3D `twister` 播放 `u/u'`，宽转候选不调用只识别六面转的 `isValidRecommendation`。在普通与全屏面板复用同一个折叠区布局，朝向筛选可沿用四朝向，但不套用普通解法深度筛选。
- [ ] **步骤 4：绿灯。** 运行浏览器回归，检查在新打乱、切模式、关闭及取消期间没有旧结果，原推荐正常显示。

### 任务 4：BLECross 白底／视角、预览和发布验证

- [ ] **步骤 1：增加浏览器回归（先失败）。** `?mode=blecross`，宽转区默认折叠；黄底展开返回宽转；`z2` 白底时解法实体宽转为 `d/d'`，切 `y/y'` 后显示朝向正确；选中、步进、播放、GIF、返回起点只改变 3D 预览，不改变训练结果和 BLE 账本。折叠、换轮次及关闭时旧请求被取消。
- [ ] **步骤 2：红灯。** `playwright-cli run-code --filename scripts/verify-wide-cross.js`，预期 BLE 宽转入口不存在。
- [ ] **步骤 3：修改 `src/vue/BleCrossTrainer/index.ts`、`index.html`、`theme.ts`。** 求解输入沿用 `z2On ? toTrainFrame(analysisCoreBase) : analysisCoreBase`；`wideToPhysicalMove` 映射宽转，复用 `recommendationViewOps` 和现有预览函数，但为宽转推荐独立 `selected` 与 `source` 标识，不能写 `bestSolution/bestX/records`。普通／全屏都显示可取消的独立折叠区及「最多 8 步、有预算、非最短证明」提示。
- [ ] **步骤 4：绿灯。** 浏览器回归覆盖黄／白底、`z2`、`y/y'`、动画和取消；`npm run test:ble` 与 `npm run build` 通过。
- [ ] **步骤 5：最终审查。** `git diff --check`，核对规格每项验收；仅在用户明确要求提交功能代码时分文件精确添加，不推送、不打 APK。
