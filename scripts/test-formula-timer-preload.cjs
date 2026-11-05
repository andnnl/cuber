const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { FormulaTimerStore } = require('../.tmp/ble/formula-timer-store.js');
const data = new Map();
const store = new FormulaTimerStore({getItem:key => data.get(key) || null, setItem:(key,value) => data.set(key,value)});
const initial = store.load();
assert.equal(initial.settings.preload, false);
assert.equal(initial.settings.preloadLayout, 'alternate');
for (const layout of ['alternate', 'fixed-left']) {
  store.save({...initial.settings, preload:true, preloadLayout:layout}, []);
  assert.equal(store.load().settings.preload, true);
  assert.equal(store.load().settings.preloadLayout, layout);
}
const legacy = {...initial.settings};
delete legacy.preload;
delete legacy.preloadLayout;
store.save(legacy, []);
assert.equal(store.load().settings.preload, false);
assert.equal(store.load().settings.preloadLayout, 'alternate');
for (const invalid of [{preload:'yes'}, {preloadLayout:'unknown'}]) {
  store.save({...initial.settings, ...invalid}, []);
  assert.match(store.load().warning, /设置|读取/);
}
const source = fs.readFileSync('src/vue/FormulaTimer/index.ts', 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
const component = parsed.statements.find(ts.isClassDeclaration);
const names = ['advanceQueuedCase', 'prepareQueuedCase', 'finishRecord'];
const members = component.members.filter(member => member.name && names.includes(member.name.getText(parsed)));
assert.equal(members.length, names.length);
const code = ts.transpileModule(`class Harness {${members.map(member => member.getText(parsed)).join('\n')}}`,
  {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const jobs = [];
const Harness = new Function('window', `${code}; return Harness;`)({setTimeout:(callback,ms) => {jobs.push({callback,ms}); return jobs.length;}});
const first = {id:'pll:first', category:'pll', name:'第一题', formula:'R', scramble:"R'", initialFacelets:'first'};
const second = {...first, id:'pll:second', name:'第二题', scramble:"U'", initialFacelets:'second'};
function page(layout = 'alternate') {
  const vm = new Harness();
  Object.assign(vm, {settings:{preload:true, preloadLayout:layout, nextMode:'random'}, active:true,
    statsOpen:false, replayRecord:null, pickerOpen:false, current:first, queuedCase:second, activeSide:0,
    records:[], clearVerification() {}, clearNextJob() {this.nextJob = null;},
    save() {}, formatReaction:() => '0.20', formatTps:() => '2.00',
    validPool:() => [{...first, id:'pll:third'}],
    showCase(item) {this.current = item; this.completedRecord = null; this.prepareQueuedCase();}});
  return vm;
}
for (const layout of ['alternate', 'fixed-left']) {
  const vm = page(layout);
  const pending = vm.queuedCase;
  const jobCount = jobs.length;
  vm.finishRecord({...first, result:'success', durationMs:500, moveCount:1, at:1500});
  assert.equal(vm.current, pending, '激活必须直接使用已展示题目，不能重新随机');
  assert.equal(vm.activeSide, layout === 'alternate' ? 1 : 0);
  assert.equal(vm.queuedCase.id, 'pll:third');
  assert.equal(vm.records.length, 1);
  assert.equal(vm.completedRecord, null, '旧成绩不能冻结新题计时');
  assert.equal(vm.nextJob, null);
  assert.equal(jobs.length, jobCount, '成功后不能等待 700ms');
  vm.finishRecord({...second, result:'success', durationMs:500, at:2000});
  assert.equal(vm.activeSide, 0, '左右轮流第二次切换应回到左侧');
}
{
  const vm = page();
  vm.settings.preload = false;
  vm.finishRecord({...first, result:'success', durationMs:500, at:1500});
  assert.equal(vm.current, first);
  assert.equal(jobs[jobs.length - 1].ms, 700, '普通模式保留原切题间隔');
}
{
  const vm = page();
  vm.settings.nextMode = 'repeat';
  vm.prepareQueuedCase();
  assert.deepEqual(vm.queuedCase, first, '重复模式预览同一实际打乱');
  assert.notEqual(vm.queuedCase, first);
  vm.settings.preload = false;
  vm.prepareQueuedCase();
  assert.equal(vm.queuedCase, null);
}
for (const result of ['idle-failure', 'interrupted']) {
  const vm = page();
  vm.finishRecord({...first, result, durationMs:500, at:1500});
  assert.equal(vm.current, first, '未成功不能立即消费已预览题目');
}
console.log('公式预打乱设置兼容、两种布局和连续切题：通过');
