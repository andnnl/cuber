const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.html'), 'utf8');
const ts = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/index.ts'), 'utf8');
for (const token of ['统计', '总体成绩', '重点补练', '各公式排行', '<svg', '只练这一条'])
  assert(html.includes(token), `缺少统计视图：${token}`);
assert.match(ts, /summarizeFormulaRecords\(/);
assert.match(ts, /FormulaStatsPreferencesStore/);
assert.match(html, /v-model\.number="statsPreferences\.count"/);
assert.match(html, /statsChart\.durationPaths/);
assert.match(html, /statsGroupValue\(row, label\)/, '重点补练需要直接显示对应的慢点数值');
assert.match(html, /出题前 y[\s\S]*?<option value="y"/);
assert.match(html, /出题前 y[\s\S]*?随机 U/, '随机 U 开关放在出题前 y 后面');
assert.match(html, /settings\.randomU[\s\S]*?toggleRandomU/, '随机 U 开关响应交互');
assert.match(ts, /this\.settings\.randomU/, '随机 U 需要参与题目生成');
const recordTable = fs.readFileSync(path.join(__dirname, '../src/vue/FormulaTimer/RecordTable.html'), 'utf8');
assert.match(recordTable, /formatTps\(record\)/, '历史记录需显示 TPS');
assert.match(html, /<record-table :records="filteredRecords" @replay="replay"/, '历史记录需独立渲染，不随计时刷新重绘');
assert.match(html, /meanTps/, '统计详情需显示平均 TPS');
assert.match(ts, /this\.settings\.beforeY/, '出题前 y 需要参与实际题目生成');
assert.match(html, /v-for="category in \['f2l','advf2l','oll','pll'\]"[^>]*v-if="!statsOpen"/,
  '统计页隐藏训练分类操作，避免生成暗中的新题');
assert.match(html, /@click="startStatsFocus\(/);
assert.match(html, /@click="leaveStatsFocus"/);
assert.match(ts, /chooseFormulaItems\(/);
assert.match(ts, /focusIds: string\[\] \| null = null/);
assert.match(ts, /if \(!this\.active \|\| this\.replayRecord \|\| this\.statsOpen\) return;/,
  '统计页不能接收隐藏训练题面的实体转动');
assert.match(ts, /onAppActivate\(\): void \{ this\.active = true; if \(!this\.statsOpen\) this\.resetCase\(\);/,
  '统计页恢复前台不应暗中生成训练题');
assert.match(ts, /onAppDeactivate\(\): void \{[\s\S]*?this\.clearStatsFocus\(\);[\s\S]*?\n  \}/,
  '离开页面必须清理临时重点题池');
const compiler = require('typescript');
const parsed = compiler.createSourceFile('index.ts', ts, compiler.ScriptTarget.Latest, true);
const component = parsed.statements.find(compiler.isClassDeclaration);
const filtered = component.members.find(member => member.name?.getText(parsed) === 'filteredRecords');
const harnessCode = compiler.transpileModule(`class RecordHarness {${filtered.getText(parsed)}}`,
  {compilerOptions:{target:compiler.ScriptTarget.ES2020}}).outputText;
const RecordHarness = new Function(`${harnessCode}; return RecordHarness;`)();
const view = Object.assign(new RecordHarness(), {recordResult:'all', trainingCategory:'pll',
  records:Array.from({length:2400}, (_, index) => ({at:index, category:index % 2 ? 'pll' : 'oll',
    result:index < 1200 ? 'success' : 'idle-failure'}))});
assert.equal(view.filteredRecords.length, 1000, '记录表最多显示 1000 条');
assert.equal(view.filteredRecords[0].at, 2399, '优先显示最新记录');
assert.equal(view.filteredRecords[999].at, 401);
view.recordResult = 'success';
assert.equal(view.filteredRecords.length, 600, '先筛选再限制条数，不能隐藏较早的符合条件记录');
assert.equal(view.filteredRecords[0].at, 1199);
assert.equal(view.records.length, 2400, '显示上限不删除统计或存储所用的历史记录');
assert.equal(view.records[0].at, 0, '显示排序不得修改原始记录');
console.log('公式统计视图结构与记录显示上限：通过');
