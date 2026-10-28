const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { loadCustomOllLibrary, saveCustomOllLibrary, CUSTOM_OLL_LIBRARY_KEY } = require('../.tmp/ble/op-oll-library.js');
const builtin = [{ name: 'OLL-01', origin: "F R U R' U' F'" }];
const storage = new Map();
const store = { getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, value) };
const old = { customOlls: [{ id: 'custom-one', name: '我的公式', origin: builtin[0].origin }] };
store.setItem('seamlessOpSettings', JSON.stringify(old));
assert.deepEqual(loadCustomOllLibrary(store, builtin), old.customOlls, '首次读取旧列表迁移');
assert.ok(store.getItem(CUSTOM_OLL_LIBRARY_KEY), '迁移后写入共享库');
store.setItem('seamlessOpSettings', JSON.stringify({ customOlls: [{ id: 'custom-old', name: '过时', origin: builtin[0].origin }] }));
assert.deepEqual(loadCustomOllLibrary(store, builtin), old.customOlls, '旧设置不覆盖共享库');
saveCustomOllLibrary(store, []);
assert.deepEqual(loadCustomOllLibrary(store, builtin), [], '空共享库不重新迁入旧设置');
storage.delete(CUSTOM_OLL_LIBRARY_KEY);
store.setItem('seamlessOpSettings', JSON.stringify({ useCustom: true, customOll: builtin[0].origin }));
assert.deepEqual(loadCustomOllLibrary(store, builtin),
  [{ id: 'custom-legacy', name: '旧自定义 OLL', origin: builtin[0].origin }], '旧版单条公式迁移');
console.log('全局自定义 OLL 公式库迁移：通过');
