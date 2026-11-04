const assert = require('node:assert/strict');
const cases = require('../src/vue/AdvancedF2L/data.json').cases;

assert.equal(cases.length, 54, '保留全部 54 个非标 F2L 案例');
assert.deepEqual(Object.fromEntries([...new Set(cases.map(item => item.subgroup))]
  .map(group => [group, cases.filter(item => item.subgroup === group).length])), {
  'Trapped Corner': 18,
  'Trapped Edge': 18,
  'Both Pieces Trapped': 18,
});
assert.equal(cases.reduce((total, item) => total + item.algs.flat().length, 0), 598);
assert.ok(cases.every(item => item.algs.length === 4 && item.oriNames.length === 4));
assert.ok(cases.some(item => item.algs.some(group => !group.length)), '源数据中的空方向不能补造公式');
assert.ok(cases.every(item => item.algs.flat().every(variant => variant.altId && variant.alg)));

console.log('非标 F2L 数据完整性：通过');
