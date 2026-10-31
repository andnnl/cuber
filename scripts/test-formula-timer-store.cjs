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
assert.deepEqual(initial.settings.selectedIds, { f2l: [], oll: [], pll: [] });
assert.deepEqual(initial.records, []);
assert.equal(initial.warning, '');

const settings = { ...initial.settings, category: 'oll', nextMode: 'repeat', slowOnly: true,
  slowSeconds: 2.5, selectedIds: { f2l: ['f2l:01'], oll: ['oll:01'], pll: [] } };
const records = [{ id: 'oll:01', category: 'oll', name: 'OLL-01', formula: 'R U',
  initialFacelets: 'U'.repeat(54), at: 1000, durationMs: 1900, result: 'success' }];
assert.equal(store.save(settings, records), null);
assert.deepEqual(new FormulaTimerStore(storage).load(), { settings, records, warning: '' });
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
