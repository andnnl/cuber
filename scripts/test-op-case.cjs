const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const Cube = require('../.tmp/cuber/cube.js').default;
const { matchPllSix } = require('../.tmp/ble/pll-six-sticker.js');
const { generateOpCase, validateOpCase, switchOpPll } = require('../.tmp/ble/op-case.js');
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
const none = generateOpCase([], olls, () => 0, simulate, 'none');
assert.equal(none.targetPll, '无 PLL');
assert.equal(none.pllFormula, '');
assert.ok([0, 9, 18, 27, 36, 45].every(base =>
  none.afterFacelets.slice(base, base + 9) === none.afterFacelets[base + 4].repeat(9)));
assert.equal(simulate(none.scramble.split(' ')), none.beforeFacelets);
const mixed = generateOpCase(plls, olls, () => 0.99999, simulate, 'mixed');
assert.equal(mixed.targetPll, '无 PLL');
const previous = validateOpCase(plls[0], olls[0], 'y', simulate, true);
const previousSnapshot = JSON.stringify(previous);
const replaced = switchOpPll(previous, [plls[0], plls[1]], () => 0, simulate);
assert.equal(replaced.targetPll, 'Ab', '不重复当前 PLL');
assert.equal(replaced.ollFormula, previous.ollFormula);
assert.equal(replaced.ollName, previous.ollName);
assert.equal(replaced.y, previous.y);
assert.equal(replaced.z2, previous.z2);
assert.notEqual(replaced.beforeFacelets, previous.beforeFacelets);
assert.equal(matchPllSix(replaced.afterFacelets).name, replaced.targetPll);
assert.equal(JSON.stringify(previous), previousSnapshot, '换题不得改变原案例');
const withoutPll = validateOpCase(null, olls[0], "y'", simulate);
const newPll = switchOpPll(withoutPll, [plls[0]], () => 0, simulate);
assert.equal(newPll.targetPll, 'Aa', '无 PLL 也切到有 PLL');
assert.equal(newPll.y, withoutPll.y);
assert.throws(() => switchOpPll(previous, [plls[0]], () => 0, simulate), /没有可更换的 PLL/);
assert.throws(() => switchOpPll(previous, [], () => 0, simulate), /没有可更换的 PLL/);
assert.throws(() => switchOpPll(previous, [{ name: 'PLL-Ab', origin: 'U' }], () => 0, simulate), /无可用|失败/);
assert.equal(JSON.stringify(previous), previousSnapshot, '失败仍保留原题');
let solvedChecked = 0;
for (const y of ['', 'y', "y'", 'y2']) for (const oll of olls) {
  const sample = validateOpCase(null, oll, y, simulate);
  assert.ok([0, 9, 18, 27, 36, 45].every(base =>
    sample.afterFacelets.slice(base, base + 9) === sample.afterFacelets[base + 4].repeat(9)));
  solvedChecked++;
}
assert.equal(solvedChecked, 57 * 4);
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
for (const y of ['', 'y', "y'", 'y2']) for (const pll of plls) for (const oll of olls) {
  const rotated = validateOpCase(pll, oll, y, simulate, true);
  assert.equal(rotated.z2, true);
  assert.equal(rotated.scramble.split(' ')[0], 'z2');
  assert.equal(simulate(rotated.scramble.split(' ')), rotated.beforeFacelets);
  assert.equal(simulate([...rotated.scramble.split(' '), ...rotated.moves]), rotated.afterFacelets);
}
for (const y of ['', 'y', "y'", 'y2']) for (const oll of olls) {
  const rotated = validateOpCase(null, oll, y, simulate, true);
  assert.equal(rotated.targetPll, '无 PLL');
}
console.log('无缝 OP 组合案例：通过');
