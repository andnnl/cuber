# CFOP 三维播放与蓝牙跟练实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。**本项目按 AGENTS.md 默认内联执行，不使用 worktree。**

**目标：** 将 Rust CFOP 的 Cross 至四组 F2L 求解接到独立学习页，分行播放并支持蓝牙实体魔方转错立即暂停的跟练。

**架构：** 独立 `?mode=cfop` 页拥有专属 `World` 和路线时间线；专属搜索 Worker 与轻量状态帧 Worker 调用同版本 WASM。AppShell 只把活动页经过 FollowGate 的实体事件与主动读取的状态交给该页，页面状态机负责逐动作校验、纠错和重算。

**技术栈：** Vue 2 class component、TypeScript 4.3、Three.js、webpack 5、Rust wasm-bindgen、Node assert 脚本、Playwright CLI。

---

## 文件与职责

- `public/cfop_search_worker.js`：WASM 初始化、表加载、首阶段／逐组／一键求解，单一请求应答。
- `public/cfop_timeline_worker.js`：独立 WASM，`cfop_verify_js` 为每个前缀生成并校验帧。
- `src/wasm/CfopClient.ts`：Worker 生命周期、超时、取消和迟到结果隔离。
- `src/vue/CfopLearning/route.ts`：候选和验证帧转为带阶段标签的不可变路线。
- `src/vue/CfopLearning/notation.ts`：Rust `y/y'`、六面和切片在实体、验证帧与 Cuber 3D 间的单步映射。
- `src/vue/CfopLearning/follow.ts`：实体跟练状态机；只消费本轮新事件。
- `src/vue/CfopLearning/index.ts`、`index.html`、`theme.ts`：独立世界、搜索流程、3D 动画、响应式公式 UI。
- `src/ble/app-route.ts`、`src/vue/AppShell/index.ts`、`src/vue/Setting/index.html`：路由、菜单、受控派发和跟随开关。
- `webpack.config.js`：复制两个 CFOP Worker；已有 JS／WASM／十字表／联合表继续沿用。
- `scripts/test-cfop-route.js`、`scripts/test-cfop-follow.js`、`scripts/test-cfop-contract.js`、`scripts/verify-cfop.js`：路线／状态机／WASM 契约与浏览器交互验证。

**前置约束：** 当前工作区已有宽转等未提交代码与构建产物。先执行 `git status --short`，逐项提交时只暂存本任务文件，不清理、覆盖或合并别人的改动。构建可能更新 `dist`，先记录原状并在完成时列出实际变化；不自动提交 APK、`dist` 或其他既有脏文件。用户明确不使用 worktree。

### 任务 1：确认 WASM 契约与资源可用

**文件：** 创建 `scripts/test-cfop-contract.js`；修改 `webpack.config.js`；创建两个 `public/cfop_*_worker.js`。

- [ ] **步骤 1：编写失败契约测试。** 使用 Node `assert` 读取 `public/cube_cross_solve.js`，确认四个 CFOP 导出；检查 `public/cube_cross_solve_bg.wasm`、`public/joint_table.bin`、`dist/cube_cross_table.bin` 存在；测试 webpack 输出含 `cfop_search_worker.js`／`cfop_timeline_worker.js`，并有实际 `postMessage({id, ...})` 协议。

  ```js
  for (const name of ['cfop_start_js', 'cfop_stages_js', 'cfop_auto_f2l_js', 'cfop_verify_js'])
    assert.match(glue, new RegExp(`export function ${name}\\b`));
  for (const name of ['cfop_search_worker.js', 'cfop_timeline_worker.js'])
    assert.ok(fs.existsSync(path.join(root, 'dist', name)), name);
  ```

- [ ] **步骤 2：运行 `node scripts/test-cfop-contract.js`，确认因 Worker 缺失而失败。**
- [ ] **步骤 3：参考 Rust `cfop-worker.js` 的 `ensureReady`／`ensureJoint`，将表加载与四种操作移到搜索 Worker。** 使用现有模块 URL／缓存方式初始化同一版本 WASM；联合表损坏显示明确错误或在 Worker 内受控回退，所有异常返回 `{id, error}`。帧 Worker 按如下协议执行，逐步复制 prefix，绝不在主线程循环调用 WASM：

  ```js
  const prefix = [], frames = [];
  const append = () => {
    const value = cfop_verify_js(data.input, prefix);
    frames.push({facelets: value.facelets, slots: value.slots, cross_solved: value.cross_solved});
  };
  append();
  for (const move of data.moves) { prefix.push(move); append(); }
  self.postMessage({id: data.id, frames});
  ```

- [ ] **步骤 4：在 webpack CopyWebpackPlugin 中复制两个 Worker；运行 `npm run build` 和 `node scripts/test-cfop-contract.js`，确认输出文件齐全且版本匹配。** 当前 `build` 脚本使用 Windows `set`，若 Linux shell 下失败，记录原错误并用 `npx webpack --mode=production` 验证，不顺手改原脚本。
- [ ] **步骤 5：仅提交契约测试、Worker 和 webpack 变动。** 提交信息 `feat(CFOP): 接入分阶段求解与播放帧 Worker`。

### 任务 2：请求生命周期与分阶段时间线

**文件：** 创建 `src/wasm/CfopClient.ts`、`src/vue/CfopLearning/route.ts`、`scripts/test-cfop-route.js`。

- [ ] **步骤 1：先写失败测试。** 使用既有 `typescript` 编译或脚本方式验证：Cross 首阶段完成 FR 时输出「十字」和零动作「第 1 组 F2L · FR（首阶段已完成）」；下一段完成 BL，标签第 2 组；段索引闭开区间 `[start,end)`，`frames.length === moves.length + 1`；重叠／越界和未知动作拒绝。

  ```js
  assert.deepStrictEqual(route.segments.map(x => [x.label, x.start, x.end]), [
    ['十字', 0, 2], ['第 1 组 F2L · FR（首阶段已完成）', 2, 2],
    ['第 2 组 F2L · BL', 2, 4],
  ]);
  assert.throws(() => buildRoute(stages, frames.slice(1)), /帧数/);
  ```

- [ ] **步骤 2：运行 `node scripts/test-cfop-route.js`，确认缺少路线模块而失败。**
- [ ] **步骤 3：实现路线构造。** 参考 Rust `cfop-playback.mjs` 的 `buildPlaybackSteps`／`buildPlaybackSegments`，使用 `segments.start_step/end_step/completed_slots/restored_slots`，以帧验证新完成槽位；首阶段已解槽位设零长度段；同一动作完成多槽位共享范围，不重复走动作。定义 `Route = {input: string; moves: string[]; frames: Frame[]; segments: Segment[]}`；严格动作白名单 `U/R/F/D/L/B/S` 加 `'/2` 后缀及 `y/y'`。

- [ ] **步骤 4：按 `CrossAnalysisClient` 模式实现 CFOP 双 Worker 客户端。** `search(operation,payload,timeoutMs)` 与 `timeline(input,moves)` 各有请求号、超时器；`cancel()` 终止 Worker 并 reject 挂起请求，`dispose()` 不再接收新请求；页面另有 generation，换输入／路线／模式时旧结果不得落地。
- [ ] **步骤 5：运行路线测试与 `npx tsc --noEmit -p tsconfig.json`，通过后只提交本任务文件。** 提交信息 `feat(CFOP): 构建路线分段与可取消请求客户端`。

### 任务 3：坐标和 3D 播放

**文件：** 创建 `src/vue/CfopLearning/notation.ts`、`scripts/test-cfop-notation.js`；在下一任务的页面调用，避免改共享 Twister。

- [ ] **步骤 1：先写失败坐标测试。** 基准取 Rust `cfop_verify_js(input,prefix)` 每一步的 `facelets`；分别覆盖 `F/L/B/R` 在 `y`、`y'` 之后的动作，`S/S'/S2` 在四种观察朝向中的动作，`z2` 输入和六面普通转动。检查映射后的 3D 状态与该帧等价，不允许忽略未知动作。测试 `y/y'` 只改变观察坐标，不改变实体块状态。
- [ ] **步骤 2：运行 `node scripts/test-cfop-notation.js`，确认找不到映射实现而失败。**
- [ ] **步骤 3：实现 `mapStep(move, orientation): {physicalMove?: string; nextOrientation: number; viewTurn?: string; requiresPhysicalSnapshot: boolean}`。** `y` 为观察朝向 `+1`，`y'` 为 `-1`，面转查 Rust `turnAnimation` 的四朝向表，切片按旋转后的中层轴／方向实现；Cuber `Twister.push` 不支持的动作先在专用适配层分解为经验证的等价动画，无法等价则抛异常拒绝路线，不静默跳过。

  ```ts
  if (move === 'y' || move === "y'")
    return {nextOrientation: (orientation + (move === 'y' ? 1 : 3)) % 4,
      viewTurn: move, requiresPhysicalSnapshot: false};
  const face = move[0];
  if (!/^[URFDLBS](2|')?$/.test(move)) throw new Error(`不支持的动作: ${move}`);
  ```

- [ ] **步骤 4：跑坐标测试和 `npx tsc --noEmit -p tsconfig.json`，对 Rust 的验证帧逐步比对。** 若现有 3D 无法动画重放某切片，先实现经验证的专用中层动画，再通过该断言；不能以“最终状态看似相同”放过中间帧。
- [ ] **步骤 5：只提交适配器和测试。** 提交信息 `feat(CFOP): 对齐 Rust 动作与三维播放坐标`。

### 任务 4：独立学习页、导航与阶段 UI

**文件：** 创建 `src/vue/CfopLearning/index.ts`、`index.html`、`theme.ts`；修改 `src/ble/app-route.ts`、`src/vue/AppShell/index.ts`、`src/vue/Setting/index.html`；创建 `scripts/verify-cfop.js`。

- [ ] **步骤 1：先写浏览器失败验证。** 打开 `?mode=cfop`，输入 `R U R' F U F'`，点击「搜索首阶段」，选择候选与后续逐组／一键路径；断言「十字」「第 1 组 F2L · 槽位」各占独立行，手机视口不竖排单字，逐步／整段／回到起点 3D 状态与帧一致。
- [ ] **步骤 2：先运行 `playwright-cli run-code --filename scripts/verify-cfop.js`，确认路由或控件缺失而失败。** 测试入口需使用实际运行中的本地服务；无服务先按项目已有验证脚本启动 webpack dev server。
- [ ] **步骤 3：注册 `cfop` 路由、菜单项和 AppShell 组件。** 页面单独创建 `World`、`PreferanceData`、`PaletteData` 与 `<viewport>`；显示首阶段、逐组和一键路径候选，设置搜索取消、超时和重试。候选只能通过 `buildRoute` 和帧验证后进入播放器，旧 generation 结果不能覆盖当前路线。

  ```ts
  const id = ++this.generation;
  const candidates = await this.client.search('start', {input: this.input, mode: this.mode,
    maxSolutions: 5, maxDepth: this.startDepth}, this.timeLimit * 1000);
  if (id !== this.generation || !this.appActive) return;
  this.candidates = candidates;
  ```

- [ ] **步骤 4：实现公式行与播放控制。** 每段各一行，当前动作高亮、点击跳阶段起点，空动作行只显示「已完成」；手机 CSS 用 `overflow-wrap: anywhere` 配合 `white-space: normal`，标签独占行、动作序列按 token 换行；3D 固定在上方可见。播放调用任务 3 的映射与 `twister.push`；暂停／跳步先 `tweener.finish()`，然后参考 `BleCrossTrainer.syncScene` 的 `cube.reset()`、`cube.stick(FACELET_TARGETS[i][0], FACELET_TARGETS[i][1], frame.facelets[i])` 思路直接绘制目标验证帧，并恢复当前观察朝向。不可对任意 54 位输入调用从还原态开始的 `twister.setup(prefix)`。每次定位后用 `cube.serialize()` 与帧断言。
- [ ] **步骤 5：运行浏览器测试、`npx tsc --noEmit -p tsconfig.json`、`npx webpack --mode=production`。** 只提交本任务源码和脚本，提交信息 `feat(CFOP): 添加分行公式与三维阶段播放器`。

### 任务 5：蓝牙起点与纠错状态机

**文件：** 创建 `src/vue/CfopLearning/follow.ts`、`scripts/test-cfop-follow.js`；修改 `src/vue/AppShell/index.ts`、`src/vue/CfopLearning/index.ts`／`index.html`。

- [ ] **步骤 1：先写失败状态机测试。** 用真实 `LinkEvent` 形状模拟新 MOVE、recovered MOVE、重复 serial、旧 generation 快照、正确 MOVE、错误 MOVE、逆转恢复、断线和路线更换。断言起点不相同拒绝启动；错误动作保留实际帧且光标不进；逆转后重新等待原预期；`y` 等待手动确认；不可验证 `S` 阻止蓝牙跟练。

  ```js
  assert.equal(startFollow(route, mismatchedSnapshot).status, 'blocked');
  const wrong = reduceFollow(start, {type:'move', move:'U', serial:7});
  assert.equal(wrong.status, 'paused');
  assert.equal(wrong.cursor, start.cursor);
  assert.equal(reduceFollow(wrong, {type:'move', move:"U'", serial:8}).status, 'ready');
  ```

- [ ] **步骤 2：运行 `node scripts/test-cfop-follow.js`，确认状态机缺失而失败。**
- [ ] **步骤 3：实现纯状态机。** `startFollow(route, snapshot)` 先验证完整实体面贴纸和路线帧 0；`reduceFollow(state,event)` 用实体状态推演新动作、serial／generation 去重，只有验证状态等于预期下一帧才推进。错转进入 `paused` 且保留实体状态；当实体返回最后确认帧后恢复 `ready`；`resetFromPhysical()` 使旧路线失效、以当前帧重启搜索。`y/y'` 手动确认后更新坐标；无法由设备状态验证的切片候选显示「仅 3D 播放」。
- [ ] **步骤 4：AppShell 只在 `cfop` 活动且 following 打开时向 `handlePhysicalEvent` 派发 MOVE 与 FACELETS；`onSessionSnapshot` 给页面连接状态，不直接据旧状态推进。** “读取实体起点”主动调用已注入的 `CubeSession.requestFacelets()`，以请求代号／连接 generation 接受新快照；断线和缺帧暂停。切页或关闭跟随后不处理 MOVE；不得影响 BLECross 的现有分支。
- [ ] **步骤 5：运行状态机测试、`npm run test:ble`、浏览器跟练模拟测试和类型检查；只提交本任务文件。** 提交信息 `feat(CFOP): 增加蓝牙逐动作跟练与纠错`。

### 任务 6：端到端验收与交付

**文件：** 完善 `scripts/verify-cfop.js`、`scripts/test-cfop-contract.js`；必要时只修对应功能源码。

- [ ] **步骤 1：增加回归场景。** XCross／XXCross 首阶段的已完成槽位；一键候选同时完成两槽；含 `y/y'`／切片候选；搜索取消、超时及切页迟到结果；实体起点不符、错转／逆转／重算、断连和跟随开关；手机 390px 布局。
- [ ] **步骤 2：先运行新增场景，定位真实失败；逐项修复到全部通过。** 搜索预算内无候选应显示有边界的空结果，不当作程序崩溃。
- [ ] **步骤 3：执行 `node scripts/test-cfop-route.js`、`node scripts/test-cfop-follow.js`、`node scripts/test-cfop-notation.js`、`node scripts/test-cfop-contract.js`、`npm run test:ble`、`npx tsc --noEmit -p tsconfig.json`、`npx webpack --mode=production` 和 `playwright-cli run-code --filename scripts/verify-cfop.js`；逐条记录退出码与失败数。**
- [ ] **步骤 4：用 `git diff --check`、`git status --short` 核对仅本功能文件，整理构建导致的 `dist` 差异；提交本任务测试／修复文件，不推送、不发布 APK（除非用户另行要求）。** 提交信息 `test(CFOP): 覆盖阶段播放与蓝牙纠错回归`。

## 自检与执行约定

对照设计规格：首阶段／逐组／一键、分行槽位标注、独立 3D、逐帧一致性、严格实体起点、错转暂停、坐标确认、切片禁跟练、断线与取消、手机端回归分别落在任务 1—6。实现时不要依赖当前未提交宽转改动的中间状态；先确认资源版本与构建基线。**执行方式固定为内联执行**，在当前工作区分批完成并在阶段节点报告结果；不调用子代理，不创建 worktree。
