# 公式计时统计与重点补练实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:executing-plans 在当前工作区逐任务内联执行此计划。步骤使用复选框（`- [ ]`）跟踪进度；本项目不使用 worktree。

**目标：** 在公式计时页提供两种取样口径的成绩统计、手机端趋势图和不覆盖原设置的临时重点训练。

**架构：** 独立纯函数将 `FormulaRecord[]` 转成概览与各公式摘要；独立偏好读写只保存统计控件；页面负责展示和临时题池覆盖。统计计算不进入逐帧循环，不改变记录模型或计时判定。

**技术栈：** TypeScript 4.3、Vue 2 class component、现有 HTML/CSS 模板、Node assert 测试、webpack 5。

**规格：** `docs/superpowers/specs/2026-11-01-formula-timer-statistics-design.md`。

---

## 文件结构与职责

- 创建 `src/ble/formula-timer-stats.ts`：取样、汇总、标签、排序、趋势点的纯函数。
- 创建 `src/ble/formula-timer-stats-preferences.ts`：独立统计控件的本机持久化；不触碰 `formulaTimer.v1`。
- 创建 `scripts/test-formula-timer-stats.cjs`：统计口径、边界与排序的 Node 断言。
- 创建 `scripts/test-formula-timer-stats-preferences.cjs`：偏好兼容及损坏兜底。
- 修改 `src/vue/FormulaTimer/index.ts`：接入统计、临时题池、视图状态。
- 修改 `src/vue/FormulaTimer/index.html`：统计入口、单列统计视图及临时训练提示。
- 修改 `src/vue/FormulaTimer/index.css`：手机自适应卡片和 SVG 趋势图。
- 修改 `scripts/test-formula-timer.cjs`：读源码的临时题池、退出恢复断言。
- 修改 `package.json`：将两份新增测试纳入 `test:formula-timer`。

现有工作区有大量未提交改动；所有任务均只暂存上述本任务文件，并在每次提交前检查 `git diff --cached --name-only`。尤其不要覆盖用户已有 `src/vue/FormulaTimer/index.ts` 和 `scripts/test-formula-timer.cjs` 的修改。

### 任务 1：统计纯函数

**文件：** 创建 `src/ble/formula-timer-stats.ts`、`scripts/test-formula-timer-stats.cjs`；修改 `package.json`。

- [ ] **步骤 1：先写失败测试。** 测试导入 `../.tmp/ble/formula-timer-stats.js` 的 `summarizeFormulaRecords`，用以下数据验证两种 N、旧记录、排除中断、同 ID 不同分类和三类标签：

```js
const assert = require('node:assert/strict');
const { summarizeFormulaRecords } = require('../.tmp/ble/formula-timer-stats.js');
const base = { formula: 'R U', initialFacelets: 'U'.repeat(54) };
const rec = (id, at, result, durationMs, reactionMs, category = 'pll') =>
  ({ ...base, id, name: id, category, at, result, durationMs, ...(reactionMs === null ? {} : { reactionMs }) });
const records = [
  rec('A', 9, 'success', 4000, 6000), rec('B', 8, 'success', 1000, 1000),
  rec('A', 7, 'idle-failure', 2000, 5000), rec('A', 6, 'success', 5000, 7000),
  rec('A', 5, 'success', 6000, null), rec('A', 4, 'idle-failure', 2000, 4000),
  rec('A', 3, 'idle-failure', 2000, 4000), rec('B', 2, 'success', 1000, 1000),
  rec('A', 1, 'interrupted', 2000, 4000), rec('A', 10, 'success', 2000, 1000, 'oll'),
];
const perFormula = summarizeFormulaRecords(records, 'pll', 'per-formula', 6, 3);
const a = perFormula.formulas.find(row => row.id === 'A');
assert.equal(a.attemptCount, 6);
assert.equal(a.successCount, 3);
assert.equal(a.successRate, 0.5);
assert.equal(a.meanDurationMs, 5000);
assert.equal(a.reactionCount, 2);
assert.equal(a.meanReactionMs, 6500);
assert(a.labels.includes('failure'));
assert(a.labels.includes('duration'));
const recent = summarizeFormulaRecords(records, 'pll', 'category', 3, 3);
assert.equal(recent.overview.recordCount, 3);
assert.equal(recent.formulas.find(row => row.id === 'A').attemptCount, 2);
assert.equal(recent.formulas.find(row => row.id === 'B').attemptCount, 1);
assert.equal(recent.formulas.find(row => row.id === 'A').points.length, 2);
assert.equal(recent.formulas.find(row => row.id === 'A').labels.includes('duration'), false,
  '少于三次成功不贴拧动慢');
console.log('公式统计样本与边界：通过');
```

- [ ] **步骤 2：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-stats.cjs`；预期新模块未导出／找不到模块，测试失败。
- [ ] **步骤 3：在新模块定义** `StatsMode = 'per-formula' | 'category'`、`StatsLabel = 'duration' | 'reaction' | 'failure'`，以及 `FormulaSummary`（`id/name/category/records/points/attemptCount/successCount/successRate/meanDurationMs/reactionCount/meanReactionMs/labels`）和 `StatsResult`（`overview/formulas/groups`）。实现：先筛分类，按 `at` 降序、原下标升序稳定排列；分类口径切前 N 条，每公式口径分组后各切 N 条；结果点倒转为发生顺序。概览从选中原记录直接聚合，成功率分母只计成功与停转失败。均值只计成功、有限且非负的对应时长；反应时间缺失不入均值。类别内公式的反应均值中位数作为 1.5 倍基准，基准公式需要至少 3 个反应样本。具体核心计算如下，提取小函数避免 UI 重算：

```ts
import { FormulaCategory, FormulaRecord } from './formula-timer';
export type StatsMode = 'per-formula' | 'category';
export type StatsLabel = 'duration' | 'reaction' | 'failure';
export interface StatsPoint { at: number; result: FormulaRecord['result']; durationMs: number | null; reactionMs: number | null }
export interface FormulaSummary {
  id: string; name: string; category: FormulaCategory; records: FormulaRecord[]; points: StatsPoint[];
  attemptCount: number; successCount: number; successRate: number | null;
  durationCount: number; meanDurationMs: number | null; reactionCount: number;
  meanReactionMs: number | null; labels: StatsLabel[]; insufficient: boolean;
}
export interface StatsResult {
  overview: { recordCount: number; attemptCount: number; successCount: number;
    successRate: number | null; durationCount: number; meanDurationMs: number | null;
    reactionCount: number; meanReactionMs: number | null };
  formulas: FormulaSummary[]; groups: Record<StatsLabel, FormulaSummary[]>;
}
```

接在类型后加入以下完整的纯计算实现（`groups.duration` 按均值降序、`groups.reaction` 按均值降序、`groups.failure` 按成功率升序，同分按名称、ID；缺值末尾）。

```ts
const mean = (values: number[]): number | null => values.length ?
  values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const validTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const tie = (a: FormulaSummary, b: FormulaSummary): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const descending = (a: number | null, b: number | null): number =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a;

function aggregate(records: FormulaRecord[]) {
  const attempts = records.filter(record => record.result !== 'interrupted');
  const successes = records.filter(record => record.result === 'success');
  const durations = successes.filter(record => validTime(record.durationMs)).map(record => record.durationMs);
  const reactions = successes.filter(record => validTime(record.reactionMs)).map(record => record.reactionMs!);
  return {
    recordCount: records.length, attemptCount: attempts.length, successCount: successes.length,
    successRate: attempts.length ? successes.length / attempts.length : null,
    durationCount: durations.length, meanDurationMs: mean(durations),
    reactionCount: reactions.length, meanReactionMs: mean(reactions),
  };
}

export function summarizeFormulaRecords(records: FormulaRecord[], category: FormulaCategory,
  mode: StatsMode, count: number, slowSeconds: number): StatsResult {
  const sorted = records.map((record, index) => ({ record, index }))
    .filter(item => item.record.category === category)
    .sort((a, b) => b.record.at - a.record.at || a.index - b.index);
  const groups = new Map<string, FormulaRecord[]>();
  for (const item of mode === 'category' ? sorted.slice(0, count) : sorted) {
    const values = groups.get(item.record.id) || [];
    if (mode === 'category' || values.length < count) values.push(item.record);
    groups.set(item.record.id, values);
  }
  const sample = Array.from(groups.values()).flat();
  const formulas: FormulaSummary[] = Array.from(groups.entries()).map(([id, chosen]) => {
    const result = aggregate(chosen);
    return {
      id, category, name: chosen[0].name, records: chosen,
      points: chosen.slice().reverse().map(record => ({
        at: record.at, result: record.result,
        durationMs: record.result === 'success' && validTime(record.durationMs) ? record.durationMs : null,
        reactionMs: record.result === 'success' && validTime(record.reactionMs) ? record.reactionMs! : null,
      })),
      attemptCount: result.attemptCount, successCount: result.successCount,
      successRate: result.successRate, durationCount: result.durationCount,
      meanDurationMs: result.meanDurationMs, reactionCount: result.reactionCount,
      meanReactionMs: result.meanReactionMs, labels: [], insufficient: result.successCount < 3,
    };
  });
  const reactionBaseline = median(formulas.filter(row => row.reactionCount >= 3 && row.meanReactionMs !== null)
    .map(row => row.meanReactionMs!));
  for (const row of formulas) {
    if (row.successCount >= 3 && row.meanDurationMs !== null && row.meanDurationMs > slowSeconds * 1000)
      row.labels.push('duration');
    if (row.reactionCount >= 3 && reactionBaseline !== null && row.meanReactionMs! > reactionBaseline * 1.5)
      row.labels.push('reaction');
    if (row.attemptCount >= 5 && row.successRate !== null && row.successRate < 0.8)
      row.labels.push('failure');
  }
  formulas.sort((a, b) => descending(a.meanDurationMs, b.meanDurationMs) || tie(a, b));
  return {
    overview: aggregate(sample), formulas,
    groups: {
      duration: formulas.filter(row => row.labels.includes('duration'))
        .sort((a, b) => descending(a.meanDurationMs, b.meanDurationMs) || tie(a, b)),
      reaction: formulas.filter(row => row.labels.includes('reaction'))
        .sort((a, b) => descending(a.meanReactionMs, b.meanReactionMs) || tie(a, b)),
      failure: formulas.filter(row => row.labels.includes('failure'))
        .sort((a, b) => (a.successRate! - b.successRate!) || tie(a, b)),
    },
  };
}
```

若项目的 TypeScript 目标未包含 `Array.prototype.flat`，使用 `[].concat(...Array.from(groups.values()))` 替换并以 `tsc` 结果为准。`points` 对失败只保留 `result`，两个时间均为 `null`；中断亦不作速度点。输入数组不得原地排序。
- [ ] **步骤 4：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-stats.cjs`；预期通过。追加并执行均值阈值严格大于、反应中位数的偶数个样本、成功率等于 80% 不贴标签、同时间戳顺序、空数据与原数组不变断言。
- [ ] **步骤 5：只提交本任务文件**，先检查 `git diff --cached --check`，提交 `feat(公式统计): 添加成绩取样和标签计算`。

### 任务 2：统计偏好独立存储

**文件：** 创建 `src/ble/formula-timer-stats-preferences.ts`、`scripts/test-formula-timer-stats-preferences.cjs`。

- [ ] **步骤 1：先写失败测试：** 注入 `StorageLike`，断言默认 `{ category:'f2l', mode:'per-formula', count:20 }`、保存再读、损坏 JSON/非法分类与 N 返回默认值、写失败不抛异常。`StorageLike` 复用 `formula-timer-store.ts` 的导出类型。

```js
const assert = require('node:assert/strict');
const { FormulaStatsPreferencesStore } = require('../.tmp/ble/formula-timer-stats-preferences.js');
const data = new Map();
const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => { data.set(key, value); } };
const store = new FormulaStatsPreferencesStore(storage);
assert.deepEqual(store.load(), { category: 'f2l', mode: 'per-formula', count: 20 });
store.save({ category: 'oll', mode: 'category', count: 50 });
assert.deepEqual(store.load(), { category: 'oll', mode: 'category', count: 50 });
data.set('formulaTimer.stats.v1', '{bad');
assert.deepEqual(store.load(), { category: 'f2l', mode: 'per-formula', count: 20 });
console.log('公式统计偏好兼容：通过');
```

- [ ] **步骤 2：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-stats-preferences.cjs`；预期找不到新模块。
- [ ] **步骤 3：实现** `FormulaStatsPreferencesStore`，键为 `formulaTimer.stats.v1`，仅接受 F2L／OLL／PLL、两种口径和 10／20／50／100；`load()` 用 `try/catch` 回退默认，`save(value)` 返回 `boolean`，失败返回 `false`，不修改训练存储。

```ts
import { FormulaCategory } from './formula-timer';
import { StorageLike } from './formula-timer-store';
import { StatsMode } from './formula-timer-stats';
export interface FormulaStatsPreferences { category: FormulaCategory; mode: StatsMode; count: 10 | 20 | 50 | 100 }
const KEY = 'formulaTimer.stats.v1';
const defaults = (): FormulaStatsPreferences => ({ category: 'f2l', mode: 'per-formula', count: 20 });
export class FormulaStatsPreferencesStore {
  constructor(private readonly storage: StorageLike) {}
  load(): FormulaStatsPreferences {
    try {
      const value = JSON.parse(this.storage.getItem(KEY) || 'null');
      if (['f2l', 'oll', 'pll'].includes(value?.category) &&
          ['per-formula', 'category'].includes(value?.mode) &&
          [10, 20, 50, 100].includes(value?.count)) return value;
    } catch { /* 损坏偏好不影响训练记录 */ }
    return defaults();
  }
  save(value: FormulaStatsPreferences): boolean {
    try { this.storage.setItem(KEY, JSON.stringify(value)); return true; }
    catch { return false; }
  }
}
```

- [ ] **步骤 4：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-stats-preferences.cjs`；预期通过；增加非法值与 setItem 抛错断言后重跑。
- [ ] **步骤 5：只提交本任务文件**，先检查 `git diff --cached --check`，提交 `feat(公式统计): 独立记忆统计筛选`。

### 任务 3：统计页与手机端趋势图

**文件：** 修改 `src/vue/FormulaTimer/index.ts`、`index.html`、`index.css`、`package.json`，创建 `scripts/test-formula-timer-stats-view.cjs`。

- [ ] **步骤 1：先写失败的模板契约测试。** 读取模板和 TypeScript，断言统计入口、三段布局、统计口径控件、SVG、临时训练操作都存在，并确认图表不会在逐帧 `loop()` 中重算。

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.html'), 'utf8');
const ts = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
for (const token of ['统计', '总体成绩', '重点补练', '各公式排行', '<svg', '只练这一条'])
  assert(html.includes(token), `缺少统计视图：${token}`);
assert.match(ts, /summarizeFormulaRecords\(/);
assert.match(ts, /FormulaStatsPreferencesStore/);
console.log('公式统计视图结构：通过');
```

- [ ] **步骤 2：运行** `node scripts/test-formula-timer-stats-view.cjs`；预期因统计入口和组件缺失而失败。
- [ ] **步骤 3：视图状态**加入 `statsOpen=false`、`statsPreferences`、`statsExpandedId`，按 `records`、统计偏好和 `settings.slowSeconds` 计算 `statsResult`。原训练页保持原布局；统计打开时隐藏 3D 区域与训练面板，仅显示返回按钮及统计面板。顶部分类选择是统计专用，不调用 `changeCategory()`。`@change` 保存偏好。拧动、反应与成功率分别带有效样本数；对 `null` 显示“—”。仅展开当前卡的 SVG，图表坐标以该卡 `points` 和有限成功时间计算；当有效点不足 2 个时显示点及“数据不足”，不绘制折线；失败画独立标记。

```ts
// FormulaTimerView 中增加（导入纯统计模块及偏好模块）。
statsOpen = false;
statsPreferences = new FormulaStatsPreferencesStore(window.localStorage).load();
statsExpandedId = '';
private readonly statsStore = new FormulaStatsPreferencesStore(window.localStorage);
get statsResult(): StatsResult {
  return summarizeFormulaRecords(this.records, this.statsPreferences.category,
    this.statsPreferences.mode, this.statsPreferences.count, this.settings.slowSeconds);
}
saveStatsPreferences(): void { if (!this.statsStore.save(this.statsPreferences)) this.warning = '统计筛选偏好保存失败'; }
openStats(): void { this.statsOpen = true; }
closeStats(): void { this.statsOpen = false; }
toggleStatsRow(id: string): void { this.statsExpandedId = this.statsExpandedId === id ? '' : id; }
```

模板结构使用 `v-if="!statsOpen"` 包住原 `formula-timer-cube` 和训练 `main`（但让选择公式弹层仍由原 `pickerOpen` 控制），并在统计 `main v-else` 内按“总体成绩 → 重点补练 → 各公式排行”渲染。趋势 SVG 使用 `viewBox="0 0 300 100"`、`preserveAspectRatio="none"` 与 `width:100%;max-width:100%`；SVG 的 `<polyline>` 在失败点处断开，不跨越失败连接。手机样式给卡片 `min-width:0`、公式文本 `overflow-wrap:anywhere`；统计页使用已有青色按钮和全局背景变量。
- [ ] **步骤 4：运行** `node scripts/test-formula-timer-stats-view.cjs && npx tsc -p tsconfig.ble.json && npm run build`；预期通过，并手动在手机宽度验证分类、口径、空数据、展开图表与返回训练。若 `npm run build` 更新已跟踪的 `dist` 或 Android 资源，不将生成物纳入本功能提交。
- [ ] **步骤 5：只提交页面、样式、测试和 package.json 的本任务 hunks**，先检查暂存 diff；提交 `feat(公式统计): 添加手机端统计面板与趋势图`。

### 任务 4：临时重点训练与回归

**文件：** 修改 `src/vue/FormulaTimer/index.ts`、`index.html`、`scripts/test-formula-timer.cjs`；创建 `src/ble/formula-timer-focus.ts`、`scripts/test-formula-timer-focus.cjs`。

- [ ] **步骤 1：先写失败测试。** 独立的临时题池决策函数接收 `items`、临时 ID 集、原选中 ID 和 `slowOnly` 判定；临时集合非空时只返回库内对应分类项并绕过原筛选；没有临时集合时保持旧行为。验证单公式随机模式只抽该公式，已删除 ID 不可进入。

```js
const assert = require('node:assert/strict');
const { chooseFormulaItems } = require('../.tmp/ble/formula-timer-focus.js');
const items = [
  { id: 'a', category: 'pll' }, { id: 'b', category: 'pll' }, { id: 'c', category: 'oll' },
];
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, id => id === 'a', null).map(x => x.id), ['a']);
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, () => false, ['b']).map(x => x.id), ['b']);
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, () => false, ['missing']), []);
console.log('临时训练池隔离：通过');
```

- [ ] **步骤 2：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-focus.cjs`；预期找不到模块。
- [ ] **步骤 3：实现** `chooseFormulaItems`（只选集合，保留既有特殊逻辑：默认未选时不包括 `oll:custom-`），在视图 `validPool()` 中调用它后继续用已有 `makeFormulaCase`。视图增加 `focusIds: string[] | null`、`focusTitle`；`startFocus(ids,title)` 先过滤 `this.categoryItems`，零条时不切换，非零时若训练已开始调用 `training.interrupt(Date.now())`，先清除原题后设置临时 ID 并执行 `nextCase()`；`finishRecord` 的延迟下一题回调应在换题后取消，不能把旧轮次回调带入新池。`leaveFocus()` 把 `focusIds` 设为 `null` 并重新 `nextCase()`；`changeCategory()` 同样退出临时池。统计视图的组按钮传组内仍在库中的 ID，详情按钮传单条 ID。对于不可用历史公式显示不可训练提示。保持 `selectedIds`、`slowOnly`、`nextMode`、`beforeZ2` 完全不变。

```ts
export function chooseFormulaItems<T extends { id: string; category: FormulaCategory }>(
  items: T[], category: FormulaCategory, selected: string[], slowOnly: boolean,
  isSlow: (id: string) => boolean, focusIds: string[] | null,
): T[] {
  const focus = focusIds === null ? null : new Set(focusIds);
  return items.filter(item => item.category === category && (focus !== null ? focus.has(item.id) :
    (!selected.length ? !item.id.startsWith('oll:custom-') : selected.includes(item.id)) &&
    (!slowOnly || isSlow(item.id))));
}
```

注意：`interrupt()` 会触发 `finishRecord()`，其中会注册下一题任务；必须在 `startFocus()` 完成切换前再次 `clearNextJob()`。离开页面时临时题池随组件销毁；统计偏好可保留。
- [ ] **步骤 4：运行** `npx tsc -p tsconfig.ble.json && node scripts/test-formula-timer-focus.cjs && npm run test:formula-timer && npm run build`；预期全通过。新增断言覆盖临时池优先级、退出恢复原选项、单公式“随机下一条”、组内无可用公式、换题清掉旧回调。检查训练开始前换题不凭空记失败；开始后按原中断机制留记录。
- [ ] **步骤 5：只提交临时训练相关 hunks**，检查 `git diff --cached --check` 和 `git diff --cached --name-only` 后提交 `feat(公式统计): 支持临时重点补练与退出恢复`。最后执行 `npm run test:formula-timer && npm run build`，记录输出、未纳入本任务的既有工作区变更，以及统计页的手工手机端检查结果。

## 最终检查清单

- [ ] 两种 N 口径、概览／排行／趋势与三类标签来自同一批记录。
- [ ] 少样本和旧记录缺反应时间的卡片不显示误导性零值。
- [ ] `formulaTimer.v1` 的结构与记录不被统计偏好写入影响。
- [ ] 临时重点训练不改变原勾选、慢公式、重复／随机和 z2 设置；退出恢复。
- [ ] 当前任务的提交不夹带工作区原有修改、生成的发行包或资源。
