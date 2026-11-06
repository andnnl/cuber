const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { previewFormulaFacelets, cubeIconTiles, algsPreviewExpression } = require('../.tmp/ble/formula-timer-preview.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const groups = require('../src/vue/Algs/algs.json');
const advanced = require('../src/vue/AdvancedF2L/data.json').cases;
const { formulaTimerMaskPlan, unmaskedFormulaFacelets } = require('../.tmp/ble/formula-timer-preview.js');
const { advancedF2LCapturePlan, applyAdvancedF2LMask } = require('../.tmp/ble/adv-f2l.js');
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const firstAdvanced = advanced[0];
const choice = { id:`advf2l:${firstAdvanced.id}:0:${firstAdvanced.algs[0][0].altId}`,
  category:'advf2l', formula:firstAdvanced.algs[0][0].alg };
const initialPlan = advancedF2LCapturePlan(firstAdvanced, false);
assert.deepEqual(formulaTimerMaskPlan(choice, advanced).blackCubelets, initialPlan.blackCubelets);
for (const prefix of ['', 'z2', "y'", 'z2 y2']) for (const auf of ['', 'U', "U'", 'U2']) {
  const scramble = [prefix, ...parseOpFormula(choice.formula).inverse, auf].filter(Boolean).join(' ');
  const mask = formulaTimerMaskPlan({...choice, scramble}, advanced);
  const noAuf = formulaTimerMaskPlan({...choice, scramble:[prefix, ...parseOpFormula(choice.formula).inverse].filter(Boolean).join(' ')}, advanced);
  assert.deepEqual(mask, noAuf, '随机 U 不得改变受保护角棱的身份');
  const cube = new Cube(3);
  cube.twister.setup(scramble);
  const state = cube.serialize();
  applyAdvancedF2LMask(cube, mask);
  const masked = cube.serialize();
  assert.equal(unmaskedFormulaFacelets(cube), state, '判定读取实际题面而不是遮罩');
  assert.equal(cube.serialize(), masked, '判定后保留遮罩显示');
  applyAdvancedF2LMask(cube, null);
  assert.equal(cube.serialize(), state, '显示遮罩不改变题面');
}
assert.equal(formulaTimerMaskPlan({category:'pll', formula:'R'}, advanced), null);
const maskSimulator = new Cube(3);
for (const source of advanced) for (let direction = 0; direction < 4; direction++) {
  source.algs[direction].forEach((variant, index) => {
    for (const flipped of [false, true]) {
      const expected = advancedF2LCapturePlan(source, flipped, direction, maskSimulator, index);
      const item = {id:`advf2l:${source.id}:${direction}:${variant.altId}`, category:'advf2l',
        formula:variant.alg, scramble:`${expected.exp} U2`};
      const actual = formulaTimerMaskPlan(item, advanced, maskSimulator);
      assert.deepEqual(actual, {strip:expected.strip, blackCubelets:expected.blackCubelets},
        `${item.id}/${flipped} 与非标公式库相同，随机 U 不改变保护块`);
    }
  });
}

const f2l = groups[0].items[0];
assert.equal(algsPreviewExpression(f2l), `x2 (${f2l.origin})'`, '与 mode=algs 的普通 F2L 图标表达式一致');
assert.equal(algsPreviewExpression({ origin:'R', exp:'R2', scramble:true }), 'x2 R2', '遵循公式库的 scramble 标记');
const pll = groups[2].items[0];
const pllPreview = previewFormulaFacelets(`z2 ${require('../.tmp/ble/op-formula.js').parseOpFormula(pll.origin).inverse.join(' ')}`);
assert.match(pllPreview, /^[URFDLB]{54}$/, 'PLL 使用 OLL 同款黄顶展开图题面');
assert.notEqual(pllPreview, previewFormulaFacelets('z2'), 'PLL 图标不能是纯色还原态');

const state = previewFormulaFacelets("R U R'");
const expected = new Cube(3);
expected.twister.setup("R U R'");
assert.equal(state, expected.serialize());

const tiles = cubeIconTiles(state);
assert.equal(tiles.length, 27, '上、前、右各九块');
assert.deepEqual(tiles.filter(tile => tile.face === 'U').map(tile => tile.color), state.slice(0, 9).split(''));
assert.deepEqual(tiles.filter(tile => tile.face === 'F').map(tile => tile.color), state.slice(18, 27).split(''));
assert.deepEqual(tiles.filter(tile => tile.face === 'R').map(tile => tile.color), state.slice(9, 18).split(''));
assert.equal(new Set(tiles.map(tile => tile.points)).size, 27, '每块有独立的投影位置');
assert.throws(() => cubeIconTiles('U'), /54/);
console.log('formula timer previews ok');
