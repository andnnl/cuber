# 无缝 OP 训练实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 内联逐任务执行此计划。步骤使用复选框（`- [ ]`）跟踪进度。本项目不使用 worktree；不要调度子代理。

**目标：** 根据 OLL 前贴纸预判其执行后的 PLL，随机覆盖 21 种 PLL，支持 F/R、L/F 两个六格窗口、真实贴纸箭头与自定义 OLL。

**架构：** 独立的案例生成、贴纸身份追踪、窗口适配及训练状态模块；Vue 页面消费明确的数据模型，现有六格目录负责 PLL 验证。将核心计算与 Three.js 渲染隔开，箭头通过既有视口投影到屏幕坐标。

**技术栈：** TypeScript 4.3、Vue 2、Three.js、`TwistNode`、现有 `PllTraining` / `matchPllSix`、Node `assert`、webpack 5。

**规格：** [无缝 OP 设计](../specs/2026-10-27-seamless-op-training-design.md)。直接在当前 `/dd/workspace_trae/cuber` 执行；保留已有未跟踪文件。每个任务先红后绿，只提交该任务的明确文件，不推送、不发布。

## 文件边界

| 路径 | 职责 |
| --- | --- |
| `src/ble/op-formula.ts` | 严格校验、展开 OLL/PLL 公式，识别起手 AUF，生成逆序 |
| `src/ble/op-case.ts` | 等概率抽 PLL、抽 OLL、抽 y；构造并模拟核验案例 |
| `src/ble/op-sticker-trace.ts` | 保持 54 张贴纸身份，输出 OLL 每一步位置与来源映射 |
| `src/ble/op-window.ts` | F/R、L/F 索引、关系、目录匹配与推荐视角 |
| `src/ble/op-training.ts` | 答题、计时、线索、重试、记录及复盘的纯状态 |
| `src/vue/SeamlessOp/index.ts`, `index.html`, `index.css`, `sticker-overlay.ts` | 3D 页面、两套六格、轨迹叠层和动画播放 |
| `src/ble/app-route.ts`, `src/vue/AppShell/index.ts`, `src/vue/AppShell/index.html` | `?mode=seamlessop` 入口、菜单及禁用实体动作改写虚拟题目 |
| `package.json`, `scripts/test-op-*.cjs`, `scripts/verify-op-ui.js` | 核心测试命令与浏览器回归 |

为避免 `PllObservation/index.ts` 再膨胀，只复用其来源数据和纯函数，不从页面组件调用私有方法。新增页面的本地存储键以 `seamlessOp` 开头，不与 `pll6` 旧记录混写。

### 任务 1：解析与验证公式

**文件：** 创建 `src/ble/op-formula.ts`、`scripts/test-op-formula.cjs`；修改 `package.json` 的 `test:op` 脚本。

- [ ] 写失败测试：从 `algs.json` 取 OLL 57 条与 PLL 21 条，断言每条展开非空且逆序后能抵消；覆盖 `U`, `U'`, `U2` 起手、括号、`r/M/x/y/z`、错误字符与括号不匹配。测试脚本 `require('../.tmp/ble/op-formula.js')`；先运行 `npx tsc -p tsconfig.ble.json && node scripts/test-op-formula.cjs`，预期模块不存在或断言失败。

```js
const assert = require('node:assert/strict');
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
assert.equal(parseOpFormula("U (R U R' U')").openingAuf, 'U');
assert.equal(parseOpFormula("R U R'").openingAuf, null);
assert.throws(() => parseOpFormula('Q U R'), /无效|不支持/);
assert.throws(() => parseOpFormula('(R U'), /括号|无效/);
```

- [ ] 实现接口 `parseOpFormula(source: string): { moves: string[]; inverse: string[]; openingAuf: string | null }`。先执行严格语法／平衡检查，再用 `new TwistNode(source).parse()` 规范化，不允许静默丢掉未知字符；逆序用 `new TwistNode(source).parse(true).map(a => a.value)`，并通过转动模拟检验逆序。关键约束：`openingAuf = moves[0]` 仅当它是 `U/U'/U2`，不能把 `y` 当 AUF。

```ts
const moves = new TwistNode(source).parse().map(move => move.value).filter(Boolean);
const inverse = new TwistNode(source).parse(true).map(move => move.value).filter(Boolean);
const openingAuf = /^(U|U'|U2)$/.test(moves[0] || '') ? moves[0] : null;
return { moves, inverse, openingAuf };
```

上述片段只负责规范化；必须在它之前按同一份允许的转动词法做全文扫描、括号配对，并在模拟器中验证正逆抵消。
- [ ] 再运行上述命令，预期 PASS；补跑 `npm run test:pll`，预期旧 PLL 测试 PASS。
- [ ] 只提交本任务文件：`git add src/ble/op-formula.ts scripts/test-op-formula.cjs package.json && git commit -m 'feat(无缝OP): 校验并展开 OLL 公式'`。

### 任务 2：生成和核验 21 × OLL 案例

**文件：** 创建 `src/ble/op-case.ts`、`scripts/test-op-case.cjs`；修改 `package.json` 的 `test:op`。

- [ ] 写失败测试：固定随机序列分别抽首个和最后一个 PLL、OLL、4 种 y；断言生成顺序为 `[Y, ...P.inverse, ...O.inverse]`，执行完整 OLL 后现有六格目录认出 `targetPll`。遍历 OLL × PLL 组合至少 4 种代表朝向并统计拒绝原因，确保没有无界循环。运行 `npx tsc -p tsconfig.ble.json && node scripts/test-op-case.cjs`，预期 FAIL。

```js
const { generateOpCase } = require('../.tmp/ble/op-case.js');
const sample = generateOpCase(plls, olls, () => 0, simulate);
assert.equal(sample.targetPll, plls[0].name.slice(4));
assert.equal(sample.beforeFacelets.length, 54);
assert.equal(sample.afterFacelets.length, 54);
assert.equal(matchPllSix(sample.afterFacelets).name, sample.targetPll);
```

- [ ] 实现 `OpCase`：`{ targetPll, pllFormula, ollName, ollFormula, y, scramble, beforeFacelets, afterFacelets, openingAuf }`；`generateOpCase(plls, olls, random, simulate): OpCase`，`simulate(moves)` 是与展示魔方同一转动语义的依赖。对 `[Y, P⁻¹, O⁻¹]` 的题面和随后 `O` 的状态做真实模拟；校验中心、合法性、F2L 保持、顶层定向以及 `matchPllSix(afterFacelets)?.name === targetPll`。排除无法形成 OLL 训练的候选，并把可用池空／解析错误变成可见错误而非无限重抽。

```ts
const scrambleMoves = [y, ...pll.inverse, ...oll.inverse].filter(Boolean);
const beforeFacelets = simulate(scrambleMoves);
const afterFacelets = simulate([...scrambleMoves, ...oll.moves]);
if (matchPllSix(afterFacelets)?.name !== targetPll) throw Error('目标 PLL 校验失败');
```

均匀性要求：先均匀选中目标 PLL，若该 PLL 与抽中的 OLL 不兼容，只在这个 PLL 下换 OLL，不重新抽 PLL；若整个 OLL 池均无效，报错而不是偏向剩余 PLL。
- [ ] 单测增加自定义公式失败路径：未知操作、不会产生 OLL 的 `U`、以及指定 PLL 不匹配时必须报出原因。重新运行任务测试与 `npm run test:pll`，预期全部 PASS。
- [ ] 提交 `src/ble/op-case.ts scripts/test-op-case.cjs package.json`，提交说明 `feat(无缝OP): 随机生成并校验 OLL 与 PLL 组合案例`。

### 任务 3：追踪贴纸身份并适配两套六格

**文件：** 创建 `src/ble/op-sticker-trace.ts`、`src/ble/op-window.ts`、`scripts/test-op-trace.cjs`；修改 `package.json`。

- [ ] 写失败测试：54 个独立贴纸 ID 在每个受支持的转动后仍为一一映射，完整 OLL 的终点等于逐步终点；F/R 六格为面贴纸索引 `[18,19,20,9,10,11]`；L/F 使用旋转后的观察坐标，并检验 1–6 从左到右顺序。测试 `y/y'/y2`、`U` 起手以及不同颜色但同一块的关联贴纸。运行 `npx tsc -p tsconfig.ble.json && node scripts/test-op-trace.cjs`，预期 FAIL。

```js
const trace = traceOpStickers(['U', 'R', "U'", "R'"]);
assert.equal(trace.positions[0].length, 54);
assert.equal(new Set(trace.positions.at(-1)).size, 54);
assert.deepEqual(opWindow(facelets, trace.positions, 'FR').indices, [18, 19, 20, 9, 10, 11]);
```

- [ ] 实现 `traceOpStickers(moves: string[]): { positions: number[][] }`：`positions[step][id]` 表示稳定贴纸 `id` 在第 `step` 步后的 0–53 位置；保留块身份以返回角块／棱块关联贴纸。`opWindow(facelets, positions, view: 'FR' | 'LF')` 输出 `{ indices, six, sources, related, description, match }`，其中 `sources[i]` 是最终第 `i+1` 格的题面贴纸 ID。L/F 坐标必须经真实整体 y 的置换换算，不能直接换面字母。

```ts
const final = positions[positions.length - 1];
const sources = sixIndices.map(index => final.findIndex(position => position === index));
if (sources.some(id => id < 0) || new Set(sources).size !== 6) throw Error('贴纸轨迹无效');
```

实现时 `positions[0]` 必须是恒等置换，`positions[k]` 表示前 `k` 步的累计置换；测试须与真实展示魔方每一步交叉核对。
- [ ] 加入性质测试：用真实魔方模型为每种转动构造结果，与追踪后的颜色序列对比；所有 54 个 ID 唯一、双窗口的最终六格与实播后一致。运行 `npm run test:op`，预期 PASS。
- [ ] 提交本任务文件，提交说明 `feat(无缝OP): 追踪贴纸轨迹与双六格窗口`。

### 任务 4：窗口推荐、训练状态和记录

**文件：** 创建 `src/ble/op-training.ts`、`scripts/test-op-training.cjs`；修改 `src/ble/op-window.ts`、`package.json`。

- [ ] 写失败测试：同题切换 FR/LF 不重抽、默认 `showHints=false`、答错记录后留在本题、答对后留在揭示态、重试清零且保留案例、下一题才重抽、复盘恢复原题；起手 AUF 不影响前后状态。运行 `npm run test:op`，预期 FAIL。

```js
const before = training.current.scramble;
training.switchView('LF');
assert.equal(training.current.scramble, before);
assert.equal(training.hintsVisible, false);
assert.equal(training.answer('错误选项', 1200), false);
assert.equal(training.current.scramble, before);
training.retry();
assert.equal(training.current.scramble, before);
```

- [ ] 实现 `OpTraining` 的方法 `next()`, `retry()`, `switchView(view)`, `showHints()`, `answer(name, now)`, `replay(record)`；记录类型包含 `targetPll/ollFormula/y/scramble/view/usedHints/selectedName/ok/durationMs/at`，存取键为 `seamlessOpRecords`，读取时校验数组与长度并限制最近 200 条。提供 PLL／OLL／正误筛选，复盘只读、不重记成绩。
- [ ] `recommendOpWindow(fr, lf)` 先比较「特征能否唯一排除其他 20 种 PLL」，再比较可见来源贴纸数／判别关系数；均不唯一则返回明确提示，不把目录命中偷换成「六格唯一」。补充 FR 与 LF 均可／只有 LF 可／均不可的测试。运行 `npm run test:op && npm run test:pll`，预期 PASS。

```ts
if (fr.unique !== lf.unique) return fr.unique ? 'FR' : 'LF';
if (fr.visibleSources !== lf.visibleSources) return fr.visibleSources > lf.visibleSources ? 'FR' : 'LF';
return fr.relationCount <= lf.relationCount ? 'FR' : 'LF';
```

`unique` 从目录中其他 PLL 的签名排除计算，不能直接等同于 `matchPllSix` 已通过完整状态校验。
- [ ] 提交任务文件，提交说明 `feat(无缝OP): 管理训练结果与推荐观察窗口`。

### 任务 5：页面、箭头与播放

**文件：** 创建 `src/vue/SeamlessOp/index.ts`、`index.html`、`index.css`、`sticker-overlay.ts`、`scripts/verify-op-ui.js`；修改 `src/ble/app-route.ts`、`src/vue/AppShell/index.ts`、`src/vue/AppShell/index.html`、`package.json`。

- [ ] 先写浏览器验证脚本：访问 `?mode=seamlessop`，断言页面与 3D 魔方存在、默认答案／箭头隐藏；点击「显示线索」出现贴纸箭头但六格真实颜色仍隐藏；切 FR/LF 保留案例；答题后显示实际六格与 PLL；「演示验证」逐步前进／后退与回到题面；刷新可复盘。运行 `playwright-cli run-code --filename scripts/verify-op-ui.js`，预期页面不存在而失败。

```js
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=seamlessop');
  await page.getByRole('button', { name: '显示线索' }).click();
  await page.getByRole('button', { name: 'L/F' }).click();
  await page.getByRole('button', { name: '演示验证' }).click();
}
```

验证脚本沿用项目 `scripts/verify-pll6-render.js` 的 Playwright CLI `run-code` 入参格式，启动地址按当前 dev server 端口调整。
- [ ] 在 AppShell 注册 `SeamlessOp`，在 `MODES` 注册 `seamlessop`，菜单加入口。阻止蓝牙 MOVE/FACELETS 修改这页虚拟题；隐藏此页无效的「跟随实体魔方」全局开关，保留全局连接入口；页面明确说明实体动作不计入本题成绩。
- [ ] 页面用现有 `World/Viewport` 展示 `OpCase.beforeFacelets` 对应的真实状态；显示当前窗口的关键贴纸、淡化关联块、SVG 箭头连接贴纸中心与六格目标，采用 `sticker-overlay.ts` 投影。用公式 `O.moves` 驱动 3D 动画，并用同一 `positions[step]` 更新箭头；起手 U 先单独标记 AUF。暴露 `resetVisualCube()` 使工具栏重试回题面，切视角只旋转摄像机。按钮禁用／空公式／无候选的提示要清楚。
- [ ] 增加手机纵向布局与可折叠答案区；独立的 PLL 多选弹层沿用六格页长按／鼠标拖动交互。把自定义 OLL 文本和启用状态存于 `seamlessOpCustomOll`，刷新时恢复但重新执行校验。增加帮助页解释关注块、箭头、起手 AUF 与两窗口；答题与复盘记录可按 PLL／OLL／正误筛选。浏览器验证重新运行；`npx tsc --noEmit`、`npm run build`、`npm run test:op`、`npm run test:pll` 预期通过。提交本任务文件，说明 `feat(无缝OP): 添加预测六格与贴纸动画训练页`。

### 任务 6：全量回归及交付核对

**文件：** 无新增；若测试暴露缺陷，只修相应文件并添加对应回归断言。

- [ ] 用真实公式库回归 21 × 57 × 4 个候选（含可报告的无效条目）；逐个检查 OLL 后确实归于目标 PLL、两套窗口的贴纸身份与颜色一致、首步 U 的 AUF 标记与动画步数一致。
- [ ] 运行 `npm run test:op && npm run test:pll && npm run test:ble && npm run test:desktop && npm run build`，记录各命令退出码；使用浏览器脚本检查手机宽度的换行、无横向溢出、答案隐藏及箭头点击状态。
- [ ] `git diff --check`，仅提交回归修正的明确文件；汇报完成项、未覆盖项和本地预览地址。不要自行增加版本号、覆盖旧安装包或发布 Release，除非用户另行要求。

## 执行注意

现有解析器会容忍某些异常输入，不能只用「解析得到至少一步」判定自定义公式有效。六格目录只覆盖已核验的分类关系，窗口推荐必须区分「完整状态的 PLL 匹配」与「单窗口六格关系能够唯一判别」。手机端箭头从 3D 投影到六格停靠区，随 resize 与逐步动画刷新，避免将隐藏背面贴纸误投影在正面。

本计划的执行方式按项目约定为**内联执行**，不创建 worktree，不派生子代理。
