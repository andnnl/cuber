const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const {scanPllSix, pllScanStudyCases} = require('../.tmp/ble/pll-six-scan');
const {PLL_SCAN_TREE, PLL_SCAN_CASES} = require('../.tmp/ble/pll-six-scan-catalog');
const {enumerateCases} = require('./pll6-scan-analysis.cjs');
const {optimizeAnalysis} = require('./pll6-scan-optimize.cjs');
const {matchPllSix} = require('../.tmp/ble/pll-six-sticker');
const Cube = require('../.tmp/cuber/cube').default;
const optimized = optimizeAnalysis().strategies.find(strategy => strategy.mode === 'adaptive');
const examples = enumerateCases();
assert.equal(PLL_SCAN_CASES.length, 84);
assert.ok(PLL_SCAN_TREE.length < 100, '浏览器只加载精简树，不加载穷举报告');
assert.equal(scanPllSix(null), null);
const study = pllScanStudyCases();
assert.equal(study.length, 84);
for (const [count,total] of [[3,16],[4,30],[5,38]])
  assert.equal(study.filter(item => item.steps.length === count).length,total);
for (const sample of examples) {
  const feature = matchPllSix(sample.facelets);
  const actual = scanPllSix(feature);
  const expected = optimized.routes.find(route => route.id === sample.id);
  assert.equal(actual.name,sample.name);
  assert.equal(actual.steps.length,expected.path.length);
  assert.deepEqual(actual.steps.map(step => [step.a,step.b,step.relation]),
    expected.path.map(step => [step.a,step.b,step.answer]), '运行时树必须与离线优化树一致');
  assert.equal(scanPllSix({...feature,name:'错误标签'}), null, '不能根据预设答案强行匹配');
  for (const rotation of ['', 'z2']) for (const preAuf of ['', 'U', 'U2', "U'"]) {
    const cube = new Cube(3);
    cube.twister.setup([rotation,preAuf,sample.scramble].filter(Boolean).join(' '));
    const variation = scanPllSix(matchPllSix(cube.serialize()));
    assert.equal(variation?.name, sample.name, `${sample.id} ${rotation} ${preAuf}`);
    assert.ok(variation.steps.length >= 3 && variation.steps.length <= 5);
  }
}
console.log('最少比较运行时目录、84 例精简路径、672 个 AUF/z2 变体、3/4/5 次分组：通过');
