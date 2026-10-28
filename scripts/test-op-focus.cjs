const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const Cube = require('../.tmp/cuber/cube.js').default;
const { calculateOpFocus, focusDifficulty, selectFocusedCase, opWindowCoverage } = require('../.tmp/ble/op-focus.js');
const { validateOpCase } = require('../.tmp/ble/op-case.js');
const { traceOpStickers } = require('../.tmp/ble/op-sticker-trace.js');
const algs = require('../src/vue/Algs/algs.json');
const plls = algs.find(x => x.name === 'PLL').items;
const olls = algs.find(x => x.name === 'OLL').items;
const cube = new Cube(3);
const simulate = moves => { cube.twister.setup(moves.join(' ')); return cube.serialize(); };
let checked = 0;
const distribution = [0, 0, 0, 0, 0];
for (const oll of olls) {
  const sample = validateOpCase(plls[0], oll, '', simulate);
  distribution[opWindowCoverage(traceOpStickers(sample.moves)).filter(item => item.full).length]++;
}
assert.deepEqual(distribution, [17, 20, 18, 0, 2], '57 条 OLL 的满窗分布与 PLL 无关');
for (const z2 of [false, true]) for (const y of ['', 'y', "y'", 'y2']) {
  for (const pll of plls) for (const oll of olls) {
    const sample = validateOpCase(pll, oll, y, simulate, z2);
    const trace = traceOpStickers(sample.moves);
    const focus = calculateOpFocus(trace);
    assert.ok(['FR', 'RB', 'BL', 'LF'].includes(focus.view));
    assert.equal(focus.endpoints.length, 6);
    assert.equal(focus.missing, 6 - focus.visibleSources.length);
    assert.deepEqual([...new Set(focus.arrowIds)], focus.arrowIds);
    assert.ok(focus.arrowIds.length <= 6);
    assert.ok(focus.arrowIds.every(id => focus.indices.includes(trace.positions.at(-1)[id])));
    assert.ok(focus.arrowIds.every(id => trace.positions[0][id] < 9 || [9,10,11,18,19,20,36,37,38].includes(trace.positions[0][id])),
      '来源在 B 面不得画箭头');
    assert.equal(focus.full, focus.missing === 0);
    assert.equal(focus.missing, Math.min(...opWindowCoverage(trace).map(item => item.missing)),
      '优先选来源齐全的观察窗口');
    assert.ok(focusDifficulty(focus) >= focus.arrowIds.length);
    checked++;
  }
}
assert.equal(checked, 21 * 57 * 4 * 2);
const noPll = validateOpCase(null, olls[0], '', simulate);
assert.equal(calculateOpFocus(traceOpStickers(noPll.moves)).endpoints.length, 6);
const levels = [{ focus: { missing: 0, arrowIds: [1,2,3], changed: [1,2,3] } },
  { focus: { missing: 0, arrowIds: [1], changed: [1] } },
  { focus: { missing: 0, arrowIds: [1,2], changed: [1,2] } }];
assert.equal(selectFocusedCase(levels, 'all'), levels[0]);
assert.equal(selectFocusedCase(levels, 'beginner'), levels[1]);
assert.equal(selectFocusedCase(levels, 'intermediate'), levels[2]);
console.log('无缝 OP 重点线索：通过');
