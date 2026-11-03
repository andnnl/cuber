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
  const withZ2 = makeFormulaCase(item, plls, () => 0.3, true);
  const rotated = new Cube(3);
  rotated.twister.setup(withZ2.scramble);
  assert.equal(withZ2.scramble, `z2 ${generated.scramble}`, `${category} 出题前 z2 保留原打乱顺序`);
  assert.equal(withZ2.initialFacelets, rotated.serialize(), `${category} 实际题面同步 z2`);
  assert.equal(withZ2.initialFacelets[4], 'D', `${category} 黄顶题面`);
  for (const beforeY of ['', 'y', "y'", 'y2']) {
    const withY = makeFormulaCase(item, plls, () => 0.3, true, beforeY);
    const expected = ['z2', beforeY, generated.scramble].filter(Boolean).join(' ');
    assert.equal(withY.scramble, expected, `${category} 出题前 y 保留原打乱顺序`);
    const oriented = new Cube(3);
    oriented.twister.setup(expected);
    assert.equal(withY.initialFacelets, oriented.serialize(), `${category} 出题前 y 题面一致`);
    const completed = new Cube(3);
    completed.twister.setup([expected, "U'", item.formula,
      category === 'pll' ? "U'" : ''].filter(Boolean).join(' '));
    assert.equal(isFormulaGoal(category, completed.serialize()), true, `${category} 转向后正公式仍可达到训练目标`);
  }
  assert.match(generated.initialFacelets, /^[URFDLB]{54}$/);
  assert.notEqual(generated.initialFacelets, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  assert.equal(generated.id, item.id);
}
assert.match(makeFormulaCase(pool.find(item => item.name === 'F2L-32')).initialFacelets, /^[URFDLB]{54}$/,
  '括号与重复次数可解析');
assert.match(makeFormulaCase(pool.find(item => item.id === 'oll:custom-1'), plls, () => 0.3).initialFacelets, /^[URFDLB]{54}$/);
for (const [random, rotation] of [[0, ''], [0.25, 'U'], [0.5, "U'"], [0.75, 'U2']]) {
  const pll = makeFormulaCase(plls[6], plls, () => random);
  assert.equal(pll.scramble, [rotation, ...parseOpFormula(plls[6].formula).inverse, rotation].filter(Boolean).join(' '));
  const oll = makeFormulaCase(pool.find(item => item.category === 'oll'), plls, () => random);
  assert.equal(oll.scramble.startsWith(rotation ? `${rotation} ` : ''), true, 'OLL 整体朝向跟随随机值');
}
for (const item of pool) {
  const result = makeFormulaCase(item, plls, () => 0.3);
  const cube = new Cube(3);
  const inverse = parseOpFormula(item.formula).inverse;
  const expected = item.category === 'oll' ? ['U', ...parseOpFormula(plls[6].formula).inverse, ...inverse, 'U'] :
    item.category === 'pll' ? ['U', ...inverse, 'U'] : [...inverse, 'U'];
  assert.equal(result.scramble, expected.join(' '), `${item.id} 使用无缝 OP 的打乱顺序`);
  cube.twister.setup(result.scramble);
  assert.equal(cube.serialize(), result.initialFacelets, `${item.id} 题面与打乱串一致`);
  cube.twister.setup([result.scramble, "U'", item.formula,
    item.category === 'pll' ? "U'" : ''].filter(Boolean).join(' '));
  assert.equal(isFormulaGoal(item.category, cube.serialize()), true, `${item.id} 正公式达到训练目标`);
  if (item.category === 'oll') assert.equal(cube.complete, false, `${item.id} 做完 OLL 应留下 PLL`);
}
assert.throws(() => makeFormulaCase({ id: 'bad', category: 'oll', name: 'bad', formula: 'R ???' }, plls), /不支持/);
assert.throws(() => makeFormulaCase({ id: 'identity', category: 'pll', name: 'identity', formula: "R R'" }), /还原|无效/);
for (const category of ['f2l', 'oll', 'pll']) {
  const item = pool.find(value => value.category === category);
  const base = makeFormulaCase(item, plls, () => 0, false, '', false);
  for (const [value, tail] of [[0, ''], [0.25, 'U'], [0.5, "U'"], [0.75, 'U2']]) {
    const choices = category === 'oll' ? [0, 0, value] : category === 'pll' ? [0, value] : [value];
    const withRandomU = makeFormulaCase(item, plls, () => choices.shift() ?? 0, false, '', true);
    assert.equal(withRandomU.scramble, [base.scramble, tail].filter(Boolean).join(' '),
      `${category} 勾选随机 U 时在公式逆操作后追加 ${tail || '无'}`);
    const offChoices = category === 'oll' ? [0, 0, 0.3] : category === 'pll' ? [0, 0.3] : [0.3];
    const withoutRandomU = makeFormulaCase(item, plls, () => offChoices.shift() ?? 0, false, '', false);
    assert.equal(withoutRandomU.scramble, base.scramble,
      `${category} 取消随机 U 后不消耗末尾随机值，且保留原有前置随机`);
    assert.deepEqual(offChoices, [0.3], `${category} 关闭随机 U 不抽取末尾随机值`);
  }
}
for (const category of ['oll', 'pll']) {
  const item = pool.find(value => value.category === category);
  const before = makeFormulaCase(item, plls, () => 0);
  for (const [value, tail, undo] of [[0, '', ''], [0.25, 'U', "U'"],
    [0.5, "U'", 'U'], [0.75, 'U2', 'U2']]) {
    // OLL 先抽 PLL、前置 AUF，再抽后置 AUF；PLL 抽前置 AUF 后再抽后置 AUF。
    const choices = category === 'oll' ? [0, 0, value] : [0, value];
    const generated = makeFormulaCase(item, plls, () => choices.shift() ?? 0);
    assert.equal(generated.scramble, [before.scramble, tail].filter(Boolean).join(' '),
      `${category} 最后追加 ${tail || '无'}，不改变原先的出题公式`);
    const cube = new Cube(3);
    cube.twister.setup([generated.scramble, undo, item.formula].filter(Boolean).join(' '));
    assert.equal(isFormulaGoal(category, cube.serialize()), true,
      `${category} 后置 AUF ${tail || '无'} 可以通过起手调整回所选公式的目标`);
  }
}
for (const item of pool.filter(value => value.category === 'oll' || value.category === 'pll')) {
  for (const [beforeIndex, before] of ['', 'U', "U'", 'U2'].entries()) {
    const baseIndices = item.category === 'oll' ? [0.3, beforeIndex / 4, 0] : [beforeIndex / 4, 0];
    const base = makeFormulaCase(item, plls, () => baseIndices.shift() ?? 0).scramble;
    for (const [afterIndex, tail] of ['', 'U', "U'", 'U2'].entries()) {
      const indices = item.category === 'oll' ? [0.3, beforeIndex / 4, afterIndex / 4] :
        [beforeIndex / 4, afterIndex / 4];
      const generated = makeFormulaCase(item, plls, () => indices.shift() ?? 0);
      assert.equal(generated.scramble, [base, tail].filter(Boolean).join(' '),
        `${item.id} 前置 ${before || '无'} 时末尾随机选择 ${tail || '无'}`);
      const undo = tail === 'U' ? "U'" : tail === "U'" ? 'U' : tail;
      const cube = new Cube(3);
      cube.twister.setup([generated.scramble, undo, item.formula,
        item.category === 'pll' ? before === 'U' ? "U'" : before === "U'" ? 'U' : before : ''].filter(Boolean).join(' '));
      assert.equal(isFormulaGoal(item.category, cube.serialize()), true,
        `${item.id} 前置 ${before || '无'} / 后置 ${tail || '无'} 必须仍能完成训练目标`);
    }
  }
}
console.log('公式训练 F2L/OLL/PLL 题面生成：通过');
