const assert = require('node:assert/strict');
const { FormulaTimerStore } = require('../.tmp/ble/formula-timer-store.js');

const values = new Map([['algs', 'untouched'], ['pll6Records', 'untouched']]);
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
};
const store = new FormulaTimerStore(storage);
const initial = store.load();
assert.equal(initial.settings.category, 'f2l');
assert.equal(initial.settings.nextMode, 'random');
assert.equal(initial.settings.slowSeconds, 3);
assert.equal(initial.settings.beforeZ2, false, '默认不开启出题前 z2');
assert.equal(initial.settings.beforeY, '', '默认不做出题前 y');
assert.equal(initial.settings.randomU, true, '默认开启随机 U');
assert.deepEqual(initial.settings.selectedIds, { f2l: [], oll: [], pll: [] });
assert.deepEqual(initial.records, []);
assert.equal(initial.warning, '');

const settings = { ...initial.settings, category: 'oll', nextMode: 'repeat', slowOnly: true,
  beforeZ2: true, beforeY: "y'", slowSeconds: 2.5, selectedIds: { f2l: ['f2l:01'], oll: ['oll:01'], pll: [] } };
const records = [{ id: 'oll:01', category: 'oll', name: 'OLL-01', formula: 'R U',
  initialFacelets: 'U'.repeat(54), at: 1000, durationMs: 1900, result: 'success' }];
assert.equal(store.save(settings, records), null);
assert.deepEqual(new FormulaTimerStore(storage).load(), { settings, records, warning: '' });
assert.equal(store.save({ ...settings, randomU: false }, records), null);
assert.equal(store.load().settings.randomU, false, '关闭随机 U 后记住用户选择');
assert.equal(store.save(settings, records), null);
assert.equal(store.load().records[0].reactionMs, undefined, '旧记录缺少反应时间仍可读取');
const timedRecords = [{ ...records[0], reactionMs: 2400 }];
assert.equal(store.save(settings, timedRecords), null);
assert.deepEqual(store.load().records, timedRecords, '分别保存反应时间与拧公式时间');
const countedRecords = [{ ...timedRecords[0], moveCount: 8 }];
assert.equal(store.save(settings, countedRecords), null);
assert.deepEqual(store.load().records, countedRecords, '记录实际接收的蓝牙步数');
for (const count of [-1, 1.5, '8', Infinity]) {
  values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings, records: [{ ...records[0], moveCount: count }] }));
  assert.match(store.load().warning, /记录|读取/, '拒绝无效步数');
}
for (const invalid of [-1, Infinity, '2.4']) {
  values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings, records: [{ ...records[0], reactionMs: invalid }] }));
  assert.match(store.load().warning, /记录|读取/, '拒绝无效的反应时间');
}
values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings: { ...settings, beforeZ2: undefined, beforeY: undefined }, records }));
assert.equal(store.load().settings.beforeZ2, false, '旧设置迁移时保留记录并默认关闭');
assert.equal(store.load().settings.beforeY, '', '旧设置迁移时默认不做 y');
values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings: { ...settings, randomU: undefined }, records }));
assert.equal(store.load().settings.randomU, true, '旧设置迁移时保持 OLL/PLL 已有随机 U 行为');
values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings: { ...settings, randomU: 'off' }, records }));
assert.match(store.load().warning, /设置|读取/, '拒绝无效的随机 U 选择');
values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings: { ...settings, beforeY: 'x' }, records }));
assert.match(store.load().warning, /设置|读取/, '拒绝无效的出题前 y 选择');
values.set('formulaTimer.v1', JSON.stringify({ version: 1, settings, records }));
const newRecords = [{ ...records[0], scramble: "y R' U' R" }];
assert.equal(store.save(settings, newRecords), null);
assert.deepEqual(new FormulaTimerStore(storage).load().records, newRecords, '新题实际打乱串可复盘');
assert.equal(store.save(settings, [{ ...records[0], scramble: 17 }]), null);
assert.match(store.load().warning, /记录|读取/, '不接受类型错误的打乱串');
assert.equal(values.get('algs'), 'untouched');
assert.equal(values.get('pll6Records'), 'untouched');

values.set('formulaTimer.v1', '{broken');
const corrupted = store.load();
assert.equal(corrupted.settings.slowSeconds, 3);
assert.deepEqual(corrupted.records, []);
assert.match(corrupted.warning, /设置|记录|读取/);
assert.match(new FormulaTimerStore({ ...storage, setItem: () => { throw Error('quota'); } }).save(settings, records), /保存/);
console.log('公式训练设置与记录独立存储：通过');
