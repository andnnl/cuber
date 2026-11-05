# PLL 六格 3D 特征标注实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。本项目已明确选择**当前工作区内联执行**，不得创建 worktree，不需再次询问执行方式。

**目标：** 开启「显示当前特征」时，在 3D 魔方的 F／R 顶层六格上一次标出全部相关贴纸与关系，卡片区分必要判断和辅助印证，不预先显示 PLL 名称。

**架构：** 用纯函数从 `PllSixMatch` 和已核验资料行生成有序线索；页面专属 SVG 覆层把六格的几何位置投影到屏幕，不改变贴纸材质、通用 Viewport 或其他训练模式。PllObservation 管理开关、当前状态和卡片内容；状态无效时同时清空覆层与旧线索。

**技术栈：** TypeScript、Vue 2 class component、Three.js、webpack 5；`npm run test:pll`、`playwright-cli run-code`、`npm run build`。

---

## 文件与职责

- 新建 `src/ble/pll-six-visual.ts`：纯数据的形态步骤、必要关系、资料辅助关系及顺序；不涉及 Three.js。
- 修改 `scripts/test-pll-six-sticker.cjs`：纯函数和 84 个 U 朝向／336 个训练组合的线索正确性。
- 新建 `src/vue/PllObservation/visual-overlay.ts`：六格与魔方几何的映射、透视投影和正面可见性；无全局副作用。
- 修改 `src/vue/PllObservation/index.ts`：派生线索、叠层几何刷新及清理，沿用现有开关与当前状态。
- 修改 `src/vue/PllObservation/index.html`：SVG 覆层和可收起图文卡，不替换已有作答入口。
- 修改 `src/vue/PllObservation/index.css`：手机端尺寸、指针透传、关系线型与标签可读性。
- 新建 `scripts/verify-pll6-visual-overlay.js`：真实浏览器检查提示、视角、转动、切题、复盘和清理。

工作区已有大量其他功能的未提交文件；每个任务只暂存上述本功能文件。`src/vue/PllObservation/` 与 `src/ble/pll-six-sticker.ts` 等当前仍未跟踪，提交前必须检查本功能增量，不能借 `git add .` 把其他工作混进来。

## 任务 1：纯线索模型

**文件：** 新建 `src/ble/pll-six-visual.ts`；修改 `scripts/test-pll-six-sticker.cjs`。

- [ ] **步骤 1：先写失败测试。** 从现有 `observed(six)` 构造 Ja `FFRBBF` 与前置 y 后的 `RRBLLR`；把 `studyCellsForSix` 选出的资料行传入新 API，要求两者均为「①棒左＋棒左」「必要关系为空」「辅助关系有 3↔1 邻、6↔4 对」。再用具有两条 `distinguishingRelations` 的 E 案例，要求必要关系顺序与该函数一致；非法输入不产生线索。

```js
const { buildPllVisualClues } = require('../.tmp/ble/pll-six-visual.js');
for (const six of ['FFRBBF', 'RRBLLR']) {
  const f = { ...observed(six), left: '棒左', right: '棒左', name: 'Ja', signature: '' };
  const clues = buildPllVisualClues(f, guideRow('左棒左、右棒左', 'Ja'), []);
  assert.equal(clues[0].kind, 'shape');
  assert.equal(clues.filter(c => c.kind === 'required').length, 0);
  assert.ok(clues.some(c => c.kind === 'confirm' && c.relation === '邻'));
}
assert.deepEqual(buildPllVisualClues(null, [], []), []);
```

- [ ] **步骤 2：运行 `npm run test:pll`。** 预期因 `pll-six-visual.js` 不存在而失败，确认测试实际捕获缺失功能。
- [ ] **步骤 3：实现最小模型。** 线索结构保留贴纸索引（1～6）、关系、层级及可读描述；先输出形态，再解析现有必要关系字符串，最后从 `studyCellsForSix(cells, feature)` 取当前朝向的明确 `＝`／`↔` 关系。对每条资料关系用 `feature.relations` 验证，不合则不画、保留现有待复核提示；与必要关系重复的资料关系不再画第二条。不要从 `feature.name` 猜贴纸关系。

```ts
export type PllVisualClue = {
  kind: 'shape' | 'required' | 'confirm';
  order: number;
  stickers: number[];
  relation?: '同' | '对' | '邻';
  text: string;
};
export function buildPllVisualClues(feature: PllSixMatch | null, cells: string[], required: string[]): PllVisualClue[] {
  if (!feature) return [];
  const shape: PllVisualClue = {
    kind: 'shape', order: 1, stickers: [1, 2, 3, 4, 5, 6],
    text: `先看 F 面${feature.left}、R 面${feature.right}`
  };
  const necessary: PllVisualClue[] = required.map((text, index) => {
    const match = /^(\d) 与 (\d) (同|对|邻)色$/.exec(text);
    if (!match) throw new Error(`无效判别关系：${text}`);
    return { kind: 'required', order: index + 2, stickers: [Number(match[1]), Number(match[2])],
      relation: match[3] as '同' | '对' | '邻', text };
  });
  const selected = studyCellsForSix(cells, feature).join('；');
  const confirms: PllVisualClue[] = [];
  const pattern = /([1-6](?:、[1-6])*)\s*↔\s*([1-6](?:、[1-6])*)：(对|邻)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(selected)) !== null) {
    const [, left, right, relation] = match;
    for (const a of left.split('、')) for (const b of right.split('、')) {
      const x = Number(a), y = Number(b);
      if (feature.relations[x - 1][y - 1] !== relation) continue;
      if (necessary.some(clue => clue.relation === relation &&
        clue.stickers.includes(x) && clue.stickers.includes(y))) continue;
      confirms.push({ kind: 'confirm', order: 0, stickers: [x, y],
        relation: relation as '对' | '邻', text: `${x} 与 ${y} ${relation}色` });
    }
  }
  return [shape, ...necessary, ...confirms];
}
```

- [ ] **步骤 4：运行 `npm run test:pll`，再扩展测试至 84 个 AUF 与 336 个前置 y／后置 AUF 状态。** 对每条标注断言索引范围、关系真值、必要线索消除同形态其他 PLL；Ja/Jb 不因重命名颜色而匹配失败。预期所有断言通过。
- [ ] **步骤 5：完成一个仅包含本模型和测试增量的提交。** 由于现有测试文件未跟踪，提交前用 `git diff --no-index /dev/null scripts/test-pll-six-sticker.cjs` 阅读完整暂存内容，确认没有用户其他未提交内容；若不能隔离增量，先不要提交，保留工作区改动并报告。

## 任务 2：六格 3D 投影与可见性

**文件：** 新建 `src/vue/PllObservation/visual-overlay.ts`；新建 `scripts/verify-pll6-visual-overlay.js`。

- [ ] **步骤 1：写浏览器失败测试。** 打开 `http://127.0.0.1:18082/?mode=pll6`，勾选「显示当前特征」，断言 `.pll6-visual-overlay [data-sticker]` 恰有六格；记录坐标，拖动 3D 魔方视角后坐标改变；把视角转到背面后正面标签不可见；关闭开关后为零。覆层 `pointer-events: none`，拖动仍能改变镜头。

```js
async page => {
  await page.goto('http://127.0.0.1:18082/?mode=pll6');
  await page.getByRole('checkbox', { name: '显示当前特征' }).check();
  const layer = page.locator('.pll6-visual-overlay');
  if (await layer.locator('[data-sticker]').count() !== 6) throw new Error('未投影六格');
  if (await layer.evaluate(el => getComputedStyle(el).pointerEvents) !== 'none') throw new Error('覆层挡住手势');
}
```

- [ ] **步骤 2：运行 `playwright-cli run-code --filename=scripts/verify-pll6-visual-overlay.js`。** 预期找不到覆层而失败。
- [ ] **步骤 3：实现投影。** 几何映射从 `Cube.serialize()` 的循环推导：F 顶层三格为 `(x,y,z)=(0..2,2,2)`，R 顶层为 `(2,2,z=2..0)`；各自沿 F／R 面法线移动到贴纸外表面。用 `world.cube.localToWorld()`、`world.camera` 的透视矩阵把点投影到当前 Viewport 尺寸；前后面可见性用面法线和相机方向判断。页面绘制细框、短括号与最多两条必要关系线，辅助关系使用较浅线型，不压住贴纸中心。纯投影函数返回坐标／可见标志；创建和销毁 SVG DOM 由 Vue 负责。

```ts
export type StickerPoint = { number: number; x: number; y: number; visible: boolean };
export function projectPllSix(world: World, width: number, height: number): StickerPoint[] {
  world.scene.updateMatrixWorld(true);
  world.camera.updateMatrixWorld(true);
  const faces = [
    { normal: new THREE.Vector3(0, 0, 1), centers: [-64, 0, 64].map(x => new THREE.Vector3(x, 64, 96)) },
    { normal: new THREE.Vector3(1, 0, 0), centers: [64, 0, -64].map(z => new THREE.Vector3(96, 64, z)) }
  ];
  return faces.flatMap((face, side) => face.centers.map((center, index) => {
    const point = world.cube.localToWorld(center.clone());
    const normal = face.normal.clone().transformDirection(world.cube.matrixWorld);
    const front = normal.dot(world.camera.position.clone().sub(point)) > 0;
    const projected = point.project(world.camera);
    return { number: side * 3 + index + 1,
      x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2,
      visible: front && projected.z >= -1 && projected.z <= 1 };
  }));
}
```

- [ ] **步骤 4：构建并重跑浏览器测试。** `npm run build` 成功后验证视角拖动、缩放、窄屏、背面遮挡；必要时让线段在正面不可见时一起隐藏。不能借改动通用 Viewport 的拾取逻辑来让覆层可用。
- [ ] **步骤 5：检查本任务增量后提交；不暂存 `dist/` 或其他现有改动。**

## 任务 3：页面卡片、开关及状态同步

**文件：** 修改 `src/vue/PllObservation/index.ts`、`index.html`、`index.css`；扩展 `scripts/verify-pll6-visual-overlay.js`。

- [ ] **步骤 1：先扩展浏览器失败断言。** Ja 无必要关系时只出现「①形态已足以区分」，资料关系位于「辅助印证」；E 在形态后显示必要关系②③；训练未揭晓时特征卡不出现 PLL 名称；同一画面一次可看到全部线索，无“下一步”按钮。非 PLL 状态清空 `.pll6-visual-overlay`，切题与复盘后卡片／覆层都跟随当前状态。

```js
if (await page.locator('.pll6-feature-hint').getByText('下一步').count()) throw new Error('不应逐步点击揭示');
if (await page.locator('.pll6-feature-hint').getByText(/当前实际特征 · Ja/).count()) throw new Error('训练前泄露名称');
await page.evaluate(() => { const v = window.__appShell.$refs.activeView; v.world.cube.twister.setup('R'); v.refreshActualFeature(); });
if (await page.locator('.pll6-visual-overlay [data-sticker]').count()) throw new Error('非 PLL 状态保留旧标注');
```

- [ ] **步骤 2：运行新浏览器脚本，确认因仍显示旧文字提示／无视觉卡而失败。**
- [ ] **步骤 3：接入模型和覆层。** 页面从 `actualFeature`、`actualStudyRows` 计算 `visualClues`；卡片按 `kind` 顺序渲染 ①形态、必要判断与辅助印证。`loop()` 在魔方或相机发生变化时更新投影；转动动画进行中清空旧几何，落稳后重算。开关切换、`loadCase()`、`retry()`、`replay()`、`exitReplay()`、`onAppDeactivate()`、`beforeDestroy()` 负责同步或清理。下例只示意页面依赖边界，不在页面重新推断关系。

```ts
get visualClues(): PllVisualClue[] {
  return this.showCurrentFeatures && this.actualFeature && this.actualStudyRows.length === 1
    ? buildPllVisualClues(this.actualFeature, this.actualStudyRows[0].cells, this.actualHints) : [];
}
```

- [ ] **步骤 4：验证所有浏览器断言与现有功能。** `npm run build` 后执行新脚本及 `scripts/verify-pll6-computed.js`、`scripts/verify-pll6-formula-filter.js`、`scripts/verify-pll6-record-replay.js`。检查卡片的显示名称是否只在主动揭示答案处出现；手机 360 px 时魔方没有被关系文字覆盖。
- [ ] **步骤 5：只暂存上述页面与新脚本的本功能改动，检查差异后提交。** 用户未要求推送或发布，不做远端动作。

## 任务 4：完成前验证与交接

- [ ] 执行 `npm run test:pll && npm run test:ble && npm run build`，逐项确认退出码与测试通过数量。
- [ ] 执行上述四个浏览器脚本；记录视角拖动、六格面序、非 PLL 清理和手机渲染断言。
- [ ] 执行 `git diff --check`、`git status --short`，核对新增提交和其他既存未提交文件均未被误暂存或覆盖。
- [ ] 向用户报告功能入口、实现范围、验证证据和可访问的本地预览地址；未请求时不推送、不发布。
