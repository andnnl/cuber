const assert = require('node:assert/strict');
const cases = require('../src/vue/AdvancedF2L/data.json').cases;
global.requestAnimationFrame = () => 0;
const { selectAdvancedF2LCase, advancedF2LPreview, advancedF2LCapturePlan, applyAdvancedF2LMask } = require('../.tmp/ble/adv-f2l.js');
const Cube = require('../.tmp/cuber/cube.js').default;
const { FACE } = require('../.tmp/cuber/define.js');
const { parseAppRoute, routeUrl } = require('../.tmp/ble/app-route.js');
const fs = require('node:fs');
const path = require('node:path');

assert.equal(cases.length, 54, '保留全部 54 个非标 F2L 案例');
assert.deepEqual(Object.fromEntries([...new Set(cases.map(item => item.subgroup))]
  .map(group => [group, cases.filter(item => item.subgroup === group).length])), {
  'Trapped Corner': 18,
  'Trapped Edge': 18,
  'Both Pieces Trapped': 18,
});
assert.equal(cases.reduce((total, item) => total + item.algs.flat().length, 0), 598);
assert.ok(cases.every(item => item.algs.length === 4 && item.oriNames.length === 4));
assert.ok(cases.some(item => item.algs.some(group => !group.length)), '源数据中的空方向不能补造公式');
assert.ok(cases.every(item => item.algs.flat().every(variant => variant.altId && variant.alg)));

const first = selectAdvancedF2LCase(cases[0], 0, 0);
assert.equal(first.id, cases[0].id);
assert.equal(first.altId, cases[0].algs[0][0].altId);
assert.equal(first.displayFormula, cases[0].algs[0][0].alg);
assert.ok(first.moves.length && first.inverse.length);

const displayCube = new Cube(3);
for (const item of cases) for (let direction = 0; direction < 4; direction++) {
  for (let variant = 0; variant < item.algs[direction].length; variant++) {
    const selected = selectAdvancedF2LCase(item, direction, variant);
    const plan = advancedF2LCapturePlan(item, false, direction, displayCube, variant);
    assert.equal(plan.exp, selected.inverse.join(' '), '遮罩必须基于当前所选公式的初始状态');
  }
}
const displayPlan = advancedF2LCapturePlan(cases[0], false);
displayCube.twister.setup(`${displayPlan.exp} U`);
const beforeMask = displayCube.serialize();
const positions = displayCube.cubelets.map(piece => piece.initial);
applyAdvancedF2LMask(displayCube, displayPlan);
assert.ok(displayCube.initials[20].stickers.filter(Boolean).every(sticker => !sticker.visible));
assert.ok(displayCube.initials[2].stickers.filter(Boolean).every(sticker => sticker.visible));
assert.ok(displayCube.initials[5].stickers.filter(Boolean).every(sticker => sticker.visible));
assert.ok([18, 21, 0, 3].every(index => displayCube.initials[index].stickers.filter(Boolean).every(sticker => sticker.visible)));
assert.ok(displayCube.cubelets.every(piece => piece.visible), '只变黑，不移除块体');
applyAdvancedF2LMask(displayCube, null);
assert.equal(displayCube.serialize(), beforeMask, '关闭隐藏必须恢复贴纸，不改变魔方状态');
assert.deepEqual(displayCube.cubelets.map(piece => piece.initial), positions);

assert.deepEqual(advancedF2LCapturePlan(cases[0], false, 0).blackCubelets, [20, 23],
  'AF2L 1 的前右指角块当前在前右：保护实际后右配色的目标角棱，而非前右配色的角棱');
for (const index of [18, 36]) {
  assert.deepEqual(advancedF2LCapturePlan(cases[index], false, 0).blackCubelets, [20, 23],
    `${cases[index].subgroup} 同样按当前位置找到目标角棱`);
}
const flippedFirst = advancedF2LCapturePlan(cases[0], true, 0);
assert.deepEqual(flippedFirst.blackCubelets, [24, 21], '翻转后保护当前前右位置实际角块和对应棱块');
for (const index of [6, 3, 26, 23, 8, 5]) {
  assert.ok(!Object.values(flippedFirst.strip).some(indices => indices.includes(index)),
    `翻转后的目标块和已完成槽位 ${index} 不能被顶层去贴纸规则误伤`);
}
const captureSimulator = new Cube(3);
const slotFaces = [
  { indices: [20, 23], corner: ['D', 'F', 'R'], edge: ['F', 'R'] },
  { indices: [18, 21], corner: ['D', 'L', 'F'], edge: ['L', 'F'] },
  { indices: [0, 3], corner: ['D', 'B', 'L'], edge: ['B', 'L'] },
  { indices: [2, 5], corner: ['D', 'R', 'B'], edge: ['R', 'B'] },
];
for (const item of cases) for (let direction = 0; direction < 4; direction++) for (const flipped of [false, true]) {
  const plan = advancedF2LCapturePlan(item, flipped, direction, captureSimulator);
  const selection = item.algs[direction].length ? selectAdvancedF2LCase(item, direction, 0) : null;
  const expected = new Cube(3);
  const initialExp = [flipped ? 'z2' : '', ...(selection ? selection.inverse : [item.setup]),
    selection ? '' : ['', 'y', 'y2', "y'"][direction]].filter(Boolean).join(' ');
  expected.twister.setup(initialExp);
  const state = expected.serialize();
  const centers = Object.fromEntries([...'URFDLB'].map((face, index) => [face, state[index * 9 + 4]]));
  const cornerPosition = slotFaces[direction].indices[0] + (item.subgroup === 'Trapped Edge' ? 6 : 0);
  const targetCorner = expected.cubelets[cornerPosition];
  const targetColors = targetCorner.stickers.filter(Boolean).map(sticker => sticker.name);
  assert.ok(targetColors.includes(centers.D), '分类位置上的角块应为当前底色的 F2L 角块');
  const expectedBlack = [];
  slotFaces.forEach((slot, index) => {
    const done = [slot.corner, slot.edge].every((faces, piece) => faces.every(face =>
      expected.cubelets[slot.indices[piece]].getColor(FACE[face]) === centers[face]));
    for (const faces of [slot.corner, slot.edge]) {
      const colors = faces.map(face => centers[face]).sort().join('');
      const piece = expected.initials.find(cubelet => cubelet.stickers.filter(Boolean)
        .map(sticker => sticker.name).sort().join('') === colors);
      if (faces.length === 3 ? piece.initial === targetCorner.initial || done :
        colors === targetColors.filter(color => color !== centers.D).sort().join('') || done) {
        assert.ok(!plan.blackCubelets.includes(piece.initial), `${item.name}/${direction}/${flipped} 目标及已完成角棱不能变黑`);
        for (const sticker of piece.stickers.filter(Boolean)) {
          assert.ok(!(plan.strip[sticker.name] || []).includes(piece.initial), '保护块的任何贴纸都不能变黑');
        }
      } else expectedBlack.push(piece.initial);
    }
  });
  assert.deepEqual(plan.blackCubelets, expectedBlack, '仅将无关且初始未完成的槽位角棱变黑');
  captureSimulator.twister.setup(plan.exp);
  assert.equal(captureSimulator.serialize(), expected.serialize(), '使用固定公式库视角，不能把各分类角块再次转到前右');
}
assert.throws(() => advancedF2LCapturePlan(cases[0], false, 4), /未知槽位/);
assert.notEqual(selectAdvancedF2LCase(cases[0], 0, 1).altId, first.altId);
assert.throws(() => selectAdvancedF2LCase(cases.find(item => item.name === 'AF2L 9a'), 1, 0), /暂无解法/);

const failures = [];
const previewCube = new Cube(3);
const slotPositions = [[20, 23], [18, 21], [0, 3], [2, 5]];
const previewPositions = [
  Array.from({length:9}, (_, i) => Math.floor(i / 3) * 9 + 6 + i % 3),
  Array.from({length:9}, (_, i) => 18 + (2 - Math.floor(i / 3)) * 3 + i % 3),
  Array.from({length:9}, (_, i) => (2 - i % 3) * 9 + (2 - Math.floor(i / 3)) * 3 + 2),
];
const previewYaw = ['', "y'", 'y2', 'y'];
for (const item of cases) for (let direction = 0; direction < 4; direction++) {
  const normal = advancedF2LPreview(item, false, previewCube, direction);
  const flipped = advancedF2LPreview(item, true, previewCube, direction);
  for (const [label, faces] of [['normal', normal], ['z2', flipped]]) {
    assert.equal(faces.length, 3, `${item.name}/${direction}/${label} U/F/R`);
    for (const face of faces) assert.match(face, /^[URFDLBX]{9}$/, `${item.name}/${direction}/${label} 九格贴纸`);
    assert.ok(faces.join('').includes('X'), `${item.name}/${direction}/${label} 无关槽位应为灰色`);
    assert.ok(/[URFDLB]/.test(faces.join('')), `${item.name}/${direction}/${label} 目标块应有彩色贴纸`);
    // 以还原态的物理角棱为准：z2 是改变视角，不会把目标块换成另一个槽位的块。
    const target = slotPositions[direction].map(index => previewCube.initials[index]);
    const irrelevant = slotPositions.filter((_, index) => index !== direction)
      .flat().map(index => previewCube.initials[index]);
    previewCube.twister.setup([label === 'z2' ? 'z2' : '', previewYaw[direction]].filter(Boolean).join(' '));
    const targetSlots = new Set(target.map(piece => previewCube.cubelets.indexOf(piece)));
    const selected = item.algs[direction].length ? selectAdvancedF2LCase(item, direction, 0) : null;
    previewCube.twister.setup([label === 'z2' ? 'z2' : '', ...(selected ? selected.inverse : [item.setup]), previewYaw[direction]].filter(Boolean).join(' '));
    faces.forEach((face, faceIndex) => [...face].forEach((sticker, cell) => {
      const position = previewPositions[faceIndex][cell];
      const piece = previewCube.cubelets[position];
      assert.equal(sticker === 'X', irrelevant.includes(piece) && !targetSlots.has(position),
        `${item.name}/${direction}/${label} 第 ${faceIndex}/${cell} 格的目标块/无关块灰度`);
    }));
  }
  assert.notDeepEqual(normal, flipped, `${item.name}/${direction} z2 应切换朝向`);
  if (direction === 1) assert.notDeepEqual(normal, advancedF2LPreview(item, false, previewCube, 0),
    `${item.name} 改变槽位方向应改变缩略图`);
}
for (const item of cases) for (let direction = 0; direction < 4; direction++) {
  if (direction === 0) {
    try {
      previewCube.twister.setup(item.setup.replace(/([URFDLBMESxyzurfdlb])2'/g, '$12'));
      assert.equal(previewCube.serialize().length, 54);
    } catch (error) { failures.push(`${item.name}/setup: ${error.message}`); }
  }
  for (let variant = 0; variant < item.algs[direction].length; variant++) {
    try {
      const selection = selectAdvancedF2LCase(item, direction, variant);
      const cube = new Cube(3);
      cube.twister.setup(selection.inverse.join(' '));
      const start = cube.serialize();
      assert.notEqual(start, 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
      cube.twister.setup([...selection.inverse, ...selection.moves].join(' '));
      assert.equal(cube.complete, true, '正向回放应还原从所选公式逆操作得到的状态');
      cube.twister.setup(['z2', ...selection.inverse].join(' '));
      assert.notEqual(cube.serialize(), start, 'z2 起点必须改变朝向');
      cube.twister.setup(['z2', ...selection.inverse, ...selection.moves].join(' '));
      assert.equal(cube.complete, true, 'z2 朝向回放也应还原');
    } catch (error) { failures.push(`${item.name}/${item.oriNames[direction]}/${item.algs[direction][variant].altId}: ${error.message}`); }
  }
}
assert.equal(failures.length, 0, `无法播放 ${failures.length} 条：\n${failures.slice(0, 20).join('\n')}`);

assert.equal(parseAppRoute('?mode=advf2l').mode, 'advf2l');
assert.equal(routeUrl({ mode: 'advf2l' }, '/'), '/?mode=advf2l');
assert.match(fs.readFileSync(path.join(__dirname, '../src/vue/Setting/index.html'), 'utf8'),
  /tap\('advf2l'\)/, '主菜单须有新模式入口');
const shell = fs.readFileSync(path.join(__dirname, '../src/vue/AppShell/index.ts'), 'utf8');
assert.match(shell, /advf2l:\s*AdvancedF2L/, '独立页面须注册到路由视图');
const page = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.ts'), 'utf8');
for (const action of ['selectCase', 'selectDirection', 'selectVariant', 'toStart', 'previous', 'next', 'play', 'pause']) {
  assert.match(page, new RegExp(`\\b${action}\\(`), `缺少 ${action} 播放操作`);
}
const template = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.html'), 'utf8');
assert.match(template, /^<v-app>\s*<div class="adv-f2l-root">/, '页面须有 Vuetify 应用根以承载菜单弹层');
assert.match(template, /<viewport/, '常驻 3D 魔方');
assert.match(template, /selected\.algs\[direction\]/, '每个方向保留多条公式');
assert.match(template, /aria-label="z2"/, '可切换 z2 的复选框');
assert.match(page, /advF2LZ2/, '独立记忆 z2 状态');
const style = fs.readFileSync(path.join(__dirname, '../src/vue/AdvancedF2L/index.css'), 'utf8');
assert.doesNotMatch(style, /\.adv-f2l-root button(?:\s|\.|:|\{)/, '页面按钮规则不得覆盖 Setting 的 Vuetify 菜单');
assert.match(style, /grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/, '手机也须三列');

console.log('非标 F2L 数据完整性：通过');
