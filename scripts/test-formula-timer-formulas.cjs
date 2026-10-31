const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { makeFormulaCase, buildFormulaPool } = require('../.tmp/ble/formula-timer-formula.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const { isFormulaGoal } = require('../.tmp/ble/formula-timer.js');
const groups = require('../src/vue/Algs/algs.json');

const custom = [{ name: '我的 OLL', origin: "R U R' U R U2 R'", id: 'custom-1' }];
const pool = buildFormulaPool(groups, custom);
const plls = pool.filter(item => item.category === 'pll');
assert.equal(pool.filter(item => item.category === 'f2l').length, 41);
assert.equal(pool.filter(item => item.category === 'oll').length, groups[1].items.length + 1);
assert.equal(pool.filter(item => item.category === 'pll').length, groups[2].items.length);
assert.equal(new Set(pool.map(item => item.id)).size, pool.length);

for (const category of ['f2l', 'oll', 'pll']) {
  const item = pool.find(value => value.category === category);
  const generated = makeFormulaCase(item, plls, () => 0.3);
  assert.match(generated.initialFacelets, /^[URFDLB]{54}$/);
  assert.notEqual(generated.initialFacelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.equal(generated.id, item.id);
}
assert.match(makeFormulaCase(pool.find(item => item.name === 'F2L-32')).initialFacelets, /^[URFDLB]{54}$/,
  '括号与重复次数可解析');
assert.match(makeFormulaCase(pool.find(item => item.id === 'oll:custom-1'), plls, () => 0.3).initialFacelets, /^[URFDLB]{54}$/);
for (const [random, rotation] of [[0, ''], [0.25, 'y'], [0.5, "y'"], [0.75, 'y2']]) {
  const pll = makeFormulaCase(plls[6], plls, () => random);
  assert.equal(pll.scramble, [rotation, ...parseOpFormula(plls[6].formula).inverse].filter(Boolean).join(' '));
  const oll = makeFormulaCase(pool.find(item => item.category === 'oll'), plls, () => random);
  assert.equal(oll.scramble.startsWith(rotation ? `${rotation} ` : ''), true, 'OLL 整体朝向跟随随机值');
}
for (const item of pool) {
  const result = makeFormulaCase(item, plls, () => 0.3);
  const cube = new Cube(3);
  const inverse = parseOpFormula(item.formula).inverse;
  const expected = item.category === 'oll' ? ['y', ...parseOpFormula(plls[6].formula).inverse, ...inverse] :
    item.category === 'pll' ? ['y', ...inverse] : inverse;
  assert.equal(result.scramble, expected.join(' '), `${item.id} 使用无缝 OP 的打乱顺序`);
  cube.twister.setup(result.scramble);
  assert.equal(cube.serialize(), result.initialFacelets, `${item.id} 题面与打乱串一致`);
  cube.twister.setup(`${result.scramble} ${item.formula}`);
  assert.equal(isFormulaGoal(item.category, cube.serialize()), true, `${item.id} 正公式达到训练目标`);
  if (item.category === 'oll') assert.equal(cube.complete, false, `${item.id} 做完 OLL 应留下 PLL`);
}
assert.throws(() => makeFormulaCase({ id: 'bad', category: 'oll', name: 'bad', formula: 'R ???' }, plls), /不支持/);
assert.throws(() => makeFormulaCase({ id: 'identity', category: 'pll', name: 'identity', formula: "R R'" }), /还原|无效/);
console.log('公式训练 F2L/OLL/PLL 题面生成：通过');
