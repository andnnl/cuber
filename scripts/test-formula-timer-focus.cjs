const assert = require('node:assert/strict');
const { chooseFormulaItems } = require('../.tmp/ble/formula-timer-focus.js');
const items = [
  { id: 'a', category: 'pll' }, { id: 'b', category: 'pll' },
  { id: 'c', category: 'oll' }, { id: 'oll:custom-one', category: 'oll' },
];
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, id => id === 'a', null).map(x => x.id), ['a']);
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, () => false, ['b']).map(x => x.id), ['b']);
assert.deepEqual(chooseFormulaItems(items, 'pll', ['a'], true, () => false, ['missing']), []);
assert.deepEqual(chooseFormulaItems(items, 'oll', [], false, () => false, null).map(x => x.id), ['c'],
  '原有默认池不包含自定义 OLL');
assert.deepEqual(chooseFormulaItems(items, 'oll', [], false, () => false, ['oll:custom-one']).map(x => x.id),
  ['oll:custom-one'], '临时池允许自定义公式');
console.log('临时训练池优先级与原筛选隔离：通过');
