const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { restoreCustomOlls, selectedOllPool } = require('../.tmp/ble/op-custom-oll.js');
const builtin = [{ name: 'OLL-01', origin: 'R U R\' U\'' }, { name: 'OLL-02', origin: 'F R U R\' U\' F\'' }];
const legacy = restoreCustomOlls({ customOll: builtin[0].origin, useCustom: true, ollNames: ['OLL-02'] }, builtin);
assert.deepEqual(legacy.customOlls, [{ id: 'custom-legacy', name: '旧自定义 OLL', origin: builtin[0].origin }]);
assert.deepEqual(legacy.ollNames, ['custom-legacy'], '旧开关曾开启时应只选旧自定义公式');
assert.deepEqual(selectedOllPool(builtin, legacy.customOlls, legacy.ollNames),
  [{ name: '自定义 · 旧自定义 OLL', origin: builtin[0].origin }]);
const modern = restoreCustomOlls({ customOll: builtin[0].origin, useCustom: true,
  customOlls: [{ id: 'custom-1', name: '自己的一号', origin: builtin[1].origin }], ollNames: ['OLL-02', 'custom-1'] }, builtin);
assert.equal(modern.customOlls.length, 1, '已有库时不重复迁入旧输入框');
assert.deepEqual(modern.ollNames, ['OLL-02', 'custom-1']);
assert.deepEqual(selectedOllPool(builtin, modern.customOlls, modern.ollNames).map(item => item.name),
  ['OLL-02', '自定义 · 自己的一号']);
assert.deepEqual(selectedOllPool(builtin, modern.customOlls, []), builtin, '空选时仍为全部内置');
assert.deepEqual(restoreCustomOlls({ customOll: '', useCustom: true }, builtin).customOlls, []);
assert.deepEqual(restoreCustomOlls({ customOlls: [{ id: 'custom-1', name: '坏公式', origin: '?' }],
  ollNames: ['custom-1', 'ghost'] }, builtin).ollNames, []);
console.log('无缝 OP 自定义 OLL 存储与题池：通过');
