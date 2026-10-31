const assert = require('node:assert/strict');
globalThis.requestAnimationFrame = () => 0;
const { previewFormulaFacelets, cubeIconTiles, algsPreviewExpression } = require('../.tmp/ble/formula-timer-preview.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const groups = require('../src/vue/Algs/algs.json');

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
