const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const Cube = require('../.tmp/cuber/cube.js').default;
const { matchPllSix } = require('../.tmp/ble/pll-six-sticker.js');
const { generateOpCase, validateOpCase } = require('../.tmp/ble/op-case.js');
const algs = require('../src/vue/Algs/algs.json');
const plls = algs.find(item => item.name === 'PLL').items;
const olls = algs.find(item => item.name === 'OLL').items;
const cube = new Cube(3);
const simulate = moves => { cube.twister.setup(moves.join(' ')); return cube.serialize(); };

for (const [pick, rotation] of [[0, ''], [0.26, 'y'], [0.51, "y'"], [0.76, 'y2']]) {
  const draws = [0, 0, pick];
  const sample = generateOpCase(plls, olls, () => draws.shift(), simulate);
  assert.equal(sample.targetPll, 'Aa');
  assert.equal(sample.ollName, 'OLL-01');
  assert.equal(sample.y, rotation);
  assert.equal(sample.beforeFacelets.length, 54);
  assert.equal(sample.afterFacelets.length, 54);
  assert.equal(matchPllSix(sample.afterFacelets).name, 'Aa');
  assert.notEqual(sample.beforeFacelets, sample.afterFacelets);
  assert.equal(simulate(sample.scramble.split(' ')), sample.beforeFacelets);
}

const last = generateOpCase(plls, olls, () => 0.99999, simulate);
assert.equal(last.targetPll, 'Z');
assert.equal(matchPllSix(last.afterFacelets).name, 'Z');
assert.throws(() => validateOpCase(plls[0], { name: '自定义', origin: 'U' }, '', simulate), /OLL|定向/);
assert.throws(() => generateOpCase(plls, [], Math.random, simulate), /为空/);
let checked = 0;
for (const y of ['', 'y', "y'", 'y2']) for (const pll of plls) for (const oll of olls) {
  const sample = validateOpCase(pll, oll, y, simulate);
  assert.equal(matchPllSix(sample.afterFacelets).name, sample.targetPll,
    `${pll.name} + ${oll.name} + ${y}`);
  checked++;
}
assert.equal(checked, 21 * 57 * 4);
console.log('无缝 OP 组合案例：通过');
