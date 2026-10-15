# 指法推荐与多组十字训练实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。本项目用户已指定内联执行，不创建 worktree。

**目标：** 在 Cross/F2L 页实现 Cross 四观察正面的指法推荐，以及 X/XX/XXXCross 求解、播放、目标还原与剩余槽位预判判定。

**架构：** Rust/WASM 对同一轮次 54 字符状态求解；独立 Worker 执行可取消的 Cross 推荐与多组搜索。TypeScript 把物理公式、观察公式、已还原槽位和指法分保存在独立结果模型中；训练页只在用户主动打开推荐时评分，播放总使用物理公式。

**技术栈：** Rust + wasm-bindgen、TypeScript/Vue 2、Web Worker、Three.js、Node assert、webpack、Android 离线资产。

**执行记录（2026-10-15）：** 任务 1～4 已在前序提交实现；任务 5 的训练交互、目标判定和浏览器回归，以及任务 6 的离线资源复制检查已执行。`npx tsc --noEmit` 仍被原有 `src/wasm/cube_cross_solve.d.ts` 的 TS2436 阻断；未在真实 Android 设备上验证新版 APK，因此本计划的原始勾选项保留为执行步骤而非最终验收声明。

---

## 文件与职责

- `/dd/workspace_rust/cube_cross_solve/src/lib.rs`：为 Cross 推荐接受 54 字符状态，保留旧公式入口；`tests/cross_recommend.rs`、`tests/parse_check.rs`：公式/状态等价性与非法状态测试；`pkg/*`：重建产物。
- `public/cube_cross_solve.js`、`public/cube_cross_solve_bg.wasm` 和声明文件：同步更新 Rust 构建结果；`public/cube_cross_worker.js`：已有基础求解操作；新建 `public/cube_cross_analysis_worker.js`：可终止的推荐与联合表搜索。
- `src/wasm/WasmSolver.ts`、`src/wasm/CrossAnalysisClient.ts`：统一基础求解与高级任务启动/终止；`src/vue/CrossF2LTrainer/recommendations.ts`：朝向、去重、评分结果及物理公式映射；`src/vue/CrossF2LTrainer/training-targets.ts`：目标槽位、剩余预判槽位与已还原判定。
- `src/vue/CrossF2LTrainer/index.ts`、`index.html`、`theme.ts`：训练状态、列表选择/播放/预判与页面内展开、全屏结果 UI；`webpack.config.js` 和 Android 资源同步脚本：WASM/表/Worker 离线打包。
- `scripts/test-cross-analysis.js`、`scripts/verify-crossf2l-analysis.js`：纯逻辑和浏览器交互验证；`package.json`：测试命令。

## 任务 1：Cross 推荐支持真实状态

- [ ] **步骤 1：先写失败测试。** 在参考项目 `tests/cross_recommend.rs` 加入从 `CubeState::solved()` 依次执行 R、U 得到的 54 字符串与公式 `"R U"` 解析为 `CrossState` 后推荐结果对比：`min_depth` 和每桶的 `front/depth/moves/physical_moves` 一致；非法长度或中心不合法返回错误。纯 Rust 测试针对解析函数，WASM 导出另在构建后验证。
- [ ] **步骤 2：运行** `cargo test --test cross_recommend --test parse_check`，确认新测试因状态入口不存在而失败。
- [ ] **步骤 3：最小实现。** 在 `src/lib.rs` 提取可由 Rust 测试调用的 `pub fn parse_recommend_cross_state(facelets: &str) -> Result<CrossState, String>`，并新增 WASM 导出 `recommend_cross_state_js(facelets: &str) -> Result<JsValue, JsValue>`；调用已有 `CrossState::from_cube_state` 的 54 字符解析路径，先验证长度、颜色和中心（该解析器原本对坏输入会静默按已还原态返回），再与旧入口共同调用 `recommend_cross(table, &state, 8)`。不得将状态串拆为公式 token。
- [ ] **步骤 4：运行** `cargo test --test cross_recommend --test parse_check`，确认公式/状态同解和非法输入拒绝；运行 `wasm-pack build --target web --out-dir pkg --release`，检查 `pkg/cube_cross_solve.js` 命名导出包含 `recommend_cross_state_js`。
- [ ] **步骤 5：只提交本任务的 Rust 源码与测试**：`git add src/lib.rs tests/cross_recommend.rs tests/parse_check.rs && git commit -m "feat: 支持状态输入的十字指法推荐"`（在参考仓库执行，保留原有未提交 README、HTML 与模块文件）。

## 任务 2：物理与观察公式的结果模型

- [ ] **步骤 1：先在 `scripts/test-cross-analysis.js` 写断言。** 用 TypeScript 包的 `transpileModule` + Node `.ts` require hook 载入纯逻辑模块，例如 `relativeMove("R'", "L") === "F'"`、`physicalMove(relativeMove("R'", "L"), "L") === "R'"`；对 F/L/B/R × 18 个面转测试双向映射、同物理公式不同槽位去重和评分排序。使用 `node scripts/test-cross-analysis.js` 观察缺模块失败。
- [ ] **步骤 2：在 `recommendations.ts` 定义** `Recommendation { id, front, displayMoves, physicalMoves, slots, sourceIndices, route, depth, offset }`；移植参考项目 `multi-view-grip.mjs` 的 `moveInView/relativeMove/slotInView/recommendExistingViews`，保留 `physicalMoves`；Cross 的 Rust `physical_moves` 标记 `serde(skip)`，故 JS 结果必须用 `relativeMove(displayMove, front)` 反算并验证后播放。简版指法按参考 `simpleGripInstruction` 截去「；动作后左…」后缀，完整版原样显示。
- [ ] **步骤 3：运行测试和** `npx tsc --noEmit`，确认双向映射、去重和类型通过；提交模型与测试。

## 任务 3：多槽位目标与独立判定

- [ ] **步骤 1：先写纯逻辑测试。** 在 `scripts/test-cross-analysis.js` 构造 `slots=["FR","BL"]`，断言可预判集合为 FL/BR；更换成 FR/FL 时清空原 BL 预判；XXX 的三槽位仅余一槽。构造「十字已好但一组角块扭转」的 54 字符状态，断言目标还原检查失败。
- [ ] **步骤 2：运行** `node scripts/test-cross-analysis.js` 确认新断言失败。在 `training-targets.ts` 提供 `remainingSlots(solvedSlots)`、`predictionMustReset(previousSlot, nextSlots)` 与基于面贴纸/中心的 `verifySolvedTargets(facelets, slots)`；全体四条 D 棱和指定 F2L 角/棱均按目标位置与朝向判断。
- [ ] **步骤 3：跑测试和** `npx tsc --noEmit`；提交目标语义与测试。

## 任务 4：WASM 资源、独立 Worker 与取消

- [ ] **步骤 1：先在 `scripts/test-cross-analysis.js` 加 Worker 生命周期测试**：发起慢请求后取消，旧 ID 结果不落地；另用浏览器检查静态资源失败提示。运行并确认失败。
- [ ] **步骤 2：将参考 `pkg/cube_cross_solve.js`、`cube_cross_solve_bg.wasm` 及 `.d.ts` 成套同步到 `public/`。在 `public/cube_cross_worker.js` 增加 `solveMultiCross` 基础操作。新建 `public/cube_cross_analysis_worker.js`，`init` 时加载同版 Cross 表，XX/XXX 优先校验/加载 `joint_table.bin`，失败时仅 Worker 内生成；`recommendCross` 调用新状态入口，`scoreExisting` 评分已有 X/XX/XXX 候选。
- [ ] **步骤 3：在 `CrossAnalysisClient.ts` 封装** `request(id, kind, payload)`、`cancel()` 和 `dispose()`；取消必须 `worker.terminate()` 并 reject 所有 pending，后续请求创建新 Worker。`WasmSolver.ts` 导出多组解法 `{moves,slots,length}`，不在 Solver 层丢掉目标槽位标签。
- [ ] **步骤 4：实测旧 `dist/cube_cross_table.bin` 加载新版 WASM。** 如不兼容则同步参考项目 `cross_table.bin` 并更新 `IndexedDBStorage` 使用的缓存版本键；联合表复制到 `public/joint_table.bin`，将生成/缓存键按新 WASM 版本隔离。网络失败时保持基本 UI，不能在主线程回退重搜索。
- [ ] **步骤 5：运行** `npx tsc --noEmit`、`node scripts/test-cross-analysis.js`、`NODE_OPTIONS=--openssl-legacy-provider npx webpack --mode=production`；提交本任务资源与客户端。

## 任务 5：训练页四模式与指法推荐 UI

- [ ] **步骤 1：浏览器验证脚本 `scripts/verify-crossf2l-analysis.js` 先检查**模式选项、XX 两槽与 XXX 三槽约束、点击推荐才出现搜索、前 4/全部切换、全屏返回保留选择、简单/完整说明切换以及旧结果取消，先运行 `playwright-cli run-code --filename scripts/verify-crossf2l-analysis.js` 看到断言失败。
- [ ] **步骤 2：在 `index.ts` 引入状态快照。** `solve()` 从 `world.cube.serialize()` + `mapBaseOpsFacelets` 构建 `{facelets, mode, slots, generation}`；模式/槽位/基准视角/打乱/页面退出会 `generation++` 且取消 Worker。XX/XXX 基础搜索返回结构化候选并设真实 `slots`；X 的 `ALL` 同样保留返回的槽位。推荐按钮才触发 Cross 穷尽或已有多组候选四朝向评分。
- [ ] **步骤 3：把选中项统一为结构化结果**，保留普通前四项入口；`currentSolutionSteps` 读取 `physicalMoves`。切换选中项时重新计算剩余预判槽位、清理不兼容预测并更新高亮；`play/stepForward/stepBack` 不用 `displayMoves`。播放完成时调用 `verifySolvedTargets` 与原有角/棱预判比较，分别显示目标和预判判定。播放期间仍禁止切换。
- [ ] **步骤 4：在 `index.html/theme.ts` 加**四模式与多选槽位、指法按钮、下方独立滚动面板、前 4/全部、F/L/B/R 和深度筛选、简单/完整版切换及 Vuetify 全屏对话框。移动端普通面板不能盖住魔方，收纳态只显示选中解法摘要；全屏与普通面板共用单份结果状态。
- [ ] **步骤 5：运行** `npx tsc --noEmit`、上述浏览器脚本及 `NODE_OPTIONS=--openssl-legacy-provider npx webpack --mode=production`；提交训练 UI 与测试。

## 任务 6：离线资源和端到端回归

- [ ] **步骤 1：在 `scripts/test-android-app.js` 增加断言**，检查 APK/www 资产含新版 WASM、分析 Worker、联合表，并能在 Android WebView 里以 file 资源路径加载。先运行 `npm run test:android` 确认缺资源失败。
- [ ] **步骤 2：在 `webpack.config.js` 的 CopyWebpackPlugin 加入** `public/cube_cross_analysis_worker.js`、`public/joint_table.bin`，并核对既有 Android 构建脚本的 www 同步清单。静态路径必须适配 webpack dev server、生产站点及 APK。
- [ ] **步骤 3：分别在桌面窄视口和 Android 离线 WebView 验证** 54 字符实体起点、z2/y/y'、XX/XXX `ALL` 与固定槽位、选择/播放/预判、Worker 取消。运行 `npm run test:ble`、`npm run test:android`、`npm run build`（若 Linux shell 下 `set` 不生效，改用前述 webpack 命令）。
- [ ] **步骤 4：检查** `git diff --check`、`git status --short`，只提交本功能文件，保留用户原有 README、`.superpowers/` 与 `.trae/`；记录测试命令、耗时、失败限制，不发布 App 或推送仓库（用户本轮没有授权）。

## 规格覆盖与边界

任务 1/2 覆盖状态输入与朝向；任务 3/5 覆盖完整 0/1/2/3 组判定和预判；任务 4/6 覆盖可取消 Worker、版本资源和 Android 离线；任务 5 覆盖普通/全屏共享结果、前四/全部与说明详略。任务只限 Cross/F2L 页与必要的参考求解器 API，不修改 BLECross 实时训练。
