const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { makeFormulaCase, buildFormulaPool } = require('../.tmp/ble/formula-timer-formula.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const groups = require('../src/vue/Algs/algs.json');

const custom = [{ name: '我的 OLL', origin: "R U R' U R U2 R'", id: 'custom-1' }];
const pool = buildFormulaPool(groups, custom);
assert.equal(pool.filter(item => item.category === 'f2l').length, 41);
assert.equal(pool.filter(item => item.category === 'oll').length, groups[1].items.length + 1);
assert.equal(pool.filter(item => item.category === 'pll').length, groups[2].items.length);
assert.equal(new Set(pool.map(item => item.id)).size, pool.length);

for (const category of ['f2l', 'oll', 'pll']) {
  const item = pool.find(value => value.category === category);
  const generated = makeFormulaCase(item);
  assert.match(generated.initialFacelets, /^[URFDLB]{54}$/);
  assert.notEqual(generated.initialFacelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.equal(generated.id, item.id);
}
assert.match(makeFormulaCase(pool.find(item => item.name === 'F2L-32')).initialFacelets, /^[URFDLB]{54}$/,
  '括号与重复次数可解析');
assert.match(makeFormulaCase(pool.find(item => item.id === 'oll:custom-1')).initialFacelets, /^[URFDLB]{54}$/);
for (const item of pool) {
  const result = makeFormulaCase(item);
  const cube = new Cube(3);
  cube.twister.setup(parseOpFormula(item.formula).inverse.join(' '));
  assert.equal(cube.serialize(), result.initialFacelets, `${item.id} 逆公式一致`);
  cube.twister.setup([...parseOpFormula(item.formula).inverse, ...parseOpFormula(item.formula).moves].join(' '));
  assert.equal(cube.complete, true, `${item.id} 正公式能还原生成的案例`);
}
assert.throws(() => makeFormulaCase({ id: 'bad', category: 'oll', name: 'bad', formula: 'R ???' }), /不支持/);
assert.throws(() => makeFormulaCase({ id: 'identity', category: 'pll', name: 'identity', formula: "R R'" }), /还原|无效/);
console.log('公式训练 F2L/OLL/PLL 题面生成：通过');
