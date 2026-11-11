const assert = require('node:assert/strict');
global.requestAnimationFrame = () => 0;
const { topNetCells, topNetArrows } = require('../.tmp/ble/op-top-net.js');
const { traceOpStickers } = require('../.tmp/ble/op-sticker-trace.js');
const left = topNetCells('before'), right = topNetCells('after');
assert.equal(left.length, 18);
assert.equal(right.length, 21);
assert.deepEqual(right.filter(c => c.side === 'U').map(c => c.index), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
for (const [side, indices] of Object.entries({ B:[47,46,45], L:[36,37,38], F:[18,19,20], R:[11,10,9] }))
  assert.deepEqual(right.filter(c => c.side === side).map(c => c.index), indices);
assert.equal(left.some(c => c.side === 'B'), false);
assert.deepEqual(topNetCells('before', true), right, '显示 B 面时左图应补齐背面三格');
assert.equal(right.some(c => [0,4].includes(c.col) && [0,4].includes(c.row)), false);
const trace = traceOpStickers(['U']);
const arrows = topNetArrows(trace.positions, 0);
assert.ok(arrows.every(a => left.some(c => c.index === a.from)));
assert.ok(arrows.some(a => a.from !== a.to));
assert.equal(topNetArrows(trace.positions, 1).length, 0);
const { selectNetArrow } = require('../.tmp/ble/op-top-net.js');
const { filterOpDestinationArrows } = require('../.tmp/ble/op-top-net.js');
const destinationSamples = [0, 9, 18, 36, 45].map((to, id) => ({ id, from: 0, to, targetVisible: true }));
assert.deepEqual(filterOpDestinationArrows(destinationSamples, ['L', 'F', 'R', 'B']), destinationSamples);
assert.deepEqual(filterOpDestinationArrows(destinationSamples, ['L', 'R', 'B']).map(arrow => arrow.to), [0, 9, 36, 45]);
assert.deepEqual(filterOpDestinationArrows(destinationSamples, []).map(arrow => arrow.to), [0], 'U 面目的地始终保留');
assert.equal(selectNetArrow(arrows, null)?.id, arrows[0].id);
assert.equal(selectNetArrow(arrows, arrows[1].id)?.id, arrows[1].id);
assert.equal(selectNetArrow(arrows, -1)?.id, arrows[0].id);
const { topObservationArrows } = require('../.tmp/ble/op-top-net.js');
const yellowTop = 'FR' + 'U'.repeat(52);
assert.deepEqual(topObservationArrows(yellowTop, trace.positions, 0).map(a => a.id), [0, 1],
  '仅追踪左图内与顶面中心异色的贴纸');
const sideColors = [...yellowTop];
sideColors[9] = 'F';
sideColors[18] = 'L';
sideColors[36] = 'R';
sideColors[47] = 'B';
assert.deepEqual(topObservationArrows(sideColors.join(''), trace.positions, 0).map(a => a.from),
  [0, 1, 9, 18, 36], 'L/F/R 顶层异色贴纸也要有箭头，背面 B 不画');
const withBack = topObservationArrows(sideColors.join(''), trace.positions, 0, true);
assert.deepEqual(withBack.map(arrow => arrow.from), [0, 1, 9, 18, 36, 47], '显示 B 面时也应绘制背面来源箭头');
assert.ok(withBack.every(arrow => arrow.targetVisible), '显示 B 面时背面终点应可见');
assert.ok(topNetArrows(trace.positions, 0, undefined, true).some(arrow => arrow.from === 45), '通用轨迹应支持背面来源');
assert.deepEqual(topObservationArrows('U'.repeat(54), trace.positions, 0), [], '全黄顶不画箭头');
const whiteTop = 'F' + 'D'.repeat(53);
assert.deepEqual(topObservationArrows(whiteTop, trace.positions, 0).map(a => a.id), [0],
  'z2 后用当前顶面中心色，而不是写死黄色');
const whiteSideColors = [...whiteTop];
whiteSideColors[18] = 'U';
assert.deepEqual(topObservationArrows(whiteSideColors.join(''), trace.positions, 0).map(a => a.from), [0, 18],
  '白顶时也追踪侧面非白色贴纸，同时忽略侧面白色贴纸');
assert.deepEqual(topObservationArrows(yellowTop, trace.positions, 1), [], '已经执行完毕不画箭头');
const stationary = topObservationArrows(yellowTop, traceOpStickers(['F']).positions, 0);
assert.ok(stationary.some(a => a.from === 0 && a.to === 0), '非顶色贴纸原位不动也需显示去向');
const turnToSide = traceOpStickers(['y', 'U']);
const { applyStickerPermutation } = require('../.tmp/ble/op-sticker-trace.js');
const rotatedColors = applyStickerPermutation('U'.repeat(45) + 'B'.repeat(9), turnToSide.positions[1]);
assert.ok(topObservationArrows(rotatedColors, turnToSide.positions, 1)
  .every(arrow => ![45,46,47].includes(turnToSide.positions[0][arrow.id])),
  '原先在 B 面的来源，即使转到可见位置也不显示箭头');
assert.ok(topObservationArrows(rotatedColors, turnToSide.positions, 1, true)
  .some(arrow => [45,46,47].includes(turnToSide.positions[0][arrow.id])),
  '显示 B 面时应保留原先在背面、转动后可见的贴纸轨迹');
const { opWindowCoverage } = require('../.tmp/ble/op-focus.js');
assert.ok(opWindowCoverage(trace, true).every(window => window.full && window.arrowIds.length === 6),
  '显示 B 面后六格覆盖应计入背面来源');
assert.ok(opWindowCoverage(trace).some(window => window.missing > 0), '默认覆盖仍不计背面来源');
console.log('无缝 OP 顶层展开图：通过');
