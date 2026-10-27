const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const Cube = require('../.tmp/cuber/cube.js').default;
const { traceOpStickers, applyStickerPermutation } = require('../.tmp/ble/op-sticker-trace.js');
const { opWindow, opWindowIndices, recommendOpWindow } = require('../.tmp/ble/op-window.js');
const { parseOpFormula } = require('../.tmp/ble/op-formula.js');
const { validateOpCase } = require('../.tmp/ble/op-case.js');
const algs = require('../src/vue/Algs/algs.json');
const cube = new Cube(3);
const simulate = moves => { cube.twister.setup(moves.join(' ')); return cube.serialize(); };

const trace = traceOpStickers(['U', 'R', "U'", "R'"]);
assert.deepEqual(trace.positions[0], Array.from({ length: 54 }, (_, i) => i));
for (const step of trace.positions) assert.equal(new Set(step).size, 54);
assert.deepEqual(opWindowIndices('FR'), [18, 19, 20, 9, 10, 11]);
assert.deepEqual(opWindowIndices('LF'), [36, 37, 38, 18, 19, 20]);
const before = simulate(['R', 'F', 'U']);
const after = simulate(['R', 'F', 'U', 'U', 'R', "U'", "R'"]);
assert.equal(applyStickerPermutation(before, trace.positions.at(-1)), after);
for (const view of ['FR', 'LF']) {
  const row = opWindow(before, trace.positions, view);
  assert.equal(row.six, opWindowIndices(view).map(i => after[i]).join(''));
  assert.deepEqual(row.sources.map(i => trace.positions.at(-1)[i]), row.indices);
}
assert.equal(recommendOpWindow({ unique: true, visibleSources: 4, relationCount: 2 },
  { unique: false, visibleSources: 6, relationCount: 1 }).view, 'FR');
assert.equal(recommendOpWindow({ unique: false, visibleSources: 4, relationCount: 2 },
  { unique: true, visibleSources: 3, relationCount: 3 }).view, 'LF');
assert.match(recommendOpWindow({ unique: false, visibleSources: 3, relationCount: 2 },
  { unique: false, visibleSources: 4, relationCount: 3 }).message, /两窗口/);
for (const move of new Set(algs.find(group => group.name === 'OLL').items.flatMap(item => parseOpFormula(item.origin).moves))) {
  const one = traceOpStickers([move]);
  assert.equal(new Set(one.positions[1]).size, 54, move);
  const input = simulate(['F', 'U', 'R']);
  const output = simulate(['F', 'U', 'R', move]);
  assert.equal(applyStickerPermutation(input, one.positions[1]), output, move);
}
const plls = algs.find(group => group.name === 'PLL').items;
const olls = algs.find(group => group.name === 'OLL').items;
for (const y of ['', 'y', "y'", 'y2']) for (const pll of plls) for (const oll of olls) {
  const sample = validateOpCase(pll, oll, y, simulate);
  const path = traceOpStickers(sample.moves);
  assert.equal(applyStickerPermutation(sample.beforeFacelets, path.positions.at(-1)), sample.afterFacelets);
  for (const view of ['FR', 'LF']) {
    const row = opWindow(sample.beforeFacelets, path.positions, view, path.pieceIds);
    assert.equal(row.match.name, sample.targetPll, `${pll.name}/${oll.name}/${y}/${view}`);
    assert.equal(row.six, row.indices.map(i => sample.afterFacelets[i]).join(''));
  }
}
console.log('无缝 OP 贴纸身份与双窗口：通过');
