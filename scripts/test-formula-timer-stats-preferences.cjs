const assert = require('node:assert/strict');
const { FormulaStatsPreferencesStore } = require('../.tmp/ble/formula-timer-stats-preferences.js');

const values = new Map();
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => { values.set(key, value); },
};
const store = new FormulaStatsPreferencesStore(storage);
const defaults = { category: 'f2l', mode: 'per-formula', count: 20 };
assert.deepEqual(store.load(), defaults);
assert.equal(store.save({ category: 'oll', mode: 'category', count: 50 }), true);
assert.deepEqual(store.load(), { category: 'oll', mode: 'category', count: 50 });
assert.equal(values.has('formulaTimer.v1'), false, '不写训练记录');
for (const invalid of ['{bad', JSON.stringify({ category: 'other', mode: 'category', count: 50 }),
  JSON.stringify({ category: 'oll', mode: 'category', count: 11 })]) {
  values.set('formulaTimer.stats.v1', invalid);
  assert.deepEqual(store.load(), defaults);
}
const throwing = new FormulaStatsPreferencesStore({ getItem: () => { throw Error('unavailable'); },
  setItem: () => { throw Error('full'); } });
assert.deepEqual(throwing.load(), defaults);
assert.equal(throwing.save(defaults), false);
console.log('公式统计偏好存取与损坏兜底：通过');
